'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef, useState } from 'react';
import { Inbox, Phone, MessageCircle } from 'lucide-react';
import { telHref, waHref } from '@/lib/leads/contact.ts';
import { EMPTY_LEAD_FILTERS, filterLeads, relativeTime, sortLeadsByDateDesc } from '@/lib/leads/filters.ts';
import type { Actor, LeadPatch, LeadRow, LeadStatus } from '@/lib/data/types.ts';
import { canManageLeads } from '@/lib/roles.ts';

const ROW_H = 74;

const LEAD_STATUSES: LeadStatus[] = ['nuevo', 'contactado', 'calificado', 'descartado', 'ganado'];

// Pill neutro a propósito (sección 1.D del plan): el color por estado es
// `LeadStatusPill`, que nace en `components/leads/` recién en la Ola 2. Acá
// se muestra sólo la etiqueta, sin tono, hasta que ese componente exista.
const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  calificado: 'Calificado',
  descartado: 'Descartado',
  ganado: 'Ganado',
};

/**
 * Bandeja de leads del shell de ventas. Reemplaza el stub ("Pendiente:
 * bandeja de leads del proyecto."). Reusa el filtrado puro de
 * `lib/leads/filters.ts` (mismo que el panel) pero NO la interfaz de
 * `components/leads/leads-screen.tsx`: acá no hay split view ni acciones
 * masivas — una lista y, por lead, llamar/WhatsApp y cambiar el estado con
 * el pulgar, que es lo que sirve parado en la obra.
 */
