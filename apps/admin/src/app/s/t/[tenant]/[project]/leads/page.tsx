import { notFound } from 'next/navigation';
import { BottomNav } from '@/components/sales/bottom-nav.tsx';
import { SalesLeads } from '@/components/sales/sales-leads.tsx';
import { requireTenant } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { canViewLeads } from '@/lib/roles.ts';

export default async function SalesLeadsPage({
  params,
}: {
  params: Promise<{ tenant: string; project: string }>;
}) {
  const { tenant, project: projectSlug } = await params;
  const { actor } = await requireTenant(tenant);
  // Hoy `canViewLeads` es `true` para todo actor (ver roles.ts): el guard
  // queda igual acá porque es la función que decide, no una constante — si
  // el día de mañana se acota, esta pantalla ya respeta el cambio sin tocar
  // nada más.
  if (!canViewLeads(actor)) notFound();
  const project = await getRepo().getProject(tenant, projectSlug);
  if (!project) notFound();

  // Traído en el server para que la primera pantalla no sea un skeleton
  // (criterio de "la carga no salta" del plan de diseño): el cliente sólo
  // refresca en segundo plano a partir de esto.
  const leads = await getRepo().listLeads(tenant, { projectId: project.id });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <SalesLeads projectId={project.id} initialLeads={leads} actor={actor} />
      </div>
      <BottomNav tenant={tenant} project={project.slug} />
    </div>
  );
}
