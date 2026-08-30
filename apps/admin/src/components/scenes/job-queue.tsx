'use client';

import type { JobRow, JobStatus } from '@/lib/data/types.ts';

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: 'En cola',
  running: 'Procesando',
  done: 'Listo',
  failed: 'Falló',
  canceled: 'Cancelado',
};

const STATUS_COLOR: Record<JobStatus, string> = {
  queued: 'var(--fg-muted)',
  running: 'var(--accent)',
  done: 'var(--ok)',
  failed: 'var(--danger)',
  canceled: 'var(--fg-faint)',
};

function fmtEta(etaS: number | null): string {
  if (etaS === null) return '';
  if (etaS < 60) return `~${Math.ceil(etaS)}s`;
  return `~${Math.ceil(etaS / 60)} min`;
}

/**
 * Cola de procesamiento, siempre visible arriba de la grilla. `queued` y
 * `running` importan más que el resto: son los únicos que necesitan que
 * alguien vuelva a mirar. `done` se muestra igual (transparencia de qué pasó
 * recién) pero discreto.
 */
export function JobQueue({
  jobs,
  onRetry,
  onCancel,
  onViewLog,
  pending,
}: {
  jobs: JobRow[];
  onRetry: (jobId: string) => void;
  onCancel: (jobId: string) => void;
  onViewLog: (job: JobRow) => void;
  pending: Set<string>;
}) {
  const active = jobs.filter((j) => j.status === 'queued' || j.status === 'running' || j.status === 'failed');
  const rest = jobs.filter((j) => j.status === 'done' || j.status === 'canceled').slice(0, 3);
  const visible = [...active, ...rest];

  if (visible.length === 0) return null;

  return (
    <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
      <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)' }}>
          Cola de procesamiento {active.length > 0 ? `· ${active.length} activo(s)` : ''}
        </div>
        {visible.map((job) => (
          <div
            key={job.id}
            data-failed={job.status === 'failed' ? 'true' : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              height: 30,
              padding: '0 8px',
              borderRadius: 5,
              background: job.status === 'failed' ? 'color-mix(in srgb, var(--danger) 10%, transparent)' : 'var(--bg)',
              border: '1px solid var(--border)',
              opacity: pending.has(job.id) ? 0.55 : 1,
            }}
          >
            <span
              className="r-dot"
              style={{ background: STATUS_COLOR[job.status], width: 7, height: 7, flex: 'none' }}
              aria-hidden
            />
            <span style={{ minWidth: 130, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {job.sceneName ?? '(sin nombre)'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--fg-muted)', minWidth: 76 }}>{STATUS_LABEL[job.status]}</span>

            {job.status === 'running' && (
              <div style={{ flex: 1, maxWidth: 220, display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--bg-sunken)', overflow: 'hidden' }}>
                  <div style={{ width: `${job.progress}%`, height: '100%', background: 'var(--accent)' }} />
                </div>
                <span className="tnum" style={{ fontSize: 11, color: 'var(--fg-muted)', minWidth: 30 }}>
                  {Math.round(job.progress)}%
                </span>
                {job.etaS !== null && <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{fmtEta(job.etaS)}</span>}
              </div>
            )}

            {job.status === 'failed' && job.error && (
              <span style={{ flex: 1, fontSize: 11, color: 'var(--danger)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {job.error}
              </span>
            )}

            {job.status === 'queued' && <span style={{ flex: 1 }} />}
            {(job.status === 'done' || job.status === 'canceled') && <span style={{ flex: 1 }} />}

            <div style={{ display: 'flex', gap: 4, flex: 'none' }}>
              <button type="button" className="r-btn" data-variant="ghost" onClick={() => onViewLog(job)} style={{ height: 22, padding: '0 6px', fontSize: 11 }}>
                Ver log
              </button>
              {job.status === 'failed' && (
                <button
                  type="button"
                  className="r-btn"
                  disabled={pending.has(job.id)}
                  onClick={() => onRetry(job.id)}
                  style={{ height: 22, padding: '0 6px', fontSize: 11 }}
                >
                  Reintentar
                </button>
              )}
              {(job.status === 'queued' || job.status === 'running') && (
                <button
                  type="button"
                  className="r-btn"
                  disabled={pending.has(job.id)}
                  onClick={() => onCancel(job.id)}
                  style={{ height: 22, padding: '0 6px', fontSize: 11 }}
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
