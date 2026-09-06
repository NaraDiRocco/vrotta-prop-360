-- 0019_platform_roles.sql
-- Roles de PLATAFORMA (el equipo de Vrotta) por encima de los roles de
-- cliente (`memberships.role`, que siguen intactos).
--
-- POR QUÉ
--   Hoy, para que alguien de Vrotta cargue un proyecto de una inmobiliaria,
--   hay que insertarle a mano una membership `owner` de ESE tenant. Eso es
--   frágil (hay que acordarse de sacarla), miente en la UI ("Dueño" de un
--   cliente que no es suyo) y no escala a veinte clientes.
--
-- CÓMO
--   Una tabla nueva `platform_members` (user_id → rol de plataforma) y tres
--   funciones que la leen. El rol de plataforma NO es un "owner sintético":
--   `auth_role_for_tenant()` y `auth_role_for_project()` siguen devolviendo
--   NULL para alguien de Vrotta. Cada policy suma su condición de plataforma
--   escrita a mano, para que leyendo la policy se vea quién escribe.
--
--   Se eligió tabla y no un claim en el JWT a propósito: revocar es borrar la
--   fila (efecto inmediato, no hay que esperar a que venza el token), queda
--   auditado quién dio el permiso, y no hay forma de confundir `app_metadata`
--   (sólo servidor) con `user_metadata` (que el propio usuario puede editar
--   con `supabase.auth.updateUser`), que es el error clásico que convierte a
--   cualquiera en administrador de plataforma.
--
-- ESTA MIGRACIÓN ES ADITIVA: nadie pierde permisos. Vrotta gana acceso.
-- La contraparte restrictiva (la inmobiliaria deja de poder tocar estructura,
-- escenas y publicación) va en 0021, DESPUÉS de migrar a la gente de Vrotta
-- a `platform_members`. Aplicar 0021 antes dejaría a todos sin poder cargar.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. El enum, la tabla y su RLS
-- ─────────────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_type where typname = 'platform_role') then
    -- admin    → la dueña y quien ella designe. Todo: alta y baja de
    --            inmobiliarias, equipo de Vrotta, borrar proyectos y leads.
    -- operator → el equipo de producción. Carga y publica proyectos de
    --            cualquier cliente, pero no crea clientes, no borra nada
    --            y no gestiona leads (los ve, para dar soporte).
    create type platform_role as enum ('admin', 'operator');
  end if;
end $$;

create table if not exists platform_members (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       platform_role not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists platform_members_role_idx on platform_members (role);

alter table platform_members enable row level security;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Las funciones de rol de plataforma (van antes que las policies de
--    platform_members, que las usan)
-- ─────────────────────────────────────────────────────────────────────────
-- Mismo patrón que las de 0009: `stable` + `security definer` (para leer
-- platform_members sin chocar con su propia RLS) + search_path fijo.
-- Sólo miran `auth.uid()`; NUNCA metadata del token.

create or replace function auth_platform_role() returns platform_role
language sql
stable
security definer
set search_path = public
as $$
  select role from platform_members where user_id = auth.uid();
$$;

create or replace function auth_is_platform() returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from platform_members where user_id = auth.uid());
$$;

create or replace function auth_is_platform_admin() returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from platform_members where user_id = auth.uid() and role = 'admin'
  );
$$;

-- ESTA TABLA ES LA ÚNICA COSA QUE SEPARA A UN USUARIO COMÚN DE VER TODOS LOS
-- CLIENTES. Si alguien pudiera insertarse una fila acá, se auto-otorgaría
-- acceso a todas las inmobiliarias. Por eso:
--   · leer la PROPIA fila: cualquiera autenticado (el panel lo necesita para
--     saber si mostrar la vista de Vrotta o la del cliente);
--   · leer TODAS las filas: sólo un admin de plataforma (la pantalla
--     /admin/team);
--   · escribir (insert/update/delete): sólo un admin de plataforma.
-- No hay policy para `anon`: sin policy, denegado. Un `owner` de inmobiliaria
-- tampoco entra en ninguna de las tres: `auth_is_platform_admin()` le da
-- false. La primera fila se inserta a mano una única vez, con el snippet
-- supabase/snippets/bootstrap_platform_admin.sql.
--
-- Las funciones que consultan esta tabla son `security definer`, así que no
-- se produce recursión de policies al evaluarlas acá adentro.

