/**
 * Un miembro puntual del equipo de una inmobiliaria (`memberships`). PATCH
 * cambia rol y/o los proyectos asignados (esto último sólo importa para
 * `sales`, ver `membership_projects`); DELETE lo saca del equipo.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { resolveTenantActor } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { canInviteTenantUsers } from '@/lib/roles.ts';
import type { Role } from '@/lib/data/types.ts';

const TENANT_ROLES: Role[] = ['owner', 'editor', 'sales'];

function isTenantRole(v: unknown): v is Role {
  return typeof v === 'string' && TENANT_ROLES.includes(v as Role);
}

export interface UpdateMemberBody {
  role?: Role;
  projectIds?: string[];
}

async function requireManage(tenantSlug: string) {
  const resolved = await resolveTenantActor(tenantSlug);
  if (!resolved) return { ok: false as const, error: NextResponse.json({ error: 'Sin sesión' }, { status: 401 }) };
  if (!resolved.actor) return { ok: false as const, error: NextResponse.json({ error: 'No encontrado' }, { status: 404 }) };
  if (!canInviteTenantUsers(resolved.actor)) {
    return {
      ok: false as const,
      error: NextResponse.json({ error: 'Sólo el Administrador de la inmobiliaria gestiona el equipo.' }, { status: 403 }),
    };
  }
  return { ok: true as const, session: resolved.session };
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ tenant: string; user: string }> }) {
  const { tenant, user } = await ctx.params;
  const check = await requireManage(tenant);
  if (!check.ok) return check.error;

  let body: UpdateMemberBody;
  try {
    body = (await request.json()) as UpdateMemberBody;
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }

  if (body.role !== undefined && !isTenantRole(body.role)) {
    return NextResponse.json({ error: 'Rol inválido.', field: 'role' }, { status: 400 });
  }
  const projectIds = body.projectIds !== undefined
    ? (Array.isArray(body.projectIds) ? body.projectIds.filter((v) => typeof v === 'string') : [])
    : undefined;

  try {
    await getRepo().updateTenantMember(tenant, user, { role: body.role, projectIds });
    return NextResponse.json({ ok: true });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'No pude actualizarlo.' }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ tenant: string; user: string }> }) {
  const { tenant, user } = await ctx.params;
  const check = await requireManage(tenant);
  if (!check.ok) return check.error;

  if (user === check.session.id) {
    return NextResponse.json({ error: 'No podés sacarte a vos mismo del equipo.' }, { status: 400 });
  }

  try {
    await getRepo().removeTenantMember(tenant, user);
    return NextResponse.json({ ok: true });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'No pude sacarlo.' }, { status: 400 });
  }
}
