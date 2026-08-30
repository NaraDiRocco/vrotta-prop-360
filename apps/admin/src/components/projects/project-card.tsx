/**
 * Card de proyecto — anatomía del plan §4.3.
 *
 * Thumbnail real de la escena inicial: pendiente de un derivado de imagen
 * del pipeline (no bloquea esta etapa, ver plan §8 etapa 3). Mientras tanto,
 * placeholder que distingue "sin escenas todavía" de "hay escenas pero no
 * hay vista previa generada" — que el vacío se vea como carencia, no como
 * diseño.
 */
import Link from 'next/link';
import { STATUS_TOKENS, UNIT_STATUSES } from '@r360/core';
import { StatusBar } from '@/components/status.tsx';
import type { ProjectCard as ProjectCardData } from '@/lib/data/types.ts';
import { healthIssues, type HealthLevel } from '@/lib/health.ts';

const LEVEL_UI_COLOR: Record<'block' | 'warn', string> = {
  block: 'var(--ui-danger)',
  warn: 'var(--ui-warn)',
};

const LEVEL_GLYPH: Record<'block' | 'warn', string> = {
  block: '✕',
  warn: '!',
};

function worstOf(levels: HealthLevel[]): 'block' | 'warn' | null {
  if (levels.includes('block')) return 'block';
  if (levels.includes('warn')) return 'warn';
  return null;
}

/** Las dos cifras más relevantes de la barra, no el rosario completo de `summarize()`. */
function topTwo(counts: ProjectCardData['statusCounts']): string {
  const ordered = [...UNIT_STATUSES]
    .filter((s) => counts[s] > 0)
    .sort((a, b) => counts[b] - counts[a])
    .slice(0, 2);
  return ordered.map((s) => `${counts[s]} ${STATUS_TOKENS[s].label.toLowerCase()}`).join(' · ');
}

export function ProjectCardView({
  project,
  tenant,
  leads7d,
}: {
  project: ProjectCardData;
  tenant: string;
  leads7d: number;
}) {
  const pct = Math.round(project.completeness * 100);
  const issues = healthIssues(project, tenant).filter((i) => i.level !== 'ok');
  const worst = worstOf(issues.map((i) => i.level));
  const published = project.publishedVersion > 0;

  return (
    <Link
      href={`/t/${tenant}/p/${project.slug}`}
      className="r-project-card"
      style={{
        display: 'block',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        overflow: 'hidden',
        background: 'var(--bg)',
      }}
    >
      <div
        style={{
          position: 'relative',
          aspectRatio: '16 / 9',
          background: 'var(--bg-sunken)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-faint)' }}>
          {project.health.scenesTotal === 0 ? 'Sin escenas' : 'Sin vista previa'}
        </span>
        <span
          style={{
            position: 'absolute',
            right: 8,
            bottom: 8,
            padding: '2px 8px',
            borderRadius: 999,
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            background: published ? 'var(--ui-ok-bg)' : 'var(--bg-sunken)',
            color: published ? 'var(--ui-ok)' : 'var(--fg-muted)',
            border: published ? 'none' : '1px solid var(--border-strong)',
          }}
        >
          {published ? `v${project.publishedVersion} público` : 'sin publicar'}
        </span>
      </div>

      <div style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <strong style={{ fontSize: 'var(--text-md)' }}>{project.name}</strong>
          {worst && (
            <span
              style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: LEVEL_UI_COLOR[worst], flex: 'none' }}
            >
              {LEVEL_GLYPH[worst]} {issues.length}
            </span>
          )}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', marginBottom: 8 }}>
          {project.kind}
          {project.location.address ? ` · ${project.location.address}` : ''}
        </div>

        <StatusBar counts={project.statusCounts} height={8} />
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', marginTop: 5 }}>
          {topTwo(project.statusCounts) || 'Sin unidades cargadas'}
        </div>

        <div
          className="tnum"
          style={{
            display: 'flex',
            gap: 10,
            fontSize: 'var(--text-xs)',
            color: 'var(--fg-muted)',
            marginTop: 8,
          }}
        >
          <span>{project.unitsTotal} unidades</span>
          <span>{leads7d} leads/7d</span>
          <span>{pct}% completo</span>
        </div>
      </div>
    </Link>
  );
}
