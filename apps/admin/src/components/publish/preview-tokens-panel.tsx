'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { PreviewTokenRow } from '@/lib/data/types.ts';

const TTL_OPTIONS = [
  { label: '1 hora', minutes: 60 },
  { label: '24 horas', minutes: 60 * 24 },
  { label: '7 días', minutes: 60 * 24 * 7 },
  { label: '30 días', minutes: 60 * 24 * 30 },
];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-UY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function isExpired(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}

export function PreviewTokensPanel({ projectId, previewBaseUrl }: { projectId: string; previewBaseUrl: string }) {
  const queryClient = useQueryClient();
  const queryKey = ['preview-tokens', projectId] as const;
  const [ttl, setTtl] = useState(TTL_OPTIONS[1]?.minutes ?? 1440);
  const [note, setNote] = useState('');

  const { data } = useQuery<PreviewTokenRow[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/p/${projectId}/publish/preview-tokens`);
      if (!res.ok) throw new Error('No pude cargar los tokens de preview');
      return (await res.json()) as PreviewTokenRow[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/p/${projectId}/publish/preview-tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttlMinutes: ttl, note: note.trim() || null }),
      });
      if (!res.ok) throw new Error('No se pudo crear el token');
      return res.json();
    },
    onSuccess: () => {
      setNote('');
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (token: string) => {
      await fetch(`/api/p/${projectId}/publish/preview-tokens/${encodeURIComponent(token)}`, { method: 'DELETE' });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });

  const tokens = data ?? [];
  const active = tokens.filter((t) => !t.revoked);

  return (
    <div>
      <h2 style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Preview con token</h2>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <select className="r-input" style={{ width: 110 }} value={ttl} onChange={(e) => setTtl(Number(e.target.value))}>
          {TTL_OPTIONS.map((opt) => (
            <option key={opt.minutes} value={opt.minutes}>
              {opt.label}
            </option>
          ))}
        </select>
        <input
          className="r-input"
          style={{ flex: 1, minWidth: 120 }}
          placeholder="Nota (opcional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button type="button" className="r-btn" data-variant="primary" disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
          Generar link
        </button>
      </div>

      {active.length === 0 ? (
        <p style={{ fontSize: 11, color: 'var(--fg-muted)' }}>No hay links de preview activos.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {active.map((t) => {
            const url = `${previewBaseUrl}?preview=${t.token}`;
            const expired = isExpired(t.expiresAt);
            return (
              <div
                key={t.token}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 11,
                  padding: '5px 8px',
                  border: '1px solid var(--border)',
                  borderRadius: 5,
                  opacity: expired ? 0.55 : 1,
                }}
              >
                <code style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={url}>
                  {url}
                </code>
                <span style={{ color: expired ? 'var(--danger)' : 'var(--fg-muted)' }}>
                  {expired ? 'expirado' : `vence ${fmtDate(t.expiresAt)}`}
                </span>
                {t.note && <span style={{ color: 'var(--fg-faint)' }}>· {t.note}</span>}
                <button
                  type="button"
                  className="r-btn"
                  data-variant="ghost"
                  style={{ height: 20, padding: '0 6px' }}
                  disabled={revokeMutation.isPending}
                  onClick={() => revokeMutation.mutate(t.token)}
                >
                  Revocar
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
