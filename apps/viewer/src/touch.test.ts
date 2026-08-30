import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pointInPolygon,
  distanceToPolygon,
  polygonScreenSize,
  averagePolygonSize,
  findTouchCandidates,
  resolveTouch,
  MIN_TOUCH_PX,
  TOLERANCE_PX,
} from './touch.ts';

const SQUARE = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

test('pointInPolygon: adentro y afuera de un cuadrado', () => {
  assert.equal(pointInPolygon({ x: 50, y: 50 }, SQUARE), true);
  assert.equal(pointInPolygon({ x: 150, y: 50 }, SQUARE), false);
});

test('pointInPolygon: sobre el borde no cuenta como error catastrófico (no explota)', () => {
  assert.doesNotThrow(() => pointInPolygon({ x: 0, y: 0 }, SQUARE));
});

test('distanceToPolygon: 0 adentro, > 0 afuera, mide el borde más cercano', () => {
  assert.equal(distanceToPolygon({ x: 50, y: 50 }, SQUARE), 0);
  assert.equal(distanceToPolygon({ x: 110, y: 50 }, SQUARE), 10);
  assert.equal(distanceToPolygon({ x: -5, y: 50 }, SQUARE), 5);
});

test('polygonScreenSize: cuadrado de 100x100 mide 100', () => {
  assert.equal(polygonScreenSize(SQUARE), 100);
});

test('polygonScreenSize: polígono vacío mide 0', () => {
  assert.equal(polygonScreenSize([]), 0);
});

test('averagePolygonSize: promedia varios polígonos', () => {
  const small = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  const avg = averagePolygonSize([{ id: 'a', ring: SQUARE }, { id: 'b', ring: small }]);
  assert.equal(avg, (100 + 10) / 2);
});

test('averagePolygonSize: sin polígonos, Infinity (nunca activa el zoom-gate por accidente)', () => {
  assert.equal(averagePolygonSize([]), Infinity);
});

test('findTouchCandidates: un solo polígono, toque directo adentro', () => {
  const c = findTouchCandidates({ x: 50, y: 50 }, [{ id: 'lot-1', ring: SQUARE }]);
  assert.deepEqual(c, [{ id: 'lot-1', distance: 0, inside: true }]);
});

test('findTouchCandidates: toque fuera de todo tolerancia, ningún candidato', () => {
  const c = findTouchCandidates({ x: 500, y: 500 }, [{ id: 'lot-1', ring: SQUARE }]);
  assert.deepEqual(c, []);
});

test('findTouchCandidates: errar por un pelo (dentro de la tolerancia) igual selecciona', () => {
  const pt = { x: 100 + TOLERANCE_PX - 1, y: 50 }; // a un pelo del borde derecho
  const c = findTouchCandidates(pt, [{ id: 'lot-1', ring: SQUARE }]);
  assert.equal(c.length, 1);
  assert.equal(c[0]!.id, 'lot-1');
  assert.equal(c[0]!.inside, false);
});

test('findTouchCandidates: dos lotes vecinos bajo el mismo dedo -> dos candidatos, adentro primero', () => {
  const neighbor = [
    { x: 100, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 100 },
    { x: 100, y: 100 },
  ];
  // El toque cae justo adentro del segundo lote pero a <12px del borde del primero.
  const pt = { x: 105, y: 50 };
  const c = findTouchCandidates(pt, [
    { id: 'lot-1', ring: SQUARE },
    { id: 'lot-2', ring: neighbor },
  ]);
  assert.equal(c.length, 2);
  assert.equal(c[0]!.id, 'lot-2'); // adentro va primero
  assert.equal(c[0]!.inside, true);
  assert.equal(c[1]!.id, 'lot-1');
  assert.equal(c[1]!.inside, false);
});

test('resolveTouch: toque en el vacío no hace nada', () => {
  const r = resolveTouch({ x: 900, y: 900 }, [{ id: 'lot-1', ring: SQUARE }], { avgSizePx: 200 });
  assert.deepEqual(r, { kind: 'none' });
});

test('resolveTouch: lote grande (Baleia) -> selección directa, el zoom-gate no se activa', () => {
  const r = resolveTouch({ x: 50, y: 50 }, [{ id: 'lot-1', ring: SQUARE }], { avgSizePx: 300 });
  assert.deepEqual(r, { kind: 'select', id: 'lot-1' });
});

test('resolveTouch: lote chico bajo el umbral -> pide zoom en vez de seleccionar', () => {
  const r = resolveTouch(
    { x: 50, y: 50 },
    [{ id: 'lot-1', ring: SQUARE }],
    { avgSizePx: MIN_TOUCH_PX - 1 },
  );
  assert.deepEqual(r, { kind: 'zoom' });
});

test('resolveTouch: zoom-gate no se activa si el toque no tocó nada (no hay nada que agrandar)', () => {
  const r = resolveTouch({ x: 900, y: 900 }, [{ id: 'lot-1', ring: SQUARE }], { avgSizePx: 10 });
  assert.deepEqual(r, { kind: 'none' });
});

test('resolveTouch: dos candidatos con lotes ya grandes -> desambiguación honesta', () => {
  const neighbor = [
    { x: 100, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 100 },
    { x: 100, y: 100 },
  ];
  const pt = { x: 105, y: 50 };
  const r = resolveTouch(
    pt,
    [{ id: 'lot-1', ring: SQUARE }, { id: 'lot-2', ring: neighbor }],
    { avgSizePx: 100 },
  );
  assert.equal(r.kind, 'ambiguous');
  if (r.kind === 'ambiguous') assert.deepEqual(r.ids.sort(), ['lot-1', 'lot-2']);
});
