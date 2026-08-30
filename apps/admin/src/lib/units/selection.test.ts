import { describe, expect, it } from 'vitest';
import { parseUnitQuery } from './search.ts';
import {
  chunk,
  isSelected,
  planBulkStatusChange,
  selectAllMatching,
  selectionCount,
  selectionIsEmpty,
  toggle,
  unexpressibleReasons,
  type Selection,
  type UnitFilter,
} from './selection.ts';

const PROJECT = 'a0000000-0000-0000-0000-000000000002';
const GROUP_B2 = 'a0000000-0000-0000-0001-000000000002';
const GROUP_B3 = 'a0000000-0000-0000-0001-000000000003';
const TYPE_DUPLEX = 'a0000000-0000-0000-0002-000000000001';

function filter(partial: Partial<UnitFilter> = {}): UnitFilter {
  return {
    projectId: PROJECT,
    groupIds: [],
    unitTypeIds: [],
    query: parseUnitQuery(''),
    ...partial,
  };
}

describe('selección por códigos', () => {
  it('arranca vacía', () => {
    expect(selectionIsEmpty({ mode: 'codes', codes: [] })).toBe(true);
  });

  it('toggle agrega y saca', () => {
    let sel: Selection = { mode: 'codes', codes: [] };
    sel = toggle(sel, 'B2-A');
    expect(isSelected(sel, 'B2-A')).toBe(true);
    sel = toggle(sel, 'B2-A');
    expect(isSelected(sel, 'B2-A')).toBe(false);
  });

  it('cuenta lo marcado, ignorando el total del filtro', () => {
    expect(selectionCount({ mode: 'codes', codes: ['a', 'b'] }, 800)).toBe(2);
  });
});

describe('selección por predicado', () => {
  it('todo lo que matchea está seleccionado sin listar ids', () => {
    const sel = selectAllMatching(filter());
    expect(sel.mode).toBe('filter');
    expect(isSelected(sel, 'CUALQUIERA')).toBe(true);
  });

  it('toggle sobre un predicado excluye en vez de listar', () => {
    let sel = selectAllMatching(filter());
    sel = toggle(sel, 'B2-C');
    expect(sel.mode).toBe('filter');
    if (sel.mode !== 'filter') throw new Error('modo inesperado');
    expect(sel.excluded).toEqual(['B2-C']);
    expect(isSelected(sel, 'B2-C')).toBe(false);
    expect(isSelected(sel, 'B2-D')).toBe(true);
  });

  it('el conteo es total - excluidos', () => {
    const sel = toggle(selectAllMatching(filter()), 'B2-C');
    expect(selectionCount(sel, 800)).toBe(799);
  });

  it('re-toggle des-excluye', () => {
    let sel = toggle(selectAllMatching(filter()), 'B2-C');
    sel = toggle(sel, 'B2-C');
    expect(selectionCount(sel, 800)).toBe(800);
  });
});

describe('unexpressibleReasons', () => {
  it('un filtro de estado es expresable', () => {
    expect(unexpressibleReasons(filter({ query: parseUnitQuery('estado:reservado') }))).toEqual([]);
  });
  it('un rango de m² no lo es', () => {
    expect(unexpressibleReasons(filter({ query: parseUnitQuery('m2>300') }))).toContain('rango de m²');
  });
  it('sin:poligono no lo es', () => {
    expect(unexpressibleReasons(filter({ query: parseUnitQuery('sin:poligono') })).length).toBe(1);
  });
  it('más de un tipo no lo es', () => {
    expect(unexpressibleReasons(filter({ unitTypeIds: ['a', 'b'] }))).toContain('más de un tipo de unidad');
  });
});

describe('planBulkStatusChange', () => {
  it('modo códigos manda code_in en tandas', () => {
    const plan = planBulkStatusChange({ mode: 'codes', codes: ['B2-A', 'B2-B'] }, PROJECT);
    expect(plan.kind).toBe('predicate');
    if (plan.kind !== 'predicate') throw new Error('plan inesperado');
    expect(plan.calls).toEqual([{ project_id: PROJECT, code_in: ['B2-A', 'B2-B'] }]);
  });

  it('800 unidades marcadas a mano se parten en tandas', () => {
    const codes = Array.from({ length: 1200 }, (_, i) => `L-${i}`);
    const plan = planBulkStatusChange({ mode: 'codes', codes }, PROJECT);
    if (plan.kind !== 'predicate') throw new Error('plan inesperado');
    expect(plan.calls).toHaveLength(3);
    expect(plan.calls[0]?.code_in).toHaveLength(500);
  });

  it('predicado puro: una sola llamada, sin ids', () => {
    const sel = selectAllMatching(filter({ query: parseUnitQuery('estado:disponible') }));
    const plan = planBulkStatusChange(sel, PROJECT);
    if (plan.kind !== 'predicate') throw new Error('plan inesperado');
    expect(plan.calls).toEqual([{ project_id: PROJECT, status_in: ['disponible'] }]);
    expect(JSON.stringify(plan).length).toBeLessThan(200);
  });

  it('un subárbol de grupos se abre en una llamada por grupo', () => {
    const sel = selectAllMatching(filter({ groupIds: [GROUP_B2, GROUP_B3] }));
    const plan = planBulkStatusChange(sel, PROJECT);
    if (plan.kind !== 'predicate') throw new Error('plan inesperado');
    expect(plan.calls).toHaveLength(2);
    expect(plan.calls[0]).toMatchObject({ group_id: GROUP_B2 });
    expect(plan.calls[1]).toMatchObject({ group_id: GROUP_B3 });
  });

  it('un único tipo viaja como unit_type_id', () => {
    const sel = selectAllMatching(filter({ unitTypeIds: [TYPE_DUPLEX] }));
    const plan = planBulkStatusChange(sel, PROJECT);
    if (plan.kind !== 'predicate') throw new Error('plan inesperado');
    expect(plan.calls[0]).toMatchObject({ unit_type_id: TYPE_DUPLEX });
  });

  it('un término alfanumérico se traduce a code_prefix', () => {
    const sel = selectAllMatching(filter({ query: parseUnitQuery('b2') }));
    const plan = planBulkStatusChange(sel, PROJECT);
    if (plan.kind !== 'predicate') throw new Error('plan inesperado');
    expect(plan.calls[0]?.code_prefix).toBe('B2');
  });

  it('un filtro de m² obliga a materializar', () => {
    const sel = selectAllMatching(filter({ query: parseUnitQuery('m2>300') }));
    const plan = planBulkStatusChange(sel, PROJECT);
    expect(plan.kind).toBe('materialize');
    if (plan.kind !== 'materialize') throw new Error('plan inesperado');
    expect(plan.reason).toContain('m²');
  });

  it('excluir a mano obliga a materializar', () => {
    const sel = toggle(selectAllMatching(filter({ query: parseUnitQuery('estado:disponible') })), 'B2-A');
    const plan = planBulkStatusChange(sel, PROJECT);
    expect(plan.kind).toBe('materialize');
    if (plan.kind !== 'materialize') throw new Error('plan inesperado');
    expect(plan.reason).toContain('exclusiones manuales');
    expect(plan.base.status_in).toEqual(['disponible']);
  });
});

describe('chunk', () => {
  it('parte en tandas del tamaño pedido', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it('lista vacía', () => {
    expect(chunk([], 2)).toEqual([]);
  });
});
