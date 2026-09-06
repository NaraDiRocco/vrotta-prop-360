'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { InvitationScope, Role } from '@/lib/data/types.ts';
import type { AcceptInvitationResponse } from '@/app/api/invitations/[token]/accept/route.ts';

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
      <a className="r-btn" data-variant="primary" href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>
        Iniciar sesión para aceptar
      </a>
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
      <div style={{ display: 'grid', gap: 8 }}>
        <p style={{ fontSize: 12, color: 'var(--danger)', lineHeight: 1.5 }}>
          Esta invitación es para <strong>{invitationEmail}</strong>, y tu sesión actual es{' '}
          <strong>{sessionEmail}</strong>. No es transferible: cerrá sesión e iniciá sesión con esa cuenta para
          aceptarla.
        </p>
        <a className="r-btn" data-variant="ghost" href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>
          Iniciar sesión con otra cuenta
        </a>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <button type="button" className="r-btn" data-variant="primary" disabled={busy} onClick={() => void accept()}>
        {busy ? 'Aceptando…' : 'Aceptar invitación'}
      </button>
      {error && <p style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</p>}
    </div>
  );
}
