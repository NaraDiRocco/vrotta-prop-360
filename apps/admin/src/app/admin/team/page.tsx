import Link from 'next/link';
import { requirePlatformAdmin } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { TeamScreen } from '@/components/admin/team-screen.tsx';

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
  const { session } = await requirePlatformAdmin();
  const members = await getRepo().listPlatformMembers();

  return (
    <main style={{ padding: '20px 24px', display: 'grid', gap: 16, maxWidth: 720, margin: '0 auto' }}>
      <header style={{ display: 'grid', gap: 4 }}>
        <Link href="/admin" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
          ← Clientes
        </Link>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>Equipo de Vrotta</h1>
        <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
          Quién opera la plataforma: da de alta clientes, carga proyectos, publica.
        </p>
      </header>

      <TeamScreen initialMembers={members} currentUserId={session.id} />
    </main>
  );
}