drop policy if exists platform_members_select_self on platform_members;
create policy platform_members_select_self on platform_members for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists platform_members_select_admin on platform_members;
create policy platform_members_select_admin on platform_members for select
  to authenticated
  using (auth_is_platform_admin());

drop policy if exists platform_members_write_admin on platform_members;
create policy platform_members_write_admin on platform_members for all
  to authenticated
  using (auth_is_platform_admin())
  with check (auth_is_platform_admin());

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Cascada de LECTURA: se reescriben dos funciones de 0009
-- ─────────────────────────────────────────────────────────────────────────
-- Para el equipo de Vrotta, "los tenants a los que tengo acceso" son todos y
-- "los proyectos a los que tengo acceso" también. Reescribiendo estas dos
-- funciones, todas las policies de SELECT que ya las usaban (tenants,
-- memberships, projects, units, escenas, hotspots, leads, publicaciones,
-- material, storage, saved_views) dejan pasar a Vrotta sin tocarlas una por
-- una. Las de ESCRITURA no cascadean: se agregan a mano más abajo.
--
-- Se usa `union all` con guardas mutuamente excluyentes en vez de `union`
-- para no pagar la deduplicación: las dos ramas nunca devuelven filas a la vez.

create or replace function auth_tenant_ids() returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.id from tenants t where auth_is_platform()
  union all
  select m.tenant_id from memberships m
  where m.user_id = auth.uid() and not auth_is_platform();
$$;

create or replace function auth_accessible_project_ids() returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id from projects p where auth_is_platform()
  union all
  select p.id
  from projects p
  join memberships m on m.tenant_id = p.tenant_id and m.user_id = auth.uid()
  where
    not auth_is_platform()
    and (
      not exists (select 1 from membership_projects mp where mp.membership_id = m.id)
      or exists (
        select 1 from membership_projects mp
        where mp.membership_id = m.id and mp.project_id = p.id
      )
    );
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Policies de SELECT: la trampa del snapshot (leer 0015)
-- ─────────────────────────────────────────────────────────────────────────
-- Las dos funciones de arriba son `stable`: dentro de un `INSERT ... RETURNING`
-- (que es lo que hace supabase-js con `.insert().select()`, o sea TODA alta
-- desde el panel) trabajan con el snapshot previo a la inserción, así que la
-- fila recién creada no figura en su resultado. Postgres exige pasar la policy
-- de SELECT sobre la fila devuelta y falla con un error que dice "new row
-- violates row-level security policy", culpando al WITH CHECK del INSERT.
--
-- En 0015 esto se arregló para owner/editor sumando una condición evaluada
-- SOBRE LA FILA. Acá hay que sumar la equivalente para plataforma:
-- `or auth_is_platform()`, que no depende de ningún snapshot.
--
-- SI ESTO FALTA, alguien de Vrotta no puede crear proyectos ni nada que
-- cuelgue de ellos, y el error es críptico. Es la regresión más probable.

drop policy if exists tenants_select on tenants;
create policy tenants_select on tenants for select
  using (id in (select auth_tenant_ids()) or auth_is_platform());

drop policy if exists projects_select on projects;
create policy projects_select on projects for select
  using (
    id in (select auth_accessible_project_ids())
    or auth_role_for_tenant(tenant_id) = any (array['owner'::membership_role, 'editor'::membership_role])
    or auth_is_platform()
  );

drop policy if exists groups_select on groups;
create policy groups_select on groups for select
  using (
    project_id in (select auth_accessible_project_ids())
    or auth_role_for_tenant(tenant_id) = any (array['owner'::membership_role, 'editor'::membership_role])
    or auth_is_platform()
  );

drop policy if exists unit_types_select on unit_types;
create policy unit_types_select on unit_types for select
  using (
    project_id in (select auth_accessible_project_ids())
    or auth_role_for_tenant(tenant_id) = any (array['owner'::membership_role, 'editor'::membership_role])
    or auth_is_platform()
  );

drop policy if exists units_select on units;
create policy units_select on units for select
  using (
    project_id in (select auth_accessible_project_ids())
    or auth_role_for_tenant(tenant_id) = any (array['owner'::membership_role, 'editor'::membership_role])
    or auth_is_platform()
  );

