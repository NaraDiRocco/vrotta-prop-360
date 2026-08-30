'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client.ts';

/**
 * Magic link. No hay contraseña que resetear ni que filtrar, y el fundador
 * entra desde tres máquinas distintas.
 */
export function LoginForm({ next, mock }: { next: string; mock: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (mock) {
    return (
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
        <p style={{ marginBottom: 10 }}>
          Modo mock activo (<code>NEXT_PUBLIC_R360_MOCK=1</code>). No hay autenticación: entrás como
          dueño del tenant <strong>baleia</strong>.
        </p>
        <button type="button" className="r-btn" data-variant="primary" onClick={() => router.push(next)}>
          Entrar
        </button>
      </div>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState('sending');
    setError(null);
    try {
      const { error: authError } = await supabaseBrowser().auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (authError) throw new Error(authError.message);
      setState('sent');
    } catch (cause) {
      setState('idle');
      setError(cause instanceof Error ? cause.message : 'No pude enviar el enlace.');
    }
  }

  if (state === 'sent') {
    return <p>Te mandé un enlace a <strong>{email}</strong>. Abrilo desde este mismo navegador.</p>;
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
    </form>
  );
}
