import { describe, expect, it } from 'vitest';
import { validateBulkStatusBody } from './bulk-status-validation.ts';

const validFilter = {
  projectId: 'p1',
  groupIds: [],
  unitTypeIds: [],
  query: { status: [], text: [], groupCodes: [], typeCodes: [], missing: [], has: [], m2: {}, price: {} },
};

describe('validateBulkStatusBody', () => {
  it('rechaza un body vacío con el campo status', () => {
    const result = validateBulkStatusBody({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('status');
  });

  it('rechaza null', () => {
    const result = validateBulkStatusBody(null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('body');
  });

  it('rechaza un status inválido', () => {
    const result = validateBulkStatusBody({ status: 'no-existe' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('status');
  });

  it('rechaza cuando falta selection', () => {
    const result = validateBulkStatusBody({ status: 'vendido' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('selection');
  });

  it('rechaza selection.mode inválido', () => {
    const result = validateBulkStatusBody({ status: 'vendido', selection: { mode: 'todas' } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('selection.mode');
  });

  it('rechaza mode codes sin lista de códigos', () => {
    const result = validateBulkStatusBody({ status: 'vendido', selection: { mode: 'codes' } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('selection.codes');
  });

  it('acepta mode codes válido, con note null por defecto', () => {
    const result = validateBulkStatusBody({
      status: 'vendido',
      selection: { mode: 'codes', codes: ['B2-A'] },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body.note).toBeNull();
  });

  it('rechaza mode filter sin params (necesarios para materializar)', () => {
    const result = validateBulkStatusBody({
      status: 'vendido',
      selection: { mode: 'filter', filter: validFilter, excluded: [] },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('params');
  });

  it('acepta mode filter completo', () => {
    const result = validateBulkStatusBody({
      status: 'vendido',
      selection: { mode: 'filter', filter: validFilter, excluded: [] },
      params: {},
      note: 'venta directa',
    });
    expect(result.ok).toBe(true);
  });

  it('rechaza una nota que no es string ni null', () => {
    const result = validateBulkStatusBody({
      status: 'vendido',
      selection: { mode: 'codes', codes: [] },
      note: 42,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('note');
  });
});
