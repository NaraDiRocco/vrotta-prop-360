/**
 * Dataset del modo mock.
 *
 * Réplica fiel de `supabase/seed.sql` (proyecto Baleia, 20 unidades reales
 * B2-A..B3-K, con los mismos m², estados, precios y visibilidades), más un
 * segundo proyecto sintético "Las Lomas" de 640 lotes cuya única razón de ser
 * es que la tabla, la virtualización y la selección por predicado se puedan
 * probar de verdad: con 20 filas no se ve si el diseño aguanta.
 *
 * El estado vive en un singleton de `globalThis` para que sobreviva al
 * hot-reload de Next en desarrollo (si no, cada edición reinicia los datos).
 */
import type { UnitStatus } from '@r360/core';
import type { GroupRow, ProjectRow, SessionUser, StatusLogEntry, UnitPrice, UnitRow, UnitTypeRow } from './types.ts';

const T = 'a0000000-0000-0000-0000-000000000001';
const P_BALEIA = 'a0000000-0000-0000-0000-000000000002';
const P_LOMAS = 'a0000000-0000-0000-0000-000000000003';

const G = (n: number) => `a0000000-0000-0000-0001-00000000000${n}`;
const TY = (n: number) => `a0000000-0000-0000-0002-00000000000${n}`;
const U = (n: number) => `a0000000-0000-0000-0003-${String(n).padStart(12, '0')}`;

export interface MockDb {
  user: SessionUser;
  projects: ProjectRow[];
  groups: Record<string, GroupRow[]>;
  types: Record<string, UnitTypeRow[]>;
  units: Record<string, UnitRow[]>;
  prices: Record<string, UnitPrice[]>;
  log: Record<string, StatusLogEntry[]>;
  scenesTotal: Record<string, number>;
}

const NOW = '2026-08-01T12:00:00.000Z';

interface SeedUnit {
  n: number;
  code: string;
  group: number;
  type: number;
  status: UnitStatus;
  m2: number;
  attrs: Record<string, unknown>;
  sort: number;
}

// Copiado literal del seed. Si esto diverge, el mock deja de servir para nada.
const BALEIA_UNITS: SeedUnit[] = [
  { n: 1, code: 'B2-A', group: 2, type: 1, status: 'disponible', m2: 175.92, attrs: { dormitorios: 2, niveles: 2 }, sort: 1 },
  { n: 2, code: 'B2-B', group: 2, type: 1, status: 'reservado', m2: 173.10, attrs: { dormitorios: 2, niveles: 2 }, sort: 2 },
  { n: 3, code: 'B2-C', group: 2, type: 1, status: 'vendido', m2: 172.85, attrs: { dormitorios: 2, niveles: 2 }, sort: 3 },
  { n: 4, code: 'B2-D', group: 2, type: 1, status: 'bloqueado', m2: 173.40, attrs: { dormitorios: 2, niveles: 2 }, sort: 4 },
  { n: 5, code: 'B2-E', group: 2, type: 1, status: 'no_disponible', m2: 172.60, attrs: { dormitorios: 2, niveles: 2 }, sort: 5 },
  { n: 6, code: 'B2-F', group: 2, type: 2, status: 'disponible', m2: 96.95, attrs: { dormitorios: 1 }, sort: 6 },
  { n: 7, code: 'B2-G', group: 2, type: 2, status: 'disponible', m2: 95.00, attrs: { dormitorios: 1 }, sort: 7 },
  { n: 8, code: 'B2-H', group: 2, type: 2, status: 'reservado', m2: 94.40, attrs: { dormitorios: 1 }, sort: 8 },
  { n: 9, code: 'B2-I', group: 2, type: 2, status: 'vendido', m2: 86.85, attrs: { dormitorios: 1 }, sort: 9 },
  { n: 10, code: 'B3-A', group: 3, type: 1, status: 'disponible', m2: 173.20, attrs: { dormitorios: 2, niveles: 2 }, sort: 1 },
  { n: 11, code: 'B3-B', group: 3, type: 1, status: 'vendido', m2: 172.95, attrs: { dormitorios: 2, niveles: 2 }, sort: 2 },
  { n: 12, code: 'B3-C', group: 3, type: 1, status: 'reservado', m2: 173.55, attrs: { dormitorios: 2, niveles: 2 }, sort: 3 },
  { n: 13, code: 'B3-D', group: 3, type: 2, status: 'disponible', m2: 92.10, attrs: { dormitorios: 1 }, sort: 4 },
  { n: 14, code: 'B3-E', group: 3, type: 2, status: 'disponible', m2: 90.75, attrs: { dormitorios: 1 }, sort: 5 },
  { n: 15, code: 'B3-F', group: 3, type: 2, status: 'bloqueado', m2: 88.40, attrs: { dormitorios: 1 }, sort: 6 },
  { n: 16, code: 'B3-G', group: 3, type: 2, status: 'no_disponible', m2: 95.60, attrs: { dormitorios: 1 }, sort: 7 },
  { n: 17, code: 'B3-H', group: 3, type: 2, status: 'disponible', m2: 87.20, attrs: { dormitorios: 1 }, sort: 8 },
  { n: 18, code: 'B3-I', group: 3, type: 2, status: 'reservado', m2: 93.85, attrs: { dormitorios: 1 }, sort: 9 },
  { n: 19, code: 'B3-J', group: 3, type: 2, status: 'vendido', m2: 89.50, attrs: { dormitorios: 1 }, sort: 10 },
  { n: 20, code: 'B3-K', group: 3, type: 2, status: 'disponible', m2: 91.30, attrs: { dormitorios: 1 }, sort: 11 },
];

