import { describe, expect, it } from 'vitest';
import type { MaterialStateRow } from '../material/types.ts';
import { latestPublishedAt, pendingMaterialCount } from './summary.ts';

function state(itemId: string, status: MaterialStateRow['status']): MaterialStateRow {
  return { itemId, status, notes: null, updatedAt: '2026-01-01T00:00:00.000Z', updatedByEmail: null };
}

describe('pendingMaterialCount', () => {
  it('cuenta todo el catálogo como pendiente si no hay ninguna fila', () => {
    const total = pendingMaterialCount('loteo', []);
    expect(total).toBeGreaterThan(0);
  });

  it('no cuenta un ítem aprobado', () => {
    const withoutRows = pendingMaterialCount('loteo', []);
    const withOneApproved = pendingMaterialCount('loteo', [state('plano-masterplan', 'aprobado')]);
    expect(withOneApproved).toBe(withoutRows - 1);
  });

  it('no cuenta un ítem marcado no_aplica', () => {
    const withoutRows = pendingMaterialCount('loteo', []);
    const withOneNa = pendingMaterialCount('loteo', [state('plano-masterplan', 'no_aplica')]);
    expect(withOneNa).toBe(withoutRows - 1);
  });

  it('sigue contando un ítem "recibido" (todavía no revisado) como pendiente', () => {
    const withoutRows = pendingMaterialCount('loteo', []);
    const withReceived = pendingMaterialCount('loteo', [state('plano-masterplan', 'recibido')]);
    expect(withReceived).toBe(withoutRows);
  });

  it('sólo mira ítems que aplican a ese tipo de proyecto', () => {
    // 'poligono-geojson' no aplica a 'edificio': marcarlo aprobado ahí no debería mover el contador.
    const before = pendingMaterialCount('edificio', []);
    const after = pendingMaterialCount('edificio', [state('poligono-geojson', 'aprobado')]);
    expect(after).toBe(before);
  });
});

describe('latestPublishedAt', () => {
  it('devuelve null si nadie publicó nunca', () => {
    expect(latestPublishedAt([null, null])).toBeNull();
  });

  it('devuelve la fecha más reciente, ignorando los null', () => {
    expect(latestPublishedAt(['2026-01-01T00:00:00.000Z', null, '2026-03-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z'])).toBe(
      '2026-03-01T00:00:00.000Z',
    );
  });

  it('lista vacía es null', () => {
    expect(latestPublishedAt([])).toBeNull();
  });
});
