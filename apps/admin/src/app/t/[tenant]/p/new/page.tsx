import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell.tsx';
import { NewProjectScreen } from '@/components/onboarding/new-project-screen.tsx';
import { requireAdmin } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { canCreateProject } from '@/lib/roles.ts';

/**
 * Alta de proyecto. Sin `?project=` es el formulario mínimo; con `?project=`
 * es el panel de poblado (generador de códigos e importador de CSV) del
 * proyecto ya creado, que es a donde apunta el paso "Unidades" del checklist
 * de arranque.
 */
export default async function NewProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ project?: string; panel?: string }>;
}) {
  const { tenant } = await params;
  const { project: projectSlug, panel } = await searchParams;
  const { tenant: tenantRef, actor } = await requireAdmin(tenant);
  // Crear proyecto (y poblarlo) es tarea de Vrotta: la inmobiliaria no ve
  // esta pantalla.
  if (!canCreateProject(actor)) {
    redirect(projectSlug ? `/t/${tenant}/p/${projectSlug}` : `/t/${tenant}/p`);
  }

  const repo = getRepo();
  const projects = await repo.listProjects(tenant);
  const existing = projectSlug ? await repo.getProject(tenant, projectSlug) : null;
  const structure = existing ? await repo.getStructure(existing.id) : { groups: [], types: [] };

  return (
    <AppShell
      actor={actor}
      tenant={tenantRef}
      crumbs={[
        { label: tenantRef.name, href: `/t/${tenant}/p` },
        { label: 'Proyectos', href: `/t/${tenant}/p` },
        { label: existing ? `${existing.name} · cargar unidades` : 'Nuevo proyecto' },
      ]}
    >
      <NewProjectScreen
        tenantSlug={tenant}
        existingSlugs={projects.map((p) => p.slug)}
        initialProject={existing}
        initialGroups={structure.groups}
        initialTypes={structure.types}
        initialPanel={panel === 'csv' ? 'csv' : 'generate'}
      />
    </AppShell>
  );
}
