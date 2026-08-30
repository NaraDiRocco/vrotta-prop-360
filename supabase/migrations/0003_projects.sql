-- 0003_projects.sql

create table if not exists projects (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  slug               text not null,
  name               text not null,
  kind               project_kind not null,
  location           jsonb not null default '{}'::jsonb,
  published_version  int not null default 0,
  settings           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (tenant_id, slug)
);

create index if not exists projects_tenant_id_idx on projects (tenant_id);

-- Ahora que projects existe, cerramos la FK diferida de membership_projects.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'membership_projects_project_id_fkey'
  ) then
    alter table membership_projects
      add constraint membership_projects_project_id_fkey
      foreign key (project_id) references projects(id) on delete cascade;
  end if;
end $$;

create index if not exists membership_projects_project_id_idx on membership_projects (project_id);
