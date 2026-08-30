import Link from 'next/link';
import type { ReactNode } from 'react';
import { ROLE_LABEL } from '@/lib/roles.ts';
import type { Membership } from '@/lib/data/types.ts';
import { isMockMode } from '@/lib/data/repo.ts';
import { ProjectNav } from './project-nav.tsx';

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Shell del panel: rail de 56px + header con breadcrumb navegable + barra de
 * proyecto de 220px colapsable. Nada de wizards ni de paneles que aparecen y
 * desaparecen: lo opera una persona que va a estar acá ocho horas por día y
 * necesita que las cosas estén siempre en el mismo lugar.
 */
export function AppShell({
  membership,
  crumbs,
  project,
  actions,
  fill,
  children,
}: {
  membership: Membership;
  crumbs: Crumb[];
  project?: { slug: string; name: string; kind: string };
  actions?: ReactNode;
  /** La pantalla maneja su propio scroll (tablas virtualizadas). */
  fill?: boolean;
  children: ReactNode;
}) {
  const tenant = membership.tenantSlug;
  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden' }}>
      <nav
        aria-label="Secciones"
        style={{
          width: 56,
          flex: 'none',
          borderRight: '1px solid var(--border)',
          background: 'var(--bg-subtle)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 8,
          gap: 4,
        }}
      >
        <Link
          href={`/t/${tenant}/p`}
          title={membership.tenantName}
          style={{
            width: 32,
            height: 32,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 7,
            background: 'var(--accent)',
            color: 'var(--accent-fg)',
            fontWeight: 700,
            fontSize: 13,
            marginBottom: 8,
          }}
        >
          {membership.tenantName.slice(0, 2).toUpperCase()}
        </Link>
        <RailLink href={`/t/${tenant}/p`} label="Proyectos" glyph="▤" />
        <RailLink href={`/t/${tenant}/leads`} label="Leads" glyph="✉" />
        <div style={{ flex: 1 }} />
        <span
          title={`${membership.tenantName} · ${ROLE_LABEL[membership.role]}`}
          style={{ fontSize: 10, color: 'var(--fg-faint)', paddingBottom: 8, writingMode: 'vertical-rl' }}
        >
          {ROLE_LABEL[membership.role]}
        </span>
      </nav>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header
          style={{
            height: 40,
            flex: 'none',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 10px',
          }}
        >
          <ol style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
            {crumbs.map((crumb, i) => (
              <li key={`${crumb.label}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                {i > 0 && <span style={{ color: 'var(--fg-faint)' }}>/</span>}
                {crumb.href ? (
                  <Link href={crumb.href} style={{ color: 'var(--fg-muted)' }}>
                    {crumb.label}
                  </Link>
                ) : (
                  <span style={{ fontWeight: 600 }}>{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
          {isMockMode() && (
            <span
              title="NEXT_PUBLIC_R360_MOCK=1 — datos del seed en memoria, sin Supabase"
              style={{
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 4,
                border: '1px solid var(--warn)',
                color: 'var(--warn)',
              }}
            >
              MOCK
            </span>
          )}
          {actions}
        </header>

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {project && <ProjectNav tenant={tenant} project={project} role={membership.role} />}
          <main style={{ flex: 1, minWidth: 0, overflow: fill ? 'hidden' : 'auto', display: fill ? 'flex' : undefined }}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

function RailLink({ href, label, glyph }: { href: string; label: string; glyph: string }) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      style={{
        width: 36,
        height: 32,
        display: 'grid',
        placeItems: 'center',
        borderRadius: 6,
        color: 'var(--fg-muted)',
        fontSize: 15,
      }}
    >
      {glyph}
    </Link>
  );
}
