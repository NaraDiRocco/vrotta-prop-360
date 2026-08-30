'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import type { PublishState } from '@/lib/data/types.ts';
import { DiffList } from './diff-list.tsx';
import { PreviewTokensPanel } from './preview-tokens-panel.tsx';
import { PublishHistory } from './publish-history.tsx';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-UY', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const STAGES = ['Armando el manifest', 'Escribiendo tour.json', 'Registrando la publicación', 'Moviendo el puntero'];

export function PublishScreen({ tenant, projectSlug, projectId }: { tenant: string; projectSlug: string; projectId: string }) {
  const queryClient = useQueryClient();
  const stateKey = ['publish-state', projectId] as const;
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [stage, setStage] = useState<number | null>(null);
  const [diffVersion, setDiffVersion] = useState<number | null>(null);

  const { data: state, isLoading } = useQuery<PublishState>({
    queryKey: stateKey,
    queryFn: async () => {
      const res = await fetch(`/api/p/${projectId}/publish`);
      if (!res.ok) throw new Error('No pude cargar el estado de publicación');
      return (await res.json()) as PublishState;
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      for (let i = 0; i < STAGES.length; i += 1) {
        setStage(i);
        await new Promise((resolve) => setTimeout(resolve, 260));
      }
      const res = await fetch(`/api/p/${projectId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note.trim() || null }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'No se pudo publicar');
      }
      return res.json();
    },
    onSuccess: () => {
      setStage(null);
      setConfirming(false);
      setNote('');
      void queryClient.invalidateQueries({ queryKey: stateKey });
      void queryClient.invalidateQueries({ queryKey: ['publish-history', projectId] });
    },
    onError: () => setStage(null),
  });

  if (isLoading || !state) {
    return <div style={{ padding: 12, color: 'var(--fg-muted)', fontSize: 12 }}>Cargando…</div>;
  }

  const changeCount = state.draftChanges.length;
  const previewBaseUrl = `https://${tenant}.recorrido360.app/${projectSlug}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16, overflow: 'auto', flex: 1 }}>
      {/* Estado arriba */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '10px 14px',
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'var(--bg-subtle)',
        }}
      >
        <div>
          <div style={{ fontSize: 10, color: 'var(--fg-muted)' }}>Versión en vivo</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{state.liveVersion !== null ? `v${state.liveVersion}` : 'Sin publicar'}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--fg-muted)' }}>Publicada</div>
          <div style={{ fontSize: 12 }}>{fmtDate(state.livePublishedAt)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--fg-muted)' }}>Cambios pendientes</div>
          <div style={{ fontSize: 12, fontWeight: changeCount > 0 ? 700 : 400, color: changeCount > 0 ? 'var(--warn)' : 'var(--fg-muted)' }}>
            {changeCount} respecto del borrador
          </div>
        </div>
      </div>

      {/* Los dos textos explícitos que pide el negocio. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, color: 'var(--fg-muted)' }}>
        <p>
          <strong style={{ color: 'var(--fg)' }}>Los cambios de estado de unidad NO requieren republicar.</strong> El visor los lee
          en vivo desde <code>availability.json</code>; marcar una unidad como vendida o reservada se ve en el recorrido al instante,
          sin pasar por acá.
        </p>
        <p>
          <strong style={{ color: 'var(--fg)' }}>Revertir a una versión anterior NO revierte los estados.</strong> El puntero de
          versión vuelve atrás (geometría, escenas, hotspots), pero el inventario comercial sigue siendo el actual — por el mismo
          motivo de arriba.
        </p>
      </div>

      {/* Advertencias */}
      {state.warnings.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {state.warnings.map((w) => (
            <Link
              key={w.id}
              href={w.href}
              style={{
                fontSize: 11,
                padding: '6px 10px',
                borderRadius: 5,
                background: 'color-mix(in srgb, var(--warn) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--warn) 35%, transparent)',
                color: 'var(--fg)',
              }}
            >
              ⚠ {w.message}
            </Link>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>
        <div>
          <h2 style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Cambios desde la última publicación</h2>
          <DiffList entries={state.draftChanges} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
            <h2 style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Publicar</h2>
            {stage !== null ? (
              <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
                <div style={{ marginBottom: 6 }}>{STAGES[stage]}…</div>
                <div style={{ display: 'flex', gap: 3 }}>
                  {STAGES.map((s, i) => (
                    <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= stage ? 'var(--accent)' : 'var(--bg-sunken)' }} />
                  ))}
                </div>
              </div>
            ) : confirming ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea
                  className="r-input"
                  style={{ height: 60, resize: 'vertical', paddingTop: 6 }}
                  placeholder="Nota de la versión (opcional)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                {publishMutation.isError && (
                  <div style={{ fontSize: 11, color: 'var(--danger)' }}>{(publishMutation.error as Error).message}</div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="r-btn" data-variant="primary" disabled={publishMutation.isPending} onClick={() => publishMutation.mutate()}>
                    Confirmar publicación
                  </button>
                  <button type="button" className="r-btn" data-variant="ghost" onClick={() => setConfirming(false)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="r-btn" data-variant="primary" disabled={changeCount === 0} onClick={() => setConfirming(true)}>
                {changeCount === 0 ? 'Sin cambios para publicar' : `Publicar (${changeCount} cambios)`}
              </button>
            )}
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
            <PreviewTokensPanel projectId={projectId} previewBaseUrl={previewBaseUrl} />
          </div>
        </div>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
        <PublishHistory projectId={projectId} onDiffVersion={setDiffVersion} />
      </div>

      {diffVersion !== null && (
        <div
          role="dialog"
          aria-modal
          onClick={() => setDiffVersion(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', zIndex: 50 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, width: 480, maxWidth: '90vw' }}
          >
            <h2 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Diff de v{diffVersion}</h2>
            {diffVersion === state.liveVersion ? (
              <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Ésta es la versión en vivo. No hay diff contra sí misma.</p>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
                El diff completo contra versiones históricas todavía no está disponible — sólo se calcula contra la versión en vivo
                (v{state.liveVersion ?? '—'}). Usá el historial para ver la nota de esa versión.
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="button" className="r-btn" onClick={() => setDiffVersion(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