drop policy if exists scenes_select on scenes;
create policy scenes_select on scenes for select
  using (
    project_id in (select auth_accessible_project_ids())
    or auth_role_for_tenant(tenant_id) = any (array['owner'::membership_role, 'editor'::membership_role])
    or auth_is_platform()
  );

drop policy if exists hotspots_select on hotspots;
create policy hotspots_select on hotspots for select
  using (
    scene_id in (select id from scenes where project_id in (select auth_accessible_project_ids()))
    or auth_role_for_tenant(tenant_id) = any (array['owner'::membership_role, 'editor'::membership_role])
    or auth_is_platform()
  );

drop policy if exists project_material_select on project_material;
create policy project_material_select on project_material for select
  using (
    project_id in (select auth_accessible_project_ids())
    or auth_role_for_tenant(tenant_id) = any (array['owner'::membership_role, 'editor'::membership_role])
    or auth_is_platform()
  );

drop policy if exists material_files_select on material_files;
create policy material_files_select on material_files for select
  using (
    project_id in (select auth_accessible_project_ids())
    or auth_role_for_tenant(tenant_id) = any (array['owner'::membership_role, 'editor'::membership_role])
    or auth_is_platform()
  );

drop policy if exists material_share_links_select on material_share_links;
create policy material_share_links_select on material_share_links for select
  using (
    project_id in (select auth_accessible_project_ids())
    or auth_role_for_tenant(tenant_id) = any (array['owner'::membership_role, 'editor'::membership_role])
    or auth_is_platform()
  );

-- `unit_prices_select` y `jobs_select` no sufren la trampa del snapshot pero
-- exigían rol de tenant, que para Vrotta es NULL: sin esto, el equipo no ve
-- precios ni la cola de procesamiento de sus propios proyectos.
drop policy if exists unit_prices_select on unit_prices;
create policy unit_prices_select on unit_prices for select
  using (
    auth_is_platform()
    or exists (
      select 1 from units u
      where u.id = unit_id
        and u.project_id in (select auth_accessible_project_ids())
        and (
          auth_role_for_project(u.project_id) in ('owner', 'editor')
          or (auth_role_for_project(u.project_id) = 'sales' and visibility = 'public')
        )
    )
  );

drop policy if exists jobs_select on jobs;
create policy jobs_select on jobs for select
  using (auth_role_for_project(project_id) in ('owner', 'editor') or auth_is_platform());

drop policy if exists publications_select on publications;
create policy publications_select on publications for select
  using (project_id in (select auth_accessible_project_ids()) or auth_is_platform());

drop policy if exists leads_select on leads;
create policy leads_select on leads for select
  using (project_id in (select auth_accessible_project_ids()) or auth_is_platform());

