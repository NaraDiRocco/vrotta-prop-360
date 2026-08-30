import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AvailabilityFile, TourManifest } from '@r360/core';
import {
  rampColor,
  deriveBands,
  bandForPrice,
  availablePrices,
  minAvailablePrice,
  unitCodesFor,
  bandLabel,
  RAMP_FROM,
  RAMP_TO,
} from './price-layer.ts';

test('rampColor: en los extremos devuelve exactamente from/to', () => {
  assert.equal(rampColor(0), RAMP_FROM);
  assert.equal(rampColor(1), RAMP_TO);
});

test('rampColor: se recorta fuera de [0,1]', () => {
  assert.equal(rampColor(-5), RAMP_FROM);
  assert.equal(rampColor(5), RAMP_TO);
});

test('rampColor: no es igual a ningún STATUS_TOKENS.base (no se confunde con estado)', () => {
  // Regresión barata: si alguien copia y pega un color de estado acá, falla.
  const STATUS_BASES = ['#16A34A', '#D97706', '#DC2626', '#7C3AED', '#64748B'];
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    assert.ok(!STATUS_BASES.includes(rampColor(t).toUpperCase()));
  }
});

test('deriveBands: vacío sin precios', () => {
  assert.deepEqual(deriveBands([]), []);
});

test('deriveBands: 3 tramos por cuantiles, cubren todo el rango', () => {
  const prices = [100, 120, 150, 200, 210, 220, 300, 310, 320];
  const bands = deriveBands(prices, 3);
  assert.equal(bands.length, 3);
  assert.equal(bands[0]!.min, 100);
  assert.equal(bands[bands.length - 1]!.max, 320);
  // Los tramos son contiguos: el max de uno no supera el min del siguiente lógicamente.
  for (let i = 1; i < bands.length; i++) {
    assert.ok(bands[i]!.min >= bands[i - 1]!.min);
  }
});

test('deriveBands: colores ordenados claro -> oscuro (más caro = más oscuro)', () => {
  const prices = [100, 200, 300, 400, 500, 600];
  const bands = deriveBands(prices, 3);
  // El primer tramo (barato) usa el extremo claro, el último el extremo oscuro.
  assert.equal(bands[0]!.color, RAMP_FROM);
  assert.equal(bands[bands.length - 1]!.color, RAMP_TO);
});

test('deriveBands: con menos precios que tramos pedidos, no revienta', () => {
  const bands = deriveBands([100, 200], 4);
  assert.ok(bands.length >= 1 && bands.length <= 2);
});

test('bandForPrice: encuentra el tramo correcto', () => {
  const bands = deriveBands([100, 200, 300, 400, 500, 600], 3);
  const mid = bandForPrice(250, bands);
  assert.ok(mid);
  assert.ok(250 >= mid!.min && 250 <= mid!.max);
});

test('bandForPrice: precio por encima de todo cae en el tramo más caro, no queda sin pintar', () => {
  const bands = deriveBands([100, 200, 300], 3);
  const b = bandForPrice(99999, bands);
  assert.equal(b, bands[bands.length - 1]);
});

test('bandForPrice: sin tramos, null', () => {
  assert.equal(bandForPrice(100, []), null);
});

const availability: AvailabilityFile = {
  v: 1,
  generated_at: 'now',
  units: {
    'B2-A': { s: 'disponible', p: { a: 240000, c: 'USD' } },
    'B2-B': { s: 'reservado', p: { a: 999999, c: 'USD' } }, // no disponible: no debe entrar
    'B2-C': { s: 'disponible', p: null }, // sin precio: no debe entrar
    'B3-A': { s: 'disponible', p: { a: 96000, c: 'USD' } },
  },
};

test('availablePrices: sólo disponibles y con precio', () => {
  assert.deepEqual(availablePrices(availability).sort((a, b) => a - b), [96000, 240000]);
});

test('availablePrices: sin availability, vacío', () => {
  assert.deepEqual(availablePrices(null), []);
});

test('minAvailablePrice: mínimo entre varios códigos, ignora vendido/reservado y sin precio', () => {
  assert.equal(minAvailablePrice(['B2-A', 'B2-B', 'B2-C'], availability), 240000);
  assert.equal(minAvailablePrice(['B2-B', 'B2-C'], availability), null);
});

test('unitCodesFor: bloque agregado devuelve sus unidades; unidad hoja se devuelve a sí misma', () => {
  const tour = {
    units: {
      B2: { attrs: { unitCodes: ['B2-A', 'B2-B'] } },
      'B2-A': { attrs: {} },
    },
  } as unknown as TourManifest;
  assert.deepEqual(unitCodesFor('B2', tour), ['B2-A', 'B2-B']);
  assert.deepEqual(unitCodesFor('B2-A', tour), ['B2-A']);
  assert.deepEqual(unitCodesFor(null, tour), []);
});

test('bandLabel: extremos usan "hasta"/"más de", el medio usa rango', () => {
  const bands = deriveBands([100000, 200000, 300000], 3);
  assert.match(bandLabel(bands[0]!, 0, 3), /^hasta /);
  assert.match(bandLabel(bands[2]!, 2, 3), /^más de /);
  assert.doesNotMatch(bandLabel(bands[1]!, 1, 3), /^(hasta|más de)/);
});
