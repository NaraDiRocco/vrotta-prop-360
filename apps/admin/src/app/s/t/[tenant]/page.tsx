import Link from 'next/link';
import { FolderKanban } from 'lucide-react';
import { StatusBar } from '@/components/status.tsx';
import { SalesHeader } from '@/components/sales/sales-header.tsx';
import { requireTenant } from '@/lib/auth.ts';
import { getRepo, isMockMode } from '@/lib/data/index.ts';
import { actorLabel } from '@/lib/roles.ts';

/** Selector de proyecto del shell de ventas. */
export default async function SalesProjects({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const { membership, actor, session } = await requireTenant(tenant);
  const projects = await getRepo().listProjects(tenant);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <SalesHeader
        tenantName={membership.tenantName}
        actorLabel={actorLabel(actor)}
        email={session.email}
        mock={isMockMode()}
      />
      <main style={{ padding: 12, flex: 1 }}>
        {projects.length === 0 ? (
          <div className="r-empty" style={{ padding: '48px 24px' }}>
            <FolderKanban size={28} strokeWidth={1.5} color="var(--fg-faint)" aria-hidden />
            <strong style={{ fontSize: '0.9375rem' }}>Todavía no tenés proyectos asignados</strong>
            <span style={{ fontSize: '0.8125rem' }}>Pedile al administrador de {membership.tenantName} que te asigne uno.</span>
          </div>
        ) : (
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
                  <div style={{ fontSize: '0.9375rem', fontWeight: 600 }}>{project.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--fg-muted)', marginBottom: 6 }}>
                    {project.unitsTotal} unidades
                  </div>
                  <StatusBar counts={project.statusCounts} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
