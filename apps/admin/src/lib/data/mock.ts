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
import type { PublishSnapshot } from '../publish/diff.ts';
import type {
  GroupRow,
  JobRow,
  LeadRow,
  PreviewTokenRow,
  ProjectRow,
  SceneRow,
  SessionUser,
  StatusLogEntry,
  UnitPrice,
  UnitRow,
  UnitTypeRow,
} from './types.ts';

const T = 'a0000000-0000-0000-0000-000000000001';
const P_BALEIA = 'a0000000-0000-0000-0000-000000000002';
const P_LOMAS = 'a0000000-0000-0000-0000-000000000003';

const G = (n: number) => `a0000000-0000-0000-0001-00000000000${n}`;
const TY = (n: number) => `a0000000-0000-0000-0002-00000000000${n}`;
const U = (n: number) => `a0000000-0000-0000-0003-${String(n).padStart(12, '0')}`;
const SC = (n: number) => `a0000000-0000-0000-0004-${String(n).padStart(12, '0')}`;
const J = (n: number) => `a0000000-0000-0000-0005-${String(n).padStart(12, '0')}`;
const LEAD = (n: number) => `a0000000-0000-0000-0007-${String(n).padStart(12, '0')}`;

export interface MockPublication {
  version: number;
  note: string | null;
  publishedByEmail: string | null;
  publishedAt: string;
  snapshot: PublishSnapshot;
}

