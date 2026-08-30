'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Tres destinos. Ni uno más: se opera con el pulgar, parado en la obra. */
export function BottomNav({ tenant, project }: { tenant: string; project: string }) {
  const pathname = usePathname();
  const base = `/s/t/${tenant}/${project}`;
  const items = [
    { href: `${base}/units`, label: 'Unidades', glyph: '▤', exact: false },
    { href: `${base}/leads`, label: 'Consultas', glyph: '✉', exact: false },
    // Exacto: si no, "Proyectos" queda activo en todas las pantallas, porque
    // toda la ruta del shell empieza con /s/t/<tenant>.
    { href: `/s/t/${tenant}`, label: 'Proyectos', glyph: '◎', exact: true },
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
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              flex: 1,
              minHeight: 52,
              display: 'grid',
              placeItems: 'center',
              gap: 1,
              color: active ? 'var(--accent)' : 'var(--fg-muted)',
              fontSize: 11,
              fontWeight: active ? 600 : 400,
            }}
          >
            <span style={{ fontSize: 17 }}>{item.glyph}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
