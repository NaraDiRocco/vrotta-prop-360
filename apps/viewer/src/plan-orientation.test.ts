import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldRotate,
  canvasSize,
  toLatLng,
  fittedArea,
  fitWidthView,
  isBottomChromeRect,
  legendOffsetFrom,
} from './plan-orientation.ts';

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

// ── Encuadre al ancho (idea 4, auditoría §4) ────────────────────────────

test('fitWidthView: el ancho del lienzo llena exactamente el ancho del box', () => {
  const view = fitWidthView(1960, 7945, 375, 812)!;
  assert.ok(view);
  const displayedWidth = 1960 * Math.pow(2, view.zoom);
  assert.ok(Math.abs(displayedWidth - 375) < 0.01);
});

test('fitWidthView: ancla arriba — el borde superior de la vista cae en el tope del lienzo', () => {
  const view = fitWidthView(1960, 7945, 375, 812)!;
  const scale = Math.pow(2, view.zoom);
  const viewportH = 812 / scale;
  const top = view.centerLat + viewportH / 2;
  assert.ok(Math.abs(top - 7945) < 0.01, `tope de la vista ${top} debería ser 7945 (el tope del lienzo)`);
});

test('fitWidthView: da más zoom (menos zoom-out) que el fitBounds de siempre, que encaja también el alto', () => {
  const view = fitWidthView(1960, 7945, 375, 812)!;
  // El fitBounds de siempre usa min(ancho, alto): con este lienzo 1:4, el
  // alto manda y el zoom resultante es más chico — eso es lo que deja el
  // plano en ~120px de ancho (medido en la auditoría). Al ancho, el zoom
  // tiene que ser mayor.
  const zoomFitBoth = Math.log2(Math.min(375 / 1960, 812 / 7945));
  assert.ok(view.zoom > zoomFitBoth);
  // Y con ese zoom mayor, el ancho mostrado es el ancho real de pantalla,
  // no una fracción de él.
  const anchoAlAncho = 1960 * Math.pow(2, view.zoom);
  assert.equal(Math.round(anchoAlAncho), 375);
});

test('fitWidthView: medidas inválidas devuelven null, no rompe', () => {
  assert.equal(fitWidthView(0, 100, 375, 812), null);
  assert.equal(fitWidthView(100, 0, 375, 812), null);
  assert.equal(fitWidthView(100, 100, 0, 812), null);
  assert.equal(fitWidthView(100, 100, 375, 0), null);
});

// ── Chrome inferior vs. contenedor de pantalla completa ─────────────────

test('isBottomChromeRect: una barra angosta que toca el borde inferior cuenta como chrome', () => {
  const vh = 812;
  const tabBar = { top: vh - 61, bottom: vh, height: 61 };
  assert.equal(isBottomChromeRect(tabBar, vh), true);
});

test('isBottomChromeRect: un contenedor de pantalla completa NO cuenta, aunque toque el borde inferior', () => {
  const vh = 812;
  // .r360-plan, .r360-ui, .r360-units-mount: inset:0, los 812px enteros.
  const fullScreen = { top: 0, bottom: vh, height: vh };
  assert.equal(isBottomChromeRect(fullScreen, vh), false);
});

test('isBottomChromeRect: algo que no toca el borde inferior no cuenta', () => {
  const vh = 812;
  const floating = { top: 100, bottom: 200, height: 100 };
  assert.equal(isBottomChromeRect(floating, vh), false);
});

test('legendOffsetFrom: mide la barra más alta entre las candidatas, ignora los contenedores enteros', () => {
  const vh = 812;
  const rects = [
    { top: 0, bottom: vh, height: vh }, // .r360-plan
    { top: 0, bottom: vh, height: vh }, // .r360-ui
    { top: 0, bottom: vh, height: vh }, // .r360-units-mount
    { top: vh - 61, bottom: vh, height: 61 }, // barra de pestañas
  ];
  assert.equal(legendOffsetFrom(rects, vh), 61);
});

test('legendOffsetFrom: sin candidatos, alto 0', () => {
  assert.equal(legendOffsetFrom([], 812), 0);
});

test('legendOffsetFrom: reproduce el bug medido — sin el filtro daría ~893px en vez de ~61px', () => {
  const vh = 812;
  // Reproduce exactamente lo medido en la auditoría: sólo contenedores de
  // pantalla completa tocando el borde inferior, ninguna barra angosta.
  const onlyFullScreenContainers = [
    { top: 0, bottom: vh, height: vh },
    { top: 0, bottom: vh, height: vh },
  ];
  assert.equal(legendOffsetFrom(onlyFullScreenContainers, vh), 0);
});
