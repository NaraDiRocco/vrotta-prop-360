import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Actor, ProjectRef, TenantRef } from '@/lib/data/types.ts';
import { isMockMode } from '@/lib/data/repo.ts';
import { Sidebar } from './shell/sidebar.tsx';
import { ShellStyles } from './shell/shell-styles.tsx';
import { ShellProvider, SidebarBackdrop, SidebarMenuButton, SidebarToggle } from './shell/shell-state.tsx';

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Shell del panel: UN sidebar de 240px (colapsable a 64) + header con
 * breadcrumb navegable. Nada de wizards ni de paneles que aparecen y
 * desaparecen: lo opera gente que necesita que las cosas estén siempre en el
 * mismo lugar.
 *
 * Antes había cuatro señales simultáneas de "dónde estoy": una banda azul de
 * 22px ("Operando como Vrotta en X"), el avatar del cliente, el breadcrumb y
 * el rol en 9px al pie del rail — 484px de cromo horizontal en Unidades, y
 * aun así ningún lugar para verse a uno mismo ni cerrar sesión. Ahora hay una
 * sola columna con los cuatro niveles (cliente / secciones / proyecto /
 * persona), la banda no existe (el "operando como Vrotta" es un distintivo en
 * el avatar y una línea del popover) y el menú de usuario existe.
 *
 * Recibe `actor` (quién opera) y `tenant` (en cuyo contexto): todo lo que
 * decide qué mostrar pasa por `roles.ts`, nunca por comparar `membership.role`
 * a mano. Sin `tenant` el shell entra en modo plataforma (`/admin`), que antes
 * quedaba afuera del shell y parecía otra aplicación.
 */
export async function AppShell({
  actor,
  tenant,
  crumbs,
  project,
  actions,
  fill,
  children,
}: {
  actor: Actor;
  /** La inmobiliaria en cuyo contexto se está parado. Ausente = `/admin`. */
  tenant?: TenantRef;
  crumbs: Crumb[];
  project?: ProjectRef;
  actions?: ReactNode;
  /** La pantalla maneja su propio scroll (tablas virtualizadas). */
  fill?: boolean;
  children: ReactNode;
}) {
  return (
    <ShellProvider>
      <ShellStyles />
      <div className="shell-root">
        <div className="shell-body">
          <SidebarBackdrop />
          <Sidebar actor={actor} {...(tenant ? { tenant } : {})} {...(project ? { project } : {})} />

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <header className="shell-header">
              <SidebarToggle />
              <SidebarMenuButton />

              {/* El breadcrumb decía "Baleia / Baleia / Unidades" cuando el
                  cliente y su proyecto se llaman igual. El prefijo de tipo
                  ("cliente", "complejo") distingue los dos niveles sin sumar
                  una línea; se deriva acá para que ninguna página tenga que
                  cambiar cómo arma sus crumbs. */}
              <ol className="shell-crumbs">
                {crumbs.map((crumb, i) => {
                  const type =
                    tenant && crumb.label === tenant.name && i === 0
                      ? 'cliente'
                      : project && crumb.label === project.name
                        ? project.kind
                        : null;
                  return (
                    <li key={`${crumb.label}-${i}`} className="shell-crumb">
                      {i > 0 && <span style={{ color: 'var(--fg-faint)' }}>/</span>}
                      {crumb.href ? (
                        <Link href={crumb.href} style={{ color: 'var(--fg-muted)' }}>
                          {crumb.label}
                        </Link>
                      ) : (
                        <span style={{ fontWeight: 600 }}>{crumb.label}</span>
                      )}
                      {type && <span className="shell-crumb-type">· {type}</span>}
                    </li>
                  );
                })}
              </ol>

              {isMockMode() && (
                <span
                  title="NEXT_PUBLIC_R360_MOCK=1 — datos del seed en memoria, sin Supabase"
                  style={{
                    flex: 'none',
                    fontSize: 'var(--text-xs)',
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
    </ShellProvider>
  );
}
