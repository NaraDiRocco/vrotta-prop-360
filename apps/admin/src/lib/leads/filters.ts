/**
 * Filtrado y búsqueda de leads — puro, para poder testearlo sin montar la
 * pantalla. Igual que en units/query.ts, el filtro efectivo es lo que se ve.
 */
import type { LeadRow, LeadStatus } from '../data/types.ts';

export interface LeadFilters {
  projectId: string | null;
  status: LeadStatus | null;
  unitCode: string | null;
  /** Fecha ISO (inclusive). */
  from: string | null;
  to: string | null;
  text: string;
}

export const EMPTY_LEAD_FILTERS: LeadFilters = {
  projectId: null,
  status: null,
  unitCode: null,
  from: null,
  to: null,
  text: '',
};

function matchesText(lead: LeadRow, text: string): boolean {
  if (!text.trim()) return true;
  const needle = text.trim().toLowerCase();
  return (
    lead.name.toLowerCase().includes(needle) ||
    (lead.email?.toLowerCase().includes(needle) ?? false) ||
    (lead.phone?.toLowerCase().includes(needle) ?? false) ||
    (lead.unitCode?.toLowerCase().includes(needle) ?? false) ||
    (lead.message?.toLowerCase().includes(needle) ?? false)
  );
}

export function filterLeads(leads: readonly LeadRow[], filters: LeadFilters): LeadRow[] {
  return leads.filter((lead) => {
    if (filters.projectId && lead.projectId !== filters.projectId) return false;
    if (filters.status && lead.status !== filters.status) return false;
    if (filters.unitCode && lead.unitCode !== filters.unitCode) return false;
    if (filters.from && lead.createdAt < filters.from) return false;
    if (filters.to && lead.createdAt > filters.to) return false;
    if (!matchesText(lead, filters.text)) return false;
    return true;
  });
}

export function sortLeadsByDateDesc(leads: readonly LeadRow[]): LeadRow[] {
  return [...leads].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export function unreadCount(leads: readonly LeadRow[]): number {
  return leads.filter((l) => !l.read).length;
}

/** Tiempo relativo en español, para la lista ("hace 5 min", "hace 2 h", "hace 3 d"). */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diffMs = now.getTime() - then;
  if (Number.isNaN(diffMs)) return '';
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 30) return `hace ${diffD} d`;
  const diffMonth = Math.round(diffD / 30);
  return `hace ${diffMonth} mes${diffMonth === 1 ? '' : 'es'}`;
}

/** CSV de exportación de la selección (o de todo lo filtrado si no hay selección). */
export function leadsToCsv(leads: readonly LeadRow[]): string {
  const header = [
    'nombre', 'email', 'telefono', 'proyecto', 'unidad', 'canal', 'estado', 'creado', 'mensaje',
  ];
  const escape = (v: string): string => `"${v.replace(/"/g, '""')}"`;
  const rows = leads.map((l) =>
    [l.name, l.email ?? '', l.phone ?? '', l.projectName, l.unitCode ?? '', l.channel, l.status, l.createdAt, l.message ?? '']
      .map((v) => escape(String(v)))
      .join(','),
  );
  return [header.map(escape).join(','), ...rows].join('\n');
}
