-- 0006_scenes_hotspots.sql

create table if not exists scenes (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  tenant_id     uuid references tenants(id) on delete cascade,
  slug          text not null,
  kind          scene_kind not null,
  name          text not null,
  source        jsonb not null default '{}'::jsonb,
  initial_view  jsonb,
  north_offset  numeric,
  sort          int not null default 0,
  created_at    timestamptz not null default now(),
  unique (project_id, slug)
);

create index if not exists scenes_project_id_idx on scenes (project_id);

create table if not exists hotspots (
  id              uuid primary key default gen_random_uuid(),
  scene_id        uuid not null references scenes(id) on delete cascade,
  tenant_id       uuid references tenants(id) on delete cascade,
  target_kind     hotspot_target_kind not null,
  unit_id         uuid references units(id) on delete cascade,
  group_id        uuid references groups(id) on delete cascade,
  target_scene_id uuid references scenes(id) on delete cascade,
  geometry_kind   geometry_kind not null,
  geometry        jsonb not null,
  label_anchor    jsonb,
  meta            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),

  -- A lo sumo uno de los tres targets puede estar seteado (target_kind=info
  -- no setea ninguno).
  constraint hotspots_single_target check (
    (case when unit_id is not null then 1 else 0 end)
  + (case when group_id is not null then 1 else 0 end)
  + (case when target_scene_id is not null then 1 else 0 end) <= 1
  ),
  constraint hotspots_target_kind_matches check (
    (target_kind = 'unit'  and unit_id is not null and group_id is null and target_scene_id is null) or
    (target_kind = 'group' and group_id is not null and unit_id is null and target_scene_id is null) or
    (target_kind = 'scene' and target_scene_id is not null and unit_id is null and group_id is null) or
    (target_kind = 'info'  and unit_id is null and group_id is null and target_scene_id is null)
  )
);

create index if not exists hotspots_scene_id_idx on hotspots (scene_id);
create index if not exists hotspots_unit_id_idx on hotspots (unit_id) where unit_id is not null;
create index if not exists hotspots_group_id_idx on hotspots (group_id) where group_id is not null;

-- A una unidad le corresponde a lo sumo un hotspot por escena.
create unique index if not exists hotspots_scene_unit_key
  on hotspots (scene_id, unit_id) where unit_id is not null;
