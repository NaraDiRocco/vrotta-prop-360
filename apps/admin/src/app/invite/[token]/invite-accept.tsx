'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { InvitationScope, Role } from '@/lib/data/types.ts';
import type { AcceptInvitationResponse } from '@/app/api/invitations/[token]/accept/route.ts';
import { AuthBanner } from '@/components/auth/auth-banner.tsx';

/**
 * Botón de aceptar + los tres estados que importa distinguir ANTES de
 * apretarlo: sin sesión (hay que loguearse primero, sin perder el token de
 * la URL), sesión con OTRO email (la invitación no es transferible: se
 * avisa acá para no hacer esperar el error del servidor) y sesión correcta
 * (aceptar de una).
 */
export function InviteAccept({
  token,
  invitationEmail,
  sessionEmail,
  scope,
  role,
}: {
  token: string;
  invitationEmail: string;
  sessionEmail: string | null;
  scope: InvitationScope;
  role: Role | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!sessionEmail) {
    return (
      <div className="auth-actions">
        <a className="r-btn" data-variant="primary" href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>
          Iniciar sesión para aceptar
        </a>
        {/* Con magic link, "todavía no tengo cuenta" y "ya tengo cuenta" son el
            mismo botón: Supabase crea la cuenta en el primer inicio de sesión. */}
        <p className="auth-field-hint">
          ¿Todavía no tenés cuenta? Es el mismo botón: iniciá sesión con {invitationEmail} y te la creamos en el
          momento.
        </p>
      </div>
    );
  }

  const wrongEmail = sessionEmail.trim().toLowerCase() !== invitationEmail.trim().toLowerCase();

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/invitations/${token}/accept`, { method: 'POST' });
      const payload = (await res.json()) as AcceptInvitationResponse & { error?: string };
      if (!res.ok) throw new Error(payload.error ?? 'No pude aceptar la invitación.');

      if (payload.scope === 'platform') {
        router.push('/admin');
      } else if (payload.tenantSlug) {
        router.push(scope === 'tenant' && role === 'sales' ? `/s/t/${payload.tenantSlug}` : `/t/${payload.tenantSlug}/p`);
      } else {
        router.push('/');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pude aceptar la invitación.');
      setBusy(false);
    }
  }

  if (wrongEmail) {
    return (
      <div className="auth-actions">
        <AuthBanner tone="warn">
          Esta invitación es para <strong>{invitationEmail}</strong>, y tu sesión actual es{' '}
          <strong>{sessionEmail}</strong>. No es transferible.
        </AuthBanner>
        <a className="r-btn" data-variant="primary" href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>
          Iniciar sesión con otra cuenta
        </a>
      </div>
    );
  }

  return (
    <div className="auth-actions">
      {error && <AuthBanner tone="danger">{error}</AuthBanner>}
      <button type="button" className="r-btn" data-variant="primary" disabled={busy} onClick={() => void accept()}>
        {busy ? 'Aceptando…' : 'Aceptar invitación'}
      </button>
    </div>
  );
}
