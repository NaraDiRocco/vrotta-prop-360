import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell.tsx';
import { LeadsScreen } from '@/components/leads/leads-screen.tsx';
import { requireAdmin } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';

export default async function Page({ params }: { params: Promise<{ tenant: string; project: string }> }) {
  const { tenant, project: projectSlug } = await params;
  const { tenant: tenantRef, actor } = await requireAdmin(tenant);
  const project = await getRepo().getProject(tenant, projectSlug);
  if (!project) notFound();

  const leads = await getRepo().listLeads(tenant, { projectId: project.id });

  return (
    <AppShell
      actor={actor}
      tenant={tenantRef}
      project={{ slug: project.slug, name: project.name, kind: project.kind }}
      crumbs={[
        { label: tenantRef.name, href: `/t/${tenant}/p` },
        { label: project.name, href: `/t/${tenant}/p/${project.slug}` },
        { label: 'Leads' },
      ]}
      fill
    >
      <LeadsScreen initialLeads={leads} showProjectFilter={false} defaultProjectId={project.id} actor={actor} />
    </AppShell>
  );
}
