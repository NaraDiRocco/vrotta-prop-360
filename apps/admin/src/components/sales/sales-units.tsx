'use client';

import { STATUS_TOKENS, UNIT_STATUSES, type UnitStatus } from '@r360/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef, useState } from 'react';
import { StatusDot } from '@/components/status.tsx';
import type { UnitRow } from '@/lib/data/types.ts';
import type { UnitsResponse } from '@/lib/units/api-types.ts';

const ROW_H = 68;

/**
 * Shell de ventas. NO es el panel con permisos apagados: es otra aplicación.
 * Una sola lista, botones de 44px, y una única acción posible por unidad —
 * cambiar el estado. Lo usa el comercial de la inmobiliaria desde el celular,
 * a veces con el cliente al lado.
 */
export function SalesUnits({ projectId, projectName }: { projectId: string; projectName: string }) {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<UnitStatus | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = useMemo(() => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status) params.set('s', status);
    params.set('ps', '500');
    return params.toString();
  }, [q, status]);

  const units = useQuery<UnitsResponse>({
    queryKey: ['sales-units', projectId, search],
    queryFn: async () => {
      const response = await fetch(`/api/p/${projectId}/units?${search}`);
      if (!response.ok) throw new Error('No pude cargar las unidades');
      return (await response.json()) as UnitsResponse;
    },
    placeholderData: (previous) => previous,
  });

  const rows = units.data?.rows ?? [];

  const change = useMutation({
    mutationFn: async ({ unit, next }: { unit: UnitRow; next: UnitStatus }) => {
      const response = await fetch(`/api/p/${projectId}/units/${unit.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'No se pudo guardar');
      }
      return (await response.json()) as UnitRow;
    },
    onSuccess: () => {
      setOpen(null);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['sales-units', projectId] });
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'No se pudo guardar'),
  });

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 8,
  });

  function apply(unit: UnitRow, next: UnitStatus) {
    // Confirmación sólo para "vendido": es el único cambio que el comercial no
    // puede deshacer sin llamar a la oficina.
    if (next === 'vendido' && !window.confirm(`Marcar ${unit.code} como VENDIDO. ¿Confirmás?`)) return;
    change.mutate({ unit, next });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <header style={{ padding: '10px 12px 8px', borderBottom: '1px solid var(--border)', flex: 'none' }}>
        <h1 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>{projectName}</h1>
        <input
          className="r-input"
          style={{ height: 40, fontSize: 15 }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por código"
          inputMode="search"
          aria-label="Buscar"
        />
        <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingTop: 8 }}>
          <button
            type="button"
            className="r-chip"
            data-on={status === null}
            style={{ height: 30, flex: 'none' }}
            onClick={() => setStatus(null)}
          >
            Todas
          </button>
          {UNIT_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className="r-chip"
              data-on={status === s}
              style={{ height: 30, flex: 'none' }}
              onClick={() => setStatus(status === s ? null : s)}
            >
              <StatusDot status={s} size={7} />
              {STATUS_TOKENS[s].label}
              <span className="tnum">{units.data?.countsAll[s] ?? 0}</span>
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div style={{ background: 'var(--danger)', color: '#fff', padding: '7px 12px', fontSize: 13 }}>{error}</div>
      )}

      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((item) => {
            const unit = rows[item.index];
            if (!unit) return null;
            return (
              <button
                key={unit.id}
                type="button"
                onClick={() => setOpen(open === unit.code ? null : unit.code)}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: ROW_H,
                  transform: `translateY(${item.start}px)`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  padding: '0 12px',
                  borderBottom: '1px solid var(--border)',
                  textAlign: 'left',
                }}
              >
                <StatusDot status={unit.status} size={12} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600 }}>{unit.code}</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
                    {STATUS_TOKENS[unit.status].label}
                    {unit.areaTotalM2 !== null && ` · ${unit.areaTotalM2} m²`}
                    {unit.price && unit.price.visibility === 'public' &&
                      ` · ${unit.price.currency} ${unit.price.amount.toLocaleString('es-UY')}`}
                  </div>
                </div>
                <span style={{ color: 'var(--fg-faint)', fontSize: 18 }}>{open === unit.code ? '▾' : '›'}</span>
              </button>
            );
          })}
        </div>

        {rows.length === 0 && !units.isLoading && (
          <p style={{ padding: 20, color: 'var(--fg-muted)' }}>No hay unidades que coincidan.</p>
        )}
      </div>

      {open && (
        <div
          style={{
            flex: 'none',
            borderTop: '1px solid var(--border)',
            padding: 12,
            background: 'var(--bg-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
            <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 16 }}>{open}</strong>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              onClick={() => setOpen(null)}
              style={{ minHeight: 44, minWidth: 44, fontSize: 16, color: 'var(--fg-muted)' }}
            >
              ✕
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
            {UNIT_STATUSES.map((s) => {
              const unit = rows.find((row) => row.code === open);
              return (
                <button
                  key={s}
                  type="button"
                  disabled={!unit || change.isPending || unit.status === s}
                  onClick={() => unit && apply(unit, s)}
                  style={{
                    minHeight: 44,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 7,
                    borderRadius: 8,
                    border: '1px solid var(--border-strong)',
                    background: unit?.status === s ? 'var(--bg-sel)' : 'var(--bg)',
                    fontSize: 14,
                    opacity: unit?.status === s ? 0.6 : 1,
                  }}
                >
                  <StatusDot status={s} size={10} />
                  {STATUS_TOKENS[s].label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
