/**
 * Almacén de hotspots del modo mock.
 *
 * Vive en el paquete del editor y no en `lib/data/mock.ts` a propósito: las
 * escenas y la cola de procesamiento las construye otra parte del panel en
 * paralelo, y meter mano en ese archivo sería pisarse. El repo delega acá y el
 * contrato hacia afuera son las dos funciones que agrega `Repo`:
 * `listHotspots` y `saveSceneHotspots`.
 *
 * Igual que `mock.ts`, el estado cuelga de `globalThis` para sobrevivir al
 * hot-reload de Next: si no, cada edición de código borraría lo dibujado.
 */
import type { SceneRow } from '../data/types.ts';
import { spaceOf, type HotspotRow, type Pt } from './records.ts';

const KEY = Symbol.for('r360.editor.hotspots');

interface Store {
  /** sceneId → hotspots de esa escena. */
  byScene: Map<string, HotspotRow[]>;
  seeded: Set<string>;
}

function store(): Store {
  const g = globalThis as unknown as Record<symbol, Store | undefined>;
  let s = g[KEY];
  if (!s) {
    s = { byScene: new Map(), seeded: new Set() };
    g[KEY] = s;
  }
  return s;
}

/* ── semilla ───────────────────────────────────────────────────────────── */

/**
 * Códigos que el seed de unidades marca con `hasPolygon`. Si esto divergiera,
 * el panel diría "sin polígono" para una unidad que sí tiene uno dibujado, que
 * es justo la incoherencia que el modo mock existe para no tener.
 */
const SEED: { sceneSlug: string; codes: string[] }[] = [
  { sceneSlug: 'entrada', codes: ['B2-A', 'B2-B', 'B2-C', 'B2-D', 'B2-E', 'B2-F', 'B2-G', 'B2-H', 'B2-I'] },
  { sceneSlug: 'bloque-2-patio', codes: ['B3-A', 'B3-B'] },
];

/**
 * Rectángulo esférico bajo el horizonte, del ancho de un lote.
 * No pretende parecerse a Baleia: pretende que al abrir el editor haya
 * geometría real contra la cual probar el snap, la selección y el undo.
 */
function seedRing(i: number, total: number): Pt[] {
  const spanDeg = 90;
  const w = (spanDeg / total) * 0.86;
  const yaw0 = (-spanDeg / 2 + (spanDeg / total) * i) * (Math.PI / 180);
  const yaw1 = yaw0 + w * (Math.PI / 180);
  const top = -8 * (Math.PI / 180);
  const bottom = -24 * (Math.PI / 180);
  return [
    [yaw0, top],
    [yaw1, top],
    [yaw1, bottom],
    [yaw0, bottom],
  ];
}

function seedFor(scenes: readonly SceneRow[]): void {
  const s = store();
  for (const spec of SEED) {
    const scene = scenes.find((sc) => sc.slug === spec.sceneSlug);
    if (!scene || s.byScene.has(scene.id)) continue;
    const rows: HotspotRow[] = spec.codes.map((code, i) => ({
      id: `seed-${scene.id}-${code}`,
      sceneId: scene.id,
      unitCode: code,
      geometryKind: spaceOf(scene.kind) === 'sph' ? 'polygon_sph' : 'polygon_px',
      geometry: seedRing(i, spec.codes.length),
      anchor: null,
      label: null,
      zIndex: 1,
    }));
    s.byScene.set(scene.id, rows);
  }
}

/** Llamar una vez por proyecto antes de leer. Idempotente. */
export function ensureSeeded(projectId: string, scenes: readonly SceneRow[]): void {
  const s = store();
  if (s.seeded.has(projectId)) return;
  s.seeded.add(projectId);
  seedFor(scenes);
  for (const scene of scenes) if (!s.byScene.has(scene.id)) s.byScene.set(scene.id, []);
}

/* ── lectura y escritura ───────────────────────────────────────────────── */

export function readScene(sceneId: string): HotspotRow[] {
  return (store().byScene.get(sceneId) ?? []).map(clone);
}

export function readProject(scenes: readonly SceneRow[]): HotspotRow[] {
  const out: HotspotRow[] = [];
  for (const scene of scenes) out.push(...readScene(scene.id));
  return out;
}

export function writeScene(sceneId: string, rows: readonly HotspotRow[]): void {
  store().byScene.set(sceneId, rows.map(clone));
}

function clone(h: HotspotRow): HotspotRow {
  return { ...h, geometry: h.geometry.map(([a, b]) => [a, b] as Pt), anchor: h.anchor ? [h.anchor[0], h.anchor[1]] : null };
}
