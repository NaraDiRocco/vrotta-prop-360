import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';

export async function GET(_request: NextRequest, ctx: { params: Promise<{ project: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });

  const { project } = await ctx.params;
  const tokens = await getRepo().listPreviewTokens(project);
  return NextResponse.json(tokens);
}

const MIN_TTL_MINUTES = 5;
const MAX_TTL_MINUTES = 60 * 24 * 30; // 30 días

export async function POST(request: NextRequest, ctx: { params: Promise<{ project: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });

  const { project } = await ctx.params;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }
  const body = raw as { ttlMinutes?: unknown; note?: unknown };
  if (typeof body.ttlMinutes !== 'number' || body.ttlMinutes < MIN_TTL_MINUTES || body.ttlMinutes > MAX_TTL_MINUTES) {
    return NextResponse.json(
      { error: `ttlMinutes tiene que estar entre ${MIN_TTL_MINUTES} y ${MAX_TTL_MINUTES}`, field: 'ttlMinutes' },
      { status: 400 },
    );
  }
  if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') {
    return NextResponse.json({ error: 'Nota inválida', field: 'note' }, { status: 400 });
  }

  const token = await getRepo().createPreviewToken(project, body.ttlMinutes, (body.note as string | null | undefined) ?? null);
  return NextResponse.json(token, { status: 201 });
}
