-- 0004_structure.sql
-- Jerarquía de un proyecto: groups (auto-referente), unit_types, units.
-- tenant_id se desnormaliza acá (columna + FK); se completa por trigger en 0008.

create table if not exists groups (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  tenant_id  uuid references tenants(id) on delete cascade,
  parent_id  uuid references groups(id) on delete cascade,
  kind       text not null,       -- texto libre: bloque | manzana | torre | piso | etapa | ...
  code       text not null,
  name       text,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);

-- unique(project_id, parent_id, code) tratando parent_id nulo como un valor
-- más (los top-level también deben tener code único dentro del proyecto).
create unique index if not exists groups_project_parent_code_key
  on groups (project_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), code);

create index if not exists groups_project_id_idx on groups (project_id);
create index if not exists groups_parent_id_idx on groups (parent_id);

create table if not exists unit_types (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  tenant_id   uuid references tenants(id) on delete cascade,
  code        text not null,
  name        text not null,
  attr_schema jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  unique (project_id, code)
);

create index if not exists unit_types_project_id_idx on unit_types (project_id);

create table if not exists units (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id) on delete cascade,
  tenant_id      uuid references tenants(id) on delete cascade,
  group_id       uuid references groups(id) on delete set null,
  unit_type_id   uuid references unit_types(id) on delete set null,
  code           text not null,
  status         unit_status not null default 'no_disponible',
  area_total_m2  numeric,
  attrs          jsonb not null default '{}'::jsonb,
  media          jsonb not null default '{}'::jsonb,
  sort           int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (project_id, code)
);

create index if not exists units_project_id_idx on units (project_id);
create index if not exists units_group_id_idx on units (group_id);
create index if not exists units_unit_type_id_idx on units (unit_type_id);
