/**
 * Geometría esférica compartida por el visor y el editor.
 *
 * Convención: [yaw, pitch] en RADIANES.
 *   yaw   ∈ (-PI, PI]   rotación horizontal (longitud)
 *   pitch ∈ [-PI/2, PI/2] vertical (latitud). +PI/2 = cenit.
 */

export type Sph = readonly [number, number];
export type Vec3 = readonly [number, number, number];
/** Punto de plano/imagen, normalizado 0..1 sobre el ancho y alto del master. */
export type Px = readonly [number, number];

export const TAU = Math.PI * 2;

export function sphToVec3([yaw, pitch]: Sph): Vec3 {
  const cp = Math.cos(pitch);
  return [cp * Math.sin(yaw), Math.sin(pitch), cp * Math.cos(yaw)];
}

export function vec3ToSph([x, y, z]: Vec3): Sph {
  const len = Math.hypot(x, y, z) || 1;
  return [Math.atan2(x / len, z / len), Math.asin(clamp(y / len, -1, 1))];
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function normalize([x, y, z]: Vec3): Vec3 {
  const l = Math.hypot(x, y, z);
  return l === 0 ? [0, 0, 1] : [x / l, y / l, z / l];
}

/** Interpolación sobre el círculo máximo (arco más corto). */
export function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const d = clamp(dot(a, b), -1, 1);
  const omega = Math.acos(d);
  if (omega < 1e-6) return a;
  const so = Math.sin(omega);
  const s1 = Math.sin((1 - t) * omega) / so;
  const s2 = Math.sin(t * omega) / so;
  return [a[0] * s1 + b[0] * s2, a[1] * s1 + b[1] * s2, a[2] * s1 + b[2] * s2];
}

/** Ángulo entre dos direcciones, en radianes. */
export function angleBetween(a: Sph, b: Sph): number {
  return Math.acos(clamp(dot(sphToVec3(a), sphToVec3(b)), -1, 1));
}

/**
 * Subdivide una arista siguiendo la geodésica.
 *
 * Sin esto, el visor une los vértices con una recta EN PANTALLA, que no es
 * la recta sobre el terreno: a FOV ancho el borde del polígono se despega
 * visiblemente del lote. Devuelve el punto inicial y los intermedios; NO
 * incluye `b` (lo aporta la arista siguiente).
 */
export function densifyEdge(a: Sph, b: Sph, stepDeg = 2): Sph[] {
  const va = sphToVec3(a);
  const vb = sphToVec3(b);
  const omega = Math.acos(clamp(dot(va, vb), -1, 1));
  const steps = Math.max(1, Math.ceil((omega * 180) / Math.PI / stepDeg));
  const out: Sph[] = [];
  for (let i = 0; i < steps; i++) out.push(vec3ToSph(slerp(va, vb, i / steps)));
  return out;
}

/** Densifica un anillo cerrado completo. */
export function densifyRing(ring: readonly Sph[], stepDeg = 2): Sph[] {
  if (ring.length < 2) return [...ring];
  const out: Sph[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    out.push(...densifyEdge(a, b, stepDeg));
  }
  return out;
}

/**
 * Centroide esférico: promedio de VECTORES unitarios, normalizado.
 * Promediar yaw directamente rompe al cruzar ±180° (un polígono a caballo
 * del meridiano daría una etiqueta en el lado opuesto de la esfera).
 */
export function sphericalCentroid(ring: readonly Sph[]): Sph {
  if (ring.length === 0) return [0, 0];
  let x = 0, y = 0, z = 0;
  for (const p of ring) {
    const v = sphToVec3(p);
    x += v[0]; y += v[1]; z += v[2];
  }
  return vec3ToSph(normalize([x, y, z]));
}

/** Normaliza yaw al rango (-PI, PI]. */
export function normalizeYaw(yaw: number): number {
  let y = ((yaw + Math.PI) % TAU + TAU) % TAU - Math.PI;
  if (y === -Math.PI) y = Math.PI;
  return y;
}

/** Área esférica aproximada (excedente esférico) — sirve para ordenar por tamaño. */
export function ringAreaApprox(ring: readonly Sph[]): number {
  if (ring.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [y1, p1] = ring[i]!;
    const [y2, p2] = ring[(i + 1) % ring.length]!;
    let dy = normalizeYaw(y2 - y1);
    sum += dy * (2 + Math.sin(p1) + Math.sin(p2));
  }
  return Math.abs(sum / 2);
}

/** ¿El anillo se auto-interseca? Se usa para avisar en el editor. */
export function ringSelfIntersects(ring: readonly Px[] | readonly Sph[]): boolean {
  const n = ring.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsIntersect(ring[i]!, ring[(i + 1) % n]!, ring[j]!, ring[(j + 1) % n]!)) return true;
    }
  }
  return false;
}

function segmentsIntersect(p1: Sph | Px, p2: Sph | Px, p3: Sph | Px, p4: Sph | Px): boolean {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < 1e-12) return false;
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  return t > 0 && t < 1 && u > 0 && u < 1;
}
