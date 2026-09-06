'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client.ts';
import { translateAuthError } from '@/lib/auth/errors.ts';
import { checkNewPassword } from '@/lib/auth/password.ts';

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
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
        <p>
          Modo mock activo (<code>NEXT_PUBLIC_R360_MOCK=1</code>). No hay contraseñas que cambiar: entrá
          directo desde <Link href="/login">/login</Link>.
        </p>
      </div>
    );
  }

  if (!ready) return null;

  if (!hasSession) {
    return (
      <p>
        Este enlace venció o ya se usó. Pedí uno nuevo desde{' '}
        <Link href="/forgot-password">recuperar contraseña</Link>.
      </p>
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
      <div style={{ display: 'grid', gap: 8 }}>
        <p>Listo, contraseña cambiada.</p>
        <button type="button" className="r-btn" data-variant="primary" onClick={() => router.push('/')}>
          Entrar al panel
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 8 }}>
      <label htmlFor="password" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
        Contraseña nueva
      </label>
      <input
        id="password"
        className="r-input"
        type="password"
        required
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Mínimo 8 caracteres, con letras y números"
      />
      <label htmlFor="confirmation" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
        Repetirla
      </label>
      <input
        id="confirmation"
        className="r-input"
        type="password"
        required
        value={confirmation}
        onChange={(e) => setConfirmation(e.target.value)}
        placeholder="••••••••"
      />
      <button type="submit" className="r-btn" data-variant="primary" disabled={state === 'sending'}>
        {state === 'sending' ? 'Guardando…' : 'Guardar contraseña'}
      </button>
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
    </form>
  );
}
