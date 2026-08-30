-- 0016_material.sql
-- Material requerido: catálogo de qué hace falta por proyecto (el catálogo en
-- sí vive en código, `apps/admin/src/lib/material/catalog.ts`), el estado de
-- cada ítem, los archivos que sube el cliente, y el link compartible que se le
-- manda por WhatsApp para que suba sin tener cuenta.
--
-- MODELO DE ACCESO
--   Panel  → sesión del usuario + RLS por membership, igual que el resto.
--   Link   → un token opaco de 128 bits que resuelve a UN proyecto. No abre
--            sesión ni da acceso a nada más del tenant. Todo lo que hace pasa
--            por las tres funciones `material_link_*` de abajo, que son
--            security definer y validan el token en cada llamada. El resto de
--            las tablas siguen cerradas a `anon`.
--
-- NOTA SOBRE LAS POLICIES DE SELECT — leer 0015_fix_insert_returning_rls.sql
--   `auth_accessible_project_ids()` es STABLE: dentro de la misma sentencia
--   trabaja con el snapshot previo, así que la fila recién insertada no
--   aparece en su resultado y un `INSERT ... RETURNING` (lo que hace
--   supabase-js con `.insert().select()`) falla contra la policy de SELECT.
--   Por eso todas las policies de lectura de acá suman, además, una condición
--   evaluada sobre la propia fila (`auth_role_for_tenant(tenant_id) in
--   (owner, editor)`), que no depende de ningún snapshot.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'material_status') then
    create type material_status as enum ('pendiente', 'solicitado', 'recibido', 'aprobado', 'no_aplica');
  end if;

  if not exists (select 1 from pg_type where typname = 'material_upload_via') then
    create type material_upload_via as enum ('panel', 'link');
  end if;
end $$;

-- ── project_material: estado de cada ítem del catálogo en un proyecto ────
-- Los ítems sin fila se leen como 'pendiente': no se precarga el catálogo
-- entero al crear el proyecto, así agregar un ítem nuevo al catálogo no exige
-- una migración de datos.
create table if not exists project_material (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  item_id     text not null,
  status      material_status not null default 'pendiente',
  notes       text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null,
  unique (project_id, item_id)
);

create index if not exists project_material_project_idx on project_material (project_id);

-- ── material_files: los archivos subidos, por ítem ───────────────────────
-- `uploaded_by` es nullable a propósito: quien sube por el link no tiene
-- cuenta. `uploaded_via` distingue las dos vías para poder auditar después.
create table if not exists material_files (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  tenant_id     uuid not null references tenants(id) on delete cascade,
  item_id       text not null,
  storage_path  text not null unique,
  filename      text not null,
  size_bytes    bigint not null check (size_bytes > 0),
  mime          text not null,
  uploaded_by   uuid references auth.users(id) on delete set null,
  uploaded_via  material_upload_via not null default 'panel',
  created_at    timestamptz not null default now()
);

create index if not exists material_files_project_item_idx on material_files (project_id, item_id);

