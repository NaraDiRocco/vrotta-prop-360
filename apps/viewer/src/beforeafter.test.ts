import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampPercent,
  percentFromClientX,
  axisFromDelta,
  toggleTarget,
  isDoubleTap,
  arrowKeyDelta,
  labelOpacity,
  easeInOutCubic,
  valueAt,
  distanceBetween,
  clampScale,
  ARROW_KEY_STEP,
  SAFE_DEFAULT_PCT,
} from './beforeafter.ts';

// --- clampPercent -----------------------------------------------------

test('clampPercent deja pasar valores dentro de rango', () => {
  assert.equal(clampPercent(0), 0);
  assert.equal(clampPercent(50), 50);
  assert.equal(clampPercent(100), 100);
});

test('clampPercent recorta fuera de rango', () => {
  assert.equal(clampPercent(-10), 0);
  assert.equal(clampPercent(140), 100);
});

test('clampPercent cae al medio si el número es inválido', () => {
  assert.equal(clampPercent(NaN), 50);
});

// --- percentFromClientX ------------------------------------------------

test('percentFromClientX mapea el borde izquierdo a 0 y el derecho a 100', () => {
  const rect = { left: 100, width: 300 };
  assert.equal(percentFromClientX(100, rect), 0);
  assert.equal(percentFromClientX(400, rect), 100);
  assert.equal(percentFromClientX(250, rect), 50);
});

test('percentFromClientX recorta cuando el toque cae afuera de la caja', () => {
  const rect = { left: 0, width: 200 };
  assert.equal(percentFromClientX(-50, rect), 0);
  assert.equal(percentFromClientX(500, rect), 100);
});

test('percentFromClientX no rompe con una caja de ancho 0', () => {
  assert.equal(percentFromClientX(10, { left: 0, width: 0 }), 50);
});

// --- axisFromDelta -------------------------------------------------------

test('axisFromDelta: sin movimiento suficiente todavía no decide', () => {
  assert.equal(axisFromDelta(1, 1), 'undecided');
  assert.equal(axisFromDelta(0, 0), 'undecided');
});

test('axisFromDelta: más horizontal que vertical es arrastre del divisor', () => {
  assert.equal(axisFromDelta(20, 5), 'horizontal');
  assert.equal(axisFromDelta(-20, 5), 'horizontal');
});

test('axisFromDelta: más vertical que horizontal es scroll de la página', () => {
  assert.equal(axisFromDelta(5, 20), 'vertical');
  assert.equal(axisFromDelta(5, -20), 'vertical');
});

test('axisFromDelta: en un empate exacto gana el scroll (no le roba el gesto a la página)', () => {
  assert.equal(axisFromDelta(15, 15), 'vertical');
});

test('axisFromDelta respeta un umbral custom', () => {
  assert.equal(axisFromDelta(3, 1, 10), 'undecided');
  assert.equal(axisFromDelta(12, 1, 10), 'horizontal');
});

// --- toggleTarget --------------------------------------------------------

test('toggleTarget: desde la izquierda del medio va a 100', () => {
  assert.equal(toggleTarget(0), 100);
  assert.equal(toggleTarget(49), 100);
});

test('toggleTarget: desde el medio o la derecha va a 0', () => {
  assert.equal(toggleTarget(50), 0);
  assert.equal(toggleTarget(100), 0);
});

test('toggleTarget es su propio inverso en los extremos (alterna, no se traba)', () => {
  const a = toggleTarget(0);
  const b = toggleTarget(a);
  assert.equal(b, 0);
});

// --- isDoubleTap -----------------------------------------------------------

test('isDoubleTap: dos toques cerca en tiempo y espacio cuentan como doble toque', () => {
  assert.equal(isDoubleTap(0, 200, { x: 100, y: 100 }, { x: 105, y: 98 }), true);
});

test('isDoubleTap: demasiado lejos en el tiempo no cuenta', () => {
  assert.equal(isDoubleTap(0, 500, { x: 100, y: 100 }, { x: 100, y: 100 }), false);
});

