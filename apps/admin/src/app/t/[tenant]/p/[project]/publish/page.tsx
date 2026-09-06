import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell.tsx';
import { PublishScreen } from '@/components/publish/publish-screen.tsx';
import { requireAdmin } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { canPublish } from '@/lib/roles.ts';

export default async function Page({ params }: { params: Promise<{ tenant: string; project: string }> }) {
  const { tenant, project: projectSlug } = await params;
  const { tenant: tenantRef, actor } = await requireAdmin(tenant);
  // Publicar/revertir es tarea de Vrotta: la inmobiliaria ve el estado de la
  // publicación en el resumen del proyecto, no acá.
  if (!canPublish(actor)) redirect(`/t/${tenant}/p/${projectSlug}`);

  const project = await getRepo().getProject(tenant, projectSlug);
  if (!project) notFound();

  return (
    <AppShell
      actor={actor}
      tenant={tenantRef}
      project={{ slug: project.slug, name: project.name, kind: project.kind }}
      crumbs={[
        { label: tenantRef.name, href: `/t/${tenant}/p` },
        { label: project.name, href: `/t/${tenant}/p/${project.slug}` },
        { label: 'Publicar' },
      ]}
      fill
    >
      <PublishScreen tenant={tenant} projectSlug={project.slug} projectId={project.id} />
    </AppShell>
  );
}
