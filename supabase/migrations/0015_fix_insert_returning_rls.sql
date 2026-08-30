-- Arregla el alta de proyectos (y de cualquier fila) vía INSERT ... RETURNING.
--
-- SÍNTOMA
--   Crear un proyecto desde el panel fallaba con:
--     new row violates row-level security policy for table "projects"
--   aunque el usuario fuera `owner` del tenant y el WITH CHECK del INSERT
--   evaluara `true` al probarlo a mano.
--
-- CAUSA
--   `projects_select` filtra por `id IN (select auth_accessible_project_ids())`.
--   Esa función es STABLE: dentro de la misma sentencia usa el snapshot previo
--   a la inserción, así que la fila recién creada NO figura en su resultado.
--   En un `INSERT ... RETURNING`, Postgres exige además pasar la policy de
--   SELECT sobre la fila devuelta — y ahí falla, reportando el error como si
--   fuera el WITH CHECK del INSERT.
--
--   Esto no es un caso de borde: `supabase-js` hace `.insert().select()` por
--   defecto, o sea que TODA alta desde el panel caía en esto.
--
-- ARREGLO
--   Sumar a la policy de lectura una condición que no dependa del snapshot:
--   quien es owner o editor del tenant puede ver los proyectos de ese tenant.
--   Es la misma semántica que ya tenía (owner/editor ven todo su tenant), pero
--   evaluada sobre la fila, no sobre una lista precalculada.
--
--   `sales` NO se ve afectado: sigue viendo únicamente los proyectos que le
--   fueron asignados vía `membership_projects`, por la primera condición.

drop policy if exists projects_select on projects;

create policy projects_select on projects
for select
using (
  id in (select auth_accessible_project_ids())
  or auth_role_for_tenant(tenant_id) = any (array['owner'::membership_role, 'editor'::membership_role])
);

-- Mismo patrón para las tablas hijas: todas se leen a través de
-- `auth_accessible_project_ids()` y sufren el mismo problema al insertar con
-- RETURNING (crear un grupo, una unidad, una escena, un hotspot…).

drop policy if exists groups_select on groups;
create policy groups_select on groups
for select
using (
  project_id in (select auth_accessible_project_ids())
  or auth_role_for_tenant(tenant_id) = any (array['owner'::membership_role, 'editor'::membership_role])
);

drop policy if exists unit_types_select on unit_types;
create policy unit_types_select on unit_types
for select
using (
  project_id in (select auth_accessible_project_ids())
  or auth_role_for_tenant(tenant_id) = any (array['owner'::membership_role, 'editor'::membership_role])
);

drop policy if exists units_select on units;
create policy units_select on units
for select
using (
  project_id in (select auth_accessible_project_ids())
  or auth_role_for_tenant(tenant_id) = any (array['owner'::membership_role, 'editor'::membership_role])
);

drop policy if exists scenes_select on scenes;
create policy scenes_select on scenes
for select
using (
  project_id in (select auth_accessible_project_ids())
  or auth_role_for_tenant(tenant_id) = any (array['owner'::membership_role, 'editor'::membership_role])
);

drop policy if exists hotspots_select on hotspots;
create policy hotspots_select on hotspots
for select
using (
  scene_id in (select id from scenes where project_id in (select auth_accessible_project_ids()))
  or auth_role_for_tenant(tenant_id) = any (array['owner'::membership_role, 'editor'::membership_role])
);