export function SalesLeads({
  projectId,
  initialLeads,
  actor,
}: {
  projectId: string;
  initialLeads: LeadRow[];
  actor: Actor;
}) {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<LeadStatus | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const puedeGestionar = canManageLeads(actor);

  const leads = useQuery<LeadRow[]>({
    queryKey: ['sales-leads', projectId],
    queryFn: async () => {
      const response = await fetch(`/api/p/${projectId}/leads`);
      if (!response.ok) throw new Error('No pude cargar las consultas');
      return (await response.json()) as LeadRow[];
    },
    initialData: initialLeads,
    // El SSR ya trajo la primera tanda: no hay flash de vacío mientras
    // refresca en segundo plano.
    placeholderData: (previous) => previous,
  });

  const patch = useMutation({
    mutationFn: async ({ lead, next }: { lead: LeadRow; next: LeadPatch }) => {
      const response = await fetch(`/api/p/${projectId}/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'No se pudo guardar');
      }
      return (await response.json()) as LeadRow;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['sales-leads', projectId] }),
  });

  const rows = useMemo(
    () => sortLeadsByDateDesc(filterLeads(leads.data ?? [], { ...EMPTY_LEAD_FILTERS, status })),
    [leads.data, status],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 8,
  });

  function markStatus(lead: LeadRow, next: LeadStatus): void {
    if (!puedeGestionar || next === lead.status) return;
    patch.mutate({ lead, next: { status: next } });
  }

  function toggleOpen(lead: LeadRow): void {
    setOpen((current) => (current === lead.id ? null : lead.id));
    // Igual que en el panel: abrir un lead no leído lo marca leído. Sólo si
    // el actor puede gestionar (Vrotta Operador ve pero no gestiona).
    if (!lead.read && puedeGestionar) patch.mutate({ lead, next: { read: true } });
  }

  const activeLead = rows.find((l) => l.id === open) ?? null;
  const isInitialLoading = leads.isLoading && rows.length === 0 && (leads.data ?? []).length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <header style={{ padding: '10px 12px 8px', borderBottom: '1px solid var(--border)', flex: 'none' }}>
        <h1 style={{ fontSize: '1.0625rem', fontWeight: 600, marginBottom: 8 }}>Consultas</h1>
        <div style={{ display: 'flex', gap: 5, overflowX: 'auto' }}>
          <button
            type="button"
            className="r-chip"
            data-on={status === null}
            style={{ height: 30, flex: 'none' }}
            onClick={() => setStatus(null)}
          >
            Todas
          </button>
          {LEAD_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className="r-chip"
              data-on={status === s}
              style={{ height: 30, flex: 'none' }}
              onClick={() => setStatus(status === s ? null : s)}
            >
              {LEAD_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </header>

      {patch.isError && (
        <div
          role="alert"
          style={{
            background: 'var(--ui-danger-bg)',
            color: 'var(--ui-danger)',
            border: '1px solid var(--ui-danger-border)',
            borderLeft: 'none',
            borderRight: 'none',
            padding: '7px 12px',
            fontSize: '0.8125rem',
          }}
        >
          {patch.error instanceof Error ? patch.error.message : 'No se pudo guardar'}
        </div>
      )}

      {isInitialLoading ? (
        <div style={{ flex: 1, overflow: 'hidden', padding: '0 12px' }} aria-busy="true" aria-label="Cargando consultas">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="r-skeleton" style={{ height: ROW_H - 14, margin: '7px 0' }} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="r-empty" style={{ padding: '48px 24px', flex: 1 }}>
          <Inbox size={28} strokeWidth={1.5} color="var(--fg-faint)" aria-hidden />
          <strong style={{ fontSize: '0.9375rem' }}>
            {status ? 'No hay consultas con ese estado' : 'Todavía no hay consultas para este proyecto'}
          </strong>
          <span style={{ fontSize: '0.8125rem' }}>
            {status
              ? 'Probá con otro estado o mirá todas.'
              : 'Las consultas de la web y WhatsApp van a aparecer acá apenas lleguen.'}
          </span>
          {status && (
            <button type="button" className="r-btn" style={{ marginTop: 4 }} onClick={() => setStatus(null)}>
              Ver todas
            </button>
          )}
        </div>
      ) : (
        <div ref={scrollRef} style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((item) => {
              const lead = rows[item.index];
              if (!lead) return null;
              const tel = lead.phone ? telHref(lead.phone) : null;
              const wa = lead.phone ? waHref(lead.phone) : null;
              return (
                <div
                  key={lead.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: ROW_H,
                    transform: `translateY(${item.start}px)`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '0 12px',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleOpen(lead)}
                    style={{ flex: 1, minWidth: 0, textAlign: 'left', minHeight: 44, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      {!lead.read && (
                        <span className="r-dot" style={{ background: 'var(--accent)', flex: 'none' }} aria-label="No leído" />
                      )}
                      <span
                        style={{
                          fontSize: '0.9375rem',
                          fontWeight: lead.read ? 500 : 700,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {lead.name}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--fg-muted)' }}>
                      <span className="r-pill" data-tone="neutral" style={{ border: '1px solid var(--border)', padding: '1px 7px' }}>
                        {LEAD_STATUS_LABEL[lead.status]}
                      </span>
                      {lead.unitCode && <span>{lead.unitCode}</span>}
                      <span suppressHydrationWarning style={{ color: 'var(--fg-faint)' }}>
                        {relativeTime(lead.createdAt)}
                      </span>
                    </div>
                  </button>

                  <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
                    {tel && (
                      <a
                        href={tel}
                        aria-label={`Llamar a ${lead.name}`}
                        className="r-btn"
                        style={{ minHeight: 44, minWidth: 44, justifyContent: 'center' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Phone size={18} strokeWidth={1.75} aria-hidden />
                      </a>
                    )}
                    {wa && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`WhatsApp a ${lead.name}`}
                        className="r-btn"
                        data-variant="primary"
                        style={{ minHeight: 44, minWidth: 44, justifyContent: 'center' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MessageCircle size={18} strokeWidth={1.75} aria-hidden />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeLead && (
        <div
          style={{
            flex: 'none',
            borderTop: '1px solid var(--border)',
            padding: 12,
            background: 'var(--bg-subtle)',
            maxHeight: '55%',
            overflow: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 9 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ fontSize: '0.9375rem' }}>{activeLead.name}</strong>
              {activeLead.message && (
                <p style={{ fontSize: '0.8125rem', color: 'var(--fg-muted)', marginTop: 4 }}>{activeLead.message}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setOpen(null)}
              aria-label="Cerrar"
              style={{ minHeight: 44, minWidth: 44, fontSize: '1rem', color: 'var(--fg-muted)' }}
            >
              ✕
            </button>
          </div>

          {puedeGestionar && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              {LEAD_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={patch.isPending || activeLead.status === s}
                  onClick={() => markStatus(activeLead, s)}
                  style={{
                    minHeight: 44,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 8,
                    border: '1px solid var(--border-strong)',
                    background: activeLead.status === s ? 'var(--bg-sel)' : 'var(--bg)',
                    fontSize: '0.875rem',
                    opacity: activeLead.status === s ? 0.6 : 1,
                  }}
                >
                  {LEAD_STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