drop policy if exists unit_status_log_select on unit_status_log;
create policy unit_status_log_select on unit_status_log for select
  using (
    auth_is_platform()
    or exists (
      select 1 from units u
      where u.id = unit_id and u.project_id in (select auth_accessible_project_ids())
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Policies de ESCRITURA: se agregan, no se heredan
-- ─────────────────────────────────────────────────────────────────────────
-- Cada una repite la condición vieja (nadie pierde nada en esta migración) y
-- le suma la de plataforma que corresponde según la tabla de permisos:
-- `auth_is_platform()` para lo que hace producción, `auth_is_platform_admin()`
-- para lo destructivo.

drop policy if exists tenants_update on tenants;
create policy tenants_update on tenants for update
  using (auth_role_for_tenant(id) = 'owner' or auth_is_platform())
  with check (auth_role_for_tenant(id) = 'owner' or auth_is_platform());

-- Dar de alta y borrar inmobiliarias: sólo Vrotta Admin. Antes NO existía
-- policy de insert ni de delete sobre `tenants`: el alta la hacía el panel
-- con la service key, saltándose la RLS. Ahora es una operación normal de
-- usuario, y el chequeo vive en la base.
drop policy if exists tenants_insert on tenants;
create policy tenants_insert on tenants for insert
  to authenticated
  with check (auth_is_platform_admin());

drop policy if exists tenants_delete on tenants;
create policy tenants_delete on tenants for delete
  to authenticated
  using (auth_is_platform_admin());

-- Equipos: el Administrador de la inmobiliaria invita a los suyos; de
-- plataforma, sólo el Admin (el Operador no toca equipos).
drop policy if exists memberships_write on memberships;
create policy memberships_write on memberships for all
  using (auth_role_for_tenant(tenant_id) = 'owner' or auth_is_platform_admin())
  with check (auth_role_for_tenant(tenant_id) = 'owner' or auth_is_platform_admin());

drop policy if exists membership_projects_write on membership_projects;
create policy membership_projects_write on membership_projects for all
  using (
    auth_is_platform_admin()
    or exists (
      select 1 from memberships m
      where m.id = membership_id and auth_role_for_tenant(m.tenant_id) = 'owner'
    )
  )
  with check (
    auth_is_platform_admin()
    or exists (
      select 1 from memberships m
      where m.id = membership_id and auth_role_for_tenant(m.tenant_id) = 'owner'
    )
  );

-- Proyectos.
drop policy if exists projects_insert on projects;
create policy projects_insert on projects for insert
  with check (auth_role_for_tenant(tenant_id) in ('owner', 'editor') or auth_is_platform());

drop policy if exists projects_update on projects;
create policy projects_update on projects for update
  using (
    auth_is_platform()
    or (
      id in (select auth_accessible_project_ids())
      and auth_role_for_project(id) in ('owner', 'editor')
    )
  )
  with check (auth_role_for_tenant(tenant_id) in ('owner', 'editor') or auth_is_platform());

-- Borrar un proyecto se lleva puestas escenas, unidades, hotspots y leads:
-- queda en Vrotta Admin (además del owner del tenant, que lo conserva hasta
-- 0021).
drop policy if exists projects_delete on projects;
create policy projects_delete on projects for delete
  using (auth_role_for_project(id) = 'owner' or auth_is_platform_admin());

-- Estructura y escenas.
drop policy if exists groups_write on groups;
create policy groups_write on groups for all
  using (auth_role_for_project(project_id) in ('owner', 'editor') or auth_is_platform())
  with check (auth_role_for_project(project_id) in ('owner', 'editor') or auth_is_platform());

drop policy if exists unit_types_write on unit_types;
create policy unit_types_write on unit_types for all
  using (auth_role_for_project(project_id) in ('owner', 'editor') or auth_is_platform())
  with check (auth_role_for_project(project_id) in ('owner', 'editor') or auth_is_platform());

drop policy if exists scenes_write on scenes;
create policy scenes_write on scenes for all
  using (auth_role_for_project(project_id) in ('owner', 'editor') or auth_is_platform())
  with check (auth_role_for_project(project_id) in ('owner', 'editor') or auth_is_platform());

drop policy if exists hotspots_write on hotspots;
create policy hotspots_write on hotspots for all
  using (
    auth_is_platform()
    or exists (
      select 1 from scenes s
      where s.id = scene_id and auth_role_for_project(s.project_id) in ('owner', 'editor')
    )
  )
  with check (
    auth_is_platform()
    or exists (
      select 1 from scenes s
      where s.id = scene_id and auth_role_for_project(s.project_id) in ('owner', 'editor')
    )
  );

-- Unidades. Ojo: la RLS no distingue columnas — quién puede tocar QUÉ columna
-- de `units` lo resuelve el trigger del punto 8.
drop policy if exists units_insert on units;
create policy units_insert on units for insert
  with check (auth_role_for_project(project_id) in ('owner', 'editor') or auth_is_platform());

drop policy if exists units_update on units;
create policy units_update on units for update
  using (auth_role_for_project(project_id) in ('owner', 'editor') or auth_is_platform())
  with check (auth_role_for_project(project_id) in ('owner', 'editor') or auth_is_platform());

drop policy if exists units_delete on units;
create policy units_delete on units for delete
  using (auth_role_for_project(project_id) in ('owner', 'editor') or auth_is_platform());

drop policy if exists unit_prices_write on unit_prices;
create policy unit_prices_write on unit_prices for all
  using (
    auth_is_platform()
    or exists (
      select 1 from units u
      where u.id = unit_id and auth_role_for_project(u.project_id) in ('owner', 'editor')
    )
  )
  with check (
    auth_is_platform()
    or exists (
      select 1 from units u
      where u.id = unit_id and auth_role_for_project(u.project_id) in ('owner', 'editor')
    )
  );

drop policy if exists publications_insert on publications;
create policy publications_insert on publications for insert
  with check (auth_role_for_project(project_id) in ('owner', 'editor') or auth_is_platform());

-- Material.
drop policy if exists project_material_write on project_material;
create policy project_material_write on project_material for all
  using (auth_role_for_project(project_id) in ('owner', 'editor') or auth_is_platform())
  with check (auth_role_for_project(project_id) in ('owner', 'editor') or auth_is_platform());

drop policy if exists material_files_insert on material_files;
create policy material_files_insert on material_files for insert
  with check (auth_role_for_project(project_id) in ('owner', 'editor') or auth_is_platform());

drop policy if exists material_files_delete on material_files;
create policy material_files_delete on material_files for delete
  using (auth_role_for_project(project_id) in ('owner', 'editor') or auth_is_platform());

drop policy if exists material_share_links_insert on material_share_links;
create policy material_share_links_insert on material_share_links for insert
  with check (auth_role_for_project(project_id) in ('owner', 'editor') or auth_is_platform());

drop policy if exists material_share_links_update on material_share_links;
create policy material_share_links_update on material_share_links for update
  using (auth_role_for_project(project_id) in ('owner', 'editor') or auth_is_platform())
  with check (auth_role_for_project(project_id) in ('owner', 'editor') or auth_is_platform());

-- ─────────────────────────────────────────────────────────────────────────
-- 6. leads: se cierra un bug viejo y se excluye al Operador
-- ─────────────────────────────────────────────────────────────────────────
-- `leads` nunca tuvo policy de UPDATE. El CRM del panel (`patchLeadPayload`)
-- hace `update leads` con la sesión del usuario: la sentencia afecta 0 filas
-- y supabase-js no devuelve error, así que marcar un lead como "contactado"
-- parecía funcionar y no guardaba nada. Al habilitar esta policy, eso pasa a
-- persistir de verdad: es un arreglo, pero cambia el comportamiento visible.
--
-- Vrotta Operador VE los leads (policy de select, punto 4) pero no los
-- gestiona: es seguimiento comercial del cliente, no producción. La exclusión
-- está en la base y no sólo en el panel, que es donde tiene que estar.
-- Para un usuario de tenant `auth_platform_role()` es NULL, y
-- `null is distinct from 'operator'` es true, así que los tres roles de
-- cliente pasan.
drop policy if exists leads_update on leads;
create policy leads_update on leads for update
  to authenticated
  using (
    project_id in (select auth_accessible_project_ids())
    and auth_platform_role() is distinct from 'operator'::platform_role
  )
  with check (
    project_id in (select auth_accessible_project_ids())
    and auth_platform_role() is distinct from 'operator'::platform_role
  );

-- Borrar un lead es destructivo y no se deshace: Administrador del cliente o
-- Vrotta Admin.
drop policy if exists leads_delete on leads;
create policy leads_delete on leads for delete
  using (auth_role_for_project(project_id) = 'owner' or auth_is_platform_admin());

-- ─────────────────────────────────────────────────────────────────────────
-- 7. set_units_status y el storage del material
-- ─────────────────────────────────────────────────────────────────────────
-- La RPC de 0011 abortaba si `auth_role_for_tenant()` era NULL. Para alguien
-- de Vrotta siempre lo es (no tiene membership en ningún tenant), así que sin
-- este cambio no puede mover estados en masa en ningún proyecto. Se cambia
-- SÓLO esa guarda; el resto de la función queda igual que en 0011.

create or replace function set_units_status(
  p_filter jsonb,
  p_status text,
  p_note   text default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid := (p_filter ->> 'project_id')::uuid;
  v_tenant_id  uuid;
  v_role       membership_role;
  v_count      integer;
begin
  if v_project_id is null then
    raise exception 'set_units_status: p_filter.project_id es obligatorio';
  end if;

  if p_status is null or not (p_status = any (enum_range(null::unit_status)::text[])) then
    raise exception 'set_units_status: status inválido: %', p_status;
  end if;

  select tenant_id into v_tenant_id from projects where id = v_project_id;
  if v_tenant_id is null then
    raise exception 'set_units_status: proyecto % no existe', v_project_id;
  end if;

  v_role := auth_role_for_tenant(v_tenant_id);
  if v_role is null and not auth_is_platform() then
    raise exception 'set_units_status: sin acceso al tenant del proyecto';
  end if;

  -- Si el membership del usuario está scopeado a proyectos puntuales,
  -- este proyecto tiene que ser uno de ellos. Para plataforma,
  -- auth_accessible_project_ids() devuelve todos los proyectos.
  if v_project_id not in (select auth_accessible_project_ids()) then
    raise exception 'set_units_status: sin acceso a este proyecto';
  end if;

  -- Los 3 roles de cliente (owner, editor, sales) y los dos de plataforma
  -- pueden cambiar estado de unidad.

  perform set_config('app.status_change_note', coalesce(p_note, ''), true);

  with matched as (
    select u.id
    from units u
    where u.project_id = v_project_id
      and (p_filter -> 'group_id' is null
           or u.group_id = (p_filter ->> 'group_id')::uuid)
      and (p_filter -> 'unit_type_id' is null
           or u.unit_type_id = (p_filter ->> 'unit_type_id')::uuid)
      and (p_filter -> 'status_in' is null
           or u.status::text in (select jsonb_array_elements_text(p_filter -> 'status_in')))
      and (p_filter -> 'code_in' is null
           or u.code in (select jsonb_array_elements_text(p_filter -> 'code_in')))
      and (p_filter ->> 'code_prefix' is null
           or u.code like (p_filter ->> 'code_prefix') || '%')
  )
  update units u
  set status = p_status::unit_status
  from matched
  where u.id = matched.id;

  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

grant execute on function set_units_status(jsonb, text, text) to authenticated;

-- Storage del bucket `material`: las policies de 0016 exigen rol de tenant,
-- que para Vrotta es NULL. Sin esto, el equipo no puede subir ni borrar
-- material desde el panel. La de SELECT ya cascadea por
-- `auth_accessible_project_ids()` y no hace falta tocarla.
drop policy if exists material_objects_insert on storage.objects;
create policy material_objects_insert on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'material'
    and (
      auth_role_for_project((storage.foldername(name))[1]::uuid) in ('owner', 'editor')
      or auth_is_platform()
    )
  );

drop policy if exists material_objects_delete on storage.objects;
create policy material_objects_delete on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'material'
    and (
      auth_role_for_project((storage.foldername(name))[1]::uuid) in ('owner', 'editor')
      or auth_is_platform()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 8. Qué columnas de `units` puede tocar cada quién
-- ─────────────────────────────────────────────────────────────────────────
-- La RLS de Postgres es por FILA, no por columna: `units_update` deja pasar a
-- owner/editor y eso les habilita cualquier columna. Pero la ESTRUCTURA del
-- proyecto (el código de la unidad, a qué manzana/piso pertenece y de qué
-- tipo es) la arma Vrotta a partir del material: si el cliente la edita, deja
-- de coincidir con los polígonos del plano y con lo publicado.
--
-- En cambio los m² y los atributos (`attrs`) SÍ los edita el cliente:
-- decisión de la dueña. Son datos comerciales que la inmobiliaria conoce
-- mejor y corrige sobre la marcha.
--
--   Administrador (owner) y Gestor (editor) → status, area_total_m2, attrs
--   Vendedor (sales)                        → sólo status, y sólo vía
--                                             set_units_status (la policy de
--                                             UPDATE directo no lo incluye)
--   Plataforma (Vrotta)                     → todo
--
-- Defensa en la base y no sólo en el panel: un PATCH armado a mano contra la
-- API de Supabase también choca contra esto.

create or replace function units_tenant_update_guard() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- service_role (el worker, los scripts de importación) no tiene `sub` en el
  -- token: auth.uid() es NULL. Pasa sin chequeo, como pasa toda la RLS.
  if auth.uid() is null then
    return new;
  end if;

  if auth_is_platform() then
    return new;
  end if;

  if new.id           is distinct from old.id
     or new.project_id   is distinct from old.project_id
     or new.tenant_id    is distinct from old.tenant_id
     or new.group_id     is distinct from old.group_id
     or new.unit_type_id is distinct from old.unit_type_id
     or new.code         is distinct from old.code
     or new.media        is distinct from old.media
     or new.sort         is distinct from old.sort
     or new.created_at   is distinct from old.created_at
  then
    raise exception
      'La estructura de la unidad (código, grupo, tipo) la administra Vrotta. '
      'Desde el panel del cliente se pueden cambiar estado, m² y atributos.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists units_tenant_update_guard on units;
create trigger units_tenant_update_guard
  before update on units
  for each row execute function units_tenant_update_guard();
