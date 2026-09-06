'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client.ts';
import { translateAuthError } from '@/lib/auth/errors.ts';
import { checkNewPassword } from '@/lib/auth/password.ts';

/**
 * Alta de cuenta. El camino natural después de registrarse es crear el
 * tenant (`/t/new`), así que el `emailRedirectTo` del signup ya apunta ahí:
 * confirmás el correo y caés directo en "nuevo cliente", sin pasar por login
 * de nuevo.
 */
export function SignupForm({ mock }: { mock: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (mock) {
    return (
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
        <p>
          Modo mock activo (<code>NEXT_PUBLIC_R360_MOCK=1</code>). No hay registro: entrá directo desde{' '}
          <Link href="/login">/login</Link>.
        </p>
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
      const next = '/t/new';
      const { data, error: authError } = await supabaseBrowser().auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (authError) throw new Error(translateAuthError(authError.message));
      if (data.session) {
        // Confirmación de email deshabilitada: ya hay sesión, se puede seguir.
        router.push(next);
        router.refresh();
        return;
      }
      setState('sent');
    } catch (cause) {
      setState('idle');
      setError(cause instanceof Error ? cause.message : 'No pude crear la cuenta.');
    }
  }

  if (state === 'sent') {
    return (
      <p>
        Te mandamos un correo a <strong>{email}</strong> para confirmar la cuenta. Abrilo desde este mismo
        navegador y vas a caer directo en la creación de tu cliente.
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
      <label htmlFor="password" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
        Contraseña
      </label>
      <input
        id="password"
        className="r-input"
        type="password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Mínimo 8 caracteres, con letras y números"
      />
      <label htmlFor="confirmation" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
        Repetir contraseña
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
        {state === 'sending' ? 'Creando cuenta…' : 'Crear cuenta'}
      </button>
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
        ¿Ya tenés cuenta? <Link href="/login">Iniciá sesión</Link>
      </span>
    </form>
  );
}
