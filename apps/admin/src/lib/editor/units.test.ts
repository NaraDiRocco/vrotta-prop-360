import { describe, expect, test } from 'vitest';
import type { GroupRow, UnitRow } from '../data/types.ts';
import { buildUnitsModel, geomStateOf, neighbour, nextWithoutPolygon, nextWithoutPolygonInGroup } from './units.ts';

const GROUPS: GroupRow[] = [
  { id: 'g1', parentId: null, kind: 'manzana', code: 'M1', name: 'Manzana 1', sort: 1 },
  { id: 'g2', parentId: null, kind: 'manzana', code: 'M2', name: 'Manzana 2', sort: 2 },
];

function unit(code: string, groupId: string, sort: number): UnitRow {
  return {
    id: `u-${code}`,
    code,
    status: 'disponible',
    groupId,
    groupCode: groupId === 'g1' ? 'M1' : 'M2',
    unitTypeId: null,
    typeCode: null,
    typeName: null,
    areaTotalM2: null,
    attrs: {},
    price: null,
    hasPolygon: false,
    updatedAt: '2026-08-01T00:00:00.000Z',
    sort,
  };
}

const UNITS: UnitRow[] = [
  unit('M1-L01', 'g1', 1),
  unit('M1-L02', 'g1', 2),
  unit('M1-L03', 'g1', 3),
  unit('M2-L01', 'g2', 4),
  unit('M2-L02', 'g2', 5),
];

describe('indicador de geometría', () => {
  test('○ sin polígono · ◐ en otra escena · ● en esta', () => {
    const here = new Set(['M1-L01']);
    const anywhere = new Set(['M1-L01', 'M1-L02']);
    expect(geomStateOf('M1-L01', here, anywhere)).toBe('here');
    expect(geomStateOf('M1-L02', here, anywhere)).toBe('other');
    expect(geomStateOf('M1-L03', here, anywhere)).toBe('none');
  });
});

describe('árbol y progreso', () => {
  test('agrupa por manzana y cuenta el progreso por grupo', () => {
    const here = new Set(['M1-L01', 'M1-L02']);
    const model = buildUnitsModel(UNITS, GROUPS, here, here, { onlyWithout: false });
    expect(model.groups.map((g) => g.code)).toEqual(['M1', 'M2']);
    expect(model.groups[0]!.withPolygon).toBe(2);
    expect(model.groups[0]!.total).toBe(3);
    expect(model.withPolygon).toBe(2);
    expect(model.total).toBe(5);
  });

  test('el filtro «solo sin polígono» achica la lista pero NO el denominador', () => {
    const here = new Set(['M1-L01', 'M1-L02']);
    const model = buildUnitsModel(UNITS, GROUPS, here, here, { onlyWithout: true });
    expect(model.ordered).toEqual(['M1-L03', 'M2-L01', 'M2-L02']);
    // El progreso sigue midiendo contra el total real: si el denominador se
    // moviera con el filtro no habría forma de saber cuánto falta de verdad.
    expect(model.total).toBe(5);
    expect(model.withPolygon).toBe(2);
    expect(model.groups[0]!.total).toBe(3);
  });

  test('la búsqueda filtra por código', () => {
    const model = buildUnitsModel(UNITS, GROUPS, new Set(), new Set(), { onlyWithout: false, search: 'M2' });
    expect(model.ordered).toEqual(['M2-L01', 'M2-L02']);
  });
});

describe('navegación con n / p', () => {
  const ordered = UNITS.map((u) => u.code);

  test('`n` salta a la siguiente SIN polígono, ignorando las completas', () => {
    const here = new Set(['M1-L02', 'M1-L03']);
    expect(nextWithoutPolygon(ordered, here, 'M1-L01')).toBe('M2-L01');
  });

  test('`p` va para atrás con la misma regla', () => {
    const here = new Set(['M1-L02', 'M1-L03']);
    expect(nextWithoutPolygon(ordered, here, 'M2-L01', -1)).toBe('M1-L01');
  });

  test('da la vuelta al llegar al final', () => {
    expect(nextWithoutPolygon(ordered, new Set(), 'M2-L02')).toBe('M1-L01');
  });

  test('sin selección previa arranca por la primera', () => {
    expect(nextWithoutPolygon(ordered, new Set(), null)).toBe('M1-L01');
  });

  test('con la escena terminada devuelve null (es la señal de «no falta nada»)', () => {
    expect(nextWithoutPolygon(ordered, new Set(ordered), 'M1-L01')).toBeNull();
  });

  test('`j`/`k` navegan la lista sin filtrar por geometría', () => {
    const here = new Set(ordered);
    expect(neighbour(ordered, 'M1-L01', 1)).toBe('M1-L02');
    expect(neighbour(ordered, 'M1-L01', -1)).toBe('M2-L02');
    expect(here.size).toBe(5); // aunque estén todas completas, j/k igual se mueve
  });
});

describe('siguiente unidad para ⌘D', () => {
  test('se queda dentro de la misma manzana', () => {
    const here = new Set(['M1-L01']);
    expect(nextWithoutPolygonInGroup(UNITS, here, 'M1-L01')).toBe('M1-L02');
  });

  test('salta la que ya tiene polígono dentro del grupo', () => {
    const here = new Set(['M1-L01', 'M1-L02']);
    expect(nextWithoutPolygonInGroup(UNITS, here, 'M1-L01')).toBe('M1-L03');
  });

  test('con la manzana completa sigue por el proyecto en vez de dejarlo sin unidad', () => {
    const here = new Set(['M1-L01', 'M1-L02', 'M1-L03']);
    expect(nextWithoutPolygonInGroup(UNITS, here, 'M1-L01')).toBe('M2-L01');
  });

  test('con todo completo devuelve null', () => {
    const here = new Set(UNITS.map((u) => u.code));
    expect(nextWithoutPolygonInGroup(UNITS, here, 'M1-L01')).toBeNull();
  });
});
