import Link from 'next/link';
import { getSession } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { PLATFORM_ROLE_LABEL, ROLE_LABEL } from '@/lib/roles.ts';
import { buildContactLinks } from '@/lib/onboarding/contact.ts';
import { AuthLayout } from '@/components/auth/auth-layout.tsx';
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
 * Antes esa pantalla no ofrecía ninguna acción; ahora siempre ofrece dos:
 * pedir una invitación nueva y, para quien ya tiene cuenta, entrar directo.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [session, preview] = await Promise.all([getSession(), getRepo().resolveInvitationByToken(token)]);

  if (!preview) {
    const links = buildContactLinks({
      email: process.env['R360_CONTACT_EMAIL'],
      whatsapp: process.env['R360_CONTACT_WHATSAPP'],
    });
    return (
      <AuthLayout title="Esta invitación ya no sirve" contactFooter={false}>
        <p className="auth-status-line">
          Puede haber vencido, haber sido revocada, o ya haberse usado. No hay forma de reactivarla, pero tenés dos
          caminos:
        </p>
        <div className="auth-actions">
          {links.map((link, index) => (
            <a key={link.href} className="r-btn" data-variant={index === 0 ? 'primary' : 'secondary'} href={link.href}>
              Pedir una invitación nueva · {link.label}
            </a>
          ))}
          {links.length === 0 && (
            <p className="auth-field-hint">
              Pedile a quien te invitó (tu inmobiliaria, o Vrotta) que te mande una invitación nueva.
            </p>
          )}
          <Link href="/login" className="r-btn" data-variant="ghost">
            Ya tengo cuenta → Entrar
          </Link>
        </div>
      </AuthLayout>
    );
  }

  const orgLabel = preview.scope === 'platform' ? 'Vrotta' : (preview.tenantName ?? 'tu inmobiliaria');
  const roleLabel =
    preview.scope === 'platform'
      ? (preview.platformRole ? PLATFORM_ROLE_LABEL[preview.platformRole] : '')
      : (preview.role ? ROLE_LABEL[preview.role] : '');
  const initial = orgLabel.trim().charAt(0).toUpperCase() || '?';

  return (
    <AuthLayout title="Aceptá tu invitación">
      <div className="auth-invite-summary">
        <span className="auth-invite-avatar" aria-hidden="true">
          {initial}
        </span>
        <p className="auth-invite-copy">
          <strong>{orgLabel}</strong> te invita como <strong>{roleLabel}</strong>, para{' '}
          <span className="auth-invite-email">{preview.email}</span>.
        </p>
      </div>
      <InviteAccept
        token={token}
        invitationEmail={preview.email}
        sessionEmail={session?.email ?? null}
        scope={preview.scope}
        role={preview.role}
      />
    </AuthLayout>
  );
}
