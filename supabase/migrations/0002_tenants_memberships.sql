-- 0002_tenants_memberships.sql
-- Tenants, memberships y el scoping opcional de membership a proyectos puntuales.

create table if not exists tenants (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  settings   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists memberships (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       membership_role not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index if not exists memberships_user_id_idx on memberships (user_id);
create index if not exists memberships_tenant_id_idx on memberships (tenant_id);

-- Si un membership de rol "sales" (u otro) necesita quedar limitado a un
-- subconjunto de proyectos del tenant, se listan acá. Ausencia de filas para
-- un membership_id = acceso a todos los proyectos del tenant (comportamiento
-- por defecto). Ver auth_accessible_project_ids() en 0009.
create table if not exists membership_projects (
  membership_id uuid not null references memberships(id) on delete cascade,
  project_id    uuid not null, -- FK agregada en 0003 tras crear projects
  primary key (membership_id, project_id)
);
