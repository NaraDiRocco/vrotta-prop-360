'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ChevronsUpDown, KeyRound, LogOut, Monitor, Moon, Rows2, Rows3, Sun } from 'lucide-react';
import { applyTheme, readStoredTheme, type Theme } from '@/lib/theme.ts';
import { applyDensity, readStoredDensity, type Density } from '@/lib/density.ts';
import { supabaseBrowser } from '@/lib/supabase/client.ts';

/**
 * El pie del sidebar: quién sos, y lo único que se puede hacer con eso.
 *
 * Antes esto no existía. El rol aparecía como texto de 9px en `--fg-faint`
 * (2.6:1, por debajo de AA) y no había en todo el panel un lugar para verse a
 * uno mismo, cambiar la contraseña ni cerrar sesión — literalmente no se podía
 * salir. Acá el rol va en `--fg-muted` a `--text-sm`, y el popover junta las
 * cuatro cosas que son de la persona y no del cliente: tema, densidad,
 * contraseña y salida.
 *
 * Tema y densidad se aplican con las mismas funciones que usa el bootstrap del
 * layout (`applyTheme`/`applyDensity`), así que el cambio es inmediato, sin
 * recarga, y sobrevive a F5 sin parpadeo.
 */
export function UserMenu({
  email,
  roleLabel,
  tenantName,
  platform,
  defaultDensity,
  mock,
}: {
  email: string;
  roleLabel: string;
  /** El cliente que se está operando, si hay alguno. */
  tenantName?: string;
  platform: boolean;
  /** Default por rol, para cuando la persona todavía no eligió densidad. */
  defaultDensity: Density;
  /** En modo demo no hay sesión de Supabase que cerrar. */
  mock: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>('light');
  const [density, setDensity] = useState<Density>(defaultDensity);
  const [signingOut, setSigningOut] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);

  // El valor real ya lo aplicaron los scripts inline del layout antes del
  // primer pintado; acá sólo se sincroniza el estado de React al montar para
  // que las marcas del menú coincidan sin mismatch de hidratación.
  useEffect(() => {
    setTheme(readStoredTheme());
    setDensity(readStoredDensity(defaultDensity));
  }, [defaultDensity]);

  useEffect(() => {
    if (!open) return;
    function onDocDown(event: MouseEvent) {
      if (!hostRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pickTheme(next: Theme) {
    applyTheme(next);
    setTheme(next);
  }

  function pickDensity(next: Density) {
    applyDensity(next);
    setDensity(next);
  }

  async function signOut() {
    setSigningOut(true);
    if (!mock) {
      try {
        await supabaseBrowser().auth.signOut();
      } catch {
        /* si el cliente de Supabase no está configurado igual hay que salir */
      }
    }
    // Recarga completa a propósito: la sesión vive en cookies leídas por el
    // servidor, y `router.push` reusaría el árbol cacheado del usuario viejo.
    window.location.href = '/login';
  }

  const initial = email.slice(0, 1).toUpperCase();

  return (
    <div ref={hostRef} className="shell-pop-host">
      <button
        type="button"
        className="shell-row-btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Sesión de ${email}, ${roleLabel}. Abrir el menú de usuario`}
        style={{ background: open ? 'var(--bg-hover)' : undefined }}
      >
        <span className="shell-avatar shell-avatar-person">{initial}</span>
        <span className="shell-row-main shell-hide-collapsed">
          <span className="shell-row-title" style={{ fontWeight: 400 }}>
            {email}
          </span>
          <span className="shell-row-sub">{roleLabel}</span>
        </span>
        <ChevronsUpDown size={13} strokeWidth={2} className="shell-hide-collapsed" style={{ flex: 'none', color: 'var(--fg-muted)' }} aria-hidden />
      </button>

      {open && (
        <div role="menu" aria-label="Menú de usuario" className="shell-pop" style={{ bottom: 'calc(100% + 4px)', left: 0 }}>
          <div className="shell-pop-head">
            <div style={{ color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</div>
            <div>
              {platform && tenantName ? `Operando en ${tenantName} como ${roleLabel}` : roleLabel}
            </div>
          </div>

          <div className="shell-menu-sep" />

          <div className="shell-pop-head" id="shell-theme-label">
            Tema
          </div>
          <div role="group" aria-labelledby="shell-theme-label">
            <button type="button" role="menuitemradio" aria-checked={theme === 'light'} className="shell-menuitem" onClick={() => pickTheme('light')}>
              <Sun size={14} strokeWidth={1.75} aria-hidden />
              Claro
            </button>
            <button type="button" role="menuitemradio" aria-checked={theme === 'dark'} className="shell-menuitem" onClick={() => pickTheme('dark')}>
              <Moon size={14} strokeWidth={1.75} aria-hidden />
              Oscuro
            </button>
          </div>

          <div className="shell-pop-head" id="shell-density-label">
            Densidad
          </div>
          <div role="group" aria-labelledby="shell-density-label">
            <button
              type="button"
              role="menuitemradio"
              aria-checked={density === 'compact'}
              className="shell-menuitem"
              onClick={() => pickDensity('compact')}
              title="Filas de 32px: más filas por pantalla"
            >
              <Rows3 size={14} strokeWidth={1.75} aria-hidden />
              Compacta
            </button>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={density === 'comfortable'}
              className="shell-menuitem"
              onClick={() => pickDensity('comfortable')}
              title="Filas de 40px: texto y blancos de click más grandes"
            >
              <Rows2 size={14} strokeWidth={1.75} aria-hidden />
              Cómoda
            </button>
          </div>

          <div className="shell-menu-sep" />

          <Link href="/forgot-password" role="menuitem" className="shell-menuitem" onClick={() => setOpen(false)}>
            <KeyRound size={14} strokeWidth={1.75} aria-hidden />
            Cambiar contraseña
          </Link>
          <button type="button" role="menuitem" className="shell-menuitem" onClick={signOut} disabled={signingOut}>
            <LogOut size={14} strokeWidth={1.75} aria-hidden />
            {signingOut ? 'Saliendo…' : 'Cerrar sesión'}
          </button>

          {mock && (
            <div className="shell-pop-head" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Monitor size={12} strokeWidth={1.75} aria-hidden />
              Modo demo: no hay sesión real que cerrar.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
