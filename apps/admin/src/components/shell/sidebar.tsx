import { actorLabel, canCreateTenant, isPlatform } from '@/lib/roles.ts';
import { getSession } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { isMockMode } from '@/lib/data/repo.ts';
import { defaultDensityForSession } from '@/lib/density.ts';
import type { Actor, ProjectRef, TenantRef } from '@/lib/data/types.ts';
import { SidebarNav } from './sidebar-nav.tsx';

/**
 * Envoltorio de servidor del sidebar: junta todo lo que el sidebar necesita
 * saber y se lo pasa serializado a `SidebarNav`, que es de cliente porque
 * marca el activo con `usePathname` y maneja el cajón.
 *
 * Está separado de `AppShell` para que el shell no se llene de consultas: acá
 * y sólo acá se decide qué datos hacen falta para dibujar la navegación.
 */
export async function Sidebar({
  actor,
  tenant,
  project,
}: {
  actor: Actor;
  /** Ausente = pantallas de plataforma (`/admin`), donde todavía no hay cliente. */
  tenant?: TenantRef;
  project?: ProjectRef;
}) {
  const platform = isPlatform(actor);
  const session = await getSession();

  // La lista de clientes del operador ya viaja en la sesión; el conmutador de
  // un usuario de inmobiliaria no necesita datos nuevos. Para un actor de
  // plataforma, en cambio, hace falta TODA la lista de clientes (la RLS de
  // 0019 se la cascadea) — sin esto el conmutador le seguiría mostrando uno solo.
  const memberships = session?.memberships.filter((m) => m.role !== 'sales') ?? [];
  const allTenants = platform ? await getRepo().listTenants() : undefined;

  // Los proyectos hermanos sólo hacen falta cuando ya se está dentro de uno:
  // es lo que alimenta el conmutador del nivel 2. `listProjectRefs` trae
  // slug/nombre/tipo y nada más (ver el porqué en `ProjectRef`).
  const projects = project && tenant ? await getRepo().listProjectRefs(tenant.slug) : [];

  return (
    <SidebarNav
      scope={tenant ? 'tenant' : 'platform'}
      actor={actor}
      actorLabel={actorLabel(actor)}
      {...(tenant ? { tenant } : {})}
      memberships={memberships}
      {...(allTenants ? { allTenants } : {})}
      {...(platform ? { canCreateTenant: canCreateTenant(actor) } : {})}
      {...(project ? { project } : {})}
      projects={projects}
      email={session?.email ?? ''}
      defaultDensity={defaultDensityForSession(session)}
      mock={isMockMode()}
    />
  );
}
