-- 0020_invitations.sql
-- Sistema de invitaciones: cómo entra gente nueva al panel, tanto del lado
-- de una inmobiliaria (`scope='tenant'`) como del equipo de Vrotta
-- (`scope='platform'`). Cierra el hallazgo B4 del plan de roles.
--
-- POR QUÉ UNA TABLA Y NO "crear la cuenta directamente"
--   Invitar es dar de alta a alguien que hoy no tiene ninguna relación con
--   el sistema: no hay membership ni platform_member que insertar todavía
--   porque no hay `user_id` (la persona ni siquiera tiene cuenta). La
--   invitación es la promesa de un rol ("cuando aceptes esto, sos Gestor de
--   Baleia") que se cumple recién en `accept_invitation`, cuando la persona
--   ya tiene sesión.
--
-- POR QUÉ SE GUARDA EL HASH DEL TOKEN Y NO EL TOKEN
--   Comparar con `material_share_links` (0016), que SÍ guarda el token en
--   claro: ese link abre un único proyecto para subir archivos — el peor
--   uso indebido es que alguien suba un PDF que no debía. Una invitación, en
--   cambio, OTORGA UN ROL (hasta Administrador de una inmobiliaria, o
--   Vrotta Admin). Si alguien lograra leer esta tabla — un dump mal
--   protegido, un bug de RLS, un empleado con acceso a la base — con el
--   token en claro se auto-otorgaría ese rol con un solo POST. Con el hash,
--   leer la tabla entera no da nada usable: hay que tener el token que sólo
--   viajó una vez, en el link.
--
-- POR QUÉ NO ES TRANSFERIBLE
--   El link se manda por mail o se copia a mano para reenviar por WhatsApp
--   (ver punto 5 del plan: hoy no hay SMTP). Si se reenvía a la persona
--   equivocada, `accept_invitation` exige que el email de la SESIÓN que
--   acepta coincida con el de la invitación: quien la recibe por error no
--   puede usarla ni para su propia cuenta ni para ninguna otra.
--
-- ESTA MIGRACIÓN NO TOCA 0001-0019: es aditiva y autocontenida. La 0021
-- (restrictiva, todavía no aplicada) es independiente de esta.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. La tabla
-- ─────────────────────────────────────────────────────────────────────────
-- El CHECK hace que cada fila sea coherente con su scope: una invitación de
-- inmobiliaria SIEMPRE tiene tenant_id + role de cliente y NUNCA platform_role;
-- una de plataforma es al revés. No es posible, ni por bug de la aplicación
-- ni por un insert manual, crear una invitación ambigua (¿es de tenant o de
-- plataforma? ¿a qué rol?).

create table if not exists invitations (
  id            uuid primary key default gen_random_uuid(),
  scope         text not null check (scope in ('tenant', 'platform')),
  tenant_id     uuid references tenants(id) on delete cascade,
  role          membership_role,
  platform_role platform_role,
  -- Scoping de vendedores: si no está vacío, `accept_invitation` limita al
  -- nuevo membership a estos proyectos vía `membership_projects` (mismo
  -- significado que en 0002: sin filas = acceso a todo el tenant). Para
  -- invitaciones que no son `role='sales'` normalmente queda vacío, pero no
  -- se restringe a nivel de base: es una decisión de la UI, no de RLS.
  project_ids   uuid[] not null default '{}',
  -- Siempre en minúsculas (lo normaliza la aplicación antes de insertar):
  -- así la comparación en `accept_invitation` con `lower(auth.email())` no
  -- depende de con qué mayúsculas haya escrito el email quien invita.
  email         text not null,
  -- sha256 en hex del token de 32 bytes. NUNCA se guarda el token en claro
  -- (ver nota de arriba). `unique` además de servir de índice de búsqueda,
  -- hace estadísticamente imposible una colisión que le preste el rol de
  -- una invitación a otra.
  token_hash    text not null unique,
  invited_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '7 days'),
  accepted_at   timestamptz,
  revoked_at    timestamptz,
  constraint invitations_scope_shape check (
    (scope = 'tenant' and tenant_id is not null and role is not null and platform_role is null)
    or
    (scope = 'platform' and tenant_id is null and role is null and platform_role is not null)
  )
);

