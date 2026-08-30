/**
 * Imantado a vértices y aristas vecinas.
 *
 * Por qué existe: en un loteo los lotes comparten medianera. Sin snap, dos
 * polígonos contiguos dibujados a mano quedan separados por fracciones de
 * grado, y en el visor esa rendija se ve como una línea blanca entre lotes —
 * el defecto que delata al toque que el recorrido está dibujado a ojo. Con
 * snap, el segundo lote clava sus vértices exactamente sobre los del primero.
 *
 * El vértice gana siempre sobre la arista aunque la arista esté más cerca: si
 * la intención fuera un punto en el medio de la medianera, el operador no
 * habría acercado el puntero a la esquina.
 */
import { distance, projectOnEdge, toleranceFor } from './geom.ts';
import type { GeomSpace, Pt } from './records.ts';

export interface SnapTarget {
  id: string;
  ring: readonly Pt[];
}

export interface SnapHit {
  point: Pt;
  kind: 'vertex' | 'edge';
  hotspotId: string;
  /** Índice del vértice, o de la arista i→i+1. */
  index: number;
  distance: number;
}

export interface SnapOptions {
  space: GeomSpace;
  /** Tolerancia en GRADOS. 2° es el default del editor. */
  toleranceDeg: number;
  /** No imantar contra este polígono (el que se está editando). */
  excludeId?: string | null;
  /** Índice de vértice a excluir dentro de `excludeId`… no aplica: ver nota. */
  enabled?: boolean;
}

/**
 * Busca el mejor candidato para `p`. Devuelve null si el snap está apagado o si
 * no hay nada dentro de la tolerancia.
 *
 * Nota sobre `excludeId`: se excluye el polígono ENTERO en edición, no sólo el
 * vértice arrastrado. Imantar un vértice contra otro del mismo anillo colapsa
 * la geometría y es siempre un error, nunca una intención.
 */
export function findSnap(p: Pt, targets: readonly SnapTarget[], opts: SnapOptions): SnapHit | null {
  if (opts.enabled === false) return null;
  const tol = toleranceFor(opts.space, opts.toleranceDeg);
  if (!(tol > 0)) return null;

  let bestVertex: SnapHit | null = null;
  let bestEdge: SnapHit | null = null;

  for (const t of targets) {
    if (opts.excludeId && t.id === opts.excludeId) continue;
    const n = t.ring.length;
    if (n === 0) continue;

    for (let i = 0; i < n; i += 1) {
      const d = distance(opts.space, p, t.ring[i]!);
      if (d <= tol && (bestVertex === null || d < bestVertex.distance)) {
        bestVertex = { point: t.ring[i]!, kind: 'vertex', hotspotId: t.id, index: i, distance: d };
      }
    }

    if (n < 2) continue;
    for (let i = 0; i < n; i += 1) {
      const proj = projectOnEdge(opts.space, p, t.ring[i]!, t.ring[(i + 1) % n]!);
      if (!proj) continue;
      if (proj.distance <= tol && (bestEdge === null || proj.distance < bestEdge.distance)) {
        bestEdge = { point: proj.point, kind: 'edge', hotspotId: t.id, index: i, distance: proj.distance };
      }
    }
  }

  return bestVertex ?? bestEdge;
}

/** Aplica el snap si lo hay; si no, devuelve el punto tal cual. */
export function snapPoint(p: Pt, targets: readonly SnapTarget[], opts: SnapOptions): Pt {
  return findSnap(p, targets, opts)?.point ?? p;
}
