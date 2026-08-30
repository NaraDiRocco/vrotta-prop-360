/**
 * Toque tolerante sobre lotes chicos (plan §3, "El problema del dedo sobre el
 * lote chico").
 *
 * Aritmética pura, sin Leaflet ni DOM: toma polígonos ya proyectados a
 * coordenadas de pantalla (px del contenedor) y decide qué hizo el visitante.
 * `floorplan.ts` es el único que conoce Leaflet; este módulo se verifica con
 * tests, no mirando el mapa.
 *
 * Tres capas de defensa del plan, en una sola función (`resolveTouch`):
 *
 *  1. Zoom-gating: si el lote promedio en pantalla mide menos de
 *     `MIN_TOUCH_PX`, el toque no selecciona — pide zoom 2x centrado en el
 *     toque. Nunca se selecciona "lo que salga" por error.
 *  2. Toque tolerante: pasado el umbral, un toque que no cae dentro de
 *     ningún polígono igual selecciona el más cercano si su borde está a
 *     menos de `TOLERANCE_PX`.
 *  3. Desambiguación honesta: si hay 2+ candidatos dentro de la tolerancia,
 *     se listan todos en vez de adivinar.
 *
 * En Baleia (polígonos = bloques grandes) el paso 1 nunca se activa: queda
 * especificado para que la misma mecánica sirva en un loteo de 600 lotes.
 */

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface ScreenPolygon {
  id: string;
  /** Anillo cerrado o abierto (no hace falta repetir el primer punto). */
  ring: ScreenPoint[];
}

/** Objetivo mínimo de toque, en px de pantalla (regla dura del plan). */
export const MIN_TOUCH_PX = 44;
/** Radio de tolerancia al borde de un polígono, en px de pantalla. */
export const TOLERANCE_PX = 12;
/** Factor de acercamiento cuando el zoom-gating pide "acercate primero". */
export const GATE_ZOOM_FACTOR = 2;

export interface TouchCandidate {
  id: string;
  /** 0 si el toque cayó adentro del polígono. */
  distance: number;
  inside: boolean;
}

/** Ray casting estándar. Cuenta bordes horizontales una sola vez (`>=`/`<`). */
export function pointInPolygon(pt: ScreenPoint, ring: readonly ScreenPoint[]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    const intersects =
      a.y > pt.y !== b.y > pt.y &&
      pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function distToSegment(pt: ScreenPoint, a: ScreenPoint, b: ScreenPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return Math.hypot(pt.x - px, pt.y - py);
}

/** Distancia del punto al borde del polígono (0 si está adentro). */
export function distanceToPolygon(pt: ScreenPoint, ring: readonly ScreenPoint[]): number {
  if (ring.length === 0) return Infinity;
  if (pointInPolygon(pt, ring)) return 0;
  let min = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    min = Math.min(min, distToSegment(pt, ring[i]!, ring[j]!));
  }
  return min;
}

/** Tamaño en pantalla de un polígono: promedio de ancho y alto de su caja. */
export function polygonScreenSize(ring: readonly ScreenPoint[]): number {
  if (ring.length === 0) return 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of ring) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return ((maxX - minX) + (maxY - minY)) / 2;
}

/** Promedio de tamaño en pantalla sobre un conjunto de polígonos. */
export function averagePolygonSize(polys: readonly ScreenPolygon[]): number {
  if (polys.length === 0) return Infinity;
  const total = polys.reduce((sum, p) => sum + polygonScreenSize(p.ring), 0);
  return total / polys.length;
}

/**
 * Candidatos de un toque: adentro directo, o a menos de `toleranceP x` del
 * borde. Ordenados adentro-primero y luego por distancia creciente.
 */
export function findTouchCandidates(
  pt: ScreenPoint,
  polys: readonly ScreenPolygon[],
  tolerancePx = TOLERANCE_PX,
): TouchCandidate[] {
  const out: TouchCandidate[] = [];
  for (const { id, ring } of polys) {
    const inside = pointInPolygon(pt, ring);
    const distance = inside ? 0 : distanceToPolygon(pt, ring);
    if (inside || distance <= tolerancePx) out.push({ id, distance, inside });
  }
  return out.sort((a, b) => (a.inside === b.inside ? a.distance - b.distance : a.inside ? -1 : 1));
}

export type TouchResult =
  | { kind: 'none' }
  | { kind: 'zoom' }
  | { kind: 'select'; id: string }
  | { kind: 'ambiguous'; ids: string[] };

/**
 * Decisión completa de un toque, aplicando las tres capas de defensa en
 * orden. `avgSizePx` es el tamaño promedio en pantalla de los polígonos
 * seleccionables al zoom actual (ver `averagePolygonSize`).
 */
export function resolveTouch(
  pt: ScreenPoint,
  polys: readonly ScreenPolygon[],
  opts: { avgSizePx: number; minTouchPx?: number; tolerancePx?: number } ,
): TouchResult {
  const candidates = findTouchCandidates(pt, polys, opts.tolerancePx ?? TOLERANCE_PX);
  if (candidates.length === 0) return { kind: 'none' };

  const minTouchPx = opts.minTouchPx ?? MIN_TOUCH_PX;
  if (opts.avgSizePx < minTouchPx) return { kind: 'zoom' };

  if (candidates.length === 1) return { kind: 'select', id: candidates[0]!.id };
  return { kind: 'ambiguous', ids: candidates.map((c) => c.id) };
}
