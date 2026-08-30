import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell.tsx';
import { PublishScreen } from '@/components/publish/publish-screen.tsx';
import { requireAdmin } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';

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
        { label: 'Publicar' },
      ]}
      fill
    >
      <PublishScreen tenant={tenant} projectSlug={project.slug} projectId={project.id} />
    </AppShell>
  );
}
