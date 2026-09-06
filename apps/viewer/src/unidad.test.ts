import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ETAPA_FUTURA_NOTA,
  esEtapaFutura,
  formatM2,
  frasePorUnidad,
  letraDeUnidad,
  lineaEnVenta,
  numeroComercial,
  puedeVisitarse,
  resumenEnVenta,
  tituloDeUnidad,
} from './unidad.ts';

// Intl usa espacio duro en algunos formatos: se normaliza para hablar del texto.
const plain = (s: string): string => s.replace(/[  ]/g, ' ');

// ------------------------------------------------------------------ superficie

test('la superficie se escribe con coma decimal, como en español', () => {
  assert.equal(plain(formatM2(163.42)), '163,42 m²');
  assert.equal(plain(formatM2(160.5)), '160,5 m²');
  assert.equal(plain(formatM2(1234.5)), '1.234,5 m²');
});

// --------------------------------------------------------------------- letra

test('la letra sale del código del brochure', () => {
  assert.equal(letraDeUnidad('B2-A'), 'A');
  assert.equal(letraDeUnidad('B3-K'), 'K');
});

test('un código que no es del brochure no inventa letra', () => {
  assert.equal(letraDeUnidad('B2'), null);
  assert.equal(letraDeUnidad('M4/L 12'), null);
});

// -------------------------------------------------------------------- número

test('el número comercial se lee del manifiesto, nunca se deduce del código', () => {
  assert.equal(numeroComercial({ numeroComercial: '201' }), '201');
  assert.equal(numeroComercial({ numeroComercial: 201 }), '201');
  // B2-B existe y su número (202) es una asunción posicional: el builder no lo
  // emite, así que acá no hay nada que mostrar.
  assert.equal(numeroComercial({ tipologia: 'Dúplex' }), null);
  assert.equal(numeroComercial(undefined), null);
  assert.equal(numeroComercial({ numeroComercial: '  ' }), null);
});

// -------------------------------------------------------------------- título

test('con el número confirmado, el número va primero', () => {
  assert.equal(tituloDeUnidad({ code: 'B2-A', label: 'B2-A', numero: '201' }), '201 · Unidad A');
});

test('sin número confirmado se muestra sólo la letra', () => {
  assert.equal(tituloDeUnidad({ code: 'B2-B', label: 'B2-B', numero: null }), 'Unidad B');
  assert.equal(tituloDeUnidad({ code: 'B2-H', label: 'B2-H' }), 'Unidad H');
});

test('un código sin letra reconocible se muestra tal como lo rotula el manifiesto', () => {
  assert.equal(tituloDeUnidad({ code: 'B2', label: 'Bloque 2' }), 'Bloque 2');
  assert.equal(tituloDeUnidad({ code: 'X1' }), 'X1');
});

// -------------------------------------------------------------------- frase

test('la frase del mensaje usa el número cuando existe', () => {
  assert.equal(frasePorUnidad({ code: 'B2-A', label: 'B2-A', numero: '201' }), 'la 201');
  assert.equal(frasePorUnidad({ code: 'B2-B', label: 'B2-B', numero: null }), 'la unidad B2-B');
});

// -------------------------------------------------------------- etapa futura

test('un bloque sin unidades y sin estado es una etapa futura (B4, B5)', () => {
  assert.equal(esEtapaFutura({ codes: [], tieneEstado: false }), true);
});

test('un bloque con unidades, o con estado, no es una etapa futura', () => {
  assert.equal(esEtapaFutura({ codes: ['B3-A'], tieneEstado: false }), false);
  assert.equal(esEtapaFutura({ codes: [], tieneEstado: true }), false);
  // Una unidad hoja (no es bloque: no tiene `unitCodes`) nunca lo es.
  assert.equal(esEtapaFutura({ codes: null, tieneEstado: false }), false);
});

test('la nota de etapa futura no afirma nada que no sepamos', () => {
  assert.equal(ETAPA_FUTURA_NOTA, 'Etapa futura. Sin información comercial todavía.');
});

// ------------------------------------------------------------------- visita

test('se puede visitar una unidad del bloque construido', () => {
  assert.equal(puedeVisitarse({ groupCode: 'B2', bloqueConstruido: 'B2', status: 'disponible' }), true);
  assert.equal(puedeVisitarse({ groupCode: 'B2', bloqueConstruido: 'B2', status: 'bloqueado' }), true);
});

test('no se invita a visitar lo que está vendido ni lo que no está construido', () => {
  assert.equal(puedeVisitarse({ groupCode: 'B2', bloqueConstruido: 'B2', status: 'vendido' }), false);
  assert.equal(puedeVisitarse({ groupCode: 'B3', bloqueConstruido: 'B2', status: 'proximamente' }), false);
  assert.equal(puedeVisitarse({ groupCode: 'B2', bloqueConstruido: null, status: 'disponible' }), false);
  assert.equal(puedeVisitarse({ groupCode: null, bloqueConstruido: 'B2', status: 'disponible' }), false);
});

// ------------------------------------------------------------------ en venta

const ESTADOS: Record<string, string> = {
  'B2-A': 'disponible',
  'B2-B': 'disponible',
  'B2-C': 'disponible',
  'B2-D': 'disponible',
  'B2-E': 'disponible',
  'B2-F': 'bloqueado',
  'B2-G': 'bloqueado',
  'B2-H': 'vendido',
  'B2-I': 'vendido',
  ...Object.fromEntries('ABCDEFGHIJ'.split('').map((l) => [`B3-${l}`, 'proximamente'])),
  // B3-K falta a propósito en availability.json (README §3.3).
};

test('el Bloque 3 no cuenta como stock: el Bloque 2 son las 9 en venta', () => {
  const codes = Object.keys(ESTADOS).concat('B3-K');
  const r = resumenEnVenta(codes, (c) => ESTADOS[c] ?? null);
  assert.deepEqual(r, { enVenta: 9, disponibles: 5 });
  assert.equal(lineaEnVenta(r), '9 unidades en venta · 5 disponibles');
});

test('el singular se dice en singular', () => {
  assert.equal(lineaEnVenta({ enVenta: 1, disponibles: 1 }), '1 unidad en venta · 1 disponible');
});

test('sin ningún estado cargado no se inventa stock', () => {
  assert.deepEqual(resumenEnVenta(['B2-A', 'B2-B'], () => null), { enVenta: 0, disponibles: 0 });
});
