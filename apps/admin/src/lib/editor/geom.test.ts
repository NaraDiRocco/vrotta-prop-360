import { describe, expect, test } from 'vitest';
import { angleBetween, normalizeYaw } from '@r360/core';
import {
  clampPoint,
  distance,
  edgeMidpoint,
  insertVertexAfter,
  midpoints,
  pointInRing,
  projectOnEdge,
  removeVertexAt,
  selfIntersects,
  toleranceFor,
  translateRing,
  unwrapYaw,
} from './geom.ts';
import { findSnap, snapPoint, type SnapTarget } from './snap.ts';
import type { Pt } from './records.ts';

const D = Math.PI / 180;

describe('vértices', () => {
  const ring: Pt[] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];

  test('insertar después del último vértice cierra por la arista de cierre', () => {
    const out = insertVertexAfter(ring, 3, [-0.5, 0.5]);
    expect(out).toHaveLength(5);
    expect(out[4]).toEqual([-0.5, 0.5]);
  });

  test('insertar en el medio corre el resto', () => {
    const out = insertVertexAfter(ring, 1, [1, 0.5]);
    expect(out[2]).toEqual([1, 0.5]);
    expect(out[3]).toEqual([1, 1]);
  });

  test('borrar respeta el mínimo de 3 vértices', () => {
    const tri = removeVertexAt(ring, 0);
    expect(tri).toHaveLength(3);
    expect(removeVertexAt(tri, 0)).toHaveLength(3);
  });

  test('borrar un índice inexistente devuelve el anillo intacto', () => {
    expect(removeVertexAt(ring, 99)).toEqual(ring);
  });
});

describe('puntos medios', () => {
  test('en plano son el promedio', () => {
    expect(edgeMidpoint('px', [0, 0], [0.4, 0.2])).toEqual([0.2, 0.1]);
  });

  test('en esfera son el punto medio del ARCO, equidistante de los extremos', () => {
    const a: Pt = [0, 0];
    const b: Pt = [80 * D, 40 * D];
    const m = edgeMidpoint('sph', a, b);
    expect(angleBetween(a, m)).toBeCloseTo(angleBetween(m, b), 10);
    expect(angleBetween(a, m) + angleBetween(m, b)).toBeCloseTo(angleBetween(a, b), 10);
  });

  test('hay un punto medio por arista, incluida la de cierre', () => {
    expect(midpoints('px', [[0, 0], [1, 0], [1, 1]])).toHaveLength(3);
  });
});

describe('normalización y traslación', () => {
  test('clampPoint envuelve el yaw y acota el pitch', () => {
    const [yaw, pitch] = clampPoint('sph', [Math.PI * 3, Math.PI]);
    expect(Math.abs(yaw)).toBeCloseTo(Math.PI, 10);
    expect(pitch).toBeLessThan(Math.PI / 2);
    expect(pitch).toBeGreaterThan(0);
  });

  test('clampPoint acota px a 0..1', () => {
    expect(clampPoint('px', [-0.3, 1.7])).toEqual([0, 1]);
  });

  test('trasladar cruzando ±180° no rompe el anillo', () => {
    const ring: Pt[] = [
      [170 * D, 0],
      [175 * D, 0],
      [175 * D, 0.1],
    ];
    const moved = translateRing('sph', ring, 20 * D, 0);
    // El primer vértice pasa a -170°, no a 190°.
    expect(moved[0]![0]).toBeCloseTo(normalizeYaw(190 * D), 10);
    expect(moved[0]![0]).toBeLessThan(0);
  });

  test('unwrapYaw devuelve una serie continua a través del meridiano', () => {
    const un = unwrapYaw([
      [179 * D, 0],
      [-179 * D, 0],
    ]);
    expect(un[1]![0]).toBeCloseTo(181 * D, 10);
  });
});

describe('auto-intersección', () => {
  test('un cuadrado no se auto-interseca y un moño sí', () => {
    expect(selfIntersects('px', [[0, 0], [1, 0], [1, 1], [0, 1]])).toBe(false);
    expect(selfIntersects('px', [[0, 0], [1, 1], [1, 0], [0, 1]])).toBe(true);
  });

  test('un triángulo nunca se auto-interseca', () => {
    expect(selfIntersects('px', [[0, 0], [1, 0], [0.5, 1]])).toBe(false);
  });

  test('un polígono a caballo del meridiano ±180° NO da falso positivo', () => {
    // Sin desenvolver el yaw, el salto de +179° a -179° cruza toda la esfera y
    // la detección lo lee como un cruce. Es el caso que rompe el aviso.
    const ring: Pt[] = [
      [178 * D, -0.1],
      [-178 * D, -0.1],
      [-178 * D, 0.1],
      [178 * D, 0.1],
    ];
    expect(selfIntersects('sph', ring)).toBe(false);
  });

  test('un moño esférico sigue detectándose', () => {
    const ring: Pt[] = [
      [178 * D, -0.1],
      [-178 * D, 0.1],
      [-178 * D, -0.1],
      [178 * D, 0.1],
    ];
    expect(selfIntersects('sph', ring)).toBe(true);
  });
});

