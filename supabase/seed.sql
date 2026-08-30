-- supabase/seed.sql
-- Datos de prueba: proyecto Baleia (Punta Ballena, Uruguay), kind=complejo.
-- Usa UUIDs fijos (no gen_random_uuid()) para que el seed sea idempotente:
-- se puede correr varias veces con `on conflict (id) do nothing`.
--
-- Este seed NO crea usuarios de auth.users ni memberships: eso depende del
-- flujo de signup real (Supabase Auth). Al final hay un bloque comentado de
-- ejemplo para vincular un usuario ya creado como "owner" del tenant.

begin;

-- ── tenant + proyecto ───────────────────────────────────────────────────
insert into tenants (id, slug, name, settings)
values (
  'a0000000-0000-0000-0000-000000000001',
  'baleia',
  'Baleia',
  '{}'::jsonb
)
on conflict (id) do nothing;

insert into projects (id, tenant_id, slug, name, kind, location, published_version, settings)
values (
  'a0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  'baleia',
  'Baleia',
  'complejo',
  jsonb_build_object(
    'address', 'Punta Ballena, Uruguay',
    'lat', -34.901110,
    'lng', -55.039971
  ),
  0,
  '{}'::jsonb
)
on conflict (id) do nothing;

-- ── grupos: Bloque 1 a Bloque 5 (nivel único, sin parent) ───────────────
insert into groups (id, project_id, parent_id, kind, code, name, sort)
values
  ('a0000000-0000-0000-0001-000000000001', 'a0000000-0000-0000-0000-000000000002', null, 'bloque', 'B1', 'Bloque 1', 1),
  ('a0000000-0000-0000-0001-000000000002', 'a0000000-0000-0000-0000-000000000002', null, 'bloque', 'B2', 'Bloque 2', 2),
  ('a0000000-0000-0000-0001-000000000003', 'a0000000-0000-0000-0000-000000000002', null, 'bloque', 'B3', 'Bloque 3', 3),
  ('a0000000-0000-0000-0001-000000000004', 'a0000000-0000-0000-0000-000000000002', null, 'bloque', 'B4', 'Bloque 4', 4),
  ('a0000000-0000-0000-0001-000000000005', 'a0000000-0000-0000-0000-000000000002', null, 'bloque', 'B5', 'Bloque 5', 5)
on conflict (id) do nothing;

-- ── tipos de unidad ──────────────────────────────────────────────────────
insert into unit_types (id, project_id, code, name, attr_schema)
values
  (
    'a0000000-0000-0000-0002-000000000001',
    'a0000000-0000-0000-0000-000000000002',
    'duplex',
    'Dúplex',
    jsonb_build_object(
      'type', 'object',
      'properties', jsonb_build_object(
        'dormitorios', jsonb_build_object('type', 'integer'),
        'niveles', jsonb_build_object('type', 'integer'),
        'balcon', jsonb_build_object('type', 'boolean')
      )
    )
  ),
  (
    'a0000000-0000-0000-0002-000000000002',
    'a0000000-0000-0000-0000-000000000002',
    '1dorm',
    '1 dormitorio',
    jsonb_build_object(
      'type', 'object',
      'properties', jsonb_build_object(
        'dormitorios', jsonb_build_object('type', 'integer'),
        'balcon', jsonb_build_object('type', 'boolean')
      )
    )
  )
on conflict (id) do nothing;

