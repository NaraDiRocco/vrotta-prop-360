import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AvailabilityFile } from '@r360/core';
import { PRICE_ON_REQUEST, formatPrice, priceText, priceTextForUnit } from './polygons.ts';

// Intl separa el símbolo de moneda con un espacio duro (U+00A0). Es correcto
// tipográficamente y no es lo que estos tests están mirando: se normaliza para
// que la aserción hable del número y la moneda, no del glifo del espacio.
const plain = (s: string | null): string | null => s?.replace(/[\u00a0\u202f]/g, ' ') ?? s;

test('formatea el precio en la moneda que manda el dato', () => {
  assert.equal(plain(formatPrice({ a: 240000, c: 'USD' })), 'US$ 240.000');
  // En es-AR el peso uruguayo se escribe con su código, no con "$": el "$" a
  // secas es el peso argentino y confundirlos en un precio es caro.
  assert.equal(plain(formatPrice({ a: 145000, c: 'UYU' })), 'UYU 145.000');
});

test('una moneda que Intl no conoce muestra el código, no se traga el número', () => {
  assert.equal(plain(formatPrice({ a: 1000, c: 'XYZ' })), 'XYZ 1.000');
});

test('un monto que no es un número no se dibuja como NaN', () => {
  assert.equal(formatPrice({ a: Number.NaN, c: 'USD' }), PRICE_ON_REQUEST);
});

test('con precio público se muestra el precio', () => {
  assert.equal(plain(priceText({ price: { a: 240000, c: 'USD' }, status: 'disponible' })), 'US$ 240.000');
});

test('sin precio público en una unidad comprable se dice "Consultar", no se inventa', () => {
  assert.equal(priceText({ price: null, status: 'disponible' }), PRICE_ON_REQUEST);
  assert.equal(priceText({ price: null, status: 'reservado' }), PRICE_ON_REQUEST);
});

test('lo que ya no está a la venta no invita a consultar un precio', () => {
  assert.equal(priceText({ price: null, status: 'vendido' }), null);
  assert.equal(priceText({ price: null, status: 'bloqueado' }), null);
  assert.equal(priceText({ price: null, status: 'no_disponible' }), null);
});

test('una unidad vendida con precio publicado igual lo muestra', () => {
  // El dato lo manda el cliente: si decidió publicarlo, no lo escondemos.
  assert.equal(plain(priceText({ price: { a: 200000, c: 'USD' }, status: 'vendido' })), 'US$ 200.000');
});

test('un hotspot informativo (una laguna) no tiene precio ni "Consultar"', () => {
  assert.equal(priceText({ price: null, status: 'no_disponible', informational: true }), null);
  assert.equal(priceText({ price: { a: 1, c: 'USD' }, status: 'disponible', informational: true }), null);
});

const availability: AvailabilityFile = {
  v: 1,
  generated_at: '2026-08-30T00:00:00.000Z',
  units: {
    'B2-A': { s: 'disponible', p: { a: 240000, c: 'USD' } },
    'B2-B': { s: 'disponible', p: null },
    'B2-C': { s: 'vendido', p: null },
    // Estado que el visor no conoce: cae al fallback, no rompe ni miente.
    'B2-D': { s: 'en_promocion' as AvailabilityFile['units'][string]['s'], p: null },
  },
};

test('desde el código: precio, "Consultar" o nada, según el caso', () => {
  assert.equal(plain(priceTextForUnit('B2-A', availability)), 'US$ 240.000');
  assert.equal(priceTextForUnit('B2-B', availability), PRICE_ON_REQUEST);
  assert.equal(priceTextForUnit('B2-C', availability), null);
  assert.equal(priceTextForUnit('B2-D', availability), null);
});

test('una unidad ausente de availability no dice nada de precio', () => {
  assert.equal(priceTextForUnit('B9-Z', availability), null);
  assert.equal(priceTextForUnit('B2-A', null), null);
});
