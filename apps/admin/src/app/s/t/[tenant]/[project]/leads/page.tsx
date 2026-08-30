import { notFound } from 'next/navigation';
import { BottomNav } from '@/components/sales/bottom-nav.tsx';
import { requireTenant } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';

export default async function SalesLeadsPage({
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
      <main style={{ flex: 1, padding: 14, color: 'var(--fg-muted)' }}>
        <h1 style={{ fontSize: 17, fontWeight: 600, color: 'var(--fg)', marginBottom: 6 }}>Consultas</h1>
        <p>Pendiente: bandeja de leads del proyecto.</p>
      </main>
      <BottomNav tenant={tenant} project={project.slug} />
    </div>
  );
}