create index if not exists invitations_tenant_id_idx on invitations (tenant_id);
create index if not exists invitations_email_idx on invitations (email);

alter table invitations enable row level security;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. RLS
-- ─────────────────────────────────────────────────────────────────────────
-- Quién puede ver/crear/actualizar una invitación depende de su scope, no de
-- una única condición: una de tenant la maneja el Administrador de ESE
-- tenant (o cualquier Vrotta Admin); una de plataforma, sólo Vrotta Admin
-- (nunca un Administrador de inmobiliaria, ni siquiera para su propio
-- tenant: invitar gente a Vrotta no es un permiso que un cliente tenga).
--
-- Sin policy de DELETE: igual que `material_share_links`, una invitación se
-- REVOCA (`revoked_at`), no se borra. Conservarla es lo que permite mostrar
-- "invitado el 3/9, revocado el 5/9" en la pantalla de equipo en vez de que
-- desaparezca sin dejar rastro.

drop policy if exists invitations_select on invitations;
create policy invitations_select on invitations for select
  to authenticated
  using (
    (scope = 'tenant' and (auth_role_for_tenant(tenant_id) = 'owner' or auth_is_platform_admin()))
    or (scope = 'platform' and auth_is_platform_admin())
  );

drop policy if exists invitations_insert on invitations;
create policy invitations_insert on invitations for insert
  to authenticated
  with check (
    (scope = 'tenant' and (auth_role_for_tenant(tenant_id) = 'owner' or auth_is_platform_admin()))
    or (scope = 'platform' and auth_is_platform_admin())
  );

