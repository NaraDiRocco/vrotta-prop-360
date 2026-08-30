import Link from 'next/link';
import type { ReactNode } from 'react';
import { ROLE_LABEL } from '@/lib/roles.ts';
import { getSession } from '@/lib/auth.ts';
import type { Membership } from '@/lib/data/types.ts';
import { isMockMode } from '@/lib/data/repo.ts';
import { ProjectNav } from './project-nav.tsx';
import { RailNav } from './rail-nav.tsx';
import { TenantSwitcher } from './tenant-switcher.tsx';
import { ThemeToggle } from './theme-toggle.tsx';

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Shell del panel: rail de 64px + header con breadcrumb navegable + barra de
 * proyecto de 220px colapsable. Nada de wizards ni de paneles que aparecen y
 * desaparecen: lo opera una persona que va a estar acá ocho horas por día y
 * necesita que las cosas estén siempre en el mismo lugar.
 *
 * El rail lleva icono + etiqueta y marca la sección activa. Los 8px extra
 * respecto de los 56 anteriores son exactamente eso: el lugar de la etiqueta.
 * No se convierte en sidebar ancho — el ancho de la pantalla es de la tabla.
 */
export async function AppShell({
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
  // La lista de clientes del operador ya viaja en la sesión; el conmutador no
  // necesita datos nuevos.
  const session = await getSession();
  const memberships = session?.memberships.filter((m) => m.role !== 'sales') ?? [membership];

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden' }}>
      <nav
        aria-label="Secciones"
        style={{
          width: 64,
          flex: 'none',
          borderRight: '1px solid var(--border)',
          background: 'var(--bg-subtle)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 6,
          gap: 6,
        }}
      >
        <TenantSwitcher current={membership} memberships={memberships.length > 0 ? memberships : [membership]} />
        <div style={{ width: '100%', height: 1, background: 'var(--border)' }} />
        <RailNav tenant={tenant} />

        <div style={{ flex: 1 }} />

        <div style={{ width: '100%', height: 1, background: 'var(--border)' }} />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            paddingBottom: 6,
          }}
        >
          <ThemeToggle />
          <span
            title={`${membership.tenantName} · ${ROLE_LABEL[membership.role]}`}
            style={{ fontSize: 9, color: 'var(--fg-faint)' }}
          >
            {ROLE_LABEL[membership.role]}
          </span>
        </div>
      </nav>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header
          style={{
            height: 40,
            flex: 'none',
            background: 'var(--bg)',
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
                border: '1px solid var(--ui-warn-border)',
                background: 'var(--ui-warn-bg)',
                color: 'var(--ui-warn)',
              }}
            >
              MOCK
            </span>
          )}
          {actions}
        </header>

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {project && <ProjectNav tenant={tenant} project={project} role={membership.role} />}
          <main
            style={{
              flex: 1,
              minWidth: 0,
              // Las pantallas de tabla pintan su propia superficie blanca; el
              // resto vive sobre el lienzo gris.
              background: fill ? 'var(--bg)' : 'var(--bg-canvas)',
              overflow: fill ? 'hidden' : 'auto',
              display: fill ? 'flex' : undefined,
            }}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