-- ── unidades: Bloque 2 (5 dúplex A-E + 4 de 1 dorm F-I) ──────────────────
insert into units (id, project_id, group_id, unit_type_id, code, status, area_total_m2, attrs, sort)
values
  ('a0000000-0000-0000-0003-000000000001', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0001-000000000002', 'a0000000-0000-0000-0002-000000000001', 'B2-A', 'disponible',    175.92, jsonb_build_object('dormitorios', 2, 'niveles', 2), 1),
  ('a0000000-0000-0000-0003-000000000002', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0001-000000000002', 'a0000000-0000-0000-0002-000000000001', 'B2-B', 'reservado',     173.10, jsonb_build_object('dormitorios', 2, 'niveles', 2), 2),
  ('a0000000-0000-0000-0003-000000000003', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0001-000000000002', 'a0000000-0000-0000-0002-000000000001', 'B2-C', 'vendido',       172.85, jsonb_build_object('dormitorios', 2, 'niveles', 2), 3),
  ('a0000000-0000-0000-0003-000000000004', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0001-000000000002', 'a0000000-0000-0000-0002-000000000001', 'B2-D', 'bloqueado',     173.40, jsonb_build_object('dormitorios', 2, 'niveles', 2), 4),
  ('a0000000-0000-0000-0003-000000000005', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0001-000000000002', 'a0000000-0000-0000-0002-000000000001', 'B2-E', 'no_disponible', 172.60, jsonb_build_object('dormitorios', 2, 'niveles', 2), 5),
  ('a0000000-0000-0000-0003-000000000006', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0001-000000000002', 'a0000000-0000-0000-0002-000000000002', 'B2-F', 'disponible',    96.95,  jsonb_build_object('dormitorios', 1), 6),
  ('a0000000-0000-0000-0003-000000000007', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0001-000000000002', 'a0000000-0000-0000-0002-000000000002', 'B2-G', 'disponible',    95.00,  jsonb_build_object('dormitorios', 1), 7),
  ('a0000000-0000-0000-0003-000000000008', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0001-000000000002', 'a0000000-0000-0000-0002-000000000002', 'B2-H', 'reservado',     94.40,  jsonb_build_object('dormitorios', 1), 8),
  ('a0000000-0000-0000-0003-000000000009', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0001-000000000002', 'a0000000-0000-0000-0002-000000000002', 'B2-I', 'vendido',       86.85,  jsonb_build_object('dormitorios', 1), 9)
on conflict (id) do nothing;

-- ── unidades: Bloque 3 (3 dúplex A-C + 8 de 1 dorm D-K) ──────────────────
insert into units (id, project_id, group_id, unit_type_id, code, status, area_total_m2, attrs, sort)
values
  ('a0000000-0000-0000-0003-000000000010', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0001-000000000003', 'a0000000-0000-0000-0002-000000000001', 'B3-A', 'disponible',    173.20, jsonb_build_object('dormitorios', 2, 'niveles', 2), 1),
  ('a0000000-0000-0000-0003-000000000011', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0001-000000000003', 'a0000000-0000-0000-0002-000000000001', 'B3-B', 'vendido',       172.95, jsonb_build_object('dormitorios', 2, 'niveles', 2), 2),
  ('a0000000-0000-0000-0003-000000000012', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0001-000000000003', 'a0000000-0000-0000-0002-000000000001', 'B3-C', 'reservado',     173.55, jsonb_build_object('dormitorios', 2, 'niveles', 2), 3),
  ('a0000000-0000-0000-0003-000000000013', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0001-000000000003', 'a0000000-0000-0000-0002-000000000002', 'B3-D', 'disponible',    92.10,  jsonb_build_object('dormitorios', 1), 4),
  ('a0000000-0000-0000-0003-000000000014', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0001-000000000003', 'a0000000-0000-0000-0002-000000000002', 'B3-E', 'disponible',    90.75,  jsonb_build_object('dormitorios', 1), 5),
  ('a0000000-0000-0000-0003-000000000015', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0001-000000000003', 'a0000000-0000-0000-0002-000000000002', 'B3-F', 'bloqueado',     88.40,  jsonb_build_object('dormitorios', 1), 6),
  ('a0000000-0000-0000-0003-000000000016', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0001-000000000003', 'a0000000-0000-0000-0002-000000000002', 'B3-G', 'no_disponible', 95.60,  jsonb_build_object('dormitorios', 1), 7),
  ('a0000000-0000-0000-0003-000000000017', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0001-000000000003', 'a0000000-0000-0000-0002-000000000002', 'B3-H', 'disponible',    87.20,  jsonb_build_object('dormitorios', 1), 8),
  ('a0000000-0000-0000-0003-000000000018', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0001-000000000003', 'a0000000-0000-0000-0002-000000000002', 'B3-I', 'reservado',     93.85,  jsonb_build_object('dormitorios', 1), 9),
  ('a0000000-0000-0000-0003-000000000019', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0001-000000000003', 'a0000000-0000-0000-0002-000000000002', 'B3-J', 'vendido',       89.50,  jsonb_build_object('dormitorios', 1), 10),
  ('a0000000-0000-0000-0003-000000000020', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0001-000000000003', 'a0000000-0000-0000-0002-000000000002', 'B3-K', 'disponible',    91.30,  jsonb_build_object('dormitorios', 1), 11)
on conflict (id) do nothing;

-- ── precios: sólo para las unidades 'disponible'/'reservado', visibilidad
--    variada para poder demostrar el comportamiento de availability.json ──
insert into unit_prices (unit_id, amount, currency, valid_from, valid_to, visibility)
select id, price, 'USD', now() - interval '30 days', null, vis::price_visibility
from (values
  ('a0000000-0000-0000-0003-000000000001'::uuid, 285000, 'public'),
  ('a0000000-0000-0000-0003-000000000002'::uuid, 279000, 'public'),
  ('a0000000-0000-0000-0003-000000000006'::uuid, 165000, 'public'),
  ('a0000000-0000-0000-0003-000000000007'::uuid, 162000, 'on_request'),
  ('a0000000-0000-0000-0003-000000000008'::uuid, 160500, 'public'),
  ('a0000000-0000-0000-0003-000000000010'::uuid, 286500, 'public'),
  ('a0000000-0000-0000-0003-000000000012'::uuid, 284000, 'private'),
  ('a0000000-0000-0000-0003-000000000013'::uuid, 158000, 'public'),
  ('a0000000-0000-0000-0003-000000000014'::uuid, 155500, 'public'),
  ('a0000000-0000-0000-0003-000000000017'::uuid, 149000, 'public'),
  ('a0000000-0000-0000-0003-000000000018'::uuid, 161000, 'public'),
  ('a0000000-0000-0000-0003-000000000020'::uuid, 156500, 'public')
) as t(id, price, vis)
where not exists (
  select 1 from unit_prices up where up.unit_id = t.id and up.valid_to is null
);

-- Nota: B2-C, B2-D, B2-E, B2-I, B3-B, B3-F, B3-G quedan deliberadamente SIN
-- precio vigente (vendidas/bloqueadas/no disponibles) para poder demostrar
-- el check "unidades públicas sin precio vigente" de project_health.

commit;

-- ── ejemplo (comentado): vincular un usuario real como owner del tenant ──
-- insert into memberships (tenant_id, user_id, role)
-- values ('a0000000-0000-0000-0000-000000000001', '<uuid-de-auth.users>', 'owner')
-- on conflict (tenant_id, user_id) do update set role = excluded.role;