-- UPDATE cubre revocar (`revoked_at`) y reenviar (nuevo `token_hash` /
-- `expires_at`). Mismo criterio que select/insert.
drop policy if exists invitations_update on invitations;
create policy invitations_update on invitations for update
  to authenticated
  using (
    (scope = 'tenant' and (auth_role_for_tenant(tenant_id) = 'owner' or auth_is_platform_admin()))
    or (scope = 'platform' and auth_is_platform_admin())
  )
  with check (
    (scope = 'tenant' and (auth_role_for_tenant(tenant_id) = 'owner' or auth_is_platform_admin()))
    or (scope = 'platform' and auth_is_platform_admin())
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 3. RPC invitation_preview(p_token text) — leer sin sesión
-- ─────────────────────────────────────────────────────────────────────────
-- `/invite/[token]` es una ruta PÚBLICA (igual que `/m/[token]` para
-- material, ver middleware.ts): tiene que poder mostrar "te invitaron a
-- Baleia como Gestor" ANTES de que la persona inicie sesión, para que sepa
-- a qué está por entrar y con qué cuenta (mail) hacerlo. Como todavía no
-- hay sesión, la RLS de `invitations` no deja pasar nada — de ahí esta
-- función, `security definer`, que devuelve exactamente lo que esa pantalla
-- necesita y nada más: nunca el hash, nunca `invited_by`. Token inexistente,
-- vencido, revocado o ya aceptado devuelven CERO filas — la pantalla no
-- distingue esos cuatro casos entre sí (si lo hiciera, alguien podría usar
-- las cuatro respuestas distintas para enumerar tokens a fuerza bruta).
create or replace function invitation_preview(p_token text)
returns table (
  scope         text,
  tenant_name   text,
  role          membership_role,
  platform_role platform_role,
  email         text
)
language sql
stable
security definer
-- `search_path = public` (mismo patrón que 0009/0019, nunca más ancho por
-- una función security definer), así que pgcrypto se referencia calificado:
-- Supabase instala esa extensión en el esquema `extensions`, no en `public`.
set search_path = public
as $$
  select
    i.scope,
    t.name,
    i.role,
    i.platform_role,
    i.email
  from invitations i
  left join tenants t on t.id = i.tenant_id
  where i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and i.revoked_at is null
    and i.accepted_at is null
    and i.expires_at > now();
$$;

grant execute on function invitation_preview(text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. RPC accept_invitation(p_token text) — el único camino para aceptar
-- ─────────────────────────────────────────────────────────────────────────
-- security definer porque quien acepta TODAVÍA NO tiene membership ni
-- platform_member (es lo que esta función crea): su propia sesión no
-- pasaría la RLS de `memberships`/`platform_members` sin este privilegio
-- elevado. search_path fijo, mismo patrón que el resto de las funciones de
-- 0009/0011/0016/0019.
--
-- Cada `raise exception` es un mensaje pensado para mostrarse tal cual en
-- la pantalla `/invite/[token]`: son las cuatro formas en las que una
-- invitación deja de servir (vencida, revocada, ya aceptada, para otro
-- email) más el caso de token inexistente, indistinguible a propósito de
-- una invitación revocada (no hay forma de que alguien enumere tokens
-- probando si "no existe" o "está revocada" son mensajes distintos).
create or replace function accept_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email         text;
  v_hash          text;
  v_inv           invitations%rowtype;
  v_membership_id uuid;
  v_tenant_slug   text;
  v_project_count int;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión para aceptar una invitación.';
  end if;

  -- `auth.email()` lee el email verificado del JWT de la sesión, no algo
  -- que el propio usuario pueda escribir (a diferencia de un campo de
  -- perfil): es la garantía de que "el email de la sesión" es de verdad.
  v_email := lower(auth.email());

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  select * into v_inv from invitations where token_hash = v_hash;
  if not found then
    raise exception 'Esta invitación no existe o ya no es válida.';
  end if;

  if v_inv.revoked_at is not null then
    raise exception 'Esta invitación fue revocada.';
  end if;

  if v_inv.accepted_at is not null then
    -- Idempotente: si el usuario ya es miembro (la aceptó antes, en esta
    -- sesión o en otra pestaña), no es un error de verdad — se informa así
    -- para que la pantalla lo muestre como "ya estabas adentro" y redirija
    -- igual, en vez de un cartel de error. El endpoint distingue este caso
    -- por el TEXTO del mensaje (ver /api/invitations/[token]/accept).
    raise exception 'Esta invitación ya fue aceptada.';
  end if;

  if v_inv.expires_at <= now() then
    raise exception 'Esta invitación venció. Pedí que te manden una nueva.';
  end if;

  -- LA INVITACIÓN NO ES TRANSFERIBLE: si se reenvía el mail a otra persona,
  -- su sesión (con OTRO email) no pasa este chequeo. No hay forma de
  -- "aceptar en nombre de" ni de cambiar a qué email quedó dirigida.
  if v_inv.email <> v_email then
    raise exception 'Esta invitación es para otra dirección de email (%), no para %.', v_inv.email, v_email;
  end if;

  if v_inv.scope = 'tenant' then
    insert into memberships (tenant_id, user_id, role)
    values (v_inv.tenant_id, auth.uid(), v_inv.role)
    on conflict (tenant_id, user_id) do nothing
    returning id into v_membership_id;

    -- `on conflict do nothing` no vuelve a fijar `id` si la fila ya existía
    -- (alguien lo sumó por otro camino mientras la invitación seguía
    -- pendiente): se busca la que ya está, para poder de todos modos
    -- aplicar `project_ids` más abajo.
    if v_membership_id is null then
      select id into v_membership_id
      from memberships
      where tenant_id = v_inv.tenant_id and user_id = auth.uid();
    end if;

    select array_length(v_inv.project_ids, 1) into v_project_count;
    if v_project_count is not null and v_project_count > 0 then
      insert into membership_projects (membership_id, project_id)
      select v_membership_id, pid
      from unnest(v_inv.project_ids) as pid
      on conflict do nothing;
    end if;

    select slug into v_tenant_slug from tenants where id = v_inv.tenant_id;
  else
    insert into platform_members (user_id, role, created_by)
    values (auth.uid(), v_inv.platform_role, v_inv.invited_by)
    on conflict (user_id) do nothing;
  end if;

  update invitations set accepted_at = now() where id = v_inv.id;

  return jsonb_build_object(
    'scope', v_inv.scope,
    'tenantSlug', v_tenant_slug,
    'role', v_inv.role,
    'platformRole', v_inv.platform_role
  );
end;
$$;

-- Cualquier usuario autenticado puede intentar aceptar: la propia función
-- decide si el token/email/vencimiento lo permiten. Sin `anon`: aceptar una
-- invitación exige sesión (el email a comparar sale de ahí).
grant execute on function accept_invitation(text) to authenticated;