test('isDoubleTap: demasiado lejos en el espacio no cuenta', () => {
  assert.equal(isDoubleTap(0, 100, { x: 0, y: 0 }, { x: 200, y: 0 }), false);
});

test('isDoubleTap: un delta de tiempo negativo (reloj raro) no rompe, da false', () => {
  assert.equal(isDoubleTap(500, 100, { x: 0, y: 0 }, { x: 0, y: 0 }), false);
});

test('isDoubleTap acepta umbrales custom', () => {
  assert.equal(isDoubleTap(0, 400, { x: 0, y: 0 }, { x: 0, y: 0 }, 500, 32), true);
});

// --- arrowKeyDelta -----------------------------------------------------------

test('arrowKeyDelta mueve 5% con las flechas', () => {
  assert.equal(arrowKeyDelta('ArrowLeft'), -ARROW_KEY_STEP);
  assert.equal(arrowKeyDelta('ArrowRight'), ARROW_KEY_STEP);
});

test('arrowKeyDelta ignora cualquier otra tecla', () => {
  assert.equal(arrowKeyDelta('Enter'), null);
  assert.equal(arrowKeyDelta('ArrowUp'), null);
  assert.equal(arrowKeyDelta(' '), null);
});

// --- labelOpacity ----------------------------------------------------------

test('labelOpacity: a mitad de camino los dos rótulos están completos', () => {
  assert.equal(labelOpacity(50, 'before'), 1);
  assert.equal(labelOpacity(50, 'after'), 1);
});

// pct bajo (cerca de 0) = el divisor está pegado a la izquierda = la imagen
// de "después" cubre casi toda la caja (ver la tabla de semántica en beforeafter.ts).
test('labelOpacity: pct bajo → "después" tapó casi toda la pantalla, se atenúa el rótulo de la foto real', () => {
  assert.equal(labelOpacity(10, 'before'), 0.35);
  assert.equal(labelOpacity(10, 'after'), 1);
});

// pct alto (cerca de 100) = el divisor está pegado a la derecha = la foto
// real cubre casi toda la caja, "después" queda recortado a casi nada.
test('labelOpacity: pct alto → la foto real ocupa casi toda la pantalla, se atenúa el rótulo de "después"', () => {
  assert.equal(labelOpacity(90, 'after'), 0.35);
  assert.equal(labelOpacity(90, 'before'), 1);
});

test('labelOpacity tolera un porcentaje fuera de rango (lo recorta primero)', () => {
  assert.equal(labelOpacity(-50, 'before'), 0.35); // recorta a 0: "después" cubre todo
  assert.equal(labelOpacity(500, 'after'), 0.35); // recorta a 100: foto real cubre todo
});

// --- invariante pct / imagen visible / rótulo atenuado ----------------------
//
// Esto es lo que se rompió: cada función de arriba pasaba sus propios tests
// por separado (33 verdes) mientras `labelOpacity` interpretaba `pct` al
// revés que el `clip-path` de `beforeafter.css`. Un test que sólo mira
// `labelOpacity` en aislado no puede atrapar eso — hace falta atar la
// semántica de `pct` (cabecera de `beforeafter.ts`: 0 = "después" completo,
// 100 = foto real completa) a lo que `labelOpacity` decide atenuar, y a
// dónde manda `toggleTarget`.

test('invariante: en pct=0 ("después" cubre toda la caja) se atenúa el rótulo de la foto real, no el de "después"', () => {
  assert.equal(labelOpacity(0, 'before'), 0.35, 'la foto real está 100% tapada por "después": su rótulo debe atenuarse');
  assert.equal(labelOpacity(0, 'after'), 1, '"después" se ve entero: su rótulo debe quedar brillante');
});