-- ── material_share_links: el link que se le manda al cliente ─────────────
-- Sin `expires_at` el link no vence (útil para un proyecto largo); el panel
-- emite 30 días por defecto. Revocar es setear `revoked_at`: no se borra, para
-- conservar la trazabilidad de qué link se usó para subir qué.
create table if not exists material_share_links (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  token       text not null unique,
  label       text,
  expires_at  timestamptz,
  revoked_at  timestamptz,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists material_share_links_project_idx on material_share_links (project_id);

-- tenant_id se completa solo desde el proyecto (trigger de 0008): el cliente
-- nunca lo manda a mano, y así no puede pertenecer a otro tenant que el del
-- proyecto referenciado.
drop trigger if exists project_material_set_tenant_id on project_material;
create trigger project_material_set_tenant_id
  before insert or update of project_id on project_material
  for each row execute function set_tenant_id_from_project();

drop trigger if exists material_files_set_tenant_id on material_files;
create trigger material_files_set_tenant_id
  before insert or update of project_id on material_files
  for each row execute function set_tenant_id_from_project();

drop trigger if exists material_share_links_set_tenant_id on material_share_links;
create trigger material_share_links_set_tenant_id
  before insert or update of project_id on material_share_links
  for each row execute function set_tenant_id_from_project();

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table project_material     enable row level security;
alter table material_files       enable row level security;
alter table material_share_links enable row level security;

-- project_material: los tres roles lo ven (sales también necesita saber qué
-- falta); sólo owner/editor lo mueven.
drop policy if exists project_material_select on project_material;
create policy project_material_select on project_material for select
  using (
    project_id in (select auth_accessible_project_ids())
    or auth_role_for_tenant(tenant_id) = any (array['owner'::membership_role, 'editor'::membership_role])
  );

drop policy if exists project_material_write on project_material;
create policy project_material_write on project_material for all
  using (auth_role_for_project(project_id) in ('owner', 'editor'))
  with check (auth_role_for_project(project_id) in ('owner', 'editor'));

-- material_files: misma lectura; alta y baja sólo owner/editor desde el panel.
-- Las altas por el link NO pasan por acá: entran por
-- `material_link_register_file()`, que es security definer.
drop policy if exists material_files_select on material_files;
create policy material_files_select on material_files for select
  using (
    project_id in (select auth_accessible_project_ids())
    or auth_role_for_tenant(tenant_id) = any (array['owner'::membership_role, 'editor'::membership_role])
  );

drop policy if exists material_files_insert on material_files;
create policy material_files_insert on material_files for insert
  with check (auth_role_for_project(project_id) in ('owner', 'editor'));

drop policy if exists material_files_delete on material_files;
create policy material_files_delete on material_files for delete
  using (auth_role_for_project(project_id) in ('owner', 'editor'));

-- material_share_links: emitir y revocar un link es dar acceso a material del
-- proyecto, así que queda en owner/editor. Sin policy de delete: un link se
-- revoca, no se borra.
drop policy if exists material_share_links_select on material_share_links;
create policy material_share_links_select on material_share_links for select
  using (
    project_id in (select auth_accessible_project_ids())
    or auth_role_for_tenant(tenant_id) = any (array['owner'::membership_role, 'editor'::membership_role])
  );

drop policy if exists material_share_links_insert on material_share_links;
create policy material_share_links_insert on material_share_links for insert
  with check (auth_role_for_project(project_id) in ('owner', 'editor'));

drop policy if exists material_share_links_update on material_share_links;
create policy material_share_links_update on material_share_links for update
  using (auth_role_for_project(project_id) in ('owner', 'editor'))
  with check (auth_role_for_project(project_id) in ('owner', 'editor'));

-- ── Funciones del link público ───────────────────────────────────────────
-- Son la ÚNICA superficie que `anon` toca. Cada una revalida el token: no hay
-- estado de sesión que se pueda quedar viejo. Un token revocado o vencido no
-- devuelve nada y no distingue de un token inexistente, para que un link
-- filtrado no sirva ni para confirmar que el proyecto existe.

create or replace function material_link_project(p_token text)
returns table (project_id uuid, project_name text, project_kind project_kind)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, p.kind
  from material_share_links l
  join projects p on p.id = l.project_id
  where l.token = p_token
    and l.revoked_at is null
    and (l.expires_at is null or l.expires_at > now());
$$;

-- Los archivos ya subidos de ESE proyecto. Se devuelve sólo lo que el cliente
-- necesita ver: nunca `uploaded_by`, ni el tenant, ni nada de otro proyecto.
create or replace function material_link_files(p_token text)
returns table (
  id uuid,
  item_id text,
  filename text,
  size_bytes bigint,
  mime text,
  storage_path text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.item_id, f.filename, f.size_bytes, f.mime, f.storage_path, f.created_at
  from material_files f
  join material_share_links l on l.project_id = f.project_id
  where l.token = p_token
    and l.revoked_at is null
    and (l.expires_at is null or l.expires_at > now());
$$;

-- El estado de cada ítem, sin quién lo tocó ni cuándo lo tocó internamente.
create or replace function material_link_states(p_token text)
returns table (item_id text, status material_status)
language sql
stable
security definer
set search_path = public
as $$
  select m.item_id, m.status
  from project_material m
  join material_share_links l on l.project_id = m.project_id
  where l.token = p_token
    and l.revoked_at is null
    and (l.expires_at is null or l.expires_at > now());
$$;

-- Registra un archivo subido por el link y marca el ítem como 'recibido'.
-- Nunca 'aprobado': aprobar es una decisión del operador, que mira el archivo.
-- Devuelve NULL si el token no sirve, para que el llamador responda 404 sin
-- filtrar por qué.
create or replace function material_link_register_file(
  p_token        text,
  p_item_id      text,
  p_storage_path text,
  p_filename     text,
  p_size_bytes   bigint,
  p_mime         text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid;
  v_id uuid;
begin
  select l.project_id into v_project
  from material_share_links l
  where l.token = p_token
    and l.revoked_at is null
    and (l.expires_at is null or l.expires_at > now());

  if v_project is null then
    return null;
  end if;

  insert into material_files (project_id, item_id, storage_path, filename, size_bytes, mime, uploaded_via)
  values (v_project, p_item_id, p_storage_path, p_filename, p_size_bytes, p_mime, 'link')
  returning id into v_id;

  insert into project_material (project_id, item_id, status, updated_at)
  values (v_project, p_item_id, 'recibido', now())
  on conflict (project_id, item_id) do update
    set status = case
          -- No pisamos una aprobación ni un "no aplica" ya decidido: si el
          -- cliente sube otra versión, el operador la revisa aparte.
          when project_material.status in ('aprobado', 'no_aplica') then project_material.status
          else 'recibido'
        end,
        updated_at = now();

  return v_id;
end;
$$;

revoke all on function material_link_project(text) from public;
revoke all on function material_link_files(text) from public;
revoke all on function material_link_states(text) from public;
revoke all on function material_link_register_file(text, text, text, text, bigint, text) from public;

grant execute on function material_link_project(text) to anon, authenticated;
grant execute on function material_link_files(text) to anon, authenticated;
grant execute on function material_link_states(text) to anon, authenticated;
grant execute on function material_link_register_file(text, text, text, text, bigint, text) to anon, authenticated;

-- ── Storage ──────────────────────────────────────────────────────────────
-- Bucket privado: nada se sirve por URL pública. Las descargas van por URL
-- firmada de vida corta, generada por el backend después de chequear permiso o
-- token. La ruta es siempre `<project_id>/<item_id>/<uuid>.<ext>` — derivada
-- de ids del servidor, nunca del nombre que manda el cliente (ver
-- `lib/material/uploads.ts`), así un `../` en el filename no escribe fuera de
-- la carpeta del proyecto.
insert into storage.buckets (id, name, public, file_size_limit)
values ('material', 'material', false, 209715200)  -- 200 MB, igual que MAX_FILE_BYTES
on conflict (id) do update set public = false, file_size_limit = 209715200;

-- Miembros del proyecto: leen y escriben dentro de la carpeta de su proyecto.
-- El primer segmento de la ruta es el project_id.
drop policy if exists material_objects_select on storage.objects;
create policy material_objects_select on storage.objects for select
  to authenticated
  using (
    bucket_id = 'material'
    and (storage.foldername(name))[1]::uuid in (select auth_accessible_project_ids())
  );

drop policy if exists material_objects_insert on storage.objects;
create policy material_objects_insert on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'material'
    and auth_role_for_project((storage.foldername(name))[1]::uuid) in ('owner', 'editor')
  );

drop policy if exists material_objects_delete on storage.objects;
create policy material_objects_delete on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'material'
    and auth_role_for_project((storage.foldername(name))[1]::uuid) in ('owner', 'editor')
  );

-- `anon` NO tiene policy sobre storage.objects: la subida por el link la hace
-- el backend con la service key, después de validar token, extensión y tamaño.
-- Darle write directo a `anon` sobre el bucket convertiría el link en un
-- depósito abierto para cualquiera que conozca el nombre del bucket.
