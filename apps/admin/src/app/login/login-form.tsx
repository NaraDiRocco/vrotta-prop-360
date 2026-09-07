'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client.ts';
import { translateAuthError } from '@/lib/auth/errors.ts';
import { PLATFORM_ROLE_LABEL, ROLE_LABEL } from '@/lib/roles.ts';
import { AuthBanner } from '@/components/auth/auth-banner.tsx';
import { PasswordField } from '@/components/auth/password-field.tsx';

/** Etiqueta del actor de mock, para que el login no mienta sobre quién es. */
function mockActorLabel(): string {
  switch (process.env['NEXT_PUBLIC_R360_MOCK_ACTOR']) {
    case 'platform_admin':
      return PLATFORM_ROLE_LABEL.admin;
    case 'platform_operator':
      return PLATFORM_ROLE_LABEL.operator;
    case 'editor':
      return ROLE_LABEL.editor;
    case 'sales':
      return ROLE_LABEL.sales;
    default:
      return ROLE_LABEL.owner;
  }
}

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
      <>
        <AuthBanner tone="info">
          Modo mock activo (<code>NEXT_PUBLIC_R360_MOCK=1</code>). No hay autenticación: entrás como{' '}
          <strong>{mockActorLabel()}</strong> ({process.env['NEXT_PUBLIC_R360_MOCK_ACTOR'] ?? 'owner'}).
        </AuthBanner>
        <button type="button" className="r-btn" data-variant="primary" onClick={() => router.push(next)}>
          Entrar
        </button>
      </>
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
    return (
      <p className="auth-status-line">
        Te mandé un enlace a <strong>{email}</strong>. Abrilo desde este mismo navegador.
      </p>
    );
  }

  if (mode === 'magic') {
    return (
      <form onSubmit={submitMagicLink} className="auth-form">
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
    <form onSubmit={submitPassword} className="auth-form">
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
      <PasswordField
        id="password"
        label="Contraseña"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••"
        labelExtra={
          <Link href="/forgot-password" className="auth-field-link">
            ¿La olvidaste?
          </Link>
        }
      />
      <button type="submit" className="r-btn" data-variant="primary" disabled={state === 'sending'}>
        {state === 'sending' ? 'Entrando…' : 'Entrar'}
      </button>
      <div className="auth-actions-row">
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
        <Link href="/signup" className="auth-field-link">
          ¿No tenés acceso? Pedilo
        </Link>
      </div>
    </form>
  );
}
