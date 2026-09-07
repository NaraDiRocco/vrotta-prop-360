'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import {
  Building2,
  FolderKanban,
  Home,
  Images,
  Inbox,
  LayoutGrid,
  Network,
  Table2,
  UploadCloud,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Actor, Membership, ProjectRef, TenantRef } from '@/lib/data/types.ts';
import type { Density } from '@/lib/density.ts';
import {
  canEditStructure,
  canInviteTenantUsers,
  canManagePlatformTeam,
  canManageScenes,
  canPublish,
  canViewMaterial,
  isPlatform,
} from '@/lib/roles.ts';
import { TenantSwitcher } from '../tenant-switcher.tsx';
import { ProjectSwitcher } from './project-switcher.tsx';
import { UserMenu } from './user-menu.tsx';
import { useDrawer } from './shell-state.tsx';

interface NavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
  show: boolean;
  /** `true` = activo sólo con coincidencia exacta (índices de sección). */
  exact?: boolean;
}

/** Un ítem de navegación. El activo se marca con `aria-current="page"`. */
function Item({ item, sub }: { item: NavItem; sub?: boolean }) {
  const pathname = usePathname();
  const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <li className={sub ? 'shell-sub' : undefined}>
      <Link href={item.href} className="shell-item" aria-current={active ? 'page' : undefined}>
        <span className="shell-icon">
          <item.Icon size={17} strokeWidth={active ? 2 : 1.75} aria-hidden />
        </span>
        <span className="shell-item-label">{item.label}</span>
      </Link>
    </li>
  );
}

/**
 * El sidebar único: los cuatro niveles de "¿dónde estoy?" en una sola columna.
 *
 *   0. el cliente (cabecera, con conmutador)
 *   1. las secciones del cliente
 *   2. el proyecto, sólo cuando se está adentro de uno
 *   3. la persona (pie, con el menú de usuario)
 *
 * Reemplaza al rail de 64px, a la barra de proyecto de 220px y a la banda azul
 * de "Operando como Vrotta": cuatro señales para la misma pregunta, 484px de
 * cromo horizontal en Unidades. Ahora son 240 (o 64 colapsado).
 *
 * El grupo del proyecto entra y sale con la ruta, sin animación de aparición:
 * está o no está, como un breadcrumb. Nada que aparezca y desaparezca solo.
 */
