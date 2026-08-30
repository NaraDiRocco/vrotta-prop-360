import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell.tsx';
import { requireAdmin } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';

/** Placeholder: esta pantalla la construye otra parte del sistema (tools/). */
export default async function Page({ params }: { params: Promise<{ tenant: string; project: string }> }) {
  const { tenant, project: projectSlug } = await params;
  const { membership } = await requireAdmin(tenant);
  const project = await getRepo().getProject(tenant, projectSlug);
  if (!project) notFound();

  return (
    <AppShell
      membership={membership}
      project={{ slug: project.slug, name: project.name, kind: project.kind }}
      crumbs={[
        { label: membership.tenantName, href: `/t/${tenant}/p` },
        { label: project.name, href: `/t/${tenant}/p/${project.slug}` },
        { label: 'Escenas' },
      ]}
    >
      <div style={{ padding: 12, color: 'var(--fg-muted)' }}>
        <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)', marginBottom: 6 }}>Escenas</h1>
        <p>Pendiente. El editor de escenas y el flujo de publicación viven fuera de apps/admin.</p>
      </div>
    </AppShell>
  );
}
