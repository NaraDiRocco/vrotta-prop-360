-- 0009_auth_functions.sql
-- Funciones auxiliares que usan las policies de RLS. security definer +
-- stable: se evalúan una vez por statement y corren con los privilegios del
-- dueño (necesario para leer memberships/projects sin volver a chocar con
-- la propia RLS de esas tablas).

create or replace function auth_tenant_ids() returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from memberships where user_id = auth.uid();
$$;

create or replace function auth_role_for_tenant(p_tenant_id uuid) returns membership_role
language sql
stable
security definer
set search_path = public
as $$
  select role from memberships
  where tenant_id = p_tenant_id and user_id = auth.uid()
  limit 1;
$$;

-- Proyectos a los que el usuario actual tiene acceso: todos los del tenant
-- si su membership no tiene filas en membership_projects, o sólo los
-- listados si las tiene (scoping opcional, pensado para "sales").
create or replace function auth_accessible_project_ids() returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from projects p
  join memberships m on m.tenant_id = p.tenant_id and m.user_id = auth.uid()
  where
    not exists (select 1 from membership_projects mp where mp.membership_id = m.id)
    or exists (
      select 1 from membership_projects mp
      where mp.membership_id = m.id and mp.project_id = p.id
    );
$$;

-- Rol del usuario actual sobre un proyecto puntual (via el tenant del
-- proyecto), NULL si no tiene membership en ese tenant.
create or replace function auth_role_for_project(p_project_id uuid) returns membership_role
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from projects p
  join memberships m on m.tenant_id = p.tenant_id and m.user_id = auth.uid()
  where p.id = p_project_id
  limit 1;
$$;
