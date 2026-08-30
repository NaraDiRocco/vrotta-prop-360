/**
 * Importación de GeoJSON.
 *
 * El flujo es archivo → elegir la propiedad que trae el código → pantalla de
 * conflictos → aplicar. La pantalla de conflictos es la razón de ser de todo
 * esto: un GeoJSON de agrimensor nunca calza perfecto contra el listado de
 * ventas, y el error caro no es el que falla ruidosamente sino el que entra
 * silenciosamente asignado a la unidad equivocada. Por eso las cuatro
 * categorías se muestran SIEMPRE, incluso vacías, y las tres que no son
 * "coinciden y están libres" vienen con la acción en "omitir": para que
 * importar de más sea una decisión explícita.
 *
 * Todo el resultado entra al reducer como un único `importHotspots`, o sea un
 * único PatchSet: si el mapeo estaba mal, se revierte con ⌘Z.
 */
import { buildCodeIndex, matchCode, type CodeIndex } from './codes.ts';
import { selfIntersects } from './geom.ts';
import type { GeomSpace, Pt } from './records.ts';
import type { ImportOp } from './state.ts';

export interface RawFeature {
  index: number;
  ring: Pt[];
  props: Record<string, unknown>;
  /** Anillos descartados de un MultiPolygon o de un polígono con huecos. */
  droppedRings: number;
}

export interface ParsedGeoJson {
  features: RawFeature[];
  /** Claves de propiedad presentes en al menos una feature, ordenadas. */
  propertyKeys: string[];
  /** Features que no eran polígonos o no tenían suficientes vértices. */
  skipped: number;
  warnings: string[];
}

const DEG = Math.PI / 180;

/**
 * Parsea el texto del archivo.
 *
 * En escenas de plano las coordenadas se esperan ya normalizadas 0..1 sobre el
 * master (es lo que produce el pipeline de `tools/`). En panorámica se
 * interpretan como lon/lat en GRADOS y se pasan a radianes, que es la
 * convención de `Sph`.
 */
export function parseGeoJson(text: string, space: GeomSpace): ParsedGeoJson {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (err) {
    throw new Error(`El archivo no es JSON válido: ${(err as Error).message}`);
  }

  const rawFeatures = collectFeatures(doc);
  const features: RawFeature[] = [];
  const keys = new Set<string>();
  const warnings: string[] = [];
  let skipped = 0;
  let outOfRange = 0;

  for (const f of rawFeatures) {
    const raw = f['properties'];
    const props: Record<string, unknown> = isRecord(raw) ? raw : {};
    for (const k of Object.keys(props)) keys.add(k);

    const geom = isRecord(f['geometry']) ? f['geometry'] : null;
    const rings = geom ? ringsOf(geom) : [];
    if (rings.length === 0) {
      skipped += 1;
      continue;
    }
    // De un MultiPolygon o de un polígono con huecos se toma el anillo con más
    // vértices: es el contorno exterior. Los huecos no tienen representación en
    // el modelo de hotspot y se descartan avisando, no en silencio.
    const best = rings.reduce((a, b) => (b.length > a.length ? b : a));
    const ring = best.map<Pt>(([x, y]) => (space === 'sph' ? [x * DEG, y * DEG] : [x, y]));
    if (ring.length < 3) {
      skipped += 1;
      continue;
    }
    if (space === 'px' && ring.some(([x, y]) => x < -0.001 || x > 1.001 || y < -0.001 || y > 1.001)) {
      outOfRange += 1;
    }
    features.push({ index: features.length, ring: dedupeClose(ring), props, droppedRings: rings.length - 1 });
  }

  if (skipped > 0) warnings.push(`${skipped} geometrías ignoradas (no son polígonos válidos).`);
  const holes = features.reduce((acc, f) => acc + f.droppedRings, 0);
  if (holes > 0) warnings.push(`${holes} anillos secundarios descartados (huecos o multi-polígonos).`);
  if (outOfRange > 0) {
    warnings.push(
      `${outOfRange} polígonos tienen coordenadas fuera de 0..1: el archivo puede no estar normalizado sobre el master.`,
    );
  }

  return { features, propertyKeys: [...keys].sort(), skipped, warnings };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function collectFeatures(doc: unknown): Record<string, unknown>[] {
  if (!isRecord(doc)) return [];
  if (doc['type'] === 'FeatureCollection' && Array.isArray(doc['features'])) {
    return doc['features'].filter(isRecord);
  }
  if (doc['type'] === 'Feature') return [doc];
  if (typeof doc['type'] === 'string' && 'coordinates' in doc) return [{ geometry: doc, properties: {} }];
  return [];
}

function ringsOf(geom: Record<string, unknown>): [number, number][][] {
  const coords = geom['coordinates'];
  const type = geom['type'];
  if (type === 'Polygon') return positionRings(coords);
  if (type === 'MultiPolygon' && Array.isArray(coords)) return coords.flatMap((poly) => positionRings(poly));
  if (type === 'LineString') {
    const r = positionRing(coords);
    return r.length >= 3 ? [r] : [];
  }
  return [];
}

function positionRings(coords: unknown): [number, number][][] {
  if (!Array.isArray(coords)) return [];
  return coords.map(positionRing).filter((r) => r.length >= 3);
}

function positionRing(coords: unknown): [number, number][] {
  if (!Array.isArray(coords)) return [];
  const out: [number, number][] = [];
  for (const p of coords) {
    if (Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number' && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
      out.push([p[0], p[1]]);
    }
  }
  // GeoJSON cierra el anillo repitiendo el primer punto; el modelo interno no.
  if (out.length >= 2) {
    const a = out[0]!;
    const b = out[out.length - 1]!;
    if (a[0] === b[0] && a[1] === b[1]) out.pop();
  }
  return out;
}

/** Colapsa vértices consecutivos idénticos, que rompen la normal de la arista. */
function dedupeClose(ring: readonly Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of ring) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev[0] - p[0]) < 1e-12 && Math.abs(prev[1] - p[1]) < 1e-12) continue;
    out.push(p);
  }
  return out;
}

