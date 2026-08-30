-- 0011_rpc_set_units_status.sql
-- Cambia el estado de un conjunto de unidades definido por PREDICADO (no por
-- lista de ids): es lo que permite mover 800 lotes en una sola llamada.
-- security definer: así "sales" también puede usarla (la policy de UPDATE
-- directo sobre units es sólo owner/editor), pero valida el acceso a mano
-- porque al ser definer bypassea la RLS de units.
--
-- p_filter (jsonb), claves soportadas (todas opcionales salvo project_id):
--   project_id   uuid  (obligatorio)
--   group_id     uuid
--   unit_type_id uuid
--   status_in    text[]  -- filtra por estado ACTUAL
--   code_in      text[]
--   code_prefix  text
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
  if v_role is null then
    raise exception 'set_units_status: sin acceso al tenant del proyecto';
  end if;

  -- Si el membership del usuario está scopeado a proyectos puntuales,
  -- este proyecto tiene que ser uno de ellos.
  if v_project_id not in (select auth_accessible_project_ids()) then
    raise exception 'set_units_status: sin acceso a este proyecto';
  end if;

  -- Los 3 roles (owner, editor, sales) pueden cambiar estado de unidad.

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