export interface MockDb {
  user: SessionUser;
  projects: ProjectRow[];
  groups: Record<string, GroupRow[]>;
  types: Record<string, UnitTypeRow[]>;
  units: Record<string, UnitRow[]>;
  prices: Record<string, UnitPrice[]>;
  log: Record<string, StatusLogEntry[]>;
  scenesTotal: Record<string, number>;
  scenes: Record<string, SceneRow[]>;
  jobs: Record<string, JobRow[]>;
  publications: Record<string, MockPublication[]>;
  leads: Record<string, LeadRow[]>;
  previewTokens: Record<string, PreviewTokenRow[]>;
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
  { n: 2, code: 'B2-B', group: 2, type: 1, status: 'reservado', m2: 173.00, attrs: { dormitorios: 2, niveles: 2 }, sort: 2 },
  { n: 3, code: 'B2-C', group: 2, type: 1, status: 'vendido', m2: 173.00, attrs: { dormitorios: 2, niveles: 2 }, sort: 3 },
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

const SC_LOMAS = (n: number) => `b0000000-0000-0000-0004-${String(n).padStart(12, '0')}`;

interface ScenesAndJobs {
  scenes: SceneRow[];
  jobs: JobRow[];
}

/**
 * Escenas y cola de procesamiento de Baleia: cuatro escenas (3 panoramas +
 * un plano general), con jobs en varios estados para que la cola de arriba
 * tenga algo real que mostrar — uno corriendo con ETA, uno fallado con un
 * motivo accionable, uno en cola y uno terminado.
 */
function buildBaleiaScenes(): ScenesAndJobs {
  const scenes: SceneRow[] = [
    {
      id: SC(1),
      projectId: P_BALEIA,
      slug: 'entrada',
      kind: 'panorama',
      name: 'Entrada',
      source: { base: 't/baleia/baleia/v1/scenes/entrada', faceSize: 2048, tileSize: 512, levels: 4, format: 'webp' },
      sort: 1,
      isInitial: true,
      hotspotCount: 6,
      createdAt: '2026-07-20T10:00:00.000Z',
    },
    {
      id: SC(2),
      projectId: P_BALEIA,
      slug: 'bloque-2-patio',
      kind: 'panorama',
      name: 'Bloque 2 — patio',
      source: { base: 't/baleia/baleia/v1/scenes/bloque-2-patio', faceSize: 2048, tileSize: 512, levels: 4, format: 'webp' },
      sort: 2,
      isInitial: false,
      hotspotCount: 9,
      createdAt: '2026-07-20T10:05:00.000Z',
    },
    {
      id: SC(3),
      projectId: P_BALEIA,
      slug: 'bloque-3-patio',
      kind: 'panorama',
      name: 'Bloque 3 — patio',
      source: {},
      sort: 3,
      isInitial: false,
      hotspotCount: 0,
      createdAt: '2026-08-20T09:00:00.000Z',
    },
    {
      id: SC(4),
      projectId: P_BALEIA,
      slug: 'plano-general',
      kind: 'floorplan',
      name: 'Plano general',
      source: { url: '/mock/baleia-plano.jpg', width: 3000, height: 2100 },
      sort: 4,
      isInitial: false,
      hotspotCount: 20,
      createdAt: '2026-07-21T11:00:00.000Z',
    },
  ];

  const jobs: JobRow[] = [
    {
      id: J(1),
      projectId: P_BALEIA,
      sceneId: SC(3),
      sceneName: 'Bloque 3 — patio',
      kind: 'tiling',
      status: 'failed',
      progress: 42,
      etaS: null,
      error: 'No es equirectangular (relación detectada 16:9). Subí un panorama 2:1.',
      createdAt: '2026-08-20T09:00:00.000Z',
      updatedAt: '2026-08-20T09:02:10.000Z',
    },
    {
      id: J(2),
      projectId: P_BALEIA,
      sceneId: SC(4),
      sceneName: 'Plano general',
      kind: 'tiling',
      status: 'running',
      progress: 68,
      etaS: 95,
      error: null,
      createdAt: '2026-08-29T02:40:00.000Z',
      updatedAt: '2026-08-29T02:41:30.000Z',
    },
    {
      id: J(3),
      projectId: P_BALEIA,
      sceneId: null,
      sceneName: 'IMG_2044.jpg',
      kind: 'tiling',
      status: 'queued',
      progress: 0,
      etaS: null,
      error: null,
      createdAt: '2026-08-29T02:41:00.000Z',
      updatedAt: '2026-08-29T02:41:00.000Z',
    },
    {
      id: J(4),
      projectId: P_BALEIA,
      sceneId: SC(1),
      sceneName: 'Entrada',
      kind: 'tiling',
      status: 'done',
      progress: 100,
      etaS: null,
      error: null,
      createdAt: '2026-07-20T10:00:00.000Z',
      updatedAt: '2026-07-20T10:04:00.000Z',
    },
  ];

  return { scenes, jobs };
}

/** Las Lomas: mapa general + 5 panoramas de manzanas, ya publicados (v3). */
function buildLomasScenes(): ScenesAndJobs {
  const names = ['Mapa general', 'Manzana 1', 'Manzana 2', 'Manzana 3', 'Manzana 4', 'Manzana 5'];
  const scenes: SceneRow[] = names.map<SceneRow>((name, i) => ({
    id: SC_LOMAS(i + 1),
    projectId: P_LOMAS,
    slug: i === 0 ? 'mapa-general' : `manzana-${i}`,
    kind: i === 0 ? 'map' : 'panorama',
    name,
    source:
      i === 0
        ? { url: '/mock/lomas-mapa.jpg', width: 4000, height: 3000 }
        : { base: `t/baleia/las-lomas/v3/scenes/manzana-${i}`, faceSize: 2048, tileSize: 512, levels: 4, format: 'webp' },
    sort: i + 1,
    isInitial: i === 0,
    hotspotCount: i === 0 ? 8 : 24,
    createdAt: '2026-05-01T10:00:00.000Z',
  }));

  const jobs: JobRow[] = [
    {
      id: J(11),
      projectId: P_LOMAS,
      sceneId: SC_LOMAS(6),
      sceneName: 'Manzana 5',
      kind: 'tiling',
      status: 'canceled',
      progress: 15,
      etaS: null,
      error: null,
      createdAt: '2026-08-10T14:00:00.000Z',
      updatedAt: '2026-08-10T14:01:00.000Z',
    },
  ];

  return { scenes, jobs };
}

/**
 * Historial de publicaciones. El snapshot de cada versión es lo que
 * `computeDiff` compara contra el borrador actual — así el diff de la
 * pantalla de publicar tiene algo real que mostrar sin necesitar un backend.
 */
function buildPublications(baleiaUnits: UnitRow[], baleiaScenes: SceneRow[]): Record<string, MockPublication[]> {
  // Snapshot de Baleia "como estaba" en la v1: B2-H todavía no se había
  // reservado y a la escena de Bloque 3 todavía no se le habían cargado
  // hotspots (0 en la v1 también, así que ese no cambia).
  const oldUnits = baleiaUnits.map((u) => ({
    ...u,
    status: u.code === 'B2-H' ? ('disponible' as UnitStatus) : u.status,
  }));

  const snapshot: PublishSnapshot = {
    units: oldUnits.map((u) => ({
      code: u.code,
      status: u.status,
      price: u.price ? { amount: u.price.amount, currency: u.price.currency } : null,
      groupCode: u.groupCode,
      typeCode: u.typeCode,
      areaTotalM2: u.areaTotalM2,
      attrsSignature: JSON.stringify(u.attrs ?? {}),
      hasPolygon: u.hasPolygon,
    })),
    scenes: baleiaScenes
      .filter((s) => s.id !== SC(4))
      .map((s) => ({ id: s.id, name: s.name, kind: s.kind, hotspotCount: s.id === SC(2) ? 7 : s.hotspotCount })),
    config: { initialSceneId: SC(1), allowedDomains: [] },
  };

  return {
    [P_BALEIA]: [
      {
        version: 1,
        note: 'Publicación inicial: entrada y bloque 2.',
        publishedByEmail: 'demo@recorrido360.local',
        publishedAt: '2026-08-15T18:00:00.000Z',
        snapshot,
      },
    ],
    [P_LOMAS]: [
      {
        version: 1,
        note: 'Publicación inicial del loteo.',
        publishedByEmail: 'demo@recorrido360.local',
        publishedAt: '2026-06-01T12:00:00.000Z',
        snapshot: { units: [], scenes: [], config: { initialSceneId: null, allowedDomains: [] } },
      },
      {
        version: 2,
        note: 'Se agregaron manzanas 4 y 5.',
        publishedByEmail: 'demo@recorrido360.local',
        publishedAt: '2026-07-10T09:30:00.000Z',
        snapshot: { units: [], scenes: [], config: { initialSceneId: SC_LOMAS(1), allowedDomains: ['laslomas.com.uy'] } },
      },
      {
        version: 3,
        note: 'Ajuste de precios de temporada.',
        publishedByEmail: 'demo@recorrido360.local',
        publishedAt: '2026-08-05T15:45:00.000Z',
        snapshot: { units: [], scenes: [], config: { initialSceneId: SC_LOMAS(1), allowedDomains: ['laslomas.com.uy'] } },
      },
    ],
  };
}

const LEAD_CHANNELS = ['form', 'whatsapp', 'crm_webhook'] as const;
const LEAD_STATUSES = ['nuevo', 'contactado', 'calificado', 'descartado', 'ganado'] as const;

function buildLeads(baleiaUnits: UnitRow[], lomasUnits: UnitRow[]): Record<string, LeadRow[]> {
  const names = [
    'Ana Gómez', 'Bruno Silva', 'Carla Núñez', 'Diego Farías', 'Elena Ruiz',
    'Franco Bianchi', 'Gabriela Costa', 'Hugo Méndez', 'Inés Alonso', 'Joaquín Paz',
  ];

  function buildFor(
    projectId: string,
    projectSlug: string,
    projectName: string,
    units: UnitRow[],
    startN: number,
    count: number,
  ): LeadRow[] {
    const out: LeadRow[] = [];
    for (let i = 0; i < count; i += 1) {
      const n = startN + i;
      const unit = units.length > 0 ? units[n % units.length] : undefined;
      const channel = LEAD_CHANNELS[n % LEAD_CHANNELS.length] ?? 'form';
      const status = LEAD_STATUSES[n % LEAD_STATUSES.length] ?? 'nuevo';
      const daysAgo = i * 1.7;
      const createdAt = new Date(new Date('2026-08-29T18:00:00.000Z').getTime() - daysAgo * 86400000).toISOString();
      out.push({
        id: LEAD(n),
        projectId,
        projectSlug,
        projectName,
        unitId: unit?.id ?? null,
        unitCode: unit?.code ?? null,
        unitStatus: unit?.status ?? null,
        channel,
        name: names[n % names.length] ?? `Lead ${n}`,
        email: `lead${n}@example.com`,
        phone: n % 3 === 0 ? null : `+598 99 ${100000 + n}`,
        message: unit ? `Hola, me interesa la unidad ${unit.code}. ¿Sigue disponible?` : 'Hola, quiero más información del proyecto.',
        status,
        read: n % 4 !== 0,
        notes: n % 5 === 0 ? 'Ya se lo contactó por teléfono, esperando respuesta.' : null,
        source: {
          url: `https://${projectSlug}.com.uy/`,
          referrer: n % 2 === 0 ? 'https://www.google.com/' : 'https://www.instagram.com/',
          utm: n % 3 === 0 ? { utm_source: 'instagram', utm_campaign: 'lanzamiento' } : {},
          device: n % 2 === 0 ? 'mobile' : 'desktop',
        },
        createdAt,
      });
    }
    return out;
  }

  return {
    [P_BALEIA]: buildFor(P_BALEIA, 'baleia', 'Baleia', baleiaUnits, 1, 14),
    [P_LOMAS]: buildFor(P_LOMAS, 'las-lomas', 'Las Lomas', lomasUnits, 100, 22),
  };
}

function build(): MockDb {
  const baleia = buildBaleia();
  const lomas = buildLomas();
  const baleiaScenesAndJobs = buildBaleiaScenes();
  const lomasScenesAndJobs = buildLomasScenes();

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
        publishedVersion: 1,
        settings: {
          initial_scene_id: SC(1),
          allowed_domains: [],
        },
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
    scenesTotal: { [P_BALEIA]: baleiaScenesAndJobs.scenes.length, [P_LOMAS]: lomasScenesAndJobs.scenes.length },
    scenes: { [P_BALEIA]: baleiaScenesAndJobs.scenes, [P_LOMAS]: lomasScenesAndJobs.scenes },
    jobs: { [P_BALEIA]: baleiaScenesAndJobs.jobs, [P_LOMAS]: lomasScenesAndJobs.jobs },
    publications: buildPublications(baleia.units, baleiaScenesAndJobs.scenes),
    leads: buildLeads(baleia.units, lomas.units),
    previewTokens: {
      [P_BALEIA]: [
        {
          token: 'pv_baleia_demo_1',
          note: 'Para el cliente — reunión del viernes',
          createdAt: '2026-08-27T12:00:00.000Z',
          expiresAt: '2026-09-03T12:00:00.000Z',
          revoked: false,
        },
      ],
      [P_LOMAS]: [],
    },
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
