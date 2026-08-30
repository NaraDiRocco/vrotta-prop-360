import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldRotate, canvasSize, toLatLng, fittedArea } from './plan-orientation.ts';

// Medidas reales de Baleia y de un teléfono común.
const BALEIA_W = 7945;
const BALEIA_H = 1960;
const PHONE_W = 375;
const PHONE_H = 812;

test('gira el masterplan apaisado en un teléfono vertical', () => {
  assert.equal(shouldRotate(BALEIA_W, BALEIA_H, PHONE_W, PHONE_H), true);
});

test('NO gira en escritorio apaisado', () => {
  assert.equal(shouldRotate(BALEIA_W, BALEIA_H, 1440, 810), false);
});

test('NO gira un plano casi cuadrado, aunque la pantalla sea vertical', () => {
  // Girar por poco margen desorienta más de lo que suma.
  assert.equal(shouldRotate(1200, 1000, PHONE_W, PHONE_H), false);
});

test('NO gira un plano vertical', () => {
  assert.equal(shouldRotate(1000, 2000, PHONE_W, PHONE_H), false);
});

test('tolera medidas inválidas sin romper', () => {
  assert.equal(shouldRotate(0, 0, PHONE_W, PHONE_H), false);
  assert.equal(shouldRotate(BALEIA_W, BALEIA_H, 0, 0), false);
});

test('el lienzo intercambia sus lados al girar', () => {
  assert.deepEqual(canvasSize(BALEIA_W, BALEIA_H, false), { w: BALEIA_W, h: BALEIA_H });
  assert.deepEqual(canvasSize(BALEIA_W, BALEIA_H, true), { w: BALEIA_H, h: BALEIA_W });
});

test('sin girar: las cuatro esquinas caen donde corresponde', () => {
  const W = 100, H = 40;
  // (0,0) es arriba-izquierda de la imagen → lat máxima, lng 0
  assert.deepEqual(toLatLng([0, 0], W, H, false), [H, 0]);
  assert.deepEqual(toLatLng([1, 0], W, H, false), [H, W]);   // arriba-derecha
  assert.deepEqual(toLatLng([0, 1], W, H, false), [0, 0]);   // abajo-izquierda
  assert.deepEqual(toLatLng([1, 1], W, H, false), [0, W]);   // abajo-derecha
});

test('girado 90° horario: arriba-izquierda va a arriba-derecha', () => {
  const W = 100, H = 40; // lienzo girado: 40 de ancho, 100 de alto
  // Al girar en sentido horario, la esquina superior izquierda del plano
  // termina arriba a la derecha de la pantalla.
  assert.deepEqual(toLatLng([0, 0], W, H, true), [W, H]);
  // La superior derecha baja a abajo-derecha.
  assert.deepEqual(toLatLng([1, 0], W, H, true), [0, H]);
  // La inferior izquierda sube a arriba-izquierda.
  assert.deepEqual(toLatLng([0, 1], W, H, true), [W, 0]);
  // La inferior derecha va a abajo-izquierda.
  assert.deepEqual(toLatLng([1, 1], W, H, true), [0, 0]);
});

test('el giro no deforma: el centro sigue en el centro', () => {
  const W = 100, H = 40;
  const [lat, lng] = toLatLng([0.5, 0.5], W, H, true);
  assert.equal(lat, W / 2);
  assert.equal(lng, H / 2);
});

test('girar multiplica por ~4,7 la superficie útil en un teléfono', () => {
  const sin = fittedArea(BALEIA_W, BALEIA_H, PHONE_W, PHONE_H);
  const con = fittedArea(BALEIA_H, BALEIA_W, PHONE_W, PHONE_H); // lados intercambiados
  const ganancia = con / sin;
  assert.ok(ganancia > 4.5 && ganancia < 5, `ganancia ${ganancia.toFixed(2)}x fuera de lo esperado`);
});
