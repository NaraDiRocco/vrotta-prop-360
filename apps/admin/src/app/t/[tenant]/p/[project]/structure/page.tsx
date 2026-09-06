import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell.tsx';
import { StructureEditor } from '@/components/structure/structure-editor.tsx';
import { requireAdmin } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';

export default async function StructurePage({
  params,
}: {
  params: Promise<{ tenant: string; project: string }>;
}) {
  const { tenant, project: projectSlug } = await params;
  const { membership } = await requireAdmin(tenant);
  // P2a: acá va `canEditStructure(actor)`. Mientras tanto el panel sigue
  // mostrando la estructura a Administrador y Gestor, igual que hasta hoy:
  // la base recién se la cierra en 0021, después de migrar al equipo de
  // Vrotta a platform_members.
  const editaEstructura = membership.role === 'owner' || membership.role === 'editor';
  if (!editaEstructura) notFound();

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
        { label: 'Estructura' },
      ]}
    >
      <StructureEditor projectId={project.id} initialGroups={structure.groups} initialTypes={structure.types} />
    </AppShell>
  );
}
