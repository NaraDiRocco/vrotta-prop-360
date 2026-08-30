-- 0012_project_health_view.sql
-- Chequeos de salud por proyecto, para el panel de "¿está listo para
-- publicar?". Es una vista simple (sin security_barrier) por lo que hereda
-- la RLS de las tablas subyacentes con los privilegios del usuario que
-- consulta: cada quien ve la salud de los proyectos a los que ya tiene
-- acceso.
--
-- "Escena inicial" y "dominios autorizados" se leen de projects.settings:
--   settings->>'initial_scene_id'   uuid en texto
--   settings->'allowed_domains'     jsonb array de strings
create or replace view project_health as
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