/* ── elección de la propiedad con el código ────────────────────────────── */

const PREFERRED_KEYS = ['code', 'codigo', 'código', 'cod', 'unit', 'unidad', 'lote', 'name', 'nombre', 'id'];

/**
 * Sugiere qué propiedad contiene el código: la que más unidades empareja.
 * A igualdad de aciertos gana la de nombre más convencional — con un GeoJSON
 * donde `code` y `name` traen lo mismo, `code` es lo que el operador espera.
 */
export function suggestCodeProperty(features: readonly RawFeature[], index: CodeIndex): string | null {
  const keys = new Set<string>();
  for (const f of features) for (const k of Object.keys(f.props)) keys.add(k);

  let best: { key: string; hits: number; rank: number } | null = null;
  for (const key of keys) {
    let hits = 0;
    for (const f of features) {
      const raw = readCode(f.props[key]);
      if (raw && matchCode(raw, index).kind !== 'none') hits += 1;
    }
    const rank = PREFERRED_KEYS.indexOf(key.toLowerCase());
    const rankScore = rank < 0 ? PREFERRED_KEYS.length : rank;
    if (!best || hits > best.hits || (hits === best.hits && rankScore < best.rank)) {
      best = { key, hits, rank: rankScore };
    }
  }
  return best && best.hits > 0 ? best.key : (best?.key ?? null);
}

