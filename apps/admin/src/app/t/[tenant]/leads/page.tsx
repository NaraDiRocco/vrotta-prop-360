import { AppShell } from '@/components/app-shell.tsx';
import { LeadsScreen } from '@/components/leads/leads-screen.tsx';
import { requireAdmin } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';

export default async function LeadsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const { tenant: tenantRef, actor } = await requireAdmin(tenant);

  const repo = getRepo();
  const [leads, projects] = await Promise.all([repo.listLeads(tenant), repo.listProjects(tenant)]);

  return (
    <AppShell actor={actor} tenant={tenantRef} crumbs={[{ label: tenantRef.name, href: `/t/${tenant}/p` }, { label: 'Leads' }]} fill>
      <LeadsScreen
        initialLeads={leads}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        showProjectFilter
        actor={actor}
      />
    </AppShell>
  );
}
