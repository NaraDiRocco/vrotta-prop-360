-- 0022_project_domains.sql
-- Publicación de un proyecto en su propio hostname, en dos etapas:
--   1. En el acto: un subdominio de la plataforma
--      (`{subdominio}.nuestrodominio.com`), sin que el cliente haga nada.
--   2. Después, opcionalmente: un dominio propio que el cliente apunta por
--      DNS, verificado por TXT antes de servir nada ahí.
--
-- Hoy los proyectos se sirven por ruta (`/t/{tenant}/{project}/`, ver
-- apps/viewer/src/contact.ts y el ruteo de apps/worker/README.md). Esta
-- migración NO toca ese ruteo -- resolver un `Host:` entrante a un proyecto
-- es trabajo de aplicación (worker/middleware), fuera de este alcance --
-- sólo prepara los datos que ese ruteo por hostname va a necesitar.
--
-- OJO, no confundir con `projects.settings->>'allowed_domains'` (ver
-- 0012_project_health_view.sql / 0018): eso es la lista de orígenes
-- autorizados a EMBEBER el recorrido en un iframe de un tercero (CSP
-- `frame-ancestors`). Esta migración es sobre en qué hostname el recorrido
-- SE SIRVE; aquella es sobre desde qué otros sitios se lo puede incrustar.
-- Son conceptos independientes: un proyecto puede tener uno sin el otro.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. projects.subdomain — el subdominio de plataforma
-- ─────────────────────────────────────────────────────────────────────────
-- Nullable: un proyecto puede existir sin subdominio todavía (se lo asigna
-- después, o nunca, si el cliente sólo usa la ruta /t/{tenant}/{project}).
--
-- Por qué es una columna aparte y no `slug`: `slug` es único sólo dentro del
-- tenant (unique(tenant_id, slug), ver 0003) porque dos inmobiliarias
-- distintas pueden llamar "torres-del-lago" a proyectos distintos sin
-- pisarse -- conviven bajo /t/{tenant-a}/torres-del-lago/ y
-- /t/{tenant-b}/torres-del-lago/. Un hostname no tiene ese lujo: sólo puede
-- haber UN "torres-del-lago.nuestrodominio.com" en todo internet. Por eso
-- el subdominio necesita su propio espacio de unicidad, global.
alter table projects add column if not exists subdomain text;

