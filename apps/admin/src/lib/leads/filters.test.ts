import { describe, expect, it } from 'vitest';
import type { LeadRow } from '../data/types.ts';
import { EMPTY_LEAD_FILTERS, filterLeads, leadsToCsv, relativeTime, sortLeadsByDateDesc, unreadCount } from './filters.ts';

function lead(overrides: Partial<LeadRow> & { id: string }): LeadRow {
  return {
    projectId: 'p1',
    projectSlug: 'baleia',
    projectName: 'Baleia',
    unitId: null,
    unitCode: null,
    unitStatus: null,
    channel: 'form',
    name: 'Ana',
    email: 'ana@example.com',
    phone: null,
    message: null,
    status: 'nuevo',
    read: false,
    notes: null,
    source: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('filterLeads', () => {
  const leads = [
    lead({ id: '1', projectId: 'p1', status: 'nuevo', unitCode: 'B2-A', name: 'Ana Gómez' }),
    lead({ id: '2', projectId: 'p2', status: 'contactado', unitCode: 'M1-L01', name: 'Beto Ruiz', createdAt: '2026-08-05T00:00:00.000Z' }),
    lead({ id: '3', projectId: 'p1', status: 'ganado', unitCode: null, name: 'Caro Díaz' }),
  ];

  it('sin filtros devuelve todo', () => {
    expect(filterLeads(leads, EMPTY_LEAD_FILTERS)).toHaveLength(3);
  });

  it('filtra por proyecto', () => {
    const result = filterLeads(leads, { ...EMPTY_LEAD_FILTERS, projectId: 'p1' });
    expect(result.map((l) => l.id)).toEqual(['1', '3']);
  });

  it('filtra por estado', () => {
    const result = filterLeads(leads, { ...EMPTY_LEAD_FILTERS, status: 'contactado' });
    expect(result.map((l) => l.id)).toEqual(['2']);
  });

  it('filtra por unidad', () => {
    const result = filterLeads(leads, { ...EMPTY_LEAD_FILTERS, unitCode: 'B2-A' });
    expect(result.map((l) => l.id)).toEqual(['1']);
  });

  it('filtra por rango de fechas', () => {
    const result = filterLeads(leads, { ...EMPTY_LEAD_FILTERS, from: '2026-08-03T00:00:00.000Z' });
    expect(result.map((l) => l.id)).toEqual(['2']);
  });

  it('busca por texto en nombre, email, teléfono, unidad y mensaje', () => {
    const result = filterLeads(leads, { ...EMPTY_LEAD_FILTERS, text: 'gómez' });
    expect(result.map((l) => l.id)).toEqual(['1']);
  });

  it('combina múltiples filtros', () => {
    const result = filterLeads(leads, { ...EMPTY_LEAD_FILTERS, projectId: 'p1', text: 'caro' });
    expect(result.map((l) => l.id)).toEqual(['3']);
  });
});

describe('sortLeadsByDateDesc', () => {
  it('ordena del más reciente al más viejo', () => {
    const leads = [
      lead({ id: 'old', createdAt: '2026-01-01T00:00:00.000Z' }),
      lead({ id: 'new', createdAt: '2026-08-01T00:00:00.000Z' }),
    ];
    expect(sortLeadsByDateDesc(leads).map((l) => l.id)).toEqual(['new', 'old']);
  });
});

describe('unreadCount', () => {
  it('cuenta sólo los no leídos', () => {
    const leads = [lead({ id: '1', read: false }), lead({ id: '2', read: true }), lead({ id: '3', read: false })];
    expect(unreadCount(leads)).toBe(2);
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-08-29T12:00:00.000Z');

  it('minutos', () => {
    expect(relativeTime('2026-08-29T11:55:00.000Z', now)).toBe('hace 5 min');
  });

  it('horas', () => {
    expect(relativeTime('2026-08-29T09:00:00.000Z', now)).toBe('hace 3 h');
  });

  it('días', () => {
    expect(relativeTime('2026-08-26T12:00:00.000Z', now)).toBe('hace 3 d');
  });
});

describe('leadsToCsv', () => {
  it('genera un header y una fila por lead, escapando comillas', () => {
    const csv = leadsToCsv([lead({ id: '1', name: 'Ana "La Jefa" Gómez' })]);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('nombre');
    expect(lines[1]).toContain('""La Jefa""');
  });
});
