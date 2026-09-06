'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client.ts';
import { translateAuthError } from '@/lib/auth/errors.ts';

/**
 * Dos formas de entrar, no dos formularios compitiendo: por defecto se ve
 * contraseña (lo que usa la mayoría, la mayor parte de las veces) y un solo
 * link chico cambia a magic link (para quien todavía no puso contraseña, o
 * la olvidó y no quiere pasar por "olvidé mi contraseña"). Nunca se ven los
 * dos formularios a la vez.
 */
export function LoginForm({
  next,
  mock,
  initialError,
}: {
  next: string;
  mock: boolean;
  initialError?: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'password' | 'magic'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(initialError ?? null);

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

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault();
    setState('sending');
    setError(null);
    try {
      const { error: authError } = await supabaseBrowser().auth.signInWithPassword({ email, password });
      if (authError) throw new Error(translateAuthError(authError.message));
      router.push(next);
      router.refresh();
    } catch (cause) {
      setState('idle');
      setError(cause instanceof Error ? cause.message : 'No pude iniciar sesión.');
    }
  }

  async function submitMagicLink(event: React.FormEvent) {
    event.preventDefault();
    setState('sending');
    setError(null);
    try {
      const { error: authError } = await supabaseBrowser().auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (authError) throw new Error(translateAuthError(authError.message));
      setState('sent');
    } catch (cause) {
      setState('idle');
      setError(cause instanceof Error ? cause.message : 'No pude enviar el enlace.');
    }
  }

  if (state === 'sent') {
    return <p>Te mandé un enlace a <strong>{email}</strong>. Abrilo desde este mismo navegador.</p>;
  }

  if (mode === 'magic') {
    return (
      <form onSubmit={submitMagicLink} style={{ display: 'grid', gap: 8 }}>
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
        <button
          type="button"
          className="r-btn"
          data-variant="ghost"
          onClick={() => {
            setError(null);
            setMode('password');
          }}
        >
          Usar contraseña
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submitPassword} style={{ display: 'grid', gap: 8 }}>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <label htmlFor="password" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
          Contraseña
        </label>
        <Link href="/forgot-password" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
          ¿La olvidaste?
        </Link>
      </div>
      <input
        id="password"
        className="r-input"
        type="password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••"
      />
      <button type="submit" className="r-btn" data-variant="primary" disabled={state === 'sending'}>
        {state === 'sending' ? 'Entrando…' : 'Entrar'}
      </button>
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
        <button
          type="button"
          className="r-btn"
          data-variant="ghost"
          onClick={() => {
            setError(null);
            setMode('magic');
          }}
        >
          Usar enlace mágico
        </button>
        <Link href="/signup" style={{ color: 'var(--fg-muted)', alignSelf: 'center' }}>
          Crear cuenta
        </Link>
      </div>
    </form>
  );
}
