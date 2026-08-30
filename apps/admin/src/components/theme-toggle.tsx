'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { applyTheme, readStoredTheme, type Theme } from '@/lib/theme.ts';

/**
 * Toggle claro/oscuro al pie del rail. El valor real ya lo aplicó el script
 * inline del layout antes del primer pintado; acá sólo se sincroniza el estado
 * de React después de montar, para que el ícono coincida sin causar mismatch
 * de hidratación.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(readStoredTheme());
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  }

  const dark = mounted && theme === 'dark';
  const label = dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      aria-pressed={dark}
      style={{
        width: 32,
        height: 28,
        display: 'grid',
        placeItems: 'center',
        border: '1px solid transparent',
        borderRadius: 'var(--radius-control)',
        background: 'transparent',
        color: 'var(--fg-faint)',
        cursor: 'pointer',
      }}
    >
      {dark ? <Sun size={15} strokeWidth={1.75} aria-hidden /> : <Moon size={15} strokeWidth={1.75} aria-hidden />}
    </button>
  );
}
