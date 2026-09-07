'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogOut } from 'lucide-react';

/**
 * Cabecera del selector de proyectos del shell de ventas: hoy no decía de
 * qué inmobiliaria era, quién estaba operando, ni cómo salir (hallazgo del
 * diagnóstico). No depende del menú de usuario del panel (`components/shell/*`,
 * de la Ola 1.B, todavía sin terminar): resuelve "salir" acá mismo con lo
 * que ya existe — `supabaseBrowser().auth.signOut()` en modo real, o un
 * simple link a `/login` en modo mock, donde no hay sesión real que cerrar
 * (la actuación la decide `NEXT_PUBLIC_R360_MOCK_ACTOR`, no una cookie).
 *
 * Cuando el menú de usuario compartido exista, esta cabecera puede
 * reemplazar el botón de salir por ese menú sin tocar el resto del shell.
 */
export function SalesHeader({
  tenantName,
  actorLabel,
  email,
  mock,
}: {
  tenantName: string;
  actorLabel: string;
  email: string;
  mock: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut(): Promise<void> {
    setPending(true);
    if (!mock) {
      const { supabaseBrowser } = await import('@/lib/supabase/client.ts');
      await supabaseBrowser().auth.signOut();
    }
    router.push('/login');
  }

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 12px',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong
          style={{
            display: 'block',
            fontSize: '1.0625rem',
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {tenantName}
        </strong>
        <span
          style={{
            display: 'block',
            fontSize: '0.75rem',
            color: 'var(--fg-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {actorLabel} · {email}
        </span>
      </div>
      <button
        type="button"
        className="r-btn"
        onClick={() => void signOut()}
        disabled={pending}
        aria-label="Cerrar sesión"
        style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', flex: 'none' }}
      >
        <LogOut size={18} strokeWidth={1.75} aria-hidden />
      </button>
    </header>
  );
}
