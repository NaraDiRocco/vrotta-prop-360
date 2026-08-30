'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { PublicationRow } from '@/lib/data/types.ts';

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-UY', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function PublishHistory({ projectId, onDiffVersion }: { projectId: string; onDiffVersion: (version: number) => void }) {
  const queryClient = useQueryClient();

  const { data } = useQuery<PublicationRow[]>({
    queryKey: ['publish-history', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/p/${projectId}/publish/history`);
      if (!res.ok) throw new Error('No pude cargar el historial');
      return (await res.json()) as PublicationRow[];
    },
  });

  const [reverting, setReverting] = useState<number | null>(null);

  const revertMutation = useMutation({
    mutationFn: async (version: number) => {
      const res = await fetch(`/api/p/${projectId}/publish/revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? 'No se pudo revertir');
    },
    onSuccess: () => {
      setReverting(null);
      void queryClient.invalidateQueries({ queryKey: ['publish-history', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['publish-state', projectId] });
    },
  });

  const publications = data ?? [];

  return (
    <div>
      <h2 style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Historial de versiones</h2>
      {publications.length === 0 ? (
        <p style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Todavía no se publicó ninguna versión.</p>
      ) : (
        <table className="r-table">
          <thead>
            <tr>
              <th className="r-th">Versión</th>
              <th className="r-th">Fecha</th>
              <th className="r-th">Nota</th>
              <th className="r-th" style={{ width: 170 }} />
            </tr>
          </thead>
          <tbody>
            {publications.map((p) => (
              <tr key={p.id} className="r-row">
                <td className="r-td tnum">v{p.version}</td>
                <td className="r-td" suppressHydrationWarning>
                  {fmtDate(p.publishedAt)}
                </td>
                <td className="r-td" title={p.note ?? ''}>
                  {p.note ?? '—'}
                </td>
                <td className="r-td">
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    <button type="button" className="r-btn" data-variant="ghost" style={{ height: 22, fontSize: 11 }} onClick={() => onDiffVersion(p.version)}>
                      Diff
                    </button>
                    {reverting === p.version ? (
                      <>
                        <button
                          type="button"
                          className="r-btn"
                          data-variant="primary"
                          style={{ height: 22, fontSize: 11 }}
                          disabled={revertMutation.isPending}
                          onClick={() => revertMutation.mutate(p.version)}
                        >
                          Confirmar
                        </button>
                        <button type="button" className="r-btn" data-variant="ghost" style={{ height: 22, fontSize: 11 }} onClick={() => setReverting(null)}>
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <button type="button" className="r-btn" style={{ height: 22, fontSize: 11 }} onClick={() => setReverting(p.version)}>
                        Revertir
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
