'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Inbox, LayoutGrid } from 'lucide-react';

/**
 * Rail de secciones: icono + etiqueta permanente y estado activo visible.
 *
 * Las etiquetas no son decoración: con tres glyphs Unicode sin texto no había
 * forma de saber qué era cada cosa sin hover secuencial, ni en qué sección se
 * estaba parado. Iconos de Lucide en lugar de glyphs porque a 15px un ▤ se
 * dibuja distinto en cada plataforma.
 */
export function RailNav({ tenant }: { tenant: string }) {
  const pathname = usePathname();
  const items = [
    { href: `/t/${tenant}/p`, label: 'Proyectos', Icon: LayoutGrid },
    { href: `/t/${tenant}/leads`, label: 'Leads', Icon: Inbox },
  ];

  return (
    <ul style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%', padding: '0 4px' }}>
      {items.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? 'page' : undefined}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                height: 46,
                borderRadius: 6,
                color: active ? 'var(--accent)' : 'var(--fg-muted)',
                background: active ? 'var(--bg-sel)' : 'transparent',
                fontSize: 10,
                fontWeight: active ? 600 : 400,
                lineHeight: 1,
              }}
            >
              <Icon size={17} strokeWidth={active ? 2 : 1.75} aria-hidden />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
