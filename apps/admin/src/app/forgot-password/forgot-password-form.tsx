'use client';

import Link from 'next/link';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client.ts';
import { translateAuthError } from '@/lib/auth/errors.ts';
import { AuthBanner } from '@/components/auth/auth-banner.tsx';

/**
 * El mensaje de éxito es el mismo exista o no la cuenta: Supabase ya se
 * comporta así (no filtra qué correos están registrados) y repetirlo acá
 * evita que el panel sea el que termine revelándolo.
 */
export function ForgotPasswordForm({ mock }: { mock: boolean }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (mock) {
    return (
      <AuthBanner tone="info">
        Modo mock activo (<code>NEXT_PUBLIC_R360_MOCK=1</code>). No hay contraseñas que recuperar: entrá directo
        desde <Link href="/login">/login</Link>.
      </AuthBanner>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState('sending');
    setError(null);
    try {
      const { error: authError } = await supabaseBrowser().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/reset-password')}`,
      });
      if (authError) throw new Error(translateAuthError(authError.message));
      setState('sent');
    } catch (cause) {
      setState('idle');
      setError(cause instanceof Error ? cause.message : 'No pude enviar el correo.');
    }
  }

  if (state === 'sent') {
    return (
      <p className="auth-status-line">
        Si <strong>{email}</strong> tiene una cuenta, le llegó un enlace para elegir una contraseña nueva. Abrilo
        desde este mismo navegador.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="auth-form">
      {error && <AuthBanner tone="danger">{error}</AuthBanner>}
      <div className="auth-field">
        <label htmlFor="email" className="auth-field-label">
          Correo
        </label>
        <input
          id="email"
          className="r-input"
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vos@estudio.com"
        />
      </div>
      <button type="submit" className="r-btn" data-variant="primary" disabled={state === 'sending'}>
        {state === 'sending' ? 'Enviando…' : 'Enviarme un enlace'}
      </button>
      <span className="auth-field-link">
        <Link href="/login">Volver a iniciar sesión</Link>
      </span>
    </form>
  );
}
