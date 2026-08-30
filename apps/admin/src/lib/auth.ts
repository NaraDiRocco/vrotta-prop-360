import { notFound, redirect } from 'next/navigation';
import { getRepo } from './data/index.ts';
import type { Membership, SessionUser } from './data/types.ts';

export { canEditStructure, canPublish, ROLE_LABEL } from './roles.ts';

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
  membership: Membership;
}

/**
 * El tenant viaja en la URL (`/t/[tenant]/...`), no en cookie: así se pueden
 * tener abiertas en paralelo pestañas de dos clientes distintos sin que una
 * pise el contexto de la otra.
 */
export async function requireTenant(tenantSlug: string): Promise<TenantContext> {
  const session = await requireSession();
  const membership = session.memberships.find((m) => m.tenantSlug === tenantSlug);
  if (!membership) notFound();
  return { session, membership };
}

/**
 * Guard de rol. `sales` nunca entra al panel: se lo manda al shell móvil, que
 * es una aplicación distinta, no este panel con botones apagados.
 */
export async function requireAdmin(tenantSlug: string): Promise<TenantContext> {
  const ctx = await requireTenant(tenantSlug);
  if (ctx.membership.role === 'sales') redirect(`/s/t/${tenantSlug}`);
  return ctx;
}
