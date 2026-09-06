/**
 * Equipo de Vrotta (`platform_members`). Sólo Vrotta Admin.
 *
 * POST suma a alguien que YA tiene cuenta (busca por email, ver
 * `addPlatformMember` en el repo): invitar a alguien sin cuenta es el
 * sistema de invitaciones (P2c), que todavía no existe. PATCH cambia el rol,
 * DELETE saca a alguien del equipo.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { resolvePlatformActor, type PlatformActorLookup } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { canManagePlatformTeam } from '@/lib/roles.ts';
import type { PlatformMemberRow } from '@/lib/data/types.ts';

export interface AddTeamMemberBody {
  email: string;
  role: 'admin' | 'operator';
}

export interface UpdateTeamMemberBody {
  userId: string;
  role: 'admin' | 'operator';
}

export interface TeamMembersResponse {
  members: PlatformMemberRow[];
}

function isPlatformRole(v: unknown): v is 'admin' | 'operator' {
  return v === 'admin' || v === 'operator';
}

type ManageCheck = { ok: true; resolved: PlatformActorLookup } | { ok: false; error: NextResponse };

async function requireManage(): Promise<ManageCheck> {
  const resolved = await resolvePlatformActor();
  if (!resolved) return { ok: false, error: NextResponse.json({ error: 'Sin sesión' }, { status: 401 }) };
  if (!canManagePlatformTeam(resolved.actor)) {
    return { ok: false, error: NextResponse.json({ error: 'Sólo Vrotta Admin gestiona el equipo.' }, { status: 403 }) };
  }
  return { ok: true, resolved };
}

export async function GET() {
  const check = await requireManage();
  if (!check.ok) return check.error;
  const members = await getRepo().listPlatformMembers();
  return NextResponse.json({ members } satisfies TeamMembersResponse);
}

export async function POST(request: NextRequest) {
  const check = await requireManage();
  if (!check.ok) return check.error;

  let body: AddTeamMemberBody;
  try {
    body = (await request.json()) as AddTeamMemberBody;
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }

  const email = String(body.email ?? '').trim();
  if (email.length === 0) return NextResponse.json({ error: 'Falta el email.' }, { status: 400 });
  if (!isPlatformRole(body.role)) return NextResponse.json({ error: 'Rol inválido.' }, { status: 400 });

  try {
    const member = await getRepo().addPlatformMember(email, body.role);
    return NextResponse.json({ member }, { status: 201 });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'No pude sumarlo al equipo.' },
      { status: 400 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const check = await requireManage();
  if (!check.ok) return check.error;

  let body: UpdateTeamMemberBody;
  try {
    body = (await request.json()) as UpdateTeamMemberBody;
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }

  const userId = String(body.userId ?? '');
  if (userId.length === 0) return NextResponse.json({ error: 'Falta `userId`.' }, { status: 400 });
  if (!isPlatformRole(body.role)) return NextResponse.json({ error: 'Rol inválido.' }, { status: 400 });

  try {
    await getRepo().updatePlatformMemberRole(userId, body.role);
    return NextResponse.json({ ok: true });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'No pude cambiar el rol.' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const check = await requireManage();
  if (!check.ok) return check.error;

  const userId = request.nextUrl.searchParams.get('userId') ?? '';
  if (userId.length === 0) return NextResponse.json({ error: 'Falta `userId`.' }, { status: 400 });

  // No dejar que la dueña se saque a sí misma sin querer y se quede afuera:
  // igual se puede, pero desde OTRA cuenta de Vrotta Admin.
  if (userId === check.resolved.session.id) {
    return NextResponse.json({ error: 'No podés sacarte a vos mismo del equipo.' }, { status: 400 });
  }

  try {
    await getRepo().removePlatformMember(userId);
    return NextResponse.json({ ok: true });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'No pude sacarlo.' }, { status: 400 });
  }
}
