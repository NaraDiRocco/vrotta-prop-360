import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell.tsx';
import { StatusBar, summarize } from '@/components/status.tsx';
import { requireAdmin } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { countByStatus } from '@/lib/units/query.ts';
import { canPublishProject, healthIssues, LEVEL_COLOR, LEVEL_GLYPH } from '@/lib/health.ts';
import { startupChecklist } from '@/lib/onboarding/checklist.ts';
import { StartupChecklist } from '@/components/onboarding/startup-checklist.tsx';

export default async function ProjectOverview({
  params,
}: {
  params: Promise<{ tenant: string; project: string }>;
}) {
  const { tenant, project: projectSlug } = await params;
  const { membership } = await requireAdmin(tenant);
  const repo = getRepo();
  const project = await repo.getProject(tenant, projectSlug);
  if (!project) notFound();

  const [health, units, structure] = await Promise.all([
    repo.getHealth(project.id),
    repo.getAllUnits(project.id),
    repo.getStructure(project.id),
  ]);
  const issues = healthIssues({ ...project, health }, tenant);
  const checklist = startupChecklist({ tenant, project, health, groupCount: structure.groups.length });
  const publishable = canPublishProject(issues) && membership.role === 'owner';
  const counts = countByStatus(units);
  const blockers = issues.filter((i) => i.level === 'block').length;

  return (
    <AppShell
      membership={membership}
      project={{ slug: project.slug, name: project.name, kind: project.kind }}
      crumbs={[
        { label: membership.tenantName, href: `/t/${tenant}/p` },
        { label: project.name, href: `/t/${tenant}/p/${project.slug}` },
        { label: 'Resumen' },
      ]}
      actions={
        <button
          type="button"
          className="r-btn"
          data-variant="primary"
          disabled={!publishable}
          title={
            blockers > 0
              ? `${blockers} bloqueante(s) sin resolver`
              : membership.role !== 'owner'
                ? 'Sólo el dueño del tenant puede publicar'
                : 'Publicar una nueva versión'
          }
        >
          Publicar
        </button>
      }
    >
      <div style={{ padding: 12, display: 'grid', gap: 12, maxWidth: 820 }}>
        <StartupChecklist projectId={project.id} checklist={checklist} />

        <section style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Metric label="Unidades" value={String(units.length)} />
          <Metric label="Escenas" value={String(health.scenesTotal)} />
          <Metric label="Sin polígono" value={String(health.unitsWithoutGeometry)} />
          <Metric
            label="Versión publicada"
            value={project.publishedVersion > 0 ? `v${project.publishedVersion}` : '—'}
          />
        </section>

        <section>
          <h2 style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Estados</h2>
          <StatusBar counts={counts} height={10} />
          <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 5 }}>{summarize(counts)}</div>
        </section>

        <section>
          <h2 style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
            Salud del proyecto
            {blockers > 0 && (
              <span style={{ color: 'var(--danger)', fontWeight: 400 }}> — {blockers} bloqueante(s)</span>
            )}
          </h2>
          <ul style={{ border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden' }}>
            {issues.map((issue) => (
              <li
                key={issue.id}
                style={{
                  display: 'flex',
                  gap: 9,
                  alignItems: 'baseline',
                  padding: '7px 10px',
                  borderTop: '1px solid var(--border)',
                }}
              >
                <span style={{ color: LEVEL_COLOR[issue.level], width: 12, flex: 'none' }}>
                  {LEVEL_GLYPH[issue.level]}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: issue.level === 'ok' ? 400 : 600 }}>{issue.title}</div>
                  {issue.detail && (
                    <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{issue.detail}</div>
                  )}
                </div>
                {issue.level !== 'ok' && (
                  <Link href={issue.href} className="r-btn" data-variant="ghost" style={{ flex: 'none' }}>
                    Resolver →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="tnum" style={{ fontSize: 20, fontWeight: 600 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{label}</div>
    </div>
  );
}
