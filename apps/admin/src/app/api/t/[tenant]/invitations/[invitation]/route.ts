/**
 * Una invitación puntual del equipo de una inmobiliaria. DELETE revoca
 * (`revoked_at`, la fila queda para mostrarse tachada); POST reenvía (token
 * nuevo, vencimiento nuevo, e intenta mandar el mail otra vez).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { resolveTenantActor } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { canInviteTenantUsers } from '@/lib/roles.ts';
import type { InvitationRow } from '@/lib/data/types.ts';

export interface ResendInvitationResponse {
  invitation: InvitationRow;
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
      error: NextResponse.json({ error: 'Sólo el Administrador de la inmobiliaria gestiona invitaciones.' }, { status: 403 }),
    };
  }
  return { ok: true as const };
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ tenant: string; invitation: string }> }) {
  const { tenant, invitation } = await ctx.params;
  const check = await requireManage(tenant);
  if (!check.ok) return check.error;

  try {
    await getRepo().revokeInvitation(tenant, invitation);
    return NextResponse.json({ ok: true });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'No pude revocarla.' }, { status: 400 });
  }
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ tenant: string; invitation: string }> }) {
  const { tenant, invitation } = await ctx.params;
  const check = await requireManage(tenant);
  if (!check.ok) return check.error;

  try {
    const repo = getRepo();
    const { invitation: row, link } = await repo.resendInvitation(tenant, invitation);

    const origin = request.nextUrl.origin;
    const absoluteLink = `${origin}${link}`;
    const redirectUrl = `${origin}/auth/callback?next=${encodeURIComponent(link)}`;
    const email = await repo.sendInvitationEmail(row.email, redirectUrl);

    return NextResponse.json({ invitation: row, link: absoluteLink, email } satisfies ResendInvitationResponse);
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'No pude reenviarla.' }, { status: 400 });
  }
}
