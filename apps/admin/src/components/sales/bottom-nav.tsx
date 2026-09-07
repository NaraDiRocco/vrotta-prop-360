'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, LayoutGrid, MessageSquare } from 'lucide-react';
import type { ComponentType } from 'react';

/** Tres destinos. Ni uno más: se opera con el pulgar, parado en la obra. */
export function BottomNav({ tenant, project }: { tenant: string; project: string }) {
  const pathname = usePathname();
  const base = `/s/t/${tenant}/${project}`;
  const items: { href: string; label: string; icon: ComponentType<{ size?: number; strokeWidth?: number }>; exact: boolean }[] = [
    { href: `${base}/units`, label: 'Unidades', icon: LayoutGrid, exact: false },
    { href: `${base}/leads`, label: 'Consultas', icon: MessageSquare, exact: false },
    // Exacto: si no, "Proyectos" queda activo en todas las pantallas, porque
    // toda la ruta del shell empieza con /s/t/<tenant>.
    { href: `/s/t/${tenant}`, label: 'Proyectos', icon: Building2, exact: true },
  ];

  return (
    <nav
      aria-label="Navegación"
      style={{
        display: 'flex',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        flex: 'none',
      }}
    >
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            style={{
              flex: 1,
              minHeight: 52,
              display: 'grid',
              placeItems: 'center',
              gap: 1,
              color: active ? 'var(--accent)' : 'var(--fg-muted)',
              fontSize: '0.6875rem',
              fontWeight: active ? 600 : 400,
            }}
          >
            <Icon size={20} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
