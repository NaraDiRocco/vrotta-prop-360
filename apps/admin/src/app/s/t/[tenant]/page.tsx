import Link from 'next/link';
import { StatusBar } from '@/components/status.tsx';
import { requireTenant } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';

/** Selector de proyecto del shell de ventas. */
export default async function SalesProjects({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const { membership } = await requireTenant(tenant);
  const projects = await getRepo().listProjects(tenant);

  return (
    <main style={{ padding: 12, minHeight: '100dvh' }}>
      <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>{membership.tenantName}</h1>
      <ul style={{ display: 'grid', gap: 8 }}>
        {projects.map((project) => (
          <li key={project.id}>
            <Link
              href={`/s/t/${tenant}/${project.slug}/units`}
              style={{
                display: 'block',
                minHeight: 64,
                padding: 11,
                border: '1px solid var(--border)',
                borderRadius: 9,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 600 }}>{project.name}</div>
              <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 6 }}>
                {project.unitsTotal} unidades
              </div>
              <StatusBar counts={project.statusCounts} />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