export function SidebarNav({
  scope,
  actor,
  actorLabel,
  tenant,
  memberships,
  allTenants,
  canCreateTenant,
  project,
  projects,
  email,
  defaultDensity,
  mock,
}: {
  scope: 'tenant' | 'platform';
  actor: Actor;
  actorLabel: string;
  tenant?: TenantRef;
  memberships: Membership[];
  allTenants?: TenantRef[];
  canCreateTenant?: boolean;
  project?: ProjectRef;
  projects: ProjectRef[];
  email: string;
  defaultDensity: Density;
  mock: boolean;
}) {
  const { narrow, drawerOpen, setDrawerOpen, menuButtonRef } = useDrawer();
  const asideRef = useRef<HTMLElement | null>(null);
  const platform = isPlatform(actor);

  // Cajón abierto: el foco no sale de acá con Tab y Esc lo cierra devolviendo
  // el foco al botón que lo abrió. Sólo mientras es cajón — de 900 para
  // arriba el sidebar es una columna más de la página y atrapar el foco ahí
  // sería un error.
  useEffect(() => {
    if (!narrow || !drawerOpen) return;
    const aside = asideRef.current;
    if (!aside) return;

    const focusables = () =>
      Array.from(
        aside.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => el.offsetParent !== null);

    focusables()[0]?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setDrawerOpen(false);
        menuButtonRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const activo = document.activeElement as HTMLElement | null;
      if (event.shiftKey && (activo === first || !aside!.contains(activo))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activo === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [narrow, drawerOpen, setDrawerOpen, menuButtonRef]);

  const tenantSlug = tenant?.slug ?? '';
  const sections: NavItem[] =
    scope === 'platform'
      ? [
          { href: '/admin', label: 'Clientes', Icon: Building2, show: true, exact: true },
          { href: '/admin/team', label: 'Equipo de Vrotta', Icon: Users, show: canManagePlatformTeam(actor) },
        ]
      : [
          // Dentro de un proyecto, "Proyectos" deja de marcarse: el activo lo
          // lleva el ítem del grupo de abajo y dos `aria-current="page"` a la
          // vez es exactamente lo que un lector de pantalla no puede resolver.
          { href: `/t/${tenantSlug}/p`, label: 'Proyectos', Icon: LayoutGrid, show: true, exact: Boolean(project) },
          { href: `/t/${tenantSlug}/leads`, label: 'Leads', Icon: Inbox, show: true },
          { href: `/t/${tenantSlug}/team`, label: 'Equipo', Icon: Users, show: canInviteTenantUsers(actor) },
        ];

  const base = project ? `/t/${tenantSlug}/p/${project.slug}` : '';
  const projectItems: NavItem[] = project
    ? [
        { href: base, label: 'Resumen', Icon: Home, show: true, exact: true },
        { href: `${base}/units`, label: 'Unidades', Icon: Table2, show: true },
        { href: `${base}/structure`, label: 'Estructura', Icon: Network, show: canEditStructure(actor) },
        { href: `${base}/scenes`, label: 'Escenas', Icon: Images, show: canManageScenes(actor) },
        { href: `${base}/material`, label: 'Material', Icon: FolderKanban, show: canViewMaterial(actor) },
        { href: `${base}/publish`, label: 'Publicar', Icon: UploadCloud, show: canPublish(actor) },
      ]
    : [];

  const currentMembership: Membership | undefined = tenant
    ? {
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        tenantName: tenant.name,
        role: actor.kind === 'tenant' ? actor.role : 'owner',
      }
    : undefined;

  return (
    <aside
      ref={asideRef}
      id="shell-sidebar"
      className="shell-side"
      // Cerrado y fuera de pantalla no debería ser tabulable: `inert` lo saca
      // del orden de foco y del árbol de accesibilidad de una sola vez.
      {...(narrow && !drawerOpen ? { inert: true } : {})}
    >
      <div className="shell-side-head">
        <TenantSwitcher
          scope={scope}
          current={currentMembership}
          memberships={memberships.length > 0 ? memberships : currentMembership ? [currentMembership] : []}
          allTenants={allTenants}
          canCreateTenant={canCreateTenant}
          platform={platform}
          actorLabel={actorLabel}
        />
      </div>
      <div className="shell-sep" />

      <nav aria-label="Navegación principal" className="shell-side-scroll">
        <ul>
          {sections.filter((i) => i.show).map((item) => (
            <Item key={item.href} item={item} />
          ))}
        </ul>

        {project && tenant && (
          <section aria-label={`Proyecto ${project.name}`}>
            <div className="shell-group-head">
              <span className="shell-group-kicker">Proyecto</span>
            </div>
            <ProjectSwitcher tenant={tenant.slug} current={project} projects={projects} />
            <ul>
              {projectItems.filter((i) => i.show).map((item) => (
                <Item key={item.href} item={item} sub />
              ))}
            </ul>
          </section>
        )}

        <div style={{ flex: 1 }} />

        {/* "Clientes" no es una sección del cliente: es la puerta de salida
            hacia todos. Por eso va abajo y separado por un divisor. */}
        {platform && scope === 'tenant' && (
          <>
            <div className="shell-sep" style={{ margin: '4px 0' }} />
            <ul>
              <Item item={{ href: '/admin', label: 'Clientes', Icon: Building2, show: true, exact: true }} />
            </ul>
          </>
        )}
      </nav>

      <div className="shell-sep" />
      <div className="shell-side-foot">
        <UserMenu
          email={email}
          roleLabel={actorLabel}
          {...(platform && tenant ? { tenantName: tenant.name } : {})}
          platform={platform}
          defaultDensity={defaultDensity}
          mock={mock}
        />
      </div>
    </aside>
  );
}