test('invariante: en pct=100 (foto real cubre toda la caja) se atenúa el rótulo de "después", no el de la foto real', () => {
  assert.equal(labelOpacity(100, 'after'), 0.35, '"después" quedó recortado a nada: su rótulo debe atenuarse');
  assert.equal(labelOpacity(100, 'before'), 1, 'la foto real se ve entera: su rótulo debe quedar brillante');
});

test('invariante: toggleTarget siempre aterriza en un extremo cuyo propio rótulo queda brillante (nunca el atenuado)', () => {
  for (const pct of [0, 20, 49, 50, 70, 100]) {
    const target = toggleTarget(pct);
    assert.ok(target === 0 || target === 100, `toggleTarget(${pct}) debe ser un extremo, dio ${target}`);
    if (target === 100) {
      // Destino: foto real completa → su propio rótulo brillante, el de "después" atenuado.
      assert.equal(labelOpacity(target, 'before'), 1);
      assert.equal(labelOpacity(target, 'after'), 0.35);
    } else {
      // Destino: "después" completo → su propio rótulo brillante, el de la foto real atenuado.
      assert.equal(labelOpacity(target, 'after'), 1);
      assert.equal(labelOpacity(target, 'before'), 0.35);
    }
  }
});

test('invariante: el default seguro de arranque (SAFE_DEFAULT_PCT) es foto real completa, nunca "después"', () => {
  // Si el barrido de bienvenida no llega a correr (tab en segundo plano,
  // observer que no dispara, error temprano) esto es lo que queda a la
  // vista — tiene que ser la foto real, nunca la imagen de "después".
  assert.equal(SAFE_DEFAULT_PCT, 100);
  assert.equal(labelOpacity(SAFE_DEFAULT_PCT, 'before'), 1);
  assert.equal(labelOpacity(SAFE_DEFAULT_PCT, 'after'), 0.35);
});

// --- easeInOutCubic / valueAt ------------------------------------------------

test('easeInOutCubic va de 0 a 1', () => {
  assert.equal(easeInOutCubic(0), 0);
  assert.equal(easeInOutCubic(1), 1);
});

test('easeInOutCubic es monótona creciente (no hay "rebote")', () => {
  let prev = -1;
  for (let t = 0; t <= 1; t += 0.05) {
    const v = easeInOutCubic(t);
    assert.ok(v >= prev, `easeInOutCubic(${t.toFixed(2)}) = ${v} retrocedió`);
    prev = v;
  }
});

test('valueAt empieza en "from" y termina en "to"', () => {
  assert.equal(valueAt(0, 1200, 0, 50), 0);
  assert.equal(valueAt(1200, 1200, 0, 50), 50);
});

test('valueAt con duración 0 salta directo al final (así sirve también para el modo instantáneo)', () => {
  assert.equal(valueAt(0, 0, 0, 50), 50);
  assert.equal(valueAt(999, 0, 20, 80), 80);
});

test('valueAt no se pasa del destino aunque el tiempo transcurrido sea mayor a la duración', () => {
  assert.equal(valueAt(5000, 1200, 0, 50), 50);
});

test('valueAt es monótono creciente en un barrido ascendente', () => {
  let prev = -Infinity;
  for (let ms = 0; ms <= 1200; ms += 50) {
    const v = valueAt(ms, 1200, 0, 50);
    assert.ok(v >= prev, `valueAt en ${ms}ms retrocedió`);
    prev = v;
  }
});

// --- pinch-zoom (pantalla completa) -----------------------------------------

test('distanceBetween calcula la distancia euclídea entre dos dedos', () => {
  assert.equal(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

test('clampScale no deja bajar de 1x ni pasar de 4x por defecto', () => {
  assert.equal(clampScale(0.2), 1);
  assert.equal(clampScale(1), 1);
  assert.equal(clampScale(2.5), 2.5);
  assert.equal(clampScale(10), 4);
});

test('clampScale acepta límites custom', () => {
  assert.equal(clampScale(1.5, 1, 2), 1.5);
  assert.equal(clampScale(3, 1, 2), 2);
});
