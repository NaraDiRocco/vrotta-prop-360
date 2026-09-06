import Link from 'next/link';
import { AppShell } from '@/components/app-shell.tsx';
import { ClientKpiRow } from '@/components/projects/kpi-row.tsx';
import { AttentionQueue, type AttentionRow } from '@/components/projects/attention-queue.tsx';
import { ProjectCardView } from '@/components/projects/project-card.tsx';
import { requireAdmin } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { healthIssues } from '@/lib/health.ts';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export default async function ProjectsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const { membership } = await requireAdmin(tenant);
  // P2a: acá va `canEditStructure(actor)`. Mientras tanto el panel sigue
  // mostrando la estructura a Administrador y Gestor, igual que hasta hoy:
  // la base recién se la cierra en 0021, después de migrar al equipo de
  // Vrotta a platform_members.
  const editaEstructura = membership.role === 'owner' || membership.role === 'editor';
  const repo = getRepo();
  const [projects, leads] = await Promise.all([repo.listProjects(tenant), repo.listLeads(tenant)]);

  const cutoff = Date.now() - SEVEN_DAYS_MS;
  const leads7dByProject = new Map<string, number>();
  let leads7dTotal = 0;
  for (const lead of leads) {
    if (new Date(lead.createdAt).getTime() >= cutoff) {
      leads7dTotal += 1;
      leads7dByProject.set(lead.projectId, (leads7dByProject.get(lead.projectId) ?? 0) + 1);
    }
  }

  // Cola de atención: una fila por issue (no por proyecto), bloqueantes antes que avisos.
  const attentionRows: AttentionRow[] = projects
    .flatMap((project) =>
      healthIssues(project, tenant)
        .filter((issue) => issue.level !== 'ok')
        .map((issue) => ({ issue, projectName: project.name })),
    )
    .sort((a, b) => {
      if (a.issue.level !== b.issue.level) return a.issue.level === 'block' ? -1 : 1;
      return a.projectName.localeCompare(b.projectName);
    });

  return (
    <AppShell
      membership={membership}
      crumbs={[{ label: membership.tenantName, href: `/t/${tenant}/p` }, { label: 'Proyectos' }]}
      actions={
        editaEstructura ? (
          <Link href={`/t/${tenant}/p/new`} className="r-btn" data-variant="primary">
            Nuevo proyecto
          </Link>
        ) : undefined
      }
    >
      <style
        // Hover de la card: borde más marcado, sin tocar globals.css (lo reescribe otro agente en esta etapa).
        dangerouslySetInnerHTML={{
          __html: '.r-project-card:hover { border-color: var(--border-strong); }',
        }}
      />
      <div
        style={{
          padding: '16px 12px',
          background: 'var(--bg-canvas)',
          minHeight: '100%',
        }}
      >
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          {projects.length > 0 && <ClientKpiRow projects={projects} leads7d={leads7dTotal} />}

          <AttentionQueue rows={attentionRows} />

          {projects.length > 0 && (
            <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 10 }}>Proyectos</h2>
          )}

          {projects.length > 0 ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: 16,
              }}
            >
              {projects.map((project) => (
                <ProjectCardView
                  key={project.id}
                  project={project}
                  tenant={tenant}
                  leads7d={leads7dByProject.get(project.id) ?? 0}
                />
              ))}
            </div>
          ) : (
            <div
              style={{
                border: '1px dashed var(--border-strong)',
                borderRadius: 'var(--radius-card)',
                padding: '40px 20px',
                textAlign: 'center',
                color: 'var(--fg-muted)',
              }}
            >
              <p style={{ marginBottom: editaEstructura ? 10 : 0 }}>
                No hay proyectos en este cliente todavía.
              </p>
              {editaEstructura && (
                <Link href={`/t/${tenant}/p/new`} className="r-btn" data-variant="primary">
                  Crear el primero →
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
