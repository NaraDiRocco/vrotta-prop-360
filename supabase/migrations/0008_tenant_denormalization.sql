-- 0008_tenant_denormalization.sql
-- Completa automáticamente tenant_id en groups, unit_types, units y scenes
-- (a partir de su project_id) y en hotspots (a partir de su scene_id).
-- Corre BEFORE INSERT/UPDATE y siempre pisa el valor con el real: el
-- cliente nunca debería mandar tenant_id a mano.

create or replace function set_tenant_id_from_project() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select tenant_id into new.tenant_id from projects where id = new.project_id;
  return new;
end;
$$;

create or replace function set_tenant_id_from_scene() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select tenant_id into new.tenant_id from scenes where id = new.scene_id;
  return new;
end;
$$;

drop trigger if exists groups_set_tenant_id on groups;
create trigger groups_set_tenant_id
  before insert or update of project_id on groups
  for each row execute function set_tenant_id_from_project();

drop trigger if exists unit_types_set_tenant_id on unit_types;
create trigger unit_types_set_tenant_id
  before insert or update of project_id on unit_types
  for each row execute function set_tenant_id_from_project();

drop trigger if exists units_set_tenant_id on units;
create trigger units_set_tenant_id
  before insert or update of project_id on units
  for each row execute function set_tenant_id_from_project();

drop trigger if exists scenes_set_tenant_id on scenes;
create trigger scenes_set_tenant_id
  before insert or update of project_id on scenes
  for each row execute function set_tenant_id_from_project();

drop trigger if exists hotspots_set_tenant_id on hotspots;
create trigger hotspots_set_tenant_id
  before insert or update of scene_id on hotspots
  for each row execute function set_tenant_id_from_scene();

-- Backfill por si ya hay filas (no-op en un esquema recién creado).
update groups     set project_id = project_id where tenant_id is null;
update unit_types set project_id = project_id where tenant_id is null;
update units       set project_id = project_id where tenant_id is null;
update scenes      set project_id = project_id where tenant_id is null;
update hotspots     set scene_id  = scene_id   where tenant_id is null;

-- A partir de acá tenant_id es de facto obligatorio (lo pone el trigger).
alter table groups     alter column tenant_id set not null;
alter table unit_types alter column tenant_id set not null;
alter table units      alter column tenant_id set not null;
alter table scenes     alter column tenant_id set not null;
alter table hotspots   alter column tenant_id set not null;

create index if not exists groups_tenant_id_idx     on groups (tenant_id);
create index if not exists unit_types_tenant_id_idx  on unit_types (tenant_id);
create index if not exists units_tenant_id_idx       on units (tenant_id);
create index if not exists scenes_tenant_id_idx      on scenes (tenant_id);
create index if not exists hotspots_tenant_id_idx    on hotspots (tenant_id);
