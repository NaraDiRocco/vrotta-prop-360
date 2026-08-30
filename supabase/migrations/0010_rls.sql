-- 0010_rls.sql
-- RLS deny-by-default en todas las tablas: se habilita RLS y sólo se abre
-- lo que la matriz de roles autoriza. Sin policy para una operación =
-- denegada. service_role (backend) sigue bypasseando todo, como siempre.
--
-- Matriz (owner | editor | sales):
--   ver proyectos asignados         ✓ ✓ ✓
--   cambiar estado de unidad        ✓ ✓ ✓   (sales sólo vía RPC set_units_status)
--   ver/editar precios              ✓ ✓ (sales: sólo lectura de públicos)
--   ver leads                       ✓ ✓ ✓
--   editar hotspots/escenas/estructura  ✓ ✓ ✗
--   publicar                        ✓ ✓ ✗
--   configuración del tenant        ✓ ✗ ✗

alter table tenants             enable row level security;
alter table memberships         enable row level security;
alter table membership_projects enable row level security;
alter table projects            enable row level security;
alter table groups              enable row level security;
alter table unit_types          enable row level security;
alter table units               enable row level security;
alter table unit_prices         enable row level security;
alter table unit_status_log     enable row level security;
alter table scenes              enable row level security;
alter table hotspots            enable row level security;
alter table publications        enable row level security;
alter table leads               enable row level security;
alter table jobs                enable row level security;
alter table saved_views         enable row level security;

-- ── tenants ──────────────────────────────────────────────────────────────
drop policy if exists tenants_select on tenants;
create policy tenants_select on tenants for select
  using (id in (select auth_tenant_ids()));

drop policy if exists tenants_update on tenants;
create policy tenants_update on tenants for update
  using (auth_role_for_tenant(id) = 'owner')
  with check (auth_role_for_tenant(id) = 'owner');

-- ── memberships ──────────────────────────────────────────────────────────
drop policy if exists memberships_select on memberships;
create policy memberships_select on memberships for select
  using (tenant_id in (select auth_tenant_ids()));

drop policy if exists memberships_write on memberships;
create policy memberships_write on memberships for all
  using (auth_role_for_tenant(tenant_id) = 'owner')
  with check (auth_role_for_tenant(tenant_id) = 'owner');

-- ── membership_projects ──────────────────────────────────────────────────
drop policy if exists membership_projects_select on membership_projects;
create policy membership_projects_select on membership_projects for select
  using (
    exists (
      select 1 from memberships m
      where m.id = membership_id and m.tenant_id in (select auth_tenant_ids())
    )
  );

drop policy if exists membership_projects_write on membership_projects;
create policy membership_projects_write on membership_projects for all
  using (
    exists (
      select 1 from memberships m
      where m.id = membership_id and auth_role_for_tenant(m.tenant_id) = 'owner'
    )
  )
  with check (
    exists (
      select 1 from memberships m
      where m.id = membership_id and auth_role_for_tenant(m.tenant_id) = 'owner'
    )
  );

-- ── projects ─────────────────────────────────────────────────────────────
drop policy if exists projects_select on projects;
create policy projects_select on projects for select
  using (id in (select auth_accessible_project_ids()));

drop policy if exists projects_insert on projects;
create policy projects_insert on projects for insert
  with check (auth_role_for_tenant(tenant_id) in ('owner', 'editor'));

drop policy if exists projects_update on projects;
create policy projects_update on projects for update
  using (
    id in (select auth_accessible_project_ids())
    and auth_role_for_project(id) in ('owner', 'editor')
  )
  with check (auth_role_for_tenant(tenant_id) in ('owner', 'editor'));

drop policy if exists projects_delete on projects;
create policy projects_delete on projects for delete
  using (auth_role_for_project(id) = 'owner');

-- ── groups / unit_types / scenes: estructura → sólo owner/editor escriben ─
drop policy if exists groups_select on groups;
create policy groups_select on groups for select
  using (project_id in (select auth_accessible_project_ids()));
drop policy if exists groups_write on groups;
create policy groups_write on groups for all
  using (auth_role_for_project(project_id) in ('owner', 'editor'))
  with check (auth_role_for_project(project_id) in ('owner', 'editor'));

drop policy if exists unit_types_select on unit_types;
create policy unit_types_select on unit_types for select
  using (project_id in (select auth_accessible_project_ids()));
drop policy if exists unit_types_write on unit_types;
create policy unit_types_write on unit_types for all
  using (auth_role_for_project(project_id) in ('owner', 'editor'))
  with check (auth_role_for_project(project_id) in ('owner', 'editor'));

drop policy if exists scenes_select on scenes;
create policy scenes_select on scenes for select
  using (project_id in (select auth_accessible_project_ids()));
drop policy if exists scenes_write on scenes;
create policy scenes_write on scenes for all
  using (auth_role_for_project(project_id) in ('owner', 'editor'))
  with check (auth_role_for_project(project_id) in ('owner', 'editor'));

