import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AvailabilityFile, TourManifest } from '@r360/core';
import {
  buildUnitRows,
  matchesFilter,
  filterUnits,
  groupByBlock,
  tipologiasOf,
  isFilterEmpty,
  EMPTY_FILTER,
  type FilterState,
} from './filters.ts';

const tour = {
  schema: 1,
  project: 'p',
  version: 1,
  tenant: 't',
  availabilityUrl: './availability.json',
  start: 'masterplan',
  scenes: [],
  hotspots: [],
  units: {
    B2: { label: 'Bloque 2', attrs: { unitCodes: ['B2-A', 'B2-B'] } },
    'B2-A': {
      label: 'B2-A', groupCode: 'B2', areaTotalM2: 176,
      attrs: { tipologia: 'Dúplex', dormitorios: 2 },
    },
    'B2-B': {
      label: 'B2-B', groupCode: 'B2', areaTotalM2: 97,
      attrs: { tipologia: '1 dorm', dormitorios: 1 },
    },
    'B3-A': {
      label: 'B3-A', groupCode: 'B3', areaTotalM2: 96,
      attrs: { tipologia: '1 dorm', dormitorios: 1 },
    },
  },
} as unknown as TourManifest;

const availability: AvailabilityFile = {
  v: 1,
  generated_at: 'now',
  units: {
    'B2-A': { s: 'disponible', p: { a: 240000, c: 'USD' } },
    'B2-B': { s: 'reservado', p: { a: 145000, c: 'USD' } },
    // B3-A ausente a propósito: debe caer a fallback, no desaparecer.
  },
};

test('buildUnitRows: sólo unidades vendibles, nunca la fila agregada del bloque', () => {
  const rows = buildUnitRows(tour, availability);
  assert.equal(rows.length, 3);
  assert.ok(!rows.some((r) => r.code === 'B2'));
});

test('buildUnitRows: resuelve precio y estado desde availability', () => {
  const rows = buildUnitRows(tour, availability);
  const a = rows.find((r) => r.code === 'B2-A')!;
  assert.equal(a.status, 'disponible');
  assert.deepEqual(a.price, { a: 240000, c: 'USD' });
  assert.equal(a.fellBack, false);
});

test('buildUnitRows: unidad ausente de availability cae a fallback, no desaparece', () => {
  const rows = buildUnitRows(tour, availability);
  const c = rows.find((r) => r.code === 'B3-A')!;
  assert.equal(c.status, 'no_disponible');
  assert.equal(c.fellBack, true);
  assert.equal(c.price, null);
});

test('isFilterEmpty', () => {
  assert.equal(isFilterEmpty(EMPTY_FILTER), true);
  assert.equal(isFilterEmpty({ ...EMPTY_FILTER, onlyAvailable: true }), false);
});

test('matchesFilter: onlyAvailable', () => {
  const rows = buildUnitRows(tour, availability);
  const f: FilterState = { ...EMPTY_FILTER, onlyAvailable: true };
  const matched = filterUnits(rows, f).map((r) => r.code);
  assert.deepEqual(matched, ['B2-A']);
});

test('matchesFilter: tipologia exacta', () => {
  const rows = buildUnitRows(tour, availability);
  const f: FilterState = { ...EMPTY_FILTER, tipologia: '1 dorm' };
  const matched = filterUnits(rows, f).map((r) => r.code).sort();
  assert.deepEqual(matched, ['B2-B', 'B3-A']);
});

test('matchesFilter: maxAreaM2', () => {
  const rows = buildUnitRows(tour, availability);
  const f: FilterState = { ...EMPTY_FILTER, maxAreaM2: 100 };
  const matched = filterUnits(rows, f).map((r) => r.code).sort();
  assert.deepEqual(matched, ['B2-B', 'B3-A']);
});

test('matchesFilter: maxPrice descarta unidades sin precio publicado', () => {
  const rows = buildUnitRows(tour, availability);
  const f: FilterState = { ...EMPTY_FILTER, maxPrice: 300000 };
  const matched = filterUnits(rows, f).map((r) => r.code).sort();
  // B3-A no tiene precio (ausente de availability): un tope de precio no
  // puede confirmarlo, así que no matchea "hasta $300.000" sin evidencia.
  assert.deepEqual(matched, ['B2-A', 'B2-B']);
});

test('matchesFilter: combinación de filtros es AND', () => {
  const rows = buildUnitRows(tour, availability);
  const f: FilterState = { ...EMPTY_FILTER, onlyAvailable: true, tipologia: '1 dorm' };
  assert.deepEqual(filterUnits(rows, f), []);
});

test('tipologiasOf: únicas y ordenadas', () => {
  const rows = buildUnitRows(tour, availability);
  assert.deepEqual(tipologiasOf(rows), ['1 dorm', 'Dúplex']);
});

test('groupByBlock: agrupa y ordena disponibles primero dentro del grupo', () => {
  const rows = buildUnitRows(tour, availability);
  const groups = groupByBlock(rows);
  const b2 = groups.find((g) => g.groupCode === 'B2')!;
  assert.deepEqual(b2.units.map((u) => u.code), ['B2-A', 'B2-B']); // disponible antes que reservado
});
