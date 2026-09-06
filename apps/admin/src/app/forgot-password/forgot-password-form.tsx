'use client';

import Link from 'next/link';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client.ts';
import { translateAuthError } from '@/lib/auth/errors.ts';

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
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
        <p>
          Modo mock activo (<code>NEXT_PUBLIC_R360_MOCK=1</code>). No hay contraseñas que recuperar: entrá
          directo desde <Link href="/login">/login</Link>.
        </p>
      </div>
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
      <p>
        Si <strong>{email}</strong> tiene una cuenta, le llegó un enlace para elegir una contraseña nueva.
        Abrilo desde este mismo navegador.
      </p>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 8 }}>
      <label htmlFor="email" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
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
      <button type="submit" className="r-btn" data-variant="primary" disabled={state === 'sending'}>
        {state === 'sending' ? 'Enviando…' : 'Enviarme un enlace'}
      </button>
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
        <Link href="/login">Volver a iniciar sesión</Link>
      </span>
    </form>
  );
}
