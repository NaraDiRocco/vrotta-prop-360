import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { AppShell } from '@/components/app-shell.tsx';
import { UnitsScreen } from '@/components/units/units-screen.tsx';
import { requireAdmin } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';

export default async function UnitsPage({
  params,
}: {
  params: Promise<{ tenant: string; project: string }>;
}) {
  const { tenant, project: projectSlug } = await params;
  const { membership } = await requireAdmin(tenant);
  const repo = getRepo();
  const project = await repo.getProject(tenant, projectSlug);
  if (!project) notFound();

  const structure = await repo.getStructure(project.id);

  return (
    <AppShell
      membership={membership}
      project={{ slug: project.slug, name: project.name, kind: project.kind }}
      crumbs={[
        { label: membership.tenantName, href: `/t/${tenant}/p` },
        { label: project.name, href: `/t/${tenant}/p/${project.slug}` },
        { label: 'Unidades' },
      ]}
      fill
    >
      <Suspense fallback={<div style={{ padding: 12, color: 'var(--fg-muted)' }}>Cargando unidades…</div>}>
        <UnitsScreen projectId={project.id} groups={structure.groups} types={structure.types} />
      </Suspense>
    </AppShell>
  );
}
