'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef, useState } from 'react';
import type { LeadPatch, LeadRow, LeadStatus } from '@/lib/data/types.ts';
import { EMPTY_LEAD_FILTERS, filterLeads, leadsToCsv, sortLeadsByDateDesc, unreadCount, type LeadFilters } from '@/lib/leads/filters.ts';
import { LeadDetail } from './lead-detail.tsx';
import { LeadsFilterBar } from './leads-filter-bar.tsx';
import { LeadListRow } from './lead-row.tsx';

const ROW_HEIGHT = 56;

function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Split view de leads. Reutilizable para la vista de proyecto (`showProject`
 * false, sin selector de proyecto) y la cross-project del tenant (`showProject`
 * true). El filtrado es en memoria (los datasets de leads son órdenes de
 * magnitud más chicos que los de unidades) — nada de refetch por tecla.
 */
export function LeadsScreen({
  initialLeads,
  projects,
  showProjectFilter,
  defaultProjectId,
}: {
  initialLeads: LeadRow[];
  projects?: { id: string; name: string }[];
  showProjectFilter: boolean;
  defaultProjectId?: string;
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [filters, setFilters] = useState<LeadFilters>({ ...EMPTY_LEAD_FILTERS, projectId: defaultProjectId ?? null });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => sortLeadsByDateDesc(filterLeads(leads, filters)), [leads, filters]);
  const selected = filtered.find((l) => l.id === selectedId) ?? filtered[0] ?? null;

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  async function patchLead(leadId: string, patch: LeadPatch): Promise<void> {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, ...patch } : l)));
    await fetch(`/api/p/${lead.projectId}/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).catch(() => undefined);
  }

  async function bulkPatch(patch: LeadPatch): Promise<void> {
    const ids = [...checked];
    if (ids.length === 0) return;
    setLeads((prev) => prev.map((l) => (ids.includes(l.id) ? { ...l, ...patch } : l)));
    const byProject = new Map<string, string[]>();
    for (const id of ids) {
      const lead = leads.find((l) => l.id === id);
      if (!lead) continue;
      byProject.set(lead.projectId, [...(byProject.get(lead.projectId) ?? []), id]);
    }
    await Promise.all(
      [...byProject.entries()].map(([projectId, leadIds]) =>
        fetch(`/api/p/${projectId}/leads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadIds, patch }),
        }).catch(() => undefined),
      ),
    );
    setChecked(new Set());
  }

  function toggleCheck(id: string, value: boolean): void {
    setChecked((prev) => {
      const next = new Set(prev);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function onSelect(lead: LeadRow): void {
    setSelectedId(lead.id);
    if (!lead.read) void patchLead(lead.id, { read: true });
  }

  const unread = unreadCount(filtered);

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <div style={{ width: 360, flex: 'none', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', minHeight: 0 }}>
        <LeadsFilterBar filters={filters} onChange={setFilters} projects={showProjectFilter ? projects : undefined} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderBottom: '1px solid var(--border)', fontSize: 11 }}>
          <span style={{ color: 'var(--fg-muted)' }}>
            {filtered.length} lead{filtered.length === 1 ? '' : 's'} {unread > 0 ? `· ${unread} sin leer` : ''}
          </span>
          <div style={{ flex: 1 }} />
          {checked.size > 0 && (
            <>
              <span>{checked.size} sel.</span>
              <button type="button" className="r-btn" data-variant="ghost" style={{ height: 20, padding: '0 6px' }} onClick={() => bulkPatch({ read: true })}>
                Marcar leído
              </button>
              <select
                className="r-input"
                style={{ height: 20, width: 100, fontSize: 10 }}
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) void bulkPatch({ status: e.target.value as LeadStatus });
                  e.currentTarget.value = '';
                }}
              >
                <option value="" disabled>
                  Estado…
                </option>
                {(['nuevo', 'contactado', 'calificado', 'descartado', 'ganado'] as LeadStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </>
          )}
          <button
            type="button"
            className="r-btn"
            data-variant="ghost"
            style={{ height: 20, padding: '0 6px' }}
            onClick={() => {
              const rows = checked.size > 0 ? filtered.filter((l) => checked.has(l.id)) : filtered;
              downloadCsv(leadsToCsv(rows), `leads-${new Date().toISOString().slice(0, 10)}.csv`);
            }}
          >
            Exportar CSV
          </button>
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflow: 'auto' }}>
          {filtered.length === 0 ? (
            <p style={{ padding: 12, fontSize: 12, color: 'var(--fg-muted)' }}>No hay leads con estos filtros.</p>
          ) : (
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map((item) => {
                const lead = filtered[item.index];
                if (!lead) return null;
                return (
                  <div key={lead.id} style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${item.start}px)` }}>
                    <LeadListRow
                      lead={lead}
                      selected={selected?.id === lead.id}
                      checked={checked.has(lead.id)}
                      onClick={() => onSelect(lead)}
                      onCheck={(v) => toggleCheck(lead.id, v)}
                      showProject={showProjectFilter}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', overflow: 'hidden' }}>
        {selected ? (
          <LeadDetail lead={selected} onPatch={(id, patch) => void patchLead(id, patch)} />
        ) : (
          <div style={{ margin: 'auto', color: 'var(--fg-muted)', fontSize: 12 }}>Elegí un lead de la lista.</div>
        )}
      </div>
    </div>
  );
}
