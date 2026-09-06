import { NextResponse, type NextRequest } from 'next/server';
import { getSession, resolveProjectActor } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { canPublish } from '@/lib/roles.ts';

/** Estado de publicación: versión en vivo, diff del borrador, advertencias. */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ project: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });

  const { project } = await ctx.params;
  const state = await getRepo().getPublishState(project);
  return NextResponse.json(state);
}

/** Publica el borrador actual. Sólo quien pueda `canPublish` DEL TENANT DUEÑO DEL PROYECTO. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ project: string }> }) {
  const { project } = await ctx.params;

  // `project` es el id, no el slug (ver convención del resto de /api/p/[project]/*).
  // El chequeo se resuelve contra el tenant DUEÑO de ESTE proyecto — nunca
  // contra cualquier membership del usuario (ser owner de OTRO tenant no
  // alcanza) — y sin usar `requireAdmin`/`requireTenant`: esas redirigen o
  // hacen notFound(), pensadas para páginas; acá una API necesita 401/403/404
  // limpios, nunca el HTML de una redirección (bug cerrado en P2b).
  const resolved = await resolveProjectActor(project);
  if (resolved === null) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });
  if (resolved === 'sin-proyecto') return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  if (!resolved.actor || !canPublish(resolved.actor)) {
    return NextResponse.json({ error: 'No tenés permiso para publicar este proyecto' }, { status: 403 });
  }

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
