import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sphToVec3, vec3ToSph, densifyEdge, densifyRing, sphericalCentroid,
  normalizeYaw, angleBetween, ringSelfIntersects, slerp,
} from './geometry.ts';

const close = (a: number, b: number, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `${a} !== ${b}`);

test('sph<->vec3 ida y vuelta', () => {
  for (const p of [[0, 0], [1.2, -0.5], [-2.9, 1.1], [Math.PI, 0]] as const) {
    const r = vec3ToSph(sphToVec3(p));
    close(normalizeYaw(r[0] - p[0]), 0, 1e-9);
    close(r[1], p[1], 1e-9);
  }
});

test('vectores unitarios', () => {
  const [x, y, z] = sphToVec3([0.7, -0.3]);
  close(Math.hypot(x, y, z), 1, 1e-12);
});

test('densifyEdge respeta el paso angular máximo', () => {
  const a = [0, 0] as const, b = [1.0, 0] as const; // ~57°
  const pts = densifyEdge(a, b, 2);
  assert.ok(pts.length >= 28, `esperaba >=28 puntos, hubo ${pts.length}`);
  for (let i = 0; i < pts.length - 1; i++) {
    const deg = (angleBetween(pts[i]!, pts[i + 1]!) * 180) / Math.PI;
    assert.ok(deg <= 2.001, `segmento de ${deg}° supera el paso de 2°`);
  }
});

test('densifyEdge no incluye el extremo final (lo aporta la arista siguiente)', () => {
  const pts = densifyEdge([0, 0], [0.5, 0], 2);
  close(pts[0]![0], 0);
  assert.ok(Math.abs(pts[pts.length - 1]![0] - 0.5) > 1e-6);
});

test('densifyRing cierra el anillo sin duplicar vértices', () => {
  const ring = [[0, 0], [0.2, 0], [0.2, 0.2], [0, 0.2]] as const;
  const d = densifyRing(ring, 5);
  assert.ok(d.length > ring.length);
  // el primer punto debe ser el primer vértice original
  close(d[0]![0], 0); close(d[0]![1], 0);
});

test('centroide esférico funciona cruzando el meridiano ±180', () => {
  // dos puntos a ambos lados de la discontinuidad: el centro real es ±PI
  const c = sphericalCentroid([[Math.PI - 0.1, 0], [-Math.PI + 0.1, 0]]);
  assert.ok(Math.abs(Math.abs(c[0]) - Math.PI) < 1e-9, `yaw=${c[0]} deberia ser ~±PI`);
  close(c[1], 0, 1e-9);
  // el promedio ingenuo de yaw habria dado 0 (lado opuesto de la esfera)
});

test('normalizeYaw acota a (-PI, PI]', () => {
  close(normalizeYaw(3 * Math.PI), Math.PI);
  close(normalizeYaw(-3 * Math.PI), Math.PI);
  close(normalizeYaw(0.5), 0.5);
});

test('slerp en t=0 y t=1', () => {
  const a = sphToVec3([0, 0]), b = sphToVec3([1, 0.3]);
  const s0 = slerp(a, b, 0), s1 = slerp(a, b, 1);
  close(s0[0], a[0], 1e-9);
  close(s1[0], b[0], 1e-9);
});

test('deteccion de auto-interseccion', () => {
  const simple = [[0, 0], [1, 0], [1, 1], [0, 1]] as const;
  const bowtie = [[0, 0], [1, 1], [1, 0], [0, 1]] as const;
  assert.equal(ringSelfIntersects(simple), false);
  assert.equal(ringSelfIntersects(bowtie), true);
});
