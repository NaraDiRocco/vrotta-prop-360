'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, FolderKanban, Home, Images, Network, Table2, UploadCloud, type LucideIcon } from 'lucide-react';
import type { Role } from '@/lib/data/types.ts';
import { canEditStructure } from '@/lib/roles.ts';

const STORAGE_KEY = 'r360.projectnav.collapsed';

/** Barra de proyecto de 220px. Colapsable, y recuerda el estado por navegador. */
export function ProjectNav({
  tenant,
  project,
  role,
}: {
  tenant: string;
  project: { slug: string; name: string; kind: string };
  role: Role;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      /* navegador sin storage: se queda abierta */
    }
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignorar */
      }
      return next;
    });
  }

  const base = `/t/${tenant}/p/${project.slug}`;
  const items: { href: string; label: string; Icon: LucideIcon; show: boolean }[] = [
    { href: base, label: 'Resumen', Icon: Home, show: true },
    { href: `${base}/units`, label: 'Unidades', Icon: Table2, show: true },
    { href: `${base}/structure`, label: 'Estructura', Icon: Network, show: canEditStructure(role) },
    { href: `${base}/scenes`, label: 'Escenas', Icon: Images, show: canEditStructure(role) },
    { href: `${base}/material`, label: 'Material', Icon: FolderKanban, show: canEditStructure(role) },
    { href: `${base}/publish`, label: 'Publicar', Icon: UploadCloud, show: role === 'owner' },
  ];

  return (
    <nav
      aria-label={`Proyecto ${project.name}`}
      style={{
        width: collapsed ? 44 : 220,
        flex: 'none',
        borderRight: '1px solid var(--border)',
        background: 'var(--bg-subtle)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 6px 6px 10px', minWidth: 0 }}>
        {!collapsed && (
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {project.name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{project.kind}</div>
          </div>
        )}
        <button
          type="button"
          className="r-btn"
          data-variant="ghost"
          onClick={toggle}
          title={collapsed ? 'Expandir' : 'Colapsar'}
          style={{ width: 26, height: 26, padding: 0, justifyContent: 'center' }}
        >
          {collapsed ? <ChevronRight size={14} strokeWidth={2} aria-hidden /> : <ChevronLeft size={14} strokeWidth={2} aria-hidden />}
        </button>
      </div>

      <ul style={{ padding: '4px 6px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {items
          .filter((i) => i.show)
          .map((item) => {
            const active = item.href === base ? pathname === base : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={item.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    height: 28,
                    padding: '0 8px',
                    borderRadius: 5,
                    color: active ? 'var(--accent)' : 'var(--fg-muted)',
                    background: active ? 'var(--bg-sel)' : 'transparent',
                    fontWeight: active ? 600 : 400,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ width: 14, display: 'grid', placeItems: 'center', flex: 'none' }}>
                    <item.Icon size={14} strokeWidth={active ? 2 : 1.75} aria-hidden />
                  </span>
                  {!collapsed && item.label}
                </Link>
              </li>
            );
          })}
      </ul>
    </nav>
  );
}