-- Formato: label DNS válido, y nada más laxo. Se prohíbe explícitamente el
-- guion bajo (`_`): es inválido como parte de un hostname (RFC 1123) y,
-- aunque algunos resolvers lo toleran, Let's Encrypt rechaza emitir
-- certificado para un nombre que lo contenga -- el proyecto quedaría
-- publicado en el subdominio pero sin HTTPS. El rango de longitud
-- (3 a 30 caracteres) es una política de producto, no un límite de DNS
-- (que permitiría hasta 63): subdominios más cortos son más fáciles de
-- decir por teléfono y de tipear a mano, que es como circula el link de un
-- recorrido inmobiliario.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'projects_subdomain_format'
  ) then
    alter table projects
      add constraint projects_subdomain_format
      check (subdomain is null or subdomain ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$');
  end if;
end $$;

-- Único a nivel global e insensible a mayúsculas: dos tenants pueden tener
-- cada uno un proyecto "baleia" (unique(tenant_id, slug) los deja convivir),
-- pero el hostname público no admite esa convivencia -- "Baleia" y "baleia"
-- resuelven al mismo lugar en cualquier navegador. `where subdomain is not
-- null` es sólo para no indexar la mayoría de las filas que todavía no
-- tienen subdominio asignado (un NULL nunca colisiona con otro NULL en un
-- índice único, así que el predicado es una optimización, no una necesidad).
create unique index if not exists projects_subdomain_lower_key
  on projects (lower(subdomain))
  where subdomain is not null;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. reserved_subdomains — lo que nadie puede tomar como subdominio propio
-- ─────────────────────────────────────────────────────────────────────────
-- Lista de control, no de datos de negocio: sólo crece por migración, nunca
-- a pedido de un tenant (por eso más abajo no tiene policy de escritura para
-- usuarios). Se guarda siempre en minúsculas porque es contra lo que se
-- compara `lower(new.subdomain)` en el trigger de abajo.
create table if not exists reserved_subdomains (
  subdomain  text primary key check (subdomain = lower(subdomain)),
  reason     text,
  created_at timestamptz not null default now()
);

alter table reserved_subdomains enable row level security;

-- Enforcement de verdad: sin esto la tabla sería sólo documentación que la
-- aplicación podría olvidarse de consultar. Es `security definer` porque lee
-- `reserved_subdomains`, una tabla distinta de la que dispara el trigger
-- (mismo motivo que `set_tenant_id_from_project` en 0008).
create or replace function check_subdomain_not_reserved() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.subdomain is not null and exists (
    select 1 from reserved_subdomains where subdomain = lower(new.subdomain)
  ) then
    raise exception 'El subdominio "%" está reservado y no puede asignarse a un proyecto.', new.subdomain;
  end if;
  return new;
end;
$$;

drop trigger if exists projects_check_subdomain_reserved on projects;
create trigger projects_check_subdomain_reserved
  before insert or update of subdomain on projects
  for each row execute function check_subdomain_not_reserved();

-- Semilla. Cuatro grupos:
--   · Infraestructura propia de la plataforma, tal como está hoy en
--     apps/admin/src/app (los primeros segmentos de ruta: /admin, /api,
--     /auth, /dev, /invite, /login, /m/[token], /s/t/..., /signup, /t/...)
--     -- si el día de mañana alguno de éstos se sirve como subdominio en
--     vez de como ruta, un cliente no puede haberlo tomado antes.
--   · Nombres genéricos de plataforma que cualquier SaaS reserva (pedidos
--     explícitamente): admin, api, www, app, panel, cdn, staging, dev,
--     mail, login. `mail` en particular importa por los registros MX que
--     documenta DNS-BALEIA.md: un proyecto en `mail.nuestrodominio.com`
--     confundiría a cualquiera que lo relacione con el correo del dominio.
--   · La marca: el nombre del equipo (Vrotta) y el del producto en sus dos
--     formas (r360 / recorrido360, ver apps/worker/README.md y
--     DESPLIEGUE-VPS.md §6). Notar que "baleia" NO está acá: es el nombre
--     de un proyecto CLIENTE (el que corre en este mismo repo), no de la
--     plataforma -- reservarlo sería quitarle a un cliente real su propio
--     nombre.
-- `on conflict do nothing`: la migración se puede correr más de una vez sin
-- fallar por la unique de la primary key.
insert into reserved_subdomains (subdomain, reason) values
  ('admin',            'ruta interna del panel (/admin) y nombre genérico de plataforma'),
  ('api',              'ruta interna del panel (/api) y del worker'),
  ('app',              'nombre genérico reservado para la aplicación de la plataforma'),
  ('auth',             'ruta interna del panel (/auth/callback)'),
  ('cdn',              'reservado para servir estáticos/tiles de la plataforma'),
  ('dev',              'ruta interna del panel (/dev/ui) y ambiente de desarrollo'),
  ('invite',           'ruta interna del panel (/invite/[token])'),
  ('login',            'ruta interna del panel (/login)'),
  ('m',                'ruta interna del panel (/m/[token], links de material)'),
  ('mail',             'no colisionar con los registros MX del dominio (ver DNS-BALEIA.md)'),
  ('panel',            'nombre genérico reservado para el panel de administración'),
  ('r360',             'marca del producto (Recorrido 360 / r360, ver apps/worker/README.md)'),
  ('recorrido360',     'marca del producto, forma larga'),
  ('s',                'ruta interna del panel (/s/t/[tenant], vista de sales)'),
  ('signup',           'ruta interna del panel (/signup)'),
  ('staging',          'ambiente de pruebas de la plataforma'),
  ('t',                'ruta interna del panel y del worker (/t/[tenant]/...)'),
  ('vrotta',           'nombre del equipo/marca dueño de la plataforma (Vrotta Prop 360)'),
  ('www',              'convención estándar, reservado en todo dominio')
on conflict (subdomain) do nothing;

-- Lectura para cualquier autenticado (el panel la necesita para validar en
-- el cliente antes de mandar el POST, aunque el trigger de arriba es la
-- verdad final). Sin policy de insert/update/delete: esta lista sólo cambia
-- por una migración nueva, nunca por un usuario ni siquiera de plataforma;
-- `service_role` bypassea RLS para las migraciones futuras que necesiten
-- sumar un nombre.
drop policy if exists reserved_subdomains_select on reserved_subdomains;
create policy reserved_subdomains_select on reserved_subdomains for select
  to authenticated
  using (true);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. project_domains — el dominio propio del cliente
-- ─────────────────────────────────────────────────────────────────────────
-- ¿Uno o varios dominios por proyecto? VARIOS: no hay unique(project_id) ni
-- unique(project_id, domain) acá a propósito. Un cliente típicamente quiere
-- el apex y el alias "www" apuntando al mismo recorrido
-- (`milomas.com` + `www.milomas.com`), y no hay razón de negocio para
-- obligarlo a elegir uno solo -- es exactamente el caso que describe
-- DNS-BALEIA.md para el dominio de la propia plataforma (un registro A en
-- `@` y otro en `www`). Lo que SÍ es siempre 1:1 es dominio → proyecto:
-- `domain` es `unique` a secas (no compuesto con project_id), así que ese
-- mismo dominio no puede volver a insertarse para ningún otro proyecto ni
-- para el mismo dos veces.
create table if not exists project_domains (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references projects(id) on delete cascade,
  tenant_id           uuid not null references tenants(id) on delete cascade,
  -- Guardado siempre en minúsculas. El `check` es la red de seguridad: la
  -- normalización la hace la aplicación antes de insertar (mismo patrón que
  -- `invitations.email`, ver 0020), pero acá además importa para que el
  -- `unique` de abajo no se pueda esquivar insertando "Milomas.com" cuando
  -- ya existe "milomas.com" -- a diferencia del subdominio (que usa un
  -- índice sobre `lower()`), acá alcanza con obligar a la columna misma a
  -- estar ya en minúsculas.
  domain              text not null unique check (domain = lower(domain)),
  status              text not null default 'pending' check (status in ('pending', 'verified', 'failed')),
  -- No es secreto: el cliente lo copia tal cual a un registro TXT público de
  -- SU dominio para probar que lo controla -- es la prueba, no una llave de
  -- acceso. Por eso, a diferencia de `invitations.token_hash` (que SÍ se
  -- hashea porque ahí el token otorga un rol con sólo conocerlo), acá se
  -- guarda en claro y hasta puede generarlo la propia base: nunca hay una
  -- fila de `project_domains` sin token para copiar al DNS.
  verification_token  text not null default encode(gen_random_bytes(16), 'hex'),
  verified_at         timestamptz,
  -- Motivo legible del último fallo de verificación (p.ej. "no se encontró
  -- el TXT", "el TXT no coincide", "el dominio ya resuelve a otro lado"),
  -- para mostrarlo tal cual en el panel sin que el cliente tenga que leer
  -- un log. Se pisa en cada intento; no es una bitácora.
  last_error          text,
  created_at          timestamptz not null default now(),
  -- Coherencia: no puede quedar "verified" sin la fecha en que se verificó
  -- (mismo espíritu que `invitations_scope_shape` en 0020 -- una fila no
  -- puede quedar en un estado a medio completar).
  constraint project_domains_verified_at_matches_status check (
    (status = 'verified' and verified_at is not null)
    or (status <> 'verified')
  )
);

create index if not exists project_domains_project_id_idx on project_domains (project_id);

-- Para el futuro job/worker que recorra "qué está pendiente de verificar":
-- mismo espíritu que `jobs_project_id_status_idx` / `unit_status_log_changed_at_idx`
-- en 0014, un índice pensado para la consulta operativa real, no para RLS.
create index if not exists project_domains_pending_idx
  on project_domains (created_at) where status = 'pending';

-- tenant_id se completa solo desde el proyecto, igual que en
-- project_material/material_files/material_share_links (0016): el cliente
-- nunca lo manda a mano, así no puede quedar (por bug o por insert manual)
-- apuntando a un tenant distinto del dueño real del proyecto.
drop trigger if exists project_domains_set_tenant_id on project_domains;
create trigger project_domains_set_tenant_id
  before insert or update of project_id on project_domains
  for each row execute function set_tenant_id_from_project();

alter table project_domains enable row level security;

-- SELECT: mismo patrón que material_share_links/groups/scenes -- los
-- proyectos accesibles del usuario, más la condición evaluada sobre la fila
-- para owner/editor (necesaria por la trampa del snapshot de 0015: sin esto,
-- el `INSERT ... RETURNING` que hace supabase-js al agregar un dominio
-- fallaría contra esta misma policy de SELECT), más plataforma.
drop policy if exists project_domains_select on project_domains;
create policy project_domains_select on project_domains for select
  using (
    project_id in (select auth_accessible_project_ids())
    or auth_role_for_tenant(tenant_id) = any (array['owner'::membership_role, 'editor'::membership_role])
    or auth_is_platform()
  );

-- INSERT/DELETE: agregar o quitar un dominio es una operación de
-- publicación (a qué hostname responde el proyecto), así que queda en
-- owner/editor -- mismo nivel que `publications`/`material_share_links`, no
-- en `sales`. Vrotta puede operar cualquier proyecto, como en el resto de
-- las tablas desde 0019.
drop policy if exists project_domains_insert on project_domains;
create policy project_domains_insert on project_domains for insert
  with check (auth_role_for_project(project_id) in ('owner', 'editor') or auth_is_platform());

drop policy if exists project_domains_delete on project_domains;
create policy project_domains_delete on project_domains for delete
  using (auth_role_for_project(project_id) in ('owner', 'editor') or auth_is_platform());

-- SIN policy de UPDATE para usuarios, a propósito -- mismo criterio que
-- `unit_status_log` y `jobs` (0010): `status`, `verified_at` y `last_error`
-- los escribe el backend de verificación con `service_role`, después de
-- consultar el TXT en el DNS real. Si un owner/editor pudiera hacer UPDATE
-- directo, se auto-otorgaría "verified" sin haber probado nada -- un dominio
-- que no controla pasaría a servirse como si fuera suyo. Corregir un dominio
-- mal tipeado es DELETE + INSERT (el INSERT nuevo emite un
-- `verification_token` distinto, que es lo correcto: no hay razón para
-- reutilizar el de un intento anterior).
