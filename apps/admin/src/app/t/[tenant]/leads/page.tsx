import { AppShell } from '@/components/app-shell.tsx';
import { requireAdmin } from '@/lib/auth.ts';

export default async function LeadsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const { membership } = await requireAdmin(tenant);
  return (
    <AppShell
      membership={membership}
      crumbs={[{ label: membership.tenantName, href: `/t/${tenant}/p` }, { label: 'Leads' }]}
    >
      <div style={{ padding: 12, color: 'var(--fg-muted)' }}>
        <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg)', marginBottom: 6 }}>Leads</h1>
        <p>Pendiente: bandeja de consultas entrantes (tabla <code>leads</code>).</p>
      </div>
    </AppShell>
  );
}
