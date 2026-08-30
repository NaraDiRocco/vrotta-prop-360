/**
 * Operaciones de anillo, agnósticas del espacio de coordenadas.
 *
 * Todo lo que es matemática esférica de verdad (vectores, slerp, centroide,
 * auto-intersección) sale de `@r360/core`: el editor NO reimplementa nada de
 * eso. Acá sólo está la parte que el visor no necesita — insertar y borrar
 * vértices, puntos medios de arista, trasladar, y la distancia que usa el snap
 * — resuelta una vez para `sph` y para `px`.
 */
import {
  angleBetween,
  clamp,
  normalize,
  normalizeYaw,
  ringSelfIntersects,
  slerp,
  sphToVec3,
  sphericalCentroid,
  vec3ToSph,
  type Sph,
  type Vec3,
} from '@r360/core';
import type { GeomSpace, Pt } from './records.ts';

export const MIN_RING = 3;

/* ── distancia ─────────────────────────────────────────────────────────── */

/**
 * Distancia entre dos puntos en las unidades del espacio: radianes en `sph`,
 * fracción del master en `px`. El snap compara contra una tolerancia expresada
 * en las mismas unidades (ver `toleranceFor`).
 */
export function distance(space: GeomSpace, a: Pt, b: Pt): number {
  if (space === 'sph') return angleBetween(a as Sph, b as Sph);
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/**
 * La tolerancia de snap se configura SIEMPRE en grados, porque es la unidad en
 * la que el operador piensa ("2 grados") y porque es la que tiene sentido en la
 * panorámica. En un plano se traduce a fracción del master: 2° → 1 % del ancho,
 * que a 2400 px son 24 px, la misma sensación de imantado.
 */
export function toleranceFor(space: GeomSpace, tolDeg: number): number {
  return space === 'sph' ? (tolDeg * Math.PI) / 180 : tolDeg * 0.005;
}

/* ── anillo ────────────────────────────────────────────────────────────── */

/** Punto medio de la arista i→i+1. En `sph` es el punto medio del arco, no el promedio de ángulos. */
export function edgeMidpoint(space: GeomSpace, a: Pt, b: Pt): Pt {
  if (space === 'px') return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m = slerp(sphToVec3(a as Sph), sphToVec3(b as Sph), 0.5);
  return vec3ToSph(m);
}

/** Puntos medios de todas las aristas, incluida la de cierre. */
export function midpoints(space: GeomSpace, ring: readonly Pt[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < ring.length; i += 1) {
    out.push(edgeMidpoint(space, ring[i]!, ring[(i + 1) % ring.length]!));
  }
  return out;
}

/** Inserta `pt` DESPUÉS del vértice `index`. Devuelve un anillo nuevo. */
export function insertVertexAfter(ring: readonly Pt[], index: number, pt: Pt): Pt[] {
  const at = ((index % ring.length) + ring.length) % ring.length;
  const out = [...ring];
  out.splice(at + 1, 0, pt);
  return out;
}

/**
 * Borra el vértice `index`. Un polígono con menos de 3 vértices no es un
 * polígono: se devuelve el anillo intacto en vez de dejar geometría inválida
 * que el visor tendría que descartar en silencio.
 */
export function removeVertexAt(ring: readonly Pt[], index: number): Pt[] {
  if (ring.length <= MIN_RING) return [...ring];
  if (index < 0 || index >= ring.length) return [...ring];
  return ring.filter((_, i) => i !== index);
}

/**
 * Normaliza un punto a su rango válido (yaw envuelto, pitch acotado; px 0..1).
 *
 * El yaw sólo se envuelve si hace falta: `normalizeYaw` de un valor que ya está
 * en rango pasa por dos módulos y devuelve algo que difiere en el último bit.
 * Suena inocuo, pero esto corre en cada vértice de cada arrastre, y el error se
 * acumula hasta que dos vértices imantados al mismo punto dejan de ser iguales
 * — que es exactamente la rendija que el snap existe para evitar.
 */
export function clampPoint(space: GeomSpace, p: Pt): Pt {
  if (space === 'sph') {
    const yaw = p[0] > -Math.PI && p[0] <= Math.PI ? p[0] : normalizeYaw(p[0]);
    return [yaw, clamp(p[1], -Math.PI / 2 + 1e-6, Math.PI / 2 - 1e-6)];
  }
  return [clamp(p[0], 0, 1), clamp(p[1], 0, 1)];
}

/**
 * Traslada un anillo por un delta expresado en el mismo espacio.
 *
 * En `sph` el delta se aplica sobre yaw/pitch y no sobre el vector: es lo que
 * hace que arrastrar un polígono se sienta como arrastrarlo en pantalla. Cerca
 * de los polos deforma, pero ahí no hay lotes.
 */
export function translateRing(space: GeomSpace, ring: readonly Pt[], dx: number, dy: number): Pt[] {
  return ring.map((p) => clampPoint(space, [p[0] + dx, p[1] + dy]));
}

/** Delta entre dos posiciones del puntero, con el yaw envuelto por el camino corto. */
export function deltaBetween(space: GeomSpace, from: Pt, to: Pt): readonly [number, number] {
  if (space === 'sph') return [normalizeYaw(to[0] - from[0]), to[1] - from[1]];
  return [to[0] - from[0], to[1] - from[1]];
}

/** Centro del anillo: centroide esférico en `sph`, promedio simple en `px`. */
export function ringCenter(space: GeomSpace, ring: readonly Pt[]): Pt {
  if (ring.length === 0) return space === 'sph' ? [0, 0] : [0.5, 0.5];
  if (space === 'sph') return sphericalCentroid(ring as readonly Sph[]);
  let x = 0;
  let y = 0;
  for (const p of ring) {
    x += p[0];
    y += p[1];
  }
  return [x / ring.length, y / ring.length];
}

/**
 * ¿El anillo se cruza consigo mismo? Es un aviso, no un bloqueo: un polígono
 * en moño se dibuja igual y el operador tiene que poder verlo para arreglarlo.
 *
 * En `sph` se evalúa sobre yaw/pitch previa desenvoltura del yaw respecto del
 * primer vértice, para que un lote a caballo del meridiano ±180° no dé un falso
 * positivo por el salto de coordenada.
 */
export function selfIntersects(space: GeomSpace, ring: readonly Pt[]): boolean {
  if (ring.length < 4) return false;
  if (space === 'px') return ringSelfIntersects(ring);
  return ringSelfIntersects(unwrapYaw(ring));
}

/** Desenvuelve el yaw de un anillo para que sea continuo (sin saltos de 2π). */
export function unwrapYaw(ring: readonly Pt[]): Pt[] {
  if (ring.length === 0) return [];
  const out: Pt[] = [ring[0]!];
  let prev = ring[0]![0];
  for (let i = 1; i < ring.length; i += 1) {
    const next = prev + normalizeYaw(ring[i]![0] - prev);
    out.push([next, ring[i]![1]]);
    prev = next;
  }
  return out;
}

/* ── proyección sobre arista (la usa el snap a medianera) ──────────────── */

export interface EdgeProjection {
  point: Pt;
  /** Posición sobre la arista, 0 en `a` y 1 en `b`. */
  t: number;
  distance: number;
}

/**
 * Punto de la arista `a→b` más cercano a `p`. Devuelve null si la
 * perpendicular cae fuera del segmento: en ese caso el candidato correcto es un
 * vértice, y el vértice lo resuelve la otra mitad del snap.
 */
export function projectOnEdge(space: GeomSpace, p: Pt, a: Pt, b: Pt): EdgeProjection | null {
  if (space === 'px') {
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const len2 = vx * vx + vy * vy;
    if (len2 < 1e-18) return null;
    const t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2;
    if (t <= 0 || t >= 1) return null;
    const point: Pt = [a[0] + vx * t, a[1] + vy * t];
    return { point, t, distance: Math.hypot(p[0] - point[0], p[1] - point[1]) };
  }

  // Esférico: el punto más cercano sobre el círculo máximo que pasa por a y b
  // es p menos su componente en la normal del plano del círculo.
  const va = sphToVec3(a as Sph);
  const vb = sphToVec3(b as Sph);
  const vp = sphToVec3(p as Sph);
  const n = cross(va, vb);
  const nl = Math.hypot(n[0], n[1], n[2]);
  if (nl < 1e-12) return null; // a y b coinciden o son antípodas
  const nn: Vec3 = [n[0] / nl, n[1] / nl, n[2] / nl];
  const d = vp[0] * nn[0] + vp[1] * nn[1] + vp[2] * nn[2];
  const proj = normalize([vp[0] - nn[0] * d, vp[1] - nn[1] * d, vp[2] - nn[2] * d]);
  const point = vec3ToSph(proj);

  const ab = angleBetween(a as Sph, b as Sph);
  if (ab < 1e-9) return null;
  const ap = angleBetween(a as Sph, point);
  const pb = angleBetween(point, b as Sph);
  // Dentro del arco si las dos mitades suman el total (con holgura numérica).
  if (ap + pb > ab + 1e-6) return null;
  return { point, t: ap / ab, distance: Math.abs(Math.asin(clamp(d, -1, 1))) };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * ¿El punto está dentro del anillo? Se usa para elegir qué polígono se clickeó
 * cuando hay solapamiento. Rayo horizontal, sobre yaw desenvuelto en `sph`.
 */
export function pointInRing(space: GeomSpace, p: Pt, ring: readonly Pt[]): boolean {
  if (ring.length < 3) return false;
  const r = space === 'sph' ? unwrapYaw(ring) : ring;
  const px = space === 'sph' ? r[0]![0] + normalizeYaw(p[0] - r[0]![0]) : p[0];
  const py = p[1];
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i, i += 1) {
    const [xi, yi] = r[i]!;
    const [xj, yj] = r[j]!;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
