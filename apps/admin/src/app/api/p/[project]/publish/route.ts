import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth.ts';
import { canPublish } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';

/** Estado de publicación: versión en vivo, diff del borrador, advertencias. */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ project: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });

  const { project } = await ctx.params;
  const state = await getRepo().getPublishState(project);
  return NextResponse.json(state);
}

/** Publica el borrador actual. Sólo `owner` puede publicar. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ project: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });

  // `project` es el id, no el slug (ver convención del resto de /api/p/[project]/*),
  // y Repo no expone "tenant de este projectId" sin resolver por slug primero.
  // Alcanza con exigir que AL MENOS una membership del usuario sea owner: en
  // el modelo actual un usuario pertenece a un solo tenant por sesión.
  if (!session.memberships.some((m) => canPublish(m.role))) {
    return NextResponse.json({ error: 'Sólo el dueño del tenant puede publicar' }, { status: 403 });
  }

  const { project } = await ctx.params;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    raw = {};
  }
  const body = (raw ?? {}) as { note?: unknown };
  if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') {
    return NextResponse.json({ error: 'Nota inválida', field: 'note' }, { status: 400 });
  }

  try {
    const publication = await getRepo().publish(project, (body.note as string | null | undefined) ?? null);
    return NextResponse.json(publication, { status: 201 });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'No se pudo publicar' },
      { status: 422 },
    );
  }
}
