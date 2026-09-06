import { getSession } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { PLATFORM_ROLE_LABEL, ROLE_LABEL } from '@/lib/roles.ts';
import { InviteAccept } from './invite-accept.tsx';

/**
 * Pantalla pública (ruta libre en `middleware.ts`, igual que `/m/[token]`
 * para material): tiene que poder mostrar a qué inmobiliaria y con qué rol
 * invitaron ANTES de que la persona inicie sesión. La resolución del token
 * pasa por `resolveInvitationByToken`, que en Supabase es la RPC
 * `invitation_preview` (`security definer`, nunca expone el hash).
 *
 * Un token que no existe, venció, fue revocado o ya fue aceptado se
 * muestra TODOS con el mismo mensaje genérico — a propósito, ver la nota de
 * la migración 0020: no hay forma de usar la respuesta para enumerar tokens.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [session, preview] = await Promise.all([getSession(), getRepo().resolveInvitationByToken(token)]);

  if (!preview) {
    return (
      <main style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', padding: 24 }}>
        <div style={{ width: 360, display: 'grid', gap: 8 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Invitación no disponible</h1>
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
            Este link ya no sirve: puede haber vencido, haber sido revocado, o ya haberse usado. Pedile a quien te
            invitó que te mande uno nuevo.
          </p>
        </div>
      </main>
    );
  }

  const orgLabel = preview.scope === 'platform' ? 'Vrotta' : (preview.tenantName ?? 'tu inmobiliaria');
  const roleLabel =
    preview.scope === 'platform'
      ? (preview.platformRole ? PLATFORM_ROLE_LABEL[preview.platformRole] : '')
      : (preview.role ? ROLE_LABEL[preview.role] : '');

  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', padding: 24 }}>
      <div style={{ width: 360, display: 'grid', gap: 16 }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Vrotta Prop 360</h1>
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
            Te invitaron a <strong style={{ color: 'var(--fg)' }}>{orgLabel}</strong> como{' '}
            <strong style={{ color: 'var(--fg)' }}>{roleLabel}</strong>, para <code>{preview.email}</code>.
          </p>
        </div>
        <InviteAccept
          token={token}
          invitationEmail={preview.email}
          sessionEmail={session?.email ?? null}
          scope={preview.scope}
          role={preview.role}
        />
      </div>
    </main>
  );
}
