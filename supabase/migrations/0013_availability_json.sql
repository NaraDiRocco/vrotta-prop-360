-- 0013_availability_json.sql
-- Genera el jsonb de availability.json para un proyecto, con la forma
-- exacta de AvailabilityFile (packages/core/src/types.ts):
--   { v, generated_at, units: { [code]: { s, p } } }
-- p viaja en null si el precio vigente no es 'public' (o si no hay precio
-- vigente): el precio nunca sale del backend si la visibilidad no lo pide.
--
-- No es security definer: corre con los privilegios (y la RLS) de quien la
-- llama. El publish real se hace desde el backend con service_role, que
-- bypassea RLS y ve todas las unidades del proyecto.
create or replace function generate_availability_json(p_project_id uuid) returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'v', 1,
    'generated_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'units', coalesce(jsonb_object_agg(u.code, d.unit_data) filter (where u.code is not null), '{}'::jsonb)
  )
  from units u
  left join lateral (
    select up.amount, up.currency, up.visibility
    from unit_prices up
    where up.unit_id = u.id
      and up.valid_from <= now()
      and (up.valid_to is null or up.valid_to > now())
    order by up.valid_from desc
    limit 1
  ) price on true
  cross join lateral (
    select jsonb_build_object(
      's', u.status,
      'p', case
             when price.amount is not null and price.visibility = 'public'
               then jsonb_build_object('a', price.amount, 'c', price.currency)
             else null
           end
    ) as unit_data
  ) d
  where u.project_id = p_project_id;
$$;

grant execute on function generate_availability_json(uuid) to authenticated, service_role;