// unit_prices del seed: id de unidad → [monto, visibilidad].
const BALEIA_PRICES: [number, number, UnitPrice['visibility']][] = [
  [1, 285000, 'public'],
  [2, 279000, 'public'],
  [6, 165000, 'public'],
  [7, 162000, 'on_request'],
  [8, 160500, 'public'],
  [10, 286500, 'public'],
  [12, 284000, 'private'],
  [13, 158000, 'public'],
  [14, 155500, 'public'],
  [17, 149000, 'public'],
  [18, 161000, 'public'],
  [20, 156500, 'public'],
];

// Las unidades del bloque 2 tienen polígono cargado; las del 3 todavía no.
// Da algo real que resolver en el checklist de salud.
const BALEIA_WITH_POLYGON = new Set(['B2-A', 'B2-B', 'B2-C', 'B2-D', 'B2-E', 'B2-F', 'B2-G', 'B2-H', 'B2-I', 'B3-A', 'B3-B']);

function buildBaleia(): { units: UnitRow[]; prices: Record<string, UnitPrice[]> } {
  const priceByUnit = new Map(BALEIA_PRICES.map(([n, amount, visibility]) => [n, { amount, visibility }]));
  const prices: Record<string, UnitPrice[]> = {};
  const units = BALEIA_UNITS.map<UnitRow>((u) => {
    const id = U(u.n);
    const p = priceByUnit.get(u.n);
    if (p) {
      prices[id] = [
        {
          id: `price-${u.n}`,
          amount: p.amount,
          currency: 'USD',
          visibility: p.visibility,
          validFrom: '2026-07-01T00:00:00.000Z',
          validTo: null,
        },
      ];
    }
    return {
      id,
      code: u.code,
      status: u.status,
      groupId: G(u.group),
      groupCode: `B${u.group}`,
      unitTypeId: TY(u.type),
      typeCode: u.type === 1 ? 'duplex' : '1dorm',
      typeName: u.type === 1 ? 'Dúplex' : '1 dormitorio',
      areaTotalM2: u.m2,
      attrs: u.attrs,
      price: p ? { amount: p.amount, currency: 'USD', visibility: p.visibility } : null,
      hasPolygon: BALEIA_WITH_POLYGON.has(u.code),
      updatedAt: NOW,
      sort: u.sort,
    };
  });
  return { units, prices };
}

/* ── Las Lomas: loteo sintético de 640 lotes en 8 manzanas ─────────────── */

const LOMAS_STATUS_CYCLE: UnitStatus[] = [
  'disponible', 'disponible', 'disponible', 'reservado',
  'vendido', 'disponible', 'bloqueado', 'disponible',
  'vendido', 'disponible', 'reservado', 'no_disponible',
];

