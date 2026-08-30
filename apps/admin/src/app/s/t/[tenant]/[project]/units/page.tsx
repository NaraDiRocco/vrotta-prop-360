import { notFound } from 'next/navigation';
import { BottomNav } from '@/components/sales/bottom-nav.tsx';
import { SalesUnits } from '@/components/sales/sales-units.tsx';
import { requireTenant } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';

export default async function SalesUnitsPage({
  params,
}: {
  params: Promise<{ tenant: string; project: string }>;
}) {
  const { tenant, project: projectSlug } = await params;
  await requireTenant(tenant);
  const project = await getRepo().getProject(tenant, projectSlug);
  if (!project) notFound();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <SalesUnits projectId={project.id} projectName={project.name} />
      </div>
      <BottomNav tenant={tenant} project={project.slug} />
    </div>
  );
}
