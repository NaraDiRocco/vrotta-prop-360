import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell.tsx';
import { ScenesScreen } from '@/components/scenes/scenes-screen.tsx';
import { requireAdmin } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { canManageScenes } from '@/lib/roles.ts';

export default async function Page({ params }: { params: Promise<{ tenant: string; project: string }> }) {
  const { tenant, project: projectSlug } = await params;
  const { tenant: tenantRef, actor } = await requireAdmin(tenant);
  // Subir/borrar escenas y ver la cola de procesamiento es tarea de Vrotta.
  if (!canManageScenes(actor)) redirect(`/t/${tenant}/p/${projectSlug}`);

  const project = await getRepo().getProject(tenant, projectSlug);
  if (!project) notFound();

  const repo = getRepo();
  const [scenes, jobs] = await Promise.all([repo.listScenes(project.id), repo.listJobs(project.id)]);

  return (
    <AppShell
      actor={actor}
      tenant={tenantRef}
      project={{ slug: project.slug, name: project.name, kind: project.kind }}
      crumbs={[
        { label: tenantRef.name, href: `/t/${tenant}/p` },
        { label: project.name, href: `/t/${tenant}/p/${project.slug}` },
        { label: 'Escenas' },
      ]}
      fill
    >
      <ScenesScreen
        tenant={tenant}
        projectSlug={project.slug}
        projectId={project.id}
        initialScenes={scenes}
        initialJobs={jobs}
      />
    </AppShell>
  );
}
