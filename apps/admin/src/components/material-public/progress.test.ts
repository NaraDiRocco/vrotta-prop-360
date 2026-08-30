import { describe, expect, it } from 'vitest';
import { computeProgress, isResolved } from './progress.ts';
import type { MaterialItem, MaterialItemState } from './types.ts';

function item(id: string, requisito: MaterialItem['requisito']): MaterialItem {
  return {
    id,
    categoria: 'x',
    nombre: id,
    queEs: '',
    paraQue: '',
    formato: '',
    requisito,
    siNoLoTienen: '',
    aplicaA: ['loteo'],
    aceptaArchivos: true,
  };
}

function state(id: string, requisito: MaterialItem['requisito'], estado: MaterialItemState['estado']): MaterialItemState {
  return { item: item(id, requisito), estado, archivos: [], comentario: null, marcadoSinMaterial: false };
}

describe('isResolved', () => {
  it('recibido, aprobado y no_aplica cuentan como resueltos', () => {
    expect(isResolved(state('a', 'obligatorio', 'recibido'))).toBe(true);
    expect(isResolved(state('a', 'obligatorio', 'aprobado'))).toBe(true);
    expect(isResolved(state('a', 'obligatorio', 'no_aplica'))).toBe(true);
  });

  it('pendiente y solicitado no cuentan como resueltos', () => {
    expect(isResolved(state('a', 'obligatorio', 'pendiente'))).toBe(false);
    expect(isResolved(state('a', 'obligatorio', 'solicitado'))).toBe(false);
  });
});

describe('computeProgress', () => {
  it('cuenta obligatorios pendientes y arma listoParaArrancar', () => {
    const items = [
      state('masterplan', 'obligatorio', 'recibido'),
      state('logo', 'obligatorio', 'pendiente'),
      state('video', 'opcional', 'pendiente'),
    ];
    const progress = computeProgress(items);
    expect(progress.total).toBe(3);
    expect(progress.resueltos).toBe(1);
    expect(progress.obligatoriosTotal).toBe(2);
    expect(progress.obligatoriosResueltos).toBe(1);
    expect(progress.obligatoriosPendientes.map((s) => s.item.id)).toEqual(['logo']);
    expect(progress.listoParaArrancar).toBe(false);
  });

  it('listoParaArrancar es true cuando no quedan obligatorios pendientes, aunque haya opcionales sin resolver', () => {
    const items = [state('masterplan', 'obligatorio', 'aprobado'), state('video', 'opcional', 'pendiente')];
    expect(computeProgress(items).listoParaArrancar).toBe(true);
  });

  it('con lista vacía no rompe y da ratio 1', () => {
    const progress = computeProgress([]);
    expect(progress.total).toBe(0);
    expect(progress.ratio).toBe(1);
    expect(progress.listoParaArrancar).toBe(true);
  });
});