-- hotspots no tiene project_id directo: se resuelve vía su escena.
drop policy if exists hotspots_select on hotspots;
create policy hotspots_select on hotspots for select
  using (
    exists (
      select 1 from scenes s
      where s.id = scene_id and s.project_id in (select auth_accessible_project_ids())
    )
  );
drop policy if exists hotspots_write on hotspots;
create policy hotspots_write on hotspots for all
  using (
    exists (
      select 1 from scenes s
      where s.id = scene_id and auth_role_for_project(s.project_id) in ('owner', 'editor')
    )
  )
  with check (
    exists (
      select 1 from scenes s
      where s.id = scene_id and auth_role_for_project(s.project_id) in ('owner', 'editor')
    )
  );

-- ── units: todos ven y pueden cambiar estado; estructura sólo owner/editor ─
-- El cambio de estado por "sales" se hace vía la función set_units_status()
-- (security definer, ver 0011), que bypassea esta policy de UPDATE. Los
-- demás roles también pueden usarla, pero owner/editor además pueden hacer
-- UPDATE directo (edición de atributos, group_id, precios asociados, etc).
drop policy if exists units_select on units;
create policy units_select on units for select
  using (project_id in (select auth_accessible_project_ids()));

drop policy if exists units_insert on units;
create policy units_insert on units for insert
  with check (auth_role_for_project(project_id) in ('owner', 'editor'));

drop policy if exists units_update on units;
create policy units_update on units for update
  using (auth_role_for_project(project_id) in ('owner', 'editor'))
  with check (auth_role_for_project(project_id) in ('owner', 'editor'));

drop policy if exists units_delete on units;
create policy units_delete on units for delete
  using (auth_role_for_project(project_id) in ('owner', 'editor'));

-- ── unit_prices: owner/editor todo; sales sólo lectura de públicos ────────
drop policy if exists unit_prices_select on unit_prices;
create policy unit_prices_select on unit_prices for select
  using (
    exists (
      select 1 from units u
      where u.id = unit_id
        and u.project_id in (select auth_accessible_project_ids())
        and (
          auth_role_for_project(u.project_id) in ('owner', 'editor')
          or (auth_role_for_project(u.project_id) = 'sales' and visibility = 'public')
        )
    )
  );

drop policy if exists unit_prices_write on unit_prices;
create policy unit_prices_write on unit_prices for all
  using (
    exists (
      select 1 from units u
      where u.id = unit_id and auth_role_for_project(u.project_id) in ('owner', 'editor')
    )
  )
  with check (
    exists (
      select 1 from units u
      where u.id = unit_id and auth_role_for_project(u.project_id) in ('owner', 'editor')
    )
  );

-- ── unit_status_log: lectura para los 3 roles; escritura sólo por trigger ──
drop policy if exists unit_status_log_select on unit_status_log;
create policy unit_status_log_select on unit_status_log for select
  using (
    exists (
      select 1 from units u
      where u.id = unit_id and u.project_id in (select auth_accessible_project_ids())
    )
  );
-- Sin policy de insert/update/delete para usuarios: el trigger corre como
-- dueño de la tabla (security definer) y bypassea la RLS.

-- ── publications: lectura para los 3 roles; publicar sólo owner/editor ────
drop policy if exists publications_select on publications;
create policy publications_select on publications for select
  using (project_id in (select auth_accessible_project_ids()));

drop policy if exists publications_insert on publications;
create policy publications_insert on publications for insert
  with check (auth_role_for_project(project_id) in ('owner', 'editor'));
-- Inmutables: sin update/delete.

-- ── leads: lectura para los 3 roles; alta pública (formulario del visor) ──
drop policy if exists leads_select on leads;
create policy leads_select on leads for select
  using (project_id in (select auth_accessible_project_ids()));

drop policy if exists leads_insert on leads;
create policy leads_insert on leads for insert
  to anon, authenticated
  with check (exists (select 1 from projects p where p.id = project_id));

drop policy if exists leads_delete on leads;
create policy leads_delete on leads for delete
  using (auth_role_for_project(project_id) = 'owner');

-- ── jobs: cola de tiles, visibilidad de owner/editor (parte de "estructura") ─
drop policy if exists jobs_select on jobs;
create policy jobs_select on jobs for select
  using (auth_role_for_project(project_id) in ('owner', 'editor'));
-- Alta/edición la hace el backend de procesamiento con service_role
-- (bypassea RLS); no se exponen policies de insert/update a usuarios.

-- ── saved_views: cada usuario administra las suyas ─────────────────────────
drop policy if exists saved_views_all on saved_views;
create policy saved_views_all on saved_views for all
  using (user_id = auth.uid() and project_id in (select auth_accessible_project_ids()))
  with check (user_id = auth.uid() and project_id in (select auth_accessible_project_ids()));
