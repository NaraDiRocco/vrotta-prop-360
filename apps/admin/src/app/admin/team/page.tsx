import { requirePlatformAdmin } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { TeamScreen } from '@/components/admin/team-screen.tsx';
import { AppShell } from '@/components/app-shell.tsx';

/**
 * Equipo de Vrotta (`platform_members`). Sólo Vrotta Admin — `canManagePlatformTeam`.
 *
 * Alta SIN invitación por email: sumar gente sin cuenta todavía es el
 * sistema de invitaciones (P2c, no existe todavía). Acá sólo se puede sumar
 * a alguien que YA tiene cuenta en Recorrido 360 (se busca por email); si no
 * la tiene, el formulario lo dice — no hay botón que simule un alta que en
 * realidad no hizo nada.
 */
export default async function AdminTeamPage() {
  const { session, actor } = await requirePlatformAdmin();
  const members = await getRepo().listPlatformMembers();

  return (
    <AppShell actor={actor} crumbs={[{ label: 'Clientes', href: '/admin' }, { label: 'Equipo de Vrotta' }]}>
      <div style={{ padding: '20px 24px', display: 'grid', gap: 16, maxWidth: 720, margin: '0 auto' }}>
        <header style={{ display: 'grid', gap: 4 }}>
          <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>Equipo de Vrotta</h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-muted)' }}>
            Quién opera la plataforma: da de alta clientes, carga proyectos, publica.
          </p>
        </header>

        <TeamScreen initialMembers={members} currentUserId={session.id} />
      </div>
    </AppShell>
  );
}
