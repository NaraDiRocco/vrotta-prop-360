import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell.tsx';
import { StructureEditor } from '@/components/structure/structure-editor.tsx';
import { requireAdmin } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { canEditStructure } from '@/lib/roles.ts';

export default async function StructurePage({
  params,
}: {
  params: Promise<{ tenant: string; project: string }>;
}) {
  const { tenant, project: projectSlug } = await params;
  const { tenant: tenantRef, actor } = await requireAdmin(tenant);
  // La estructura (torres, pisos, tipos, alta/baja de unidades) es tarea de
  // Vrotta: la inmobiliaria vuelve al resumen del proyecto en vez de ver una
  // pantalla que no puede tocar.
  if (!canEditStructure(actor)) redirect(`/t/${tenant}/p/${projectSlug}`);

  const repo = getRepo();
  const project = await repo.getProject(tenant, projectSlug);
  if (!project) notFound();
  const structure = await repo.getStructure(project.id);

  return (
    <AppShell
      actor={actor}
      tenant={tenantRef}
      project={{ slug: project.slug, name: project.name, kind: project.kind }}
      crumbs={[
        { label: tenantRef.name, href: `/t/${tenant}/p` },
        { label: project.name, href: `/t/${tenant}/p/${project.slug}` },
        { label: 'Estructura' },
      ]}
    >
      <StructureEditor projectId={project.id} initialGroups={structure.groups} initialTypes={structure.types} />
    </AppShell>
  );
}
