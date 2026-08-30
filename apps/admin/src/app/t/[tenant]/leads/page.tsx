import { AppShell } from '@/components/app-shell.tsx';
import { LeadsScreen } from '@/components/leads/leads-screen.tsx';
import { requireAdmin } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';

export default async function LeadsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const { membership } = await requireAdmin(tenant);

  const repo = getRepo();
  const [leads, projects] = await Promise.all([repo.listLeads(tenant), repo.listProjects(tenant)]);

  return (
    <AppShell
      membership={membership}
      crumbs={[{ label: membership.tenantName, href: `/t/${tenant}/p` }, { label: 'Leads' }]}
      fill
    >
      <LeadsScreen
        initialLeads={leads}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        showProjectFilter
      />
    </AppShell>
  );
}
