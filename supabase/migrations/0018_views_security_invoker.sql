-- 0018_views_security_invoker.sql
-- Cierra fuga de datos entre clientes vía vistas que bypassean RLS.
--
-- SÍNTOMA
--   La vista `project_health` creada en 0012 corre con los permisos de quien
--   la creó (el superusuario de la migración), no del usuario que la consulta.
--   Esto bypasea completamente la RLS de las tablas subyacentes.
--   Resultado: desde el panel o desde la clave anónima, cualquiera podría
--   leer nombre, slug, tenant_id y conteos de TODOS los proyectos de TODOS
--   los clientes.
--
-- CAUSA
--   En Postgres una vista SIN la opción `security_invoker = true` se ejecuta
--   bajo la identidad de quien la creó. Las policies de RLS no se aplican
--   porque el superusuario bypass RLS por defecto.
--
--   El comentario en 0012 afirma: "hereda la RLS de las tablas subyacentes
--   con los privilegios del usuario que consulta". Esto es incorrecto.
--
-- ARREGLO
--   Recrear la vista `project_health` con `security_invoker = true` para que
--   se ejecute bajo la identidad del usuario que la consulta. Así la RLS de
--   las tablas subyacentes (projects, units, scenes, hotspots, unit_prices)
--   sí se aplica.
--
--   `security_invoker` hace que:
--   - La vista hereda realmente las policies de RLS del usuario que la consulta
--   - Si el usuario es anónimo, ve solo lo que la policy anónima permite
--   - Si es autenticado, ve solo sus proyectos (filtrados por auth_accessible_project_ids)

create or replace view project_health
  with (security_invoker = true)
as
select
  p.id   as project_id,
  p.tenant_id,
  p.slug,
  p.name,

  (
    select count(*)
    from units u
    where u.project_id = p.id
      and not exists (select 1 from hotspots h where h.unit_id = u.id)
  ) as units_without_geometry,

  (
    select count(*)
    from scenes s
    where s.project_id = p.id
      and exists (select 1 from jobs j where j.scene_id = s.id and j.status = 'failed')
  ) as scenes_with_failed_jobs,

  (
    select count(*)
    from units u
    where u.project_id = p.id
      and not exists (
        select 1 from unit_prices up
        where up.unit_id = u.id
          and up.visibility = 'public'
          and up.valid_from <= now()
          and (up.valid_to is null or up.valid_to > now())
      )
  ) as public_units_without_current_price,

  (
    p.settings ? 'initial_scene_id'
    and exists (
      select 1 from scenes s
      where s.id = nullif(p.settings ->> 'initial_scene_id', '')::uuid
        and s.project_id = p.id
    )
  ) as has_initial_scene,

  (coalesce(jsonb_array_length(p.settings -> 'allowed_domains'), 0) > 0) as has_authorized_domains

from projects p;