function buildLomas(): { groups: GroupRow[]; types: UnitTypeRow[]; units: UnitRow[] } {
  const groups: GroupRow[] = [];
  const units: UnitRow[] = [];
  const types: UnitTypeRow[] = [
    {
      id: 'b0000000-0000-0000-0002-000000000001',
      code: 'lote-estandar',
      name: 'Lote estándar',
      attrSchema: {
        type: 'object',
        properties: {
          frente_m: { type: 'number', title: 'Frente (m)' },
          esquina: { type: 'boolean', title: 'Esquina' },
          orientacion: { type: 'string', enum: ['norte', 'sur', 'este', 'oeste'], title: 'Orientación' },
        },
      },
    },
    {
      id: 'b0000000-0000-0000-0002-000000000002',
      code: 'lote-premium',
      name: 'Lote premium (frente al lago)',
      attrSchema: {
        type: 'object',
        properties: {
          frente_m: { type: 'number', title: 'Frente (m)' },
          vista_lago: { type: 'boolean', title: 'Vista al lago' },
        },
      },
    },
  ];

  const ORIENT = ['norte', 'sur', 'este', 'oeste'] as const;
  let n = 0;
  for (let m = 1; m <= 8; m += 1) {
    const stageId = `b0000000-0000-0000-0001-1000000000${String(Math.ceil(m / 4)).padStart(2, '0')}`;
    if (!groups.some((g) => g.id === stageId)) {
      groups.push({
        id: stageId,
        parentId: null,
        kind: 'etapa',
        code: `E${Math.ceil(m / 4)}`,
        name: `Etapa ${Math.ceil(m / 4)}`,
        sort: Math.ceil(m / 4),
      });
    }
    const groupId = `b0000000-0000-0000-0001-00000000${String(m).padStart(4, '0')}`;
    groups.push({ id: groupId, parentId: stageId, kind: 'manzana', code: `M${m}`, name: `Manzana ${m}`, sort: m });

    for (let l = 1; l <= 80; l += 1) {
      n += 1;
      const premium = m <= 2 && l <= 20;
      const status = LOMAS_STATUS_CYCLE[n % LOMAS_STATUS_CYCLE.length] ?? 'disponible';
      const area = 300 + ((n * 37) % 480);
      const withPrice = status === 'disponible' || status === 'reservado';
      const amount = 38000 + ((n * 911) % 62000);
      units.push({
        id: `b0000000-0000-0000-0003-${String(n).padStart(12, '0')}`,
        code: `M${m}-L${String(l).padStart(2, '0')}`,
        status,
        groupId,
        groupCode: `M${m}`,
        unitTypeId: types[premium ? 1 : 0]?.id ?? null,
        typeCode: premium ? 'lote-premium' : 'lote-estandar',
        typeName: premium ? 'Lote premium (frente al lago)' : 'Lote estándar',
        areaTotalM2: area,
        attrs: premium
          ? { frente_m: 15 + (n % 6), vista_lago: l <= 10 }
          : { frente_m: 10 + (n % 5), esquina: l % 20 === 1 || l % 20 === 0, orientacion: ORIENT[n % 4] },
        price: withPrice ? { amount, currency: 'USD', visibility: n % 9 === 0 ? 'on_request' : 'public' } : null,
        // Sólo las 3 primeras manzanas tienen polígono: `sin:poligono` tiene
        // algo que encontrar.
        hasPolygon: m <= 3,
        updatedAt: NOW,
        sort: n,
      });
    }
  }
  return { groups, types, units };
}

function build(): MockDb {
  const baleia = buildBaleia();
  const lomas = buildLomas();

  return {
    user: {
      id: '00000000-0000-0000-0000-0000000000ff',
      email: 'demo@recorrido360.local',
      memberships: [{ tenantId: T, tenantSlug: 'baleia', tenantName: 'Baleia', role: 'owner' }],
    },
    projects: [
      {
        id: P_BALEIA,
        tenantId: T,
        slug: 'baleia',
        name: 'Baleia',
        kind: 'complejo',
        location: { address: 'Punta Ballena, Uruguay', lat: -34.90111, lng: -55.039971 },
        publishedVersion: 0,
        settings: {},
        updatedAt: NOW,
      },
      {
        id: P_LOMAS,
        tenantId: T,
        slug: 'las-lomas',
        name: 'Las Lomas',
        kind: 'loteo',
        location: { address: 'Ruta 12 km 4, Maldonado' },
        publishedVersion: 3,
        settings: {
          initial_scene_id: 'b0000000-0000-0000-0004-000000000001',
          allowed_domains: ['laslomas.com.uy'],
        },
        updatedAt: NOW,
      },
    ],
    groups: {
      [P_BALEIA]: [1, 2, 3, 4, 5].map<GroupRow>((i) => ({
        id: G(i),
        parentId: null,
        kind: 'bloque',
        code: `B${i}`,
        name: `Bloque ${i}`,
        sort: i,
      })),
      [P_LOMAS]: lomas.groups,
    },
    types: {
      [P_BALEIA]: [
        {
          id: TY(1),
          code: 'duplex',
          name: 'Dúplex',
          attrSchema: {
            type: 'object',
            properties: {
              dormitorios: { type: 'integer', title: 'Dormitorios' },
              niveles: { type: 'integer', title: 'Niveles' },
              balcon: { type: 'boolean', title: 'Balcón' },
            },
          },
        },
        {
          id: TY(2),
          code: '1dorm',
          name: '1 dormitorio',
          attrSchema: {
            type: 'object',
            properties: {
              dormitorios: { type: 'integer', title: 'Dormitorios' },
              balcon: { type: 'boolean', title: 'Balcón' },
            },
          },
        },
      ],
      [P_LOMAS]: lomas.types,
    },
    units: { [P_BALEIA]: baleia.units, [P_LOMAS]: lomas.units },
    prices: baleia.prices,
    log: {},
    scenesTotal: { [P_BALEIA]: 0, [P_LOMAS]: 6 },
  };
}

const KEY = Symbol.for('r360.admin.mockdb');
type Holder = { [KEY]?: MockDb };

export function mockDb(): MockDb {
  const holder = globalThis as unknown as Holder;
  if (!holder[KEY]) holder[KEY] = build();
  return holder[KEY];
}

export function resetMockDb(): void {
  (globalThis as unknown as Holder)[KEY] = build();
}
