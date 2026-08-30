import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell.tsx';
import { MaterialScreen } from '@/components/material/material-screen.tsx';
import { requireAdmin, canEditStructure } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';

export default async function Page({ params }: { params: Promise<{ tenant: string; project: string }> }) {
  const { tenant, project: projectSlug } = await params;
  const { membership } = await requireAdmin(tenant);
  if (!canEditStructure(membership.role)) redirect(`/t/${tenant}/p/${projectSlug}`);

  const project = await getRepo().getProject(tenant, projectSlug);
  if (!project) notFound();

  return (
    <AppShell
      membership={membership}
      project={{ slug: project.slug, name: project.name, kind: project.kind }}
      crumbs={[
        { label: membership.tenantName, href: `/t/${tenant}/p` },
        { label: project.name, href: `/t/${tenant}/p/${project.slug}` },
        { label: 'Material' },
      ]}
      fill
    >
      <MaterialScreen tenant={tenant} projectSlug={project.slug} projectName={project.name} projectKind={project.kind} />
    </AppShell>
  );
}
