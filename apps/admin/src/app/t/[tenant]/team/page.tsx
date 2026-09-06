import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell.tsx';
import { TeamScreen } from '@/components/team/team-screen.tsx';
import { requireAdmin } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { canInviteTenantUsers } from '@/lib/roles.ts';

/**
 * Equipo de la inmobiliaria: miembros con su rol, invitaciones pendientes
 * con su vencimiento, invitar, cambiar rol, quitar, y asignar proyectos a un
 * Vendedor. Gating con `canInviteTenantUsers` — el Administrador (owner) y
 * cualquier Vrotta Admin. Un Gestor (editor) o un Vendedor (sales) que
 * fuerce la URL recibe 404, no un cartel de "no autorizado": esta pantalla
 * no existe para ellos, igual que `/admin` no existe para una inmobiliaria.
 */
export default async function TeamPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const { tenant: tenantRef, actor, session } = await requireAdmin(tenant);
  if (!canInviteTenantUsers(actor)) notFound();

  const repo = getRepo();
  const [members, invitations, projects] = await Promise.all([
    repo.listTenantMembers(tenant),
    repo.listTenantInvitations(tenant),
    repo.listProjects(tenant),
  ]);

  return (
    <AppShell actor={actor} tenant={tenantRef} crumbs={[{ label: tenantRef.name, href: `/t/${tenant}/p` }, { label: 'Equipo' }]}>
      <TeamScreen
        tenantSlug={tenant}
        initialMembers={members}
        initialInvitations={invitations}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        currentUserId={session.id}
      />
    </AppShell>
  );
}
