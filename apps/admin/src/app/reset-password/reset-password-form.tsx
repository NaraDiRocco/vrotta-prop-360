'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client.ts';
import { translateAuthError } from '@/lib/auth/errors.ts';
import { checkNewPassword } from '@/lib/auth/password.ts';
import { AuthBanner } from '@/components/auth/auth-banner.tsx';
import { PasswordField } from '@/components/auth/password-field.tsx';

/**
 * Se llega acá desde `/auth/callback` con una sesión de recuperación ya
 * canjeada (cookie puesta por el server). Si no hay sesión — enlace vencido,
 * ya usado, o alguien entrando directo a la URL — no tiene sentido mostrar
 * el formulario: se manda a pedir un enlace nuevo.
 */
export function ResetPasswordForm({ mock }: { mock: boolean }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mock) return;
    supabaseBrowser()
      .auth.getUser()
      .then(({ data }) => {
        setHasSession(data.user !== null);
        setReady(true);
      });
  }, [mock]);

  if (mock) {
    return (
      <AuthBanner tone="info">
        Modo mock activo (<code>NEXT_PUBLIC_R360_MOCK=1</code>). No hay contraseñas que cambiar: entrá directo desde{' '}
        <Link href="/login">/login</Link>.
      </AuthBanner>
    );
  }

  if (!ready) return null;

  if (!hasSession) {
    return (
      <div className="auth-actions">
        <AuthBanner tone="danger">Este enlace venció o ya se usó.</AuthBanner>
        <Link href="/forgot-password" className="r-btn" data-variant="primary">
          Pedir un enlace nuevo
        </Link>
      </div>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const check = checkNewPassword(password, confirmation);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setState('sending');
    try {
      const { error: authError } = await supabaseBrowser().auth.updateUser({ password });
      if (authError) throw new Error(translateAuthError(authError.message));
      setState('done');
    } catch (cause) {
      setState('idle');
      setError(cause instanceof Error ? cause.message : 'No pude cambiar la contraseña.');
    }
  }

  if (state === 'done') {
    return (
      <div className="auth-actions">
        <AuthBanner tone="ok">Listo, tu contraseña cambió.</AuthBanner>
        <button type="button" className="r-btn" data-variant="primary" onClick={() => router.push('/')}>
          Entrar al panel
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="auth-form">
      {error && <AuthBanner tone="danger">{error}</AuthBanner>}
      <PasswordField
        id="password"
        label="Contraseña nueva"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••"
        hint="Mínimo 8 caracteres, con letras y números."
        autoFocus
      />
      <PasswordField
        id="confirmation"
        label="Repetirla"
        value={confirmation}
        onChange={(e) => setConfirmation(e.target.value)}
        placeholder="••••••••"
      />
      <button type="submit" className="r-btn" data-variant="primary" disabled={state === 'sending'}>
        {state === 'sending' ? 'Guardando…' : 'Guardar contraseña'}
      </button>
    </form>
  );
}
