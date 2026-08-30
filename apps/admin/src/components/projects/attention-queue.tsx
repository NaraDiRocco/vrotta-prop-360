'use client';

/**
 * Cola de atención — reemplaza el párrafo naranja corrido por una lista
 * escaneable, una fila por issue (no por proyecto). Ver plan §5.1.
 *
 * El color es del glyph, no de la fila: sólo el header lleva fondo teñido
 * según el peor nivel presente, así el peso visual de la banda es
 * proporcional a su gravedad en vez de ser siempre una pared naranja.
 */
import { useState } from 'react';
import Link from 'next/link';
import type { HealthIssue, HealthLevel } from '@/lib/health.ts';

const LEVEL_UI_COLOR: Record<Exclude<HealthLevel, 'ok'>, string> = {
  block: 'var(--ui-danger)',
  warn: 'var(--ui-warn)',
};

const LEVEL_GLYPH: Record<Exclude<HealthLevel, 'ok'>, string> = {
  block: '✕',
  warn: '!',
};

export interface AttentionRow {
  issue: HealthIssue;
  projectName: string;
}

const COLLAPSED_LIMIT = 6;

export function AttentionQueue({ rows }: { rows: AttentionRow[] }) {
  const [expanded, setExpanded] = useState(false);
  if (rows.length === 0) return null;

  const blockers = rows.filter((r) => r.issue.level === 'block').length;
  const warns = rows.filter((r) => r.issue.level === 'warn').length;
  const worst: 'block' | 'warn' = blockers > 0 ? 'block' : 'warn';
  const visible = expanded ? rows : rows.slice(0, COLLAPSED_LIMIT);
  const hiddenCount = rows.length - visible.length;

  return (
    <section
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        overflow: 'hidden',
        marginBottom: 16,
      }}
      aria-label="Requiere atención"
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          padding: '9px 14px',
          background: worst === 'block' ? 'var(--ui-danger-bg)' : 'var(--ui-warn-bg)',
        }}
      >
        <h2 style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Requiere atención</h2>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
          {[
            blockers > 0 ? `${blockers} bloqueante${blockers === 1 ? '' : 's'}` : null,
            warns > 0 ? `${warns} aviso${warns === 1 ? '' : 's'}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </header>

      <ul>
        {visible.map(({ issue, projectName }) => (
          <li
            key={issue.id + issue.href}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 14px',
              borderTop: '1px solid var(--border)',
              background: 'var(--bg)',
            }}
          >
            <span
              aria-hidden
              style={{ width: 12, flex: 'none', color: LEVEL_UI_COLOR[issue.level as 'block' | 'warn'] }}
            >
              {LEVEL_GLYPH[issue.level as 'block' | 'warn']}
            </span>
            <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)', flex: '0 0 auto', minWidth: 120 }}>
              {projectName}
            </span>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-muted)', flex: 1, minWidth: 0 }}>
              {issue.title}
            </span>
            <Link href={issue.href} className="r-btn" data-variant="ghost" style={{ flex: 'none' }}>
              Resolver →
            </Link>
          </li>
        ))}
      </ul>

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="r-btn"
          data-variant="ghost"
          style={{
            width: '100%',
            borderRadius: 0,
            borderTop: '1px solid var(--border)',
            fontSize: 'var(--text-xs)',
          }}
        >
          Ver {hiddenCount} más
        </button>
      )}
    </section>
  );
}
