-- 0007_publications_leads_jobs_saved_views.sql

create table if not exists publications (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  version       int not null,
  manifest      jsonb not null,
  published_by  uuid references auth.users(id),
  published_at  timestamptz not null default now(),
  unique (project_id, version)
);

create index if not exists publications_project_id_idx on publications (project_id, version desc);

create table if not exists leads (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  unit_id    uuid references units(id) on delete set null,
  channel    text,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists leads_project_id_idx on leads (project_id, created_at desc);
create index if not exists leads_unit_id_idx on leads (unit_id) where unit_id is not null;

-- Cola de procesamiento de tiles (panoramas/planos).
create table if not exists jobs (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  scene_id   uuid references scenes(id) on delete cascade,
  kind       text not null,
  status     job_status not null default 'queued',
  progress   numeric not null default 0 check (progress >= 0 and progress <= 100),
  eta_s      numeric,
  error      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jobs_project_id_status_idx on jobs (project_id, status);
create index if not exists jobs_scene_id_idx on jobs (scene_id);

drop trigger if exists jobs_touch_updated_at on jobs;
create trigger jobs_touch_updated_at
  before update on jobs
  for each row
  execute function touch_updated_at();

-- Vistas guardadas de la tabla de unidades (filtros/orden/columnas por usuario).
create table if not exists saved_views (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  filters    jsonb not null default '{}'::jsonb,
  sort       jsonb,
  columns    jsonb,
  created_at timestamptz not null default now(),
  unique (project_id, user_id, name)
);

create index if not exists saved_views_project_user_idx on saved_views (project_id, user_id);
