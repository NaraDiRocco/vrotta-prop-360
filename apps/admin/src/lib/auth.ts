import { notFound, redirect } from 'next/navigation';
import { getRepo } from './data/index.ts';
import { platformActor, tenantActor } from './roles.ts';
import type { Actor, Membership, PlatformRole, SessionUser, TenantRef } from './data/types.ts';

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