export function readCode(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/* ── clasificación en los cuatro grupos ────────────────────────────────── */

export type ImportGroup = 'match_free' | 'match_taken' | 'no_unit' | 'no_code';
export type ImportAction = 'import' | 'replace' | 'unassigned' | 'skip';

export const GROUP_LABEL: Record<ImportGroup, string> = {
  match_free: 'Coinciden y están libres',
  match_taken: 'Coinciden pero ya tienen polígono',
  no_unit: 'No existen como unidad',
  no_code: 'Sin código legible',
};

export const ACTION_LABEL: Record<ImportAction, string> = {
  import: 'Importar',
  replace: 'Reemplazar el existente',
  unassigned: 'Importar sin unidad',
  skip: 'Omitir',
};

/** Acciones ofrecidas por grupo. La primera es el default. */
export const GROUP_ACTIONS: Record<ImportGroup, ImportAction[]> = {
  match_free: ['import', 'skip'],
  match_taken: ['skip', 'replace'],
  no_unit: ['skip', 'unassigned'],
  no_code: ['skip', 'unassigned'],
};

export interface ImportRow {
  featureIndex: number;
  rawCode: string | null;
  unitCode: string | null;
  /** Cuando el normalizado da más de un candidato: no se elige, se muestra. */
  candidates: string[];
  matchKind: 'exact' | 'normalized' | 'ambiguous' | 'none';
  existingHotspotId: string | null;
  group: ImportGroup;
  action: ImportAction;
  vertices: number;
  selfIntersects: boolean;
}

export function defaultActionFor(group: ImportGroup): ImportAction {
  return GROUP_ACTIONS[group][0] as ImportAction;
}

export function classifyFeatures(
  features: readonly RawFeature[],
  codeProperty: string | null,
  unitCodes: readonly string[],
  hotspotIdByUnitCode: ReadonlyMap<string, string>,
  space: GeomSpace,
): ImportRow[] {
  const index = buildCodeIndex(unitCodes);
  return features.map((f) => {
    const rawCode = codeProperty ? readCode(f.props[codeProperty]) : null;
    const outcome = rawCode ? matchCode(rawCode, index) : ({ kind: 'none' } as const);

    let unitCode: string | null = null;
    let candidates: string[] = [];
    if (outcome.kind === 'exact' || outcome.kind === 'normalized') unitCode = outcome.code;
    if (outcome.kind === 'ambiguous') candidates = outcome.candidates;

    const existingHotspotId = unitCode ? hotspotIdByUnitCode.get(unitCode) ?? null : null;
    const group: ImportGroup = !rawCode
      ? 'no_code'
      : unitCode === null
        ? 'no_unit'
        : existingHotspotId
          ? 'match_taken'
          : 'match_free';

    return {
      featureIndex: f.index,
      rawCode,
      unitCode,
      candidates,
      matchKind: outcome.kind,
      existingHotspotId,
      group,
      action: defaultActionFor(group),
      vertices: f.ring.length,
      selfIntersects: selfIntersects(space, f.ring),
    };
  });
}

export function setGroupAction(rows: readonly ImportRow[], group: ImportGroup, action: ImportAction): ImportRow[] {
  return rows.map((r) => (r.group === group ? { ...r, action } : r));
}

export function setRowAction(rows: readonly ImportRow[], featureIndex: number, action: ImportAction): ImportRow[] {
  return rows.map((r) => (r.featureIndex === featureIndex ? { ...r, action } : r));
}

/** Fija manualmente la unidad de una fila (resuelve una ambigüedad a mano). */
export function assignRowUnit(
  rows: readonly ImportRow[],
  featureIndex: number,
  unitCode: string | null,
  hotspotIdByUnitCode: ReadonlyMap<string, string>,
): ImportRow[] {
  return rows.map((r) => {
    if (r.featureIndex !== featureIndex) return r;
    if (!unitCode) return { ...r, unitCode: null, existingHotspotId: null, group: 'no_unit', action: 'skip' };
    const existingHotspotId = hotspotIdByUnitCode.get(unitCode) ?? null;
    const group: ImportGroup = existingHotspotId ? 'match_taken' : 'match_free';
    return { ...r, unitCode, existingHotspotId, group, action: defaultActionFor(group) };
  });
}

export interface ImportSummary {
  counts: Record<ImportGroup, number>;
  willImport: number;
  willReplace: number;
  willSkip: number;
  unassigned: number;
}

export function summarize(rows: readonly ImportRow[]): ImportSummary {
  const counts: Record<ImportGroup, number> = { match_free: 0, match_taken: 0, no_unit: 0, no_code: 0 };
  let willImport = 0;
  let willReplace = 0;
  let willSkip = 0;
  let unassigned = 0;
  for (const r of rows) {
    counts[r.group] += 1;
    if (r.action === 'import') willImport += 1;
    else if (r.action === 'replace') willReplace += 1;
    else if (r.action === 'unassigned') unassigned += 1;
    else willSkip += 1;
  }
  return { counts, willImport, willReplace, willSkip, unassigned };
}

/**
 * Traduce el plan a operaciones para el reducer. `newId` genera ids: se inyecta
 * para que el test sea determinista.
 */
export function buildImportOps(
  rows: readonly ImportRow[],
  features: readonly RawFeature[],
  newId: (i: number) => string,
): ImportOp[] {
  const byIndex = new Map(features.map((f) => [f.index, f]));
  const ops: ImportOp[] = [];
  for (const r of rows) {
    if (r.action === 'skip') continue;
    const feature = byIndex.get(r.featureIndex);
    if (!feature || feature.ring.length < 3) continue;
    const assign = r.action === 'unassigned' ? null : r.unitCode;
    ops.push({
      id: newId(ops.length),
      unitCode: assign,
      ring: feature.ring,
      label: assign ? null : r.rawCode,
      replaces: r.action === 'replace' ? r.existingHotspotId : null,
    });
  }
  return ops;
}
