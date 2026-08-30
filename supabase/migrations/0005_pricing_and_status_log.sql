-- 0005_pricing_and_status_log.sql

create table if not exists unit_prices (
  id         uuid primary key default gen_random_uuid(),
  unit_id    uuid not null references units(id) on delete cascade,
  amount     numeric not null check (amount >= 0),
  currency   text not null default 'USD',
  valid_from timestamptz not null default now(),
  valid_to   timestamptz,        -- null = vigente
  visibility price_visibility not null default 'public',
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to > valid_from)
);

create index if not exists unit_prices_unit_id_idx on unit_prices (unit_id);
-- Lookup rápido del precio vigente de una unidad.
create index if not exists unit_prices_unit_id_current_idx
  on unit_prices (unit_id, valid_from desc) where valid_to is null;

create table if not exists unit_status_log (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid not null references units(id) on delete cascade,
  from_status unit_status,
  to_status   unit_status not null,
  changed_by  uuid references auth.users(id),
  changed_at  timestamptz not null default now(),
  note        text
);

create index if not exists unit_status_log_unit_id_idx on unit_status_log (unit_id, changed_at desc);

-- Trigger: cada cambio de units.status queda registrado automáticamente.
-- SECURITY DEFINER + dueño de la migración (superusuario/owner) => en la
-- práctica bypassea la RLS de unit_status_log al insertar, que de otro modo
-- no tiene policy de INSERT para usuarios finales (ver 0010).
create or replace function log_unit_status_change() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into unit_status_log (unit_id, from_status, to_status, changed_by, note)
    values (
      new.id,
      old.status,
      new.status,
      auth.uid(),
      nullif(current_setting('app.status_change_note', true), '')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists units_status_change_log on units;
create trigger units_status_change_log
  after update of status on units
  for each row
  execute function log_unit_status_change();

-- updated_at siempre fresco en units.
create or replace function touch_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists units_touch_updated_at on units;
create trigger units_touch_updated_at
  before update on units
  for each row
  execute function touch_updated_at();
