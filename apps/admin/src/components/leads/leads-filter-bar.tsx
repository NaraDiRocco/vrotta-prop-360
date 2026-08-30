'use client';

import type { LeadStatus } from '@/lib/data/types.ts';
import type { LeadFilters } from '@/lib/leads/filters.ts';

const STATUS_OPTIONS: LeadStatus[] = ['nuevo', 'contactado', 'calificado', 'descartado', 'ganado'];

export function LeadsFilterBar({
  filters,
  onChange,
  projects,
}: {
  filters: LeadFilters;
  onChange: (next: LeadFilters) => void;
  projects?: { id: string; name: string }[];
}) {
  return (
    <div style={{ display: 'flex', gap: 6, padding: 8, borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center' }}>
      <input
        className="r-input"
        style={{ flex: 1, minWidth: 140 }}
        placeholder="Buscar nombre, email, teléfono, unidad…"
        value={filters.text}
        onChange={(e) => onChange({ ...filters, text: e.target.value })}
      />
      {projects && (
        <select
          className="r-input"
          style={{ width: 130 }}
          value={filters.projectId ?? ''}
          onChange={(e) => onChange({ ...filters, projectId: e.target.value || null })}
        >
          <option value="">Todos los proyectos</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      <select
        className="r-input"
        style={{ width: 130 }}
        value={filters.status ?? ''}
        onChange={(e) => onChange({ ...filters, status: (e.target.value || null) as LeadStatus | null })}
      >
        <option value="">Todos los estados</option>
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <input
        type="date"
        className="r-input"
        style={{ width: 130 }}
        value={filters.from ? filters.from.slice(0, 10) : ''}
        onChange={(e) => onChange({ ...filters, from: e.target.value ? `${e.target.value}T00:00:00.000Z` : null })}
      />
      <input
        type="date"
        className="r-input"
        style={{ width: 130 }}
        value={filters.to ? filters.to.slice(0, 10) : ''}
        onChange={(e) => onChange({ ...filters, to: e.target.value ? `${e.target.value}T23:59:59.999Z` : null })}
      />
    </div>
  );
}
