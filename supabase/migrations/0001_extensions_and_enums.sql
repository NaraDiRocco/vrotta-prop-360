-- 0001_extensions_and_enums.sql
-- Extensiones y tipos enumerados base. Idempotente.

create extension if not exists pgcrypto;   -- gen_random_uuid()

do $$
begin
  if not exists (select 1 from pg_type where typname = 'membership_role') then
    create type membership_role as enum ('owner', 'editor', 'sales');
  end if;

  if not exists (select 1 from pg_type where typname = 'project_kind') then
    create type project_kind as enum ('loteo', 'edificio', 'complejo', 'mixto');
  end if;

  -- Debe coincidir EXACTAMENTE con UNIT_STATUSES en packages/core/src/status.ts
  if not exists (select 1 from pg_type where typname = 'unit_status') then
    create type unit_status as enum (
      'disponible',
      'reservado',
      'vendido',
      'bloqueado',
      'no_disponible'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'scene_kind') then
    create type scene_kind as enum ('panorama', 'floorplan', 'map', 'video');
  end if;

  if not exists (select 1 from pg_type where typname = 'geometry_kind') then
    create type geometry_kind as enum ('polygon_sph', 'polygon_px', 'point_sph', 'point_px');
  end if;

  if not exists (select 1 from pg_type where typname = 'hotspot_target_kind') then
    create type hotspot_target_kind as enum ('unit', 'group', 'scene', 'info');
  end if;

  if not exists (select 1 from pg_type where typname = 'price_visibility') then
    create type price_visibility as enum ('public', 'on_request', 'private');
  end if;

  if not exists (select 1 from pg_type where typname = 'job_status') then
    create type job_status as enum ('queued', 'running', 'done', 'failed', 'canceled');
  end if;
end $$;
