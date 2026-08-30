import Link from 'next/link';
import { AppShell } from '@/components/app-shell.tsx';
import { StatusBar, summarize } from '@/components/status.tsx';
import { requireAdmin } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import type { ProjectCard } from '@/lib/data/types.ts';
import { healthIssues, worstLevel } from '@/lib/health.ts';

export default async function ProjectsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const { membership } = await requireAdmin(tenant);
  const projects = await getRepo().listProjects(tenant);

  const needAttention = projects.filter((p) => worstLevel(healthIssues(p, tenant)) !== 'ok');

  return (
    <AppShell membership={membership} crumbs={[{ label: membership.tenantName, href: `/t/${tenant}/p` }, { label: 'Proyectos' }]}>
      <div style={{ padding: 12 }}>
        {needAttention.length > 0 && <AttentionBand projects={needAttention} tenant={tenant} />}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 10,
          }}
        >
          {projects.map((project) => (
            <ProjectCardView key={project.id} project={project} tenant={tenant} />
          ))}
        </div>

        {projects.length === 0 && (
          <p style={{ color: 'var(--fg-muted)' }}>No hay proyectos en este tenant todavía.</p>
        )}
      </div>
    </AppShell>
  );
}

function AttentionBand({ projects, tenant }: { projects: ProjectCard[]; tenant: string }) {
  return (
    <section
      style={{
        border: '1px solid var(--warn)',
        borderRadius: 7,
        padding: '8px 10px',
        marginBottom: 12,
        background: 'color-mix(in srgb, var(--warn) 8%, transparent)',
      }}
    >
      <h2 style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Requiere atención</h2>
      <ul style={{ display: 'grid', gap: 3 }}>
        {projects.map((project) => {
          const issues = healthIssues(project, tenant).filter((i) => i.level !== 'ok');
          return (
            <li key={project.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <Link href={`/t/${tenant}/p/${project.slug}`} style={{ fontWeight: 600 }}>
                {project.name}
              </Link>
              {issues.map((issue) => (
                <Link
                  key={issue.id}
                  href={issue.href}
                  style={{
                    fontSize: 11,
                    color: issue.level === 'block' ? 'var(--danger)' : 'var(--warn)',
                  }}
                >
                  {issue.title}
                </Link>
              ))}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ProjectCardView({ project, tenant }: { project: ProjectCard; tenant: string }) {
  const pct = Math.round(project.completeness * 100);
  return (
    <Link
      href={`/t/${tenant}/p/${project.slug}`}
      style={{
        display: 'block',
        border: '1px solid var(--border)',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--bg)',
      }}
    >
      <div
        style={{
          height: 84,
          background: 'linear-gradient(135deg, var(--bg-sunken), var(--bg-hover))',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--fg-faint)',
          fontSize: 11,
        }}
      >
        {project.location.address ?? project.kind}
      </div>
      <div style={{ padding: 9 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
          <strong>{project.name}</strong>
          <span className="tnum" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
            {project.unitsTotal} u.
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginBottom: 7 }}>
          {project.kind} · {project.publishedVersion > 0 ? `publicado v${project.publishedVersion}` : 'sin publicar'}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <div style={{ flex: 1, height: 4, background: 'var(--bg-sunken)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)' }} />
          </div>
          <span className="tnum" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
            {pct}%
          </span>
        </div>

        <StatusBar counts={project.statusCounts} />
        <div style={{ fontSize: 10, color: 'var(--fg-faint)', marginTop: 5 }}>{summarize(project.statusCounts)}</div>
      </div>
    </Link>
  );
}