describe('proyección sobre arista', () => {
  test('en plano cae en la perpendicular', () => {
    const proj = projectOnEdge('px', [0.5, 0.2], [0, 0], [1, 0])!;
    expect(proj.point[0]).toBeCloseTo(0.5, 10);
    expect(proj.point[1]).toBeCloseTo(0, 10);
    expect(proj.distance).toBeCloseTo(0.2, 10);
  });

  test('devuelve null cuando la perpendicular cae fuera del segmento', () => {
    expect(projectOnEdge('px', [2, 0.2], [0, 0], [1, 0])).toBeNull();
    expect(projectOnEdge('px', [-1, 0], [0, 0], [1, 0])).toBeNull();
  });

  test('en esfera el punto proyectado queda dentro del arco', () => {
    const a: Pt = [-20 * D, 0];
    const b: Pt = [20 * D, 0];
    const proj = projectOnEdge('sph', [5 * D, 3 * D], a, b)!;
    expect(proj).not.toBeNull();
    expect(proj.point[1]).toBeCloseTo(0, 6);
    expect(proj.distance).toBeCloseTo(3 * D, 6);
    expect(proj.t).toBeGreaterThan(0);
    expect(proj.t).toBeLessThan(1);
  });
});

describe('punto dentro del anillo', () => {
  test('plano', () => {
    const sq: Pt[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    expect(pointInRing('px', [0.5, 0.5], sq)).toBe(true);
    expect(pointInRing('px', [1.5, 0.5], sq)).toBe(false);
  });

  test('esférico a caballo del meridiano', () => {
    const ring: Pt[] = [
      [178 * D, -0.1],
      [-178 * D, -0.1],
      [-178 * D, 0.1],
      [178 * D, 0.1],
    ];
    expect(pointInRing('sph', [180 * D, 0], ring)).toBe(true);
    expect(pointInRing('sph', [0, 0], ring)).toBe(false);
  });
});

describe('snap', () => {
  const vecino: SnapTarget = {
    id: 'vecino',
    ring: [
      [0, 0],
      [10 * D, 0],
      [10 * D, -10 * D],
      [0, -10 * D],
    ],
  };

  test('la tolerancia se expresa en grados y se traduce por espacio', () => {
    expect(toleranceFor('sph', 2)).toBeCloseTo(2 * D, 12);
    expect(toleranceFor('px', 2)).toBeCloseTo(0.01, 12);
  });

  test('imanta al vértice de la medianera y elimina la rendija', () => {
    // Un vértice a 0.6° del vecino: a ojo parece el mismo punto, en el visor es
    // una línea blanca entre lotes.
    const hit = findSnap([10.6 * D, 0.2 * D], [vecino], { space: 'sph', toleranceDeg: 2 })!;
    expect(hit.kind).toBe('vertex');
    // Identidad EXACTA de la tupla: es lo que garantiza que no quede rendija.
    // (`distance` no puede confirmarlo: se apoya en `acos`, que cerca de 1
    // tiene un piso de ~1e-8 rad y nunca devuelve cero pelado.)
    expect(hit.point).toBe(vecino.ring[1]);
    expect(distance('sph', hit.point, vecino.ring[1]!)).toBeLessThan(1e-7);
  });

  test('el vértice gana sobre la arista aunque la arista esté más cerca', () => {
    // Este punto está a 0.1° de la arista superior y a ~1.0° del vértice.
    const hit = findSnap([9.0 * D, 0.1 * D], [vecino], { space: 'sph', toleranceDeg: 2 })!;
    expect(hit.kind).toBe('vertex');
  });

  test('imanta a la arista cuando no hay vértice cerca', () => {
    const hit = findSnap([5 * D, 0.5 * D], [vecino], { space: 'sph', toleranceDeg: 2 })!;
    expect(hit.kind).toBe('edge');
    expect(hit.point[1]).toBeCloseTo(0, 6);
  });

  test('fuera de tolerancia no imanta', () => {
    expect(findSnap([40 * D, 40 * D], [vecino], { space: 'sph', toleranceDeg: 2 })).toBeNull();
  });

  test('apagado no imanta nunca', () => {
    const p: Pt = [10.1 * D, 0];
    expect(findSnap(p, [vecino], { space: 'sph', toleranceDeg: 2, enabled: false })).toBeNull();
    expect(snapPoint(p, [vecino], { space: 'sph', toleranceDeg: 2, enabled: false })).toBe(p);
  });

  test('nunca imanta contra el propio polígono en edición', () => {
    const p: Pt = [10.1 * D, 0];
    expect(findSnap(p, [vecino], { space: 'sph', toleranceDeg: 2, excludeId: 'vecino' })).toBeNull();
  });

  test('con varios candidatos gana el más cercano', () => {
    const otro: SnapTarget = { id: 'otro', ring: [[10.5 * D, 0], [12 * D, 0], [12 * D, -1]] };
    const hit = findSnap([10.45 * D, 0], [vecino, otro], { space: 'sph', toleranceDeg: 2 })!;
    expect(hit.hotspotId).toBe('otro');
  });

  test('funciona igual en plano', () => {
    const t: SnapTarget = { id: 'a', ring: [[0.2, 0.2], [0.4, 0.2], [0.4, 0.4], [0.2, 0.4]] };
    const hit = findSnap([0.405, 0.203], [t], { space: 'px', toleranceDeg: 2 })!;
    expect(hit.kind).toBe('vertex');
    expect(hit.point).toEqual([0.4, 0.2]);
  });
});
