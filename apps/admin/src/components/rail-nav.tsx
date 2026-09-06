'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, Inbox, LayoutGrid } from 'lucide-react';
import type { Actor } from '@/lib/data/types.ts';
import { isPlatform } from '@/lib/roles.ts';

/**
 * Rail de secciones: icono + etiqueta permanente y estado activo visible.
 *
 * Las etiquetas no son decoración: con tres glyphs Unicode sin texto no había
 * forma de saber qué era cada cosa sin hover secuencial, ni en qué sección se
 * estaba parado. Iconos de Lucide en lugar de glyphs porque a 15px un ▤ se
 * dibuja distinto en cada plataforma.
 *
 * Para un actor de plataforma se suma "Clientes", que vuelve a `/admin`: es
 * la puerta de salida de "estoy operando dentro de un cliente puntual" hacia
 * "estoy viendo todos los clientes".
 */
export function RailNav({ tenant, actor }: { tenant: string; actor: Actor }) {
  const pathname = usePathname();
  const items = [
    { href: `/t/${tenant}/p`, label: 'Proyectos', Icon: LayoutGrid, show: true },
    { href: `/t/${tenant}/leads`, label: 'Leads', Icon: Inbox, show: true },
    { href: '/admin', label: 'Clientes', Icon: Building2, show: isPlatform(actor) },
  ].filter((item) => item.show);

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
