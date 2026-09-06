import { notFound, redirect } from 'next/navigation';
import { getRepo } from './data/index.ts';
import { platformActor, tenantActor } from './roles.ts';
import type { Actor, Membership, PlatformRole, ProjectRow, SessionUser, TenantRef } from './data/types.ts';

export {
  canEditStructure,
  canPublish,
  PLATFORM_ROLE_LABEL,
  ROLE_LABEL,
} from './roles.ts';

export async function getSession(): Promise<SessionUser | null> {
  return getRepo().getSession();
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}

export interface TenantContext {
  session: SessionUser;
  /** La inmobiliaria en cuyo contexto se está operando. */
  tenant: TenantRef;
  /** Quién opera: alguien de Vrotta, o un miembro de esta inmobiliaria. */
  actor: Actor;
  /**
   * COMPATIBILIDAD, no autorización. El chrome del panel (AppShell,
   * TenantSwitcher) todavía recibe una `Membership`; para un usuario de
   * plataforma acá se sintetiza una, con el tenant que se está operando.
   * Para decidir permisos usar SIEMPRE `actor`: esta membership sintética
   * dice 'owner' y mentiría. P2 la elimina cuando el chrome pase a `actor`.
   */
  membership: Membership;
}

export interface PlatformContext {
  session: SessionUser;
  role: PlatformRole;
  actor: Actor;
}

/**
 * El tenant viaja en la URL (`/t/[tenant]/...`), no en cookie: así se pueden
 * tener abiertas en paralelo pestañas de dos clientes distintos sin que una
 * pise el contexto de la otra.
 *
 * Alguien de Vrotta no tiene membership en ningún tenant: para él el tenant
 * se resuelve por slug contra la base (la RLS de 0019 le devuelve todos).
 */
export async function requireTenant(tenantSlug: string): Promise<TenantContext> {
  const session = await requireSession();

  if (session.platformRole) {
    const tenants = await getRepo().listTenants();
    const tenant = tenants.find((t) => t.slug === tenantSlug);
    if (!tenant) notFound();
    return {
      session,
      tenant,
      actor: platformActor(session.platformRole),
      membership: {
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        tenantName: tenant.name,
        role: 'owner',
      },
    };
  }

  const membership = session.memberships.find((m) => m.tenantSlug === tenantSlug);
  if (!membership) notFound();
  return {
    session,
    tenant: { id: membership.tenantId, slug: membership.tenantSlug, name: membership.tenantName },
    actor: tenantActor(membership.role),
    membership,
  };
}

/**
 * Guard de rol. `sales` nunca entra al panel: se lo manda al shell móvil, que
 * es una aplicación distinta, no este panel con botones apagados.
 */
export async function requireAdmin(tenantSlug: string): Promise<TenantContext> {
  const ctx = await requireTenant(tenantSlug);
  if (ctx.actor.kind === 'tenant' && ctx.actor.role === 'sales') redirect(`/s/t/${tenantSlug}`);
  return ctx;
}

/**
 * Para las pantallas que sólo existen para el equipo de Vrotta (/admin y
 * derivadas). Un usuario de inmobiliaria recibe un 404, no un 403: no tiene
 * por qué enterarse de que esas pantallas existen.
 */
export async function requirePlatform(): Promise<PlatformContext> {
  const session = await requireSession();
  if (!session.platformRole) notFound();
  return { session, role: session.platformRole, actor: platformActor(session.platformRole) };
}

/** Alta y baja de clientes, equipo de Vrotta, borrados. */
export async function requirePlatformAdmin(): Promise<PlatformContext> {
  const ctx = await requirePlatform();
  if (ctx.role !== 'admin') notFound();
  return ctx;
}

/**
 * Resultado de resolver a quién representa la sesión frente a UN tenant
 * puntual, para una ruta API. `actor` es null cuando el usuario no tiene
 * ninguna relación con ese tenant (ni membership, ni plataforma): la ruta
 * decide si eso es un 403 o un 404, según cuánto quiera revelar.
 */
export interface TenantActorLookup {
  session: SessionUser;
  actor: Actor | null;
}

/**
 * Variante de `requireTenant` para route handlers (`POST /api/...`), no para
 * páginas. `requireTenant`/`requireAdmin` usan `redirect()`/`notFound()`, que
 * dentro de un handler de API terminan devolviéndole HTML de una redirección
 * a un `fetch()` del panel en vez de un JSON con el código que corresponde —
 * el bug que cierra esta función (ver P2b en publish/create). Nunca redirige:
 * devuelve `null` si no hay sesión, o `actor: null` si la hay pero el tenant
 * no existe o el usuario no tiene relación con él.
 */
export async function resolveTenantActor(tenantSlug: string): Promise<TenantActorLookup | null> {
  const session = await getSession();
  if (!session) return null;

  if (session.platformRole) {
    const tenants = await getRepo().listTenants();
    const exists = tenants.some((t) => t.slug === tenantSlug);
    return { session, actor: exists ? platformActor(session.platformRole) : null };
  }

  const membership = session.memberships.find((m) => m.tenantSlug === tenantSlug);
  return { session, actor: membership ? tenantActor(membership.role) : null };
}

/**
 * Misma idea que `resolveTenantActor`, pero resolviendo el tenant a partir
 * del proyecto: para publish/revert y cualquier otra ruta que sólo tenga el
 * `project_id` en la URL. El chequeo tiene que ser contra el tenant DUEÑO de
 * ESE proyecto — nunca contra cualquier membership del usuario, porque ser
 * owner de OTRO tenant no alcanza (y alguien de Vrotta no tiene ninguna).
 * Devuelve `'sin-proyecto'` en vez de `null` para que la ruta pueda
 * distinguir "no hay sesión" (401) de "el proyecto no existe" (404).
 */
export async function resolveProjectActor(
  projectId: string,
): Promise<(TenantActorLookup & { project: ProjectRow }) | 'sin-proyecto' | null> {
  const session = await getSession();
  if (!session) return null;

  const project = await getRepo().getProjectById(projectId);
  if (!project) return 'sin-proyecto';

  if (session.platformRole) {
    return { session, project, actor: platformActor(session.platformRole) };
  }

  const membership = session.memberships.find((m) => m.tenantId === project.tenantId);
  return { session, project, actor: membership ? tenantActor(membership.role) : null };
}

/**
 * Resultado de resolver el rol de plataforma de la sesión, para una ruta API.
 */
export interface PlatformActorLookup {
  session: SessionUser;
  role: PlatformRole;
  actor: Actor;
}

/**
 * Variante de `requirePlatform` para route handlers (`/api/admin/*`). Mismo
 * motivo que `resolveTenantActor`/`resolveProjectActor`: `requirePlatform` usa
 * `notFound()`, que en un Route Handler renderiza el 404 de PÁGINA (HTML), no
 * un JSON — el mismo bug de `redirect()` con otro nombre. Devuelve `null` si
 * no hay sesión o el usuario no es de plataforma; la ruta decide el status.
 */
export async function resolvePlatformActor(): Promise<PlatformActorLookup | null> {
  const session = await getSession();
  if (!session || !session.platformRole) return null;
  return { session, role: session.platformRole, actor: platformActor(session.platformRole) };
}
