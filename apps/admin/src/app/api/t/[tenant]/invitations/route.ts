/**
 * Invitaciones del equipo de UNA inmobiliaria (`scope='tenant'`). Sólo
 * Administrador (owner) o cualquier Vrotta Admin (`canInviteTenantUsers`).
 *
 * Un Administrador SÓLO puede invitar roles de su propia inmobiliaria
 * (owner/editor/sales): esta ruta ni siquiera acepta un campo de rol de
 * plataforma en el cuerpo, así que no hay forma de colarlo — la RLS de la
 * migración 0020 lo repite del lado de la base (la policy de insert para
 * `scope='platform'` exige `auth_is_platform_admin()`, y esta ruta nunca
 * inserta con ese scope).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { resolveTenantActor } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { canInviteTenantUsers } from '@/lib/roles.ts';
import type { InvitationRow, Role } from '@/lib/data/types.ts';

const TENANT_ROLES: Role[] = ['owner', 'editor', 'sales'];

function isTenantRole(v: unknown): v is Role {
  return typeof v === 'string' && TENANT_ROLES.includes(v as Role);
}

export interface CreateInvitationBody {
  email: string;
  role: Role;
  /** Sólo tiene efecto para `role: 'sales'`. Vacío = sin restricción. */
  projectIds?: string[];
}

export interface InvitationsResponse {
  invitations: InvitationRow[];
}

export interface CreateInvitationResponse {
  invitation: InvitationRow;
  /** URL absoluta lista para copiar y mandar por WhatsApp. */
  link: string;
  email: { sent: boolean; reason?: string };
}

async function requireManage(tenantSlug: string) {
  const resolved = await resolveTenantActor(tenantSlug);
  if (!resolved) return { ok: false as const, error: NextResponse.json({ error: 'Sin sesión' }, { status: 401 }) };
  if (!resolved.actor) return { ok: false as const, error: NextResponse.json({ error: 'No encontrado' }, { status: 404 }) };
  if (!canInviteTenantUsers(resolved.actor)) {
    return {
      ok: false as const,
      error: NextResponse.json({ error: 'Sólo el Administrador de la inmobiliaria invita gente.' }, { status: 403 }),
    };
  }
  return { ok: true as const, session: resolved.session };
}

export async function GET(_request: NextRequest, ctx: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await ctx.params;
  const check = await requireManage(tenant);
  if (!check.ok) return check.error;

  const invitations = await getRepo().listTenantInvitations(tenant);
  return NextResponse.json({ invitations } satisfies InvitationsResponse);
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await ctx.params;
  const check = await requireManage(tenant);
  if (!check.ok) return check.error;

  let body: CreateInvitationBody;
  try {
    body = (await request.json()) as CreateInvitationBody;
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }

  const email = String(body.email ?? '').trim();
  if (email.length === 0 || !email.includes('@')) {
    return NextResponse.json({ error: 'Email inválido.', field: 'email' }, { status: 400 });
  }
  if (!isTenantRole(body.role)) {
    return NextResponse.json({ error: 'Rol inválido.', field: 'role' }, { status: 400 });
  }
  const projectIds = Array.isArray(body.projectIds) ? body.projectIds.filter((v) => typeof v === 'string') : [];

  try {
    const repo = getRepo();
    const { invitation, link } = await repo.createTenantInvitation(
      tenant,
      { email, role: body.role, projectIds },
      check.session.id,
    );

    const origin = request.nextUrl.origin;
    const absoluteLink = `${origin}${link}`;
    const redirectUrl = `${origin}/auth/callback?next=${encodeURIComponent(link)}`;
    const email_ = await repo.sendInvitationEmail(invitation.email, redirectUrl);

    return NextResponse.json(
      { invitation, link: absoluteLink, email: email_ } satisfies CreateInvitationResponse,
      { status: 201 },
    );
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'No pude crear la invitación.' },
      { status: 400 },
    );
  }
}
