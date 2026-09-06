import { NextResponse, type NextRequest } from 'next/server';
import { getSession, requireAdmin } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';

/** Estado de publicación: versión en vivo, diff del borrador, advertencias. */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ project: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });

  const { project } = await ctx.params;
  const state = await getRepo().getPublishState(project);
  return NextResponse.json(state);
}

/** Publica el borrador actual. Sólo `owner` DEL TENANT DUEÑO DEL PROYECTO puede publicar. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ project: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });

  // `project` es el id, no el slug (ver convención del resto de /api/p/[project]/*).
  // El rol se valida contra el tenant DUEÑO de este proyecto, no contra
  // cualquier membership del usuario: ser owner de OTRO tenant no alcanza
  // (bug corregido — antes bastaba con `session.memberships.some(canPublish)`).
  const { project } = await ctx.params;
  const projectRow = await getRepo().getProjectById(project);
  if (!projectRow) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const ownerMembership = session.memberships.find((m) => m.tenantId === projectRow.tenantId);
  if (!ownerMembership) {
    return NextResponse.json({ error: 'Sólo el dueño del tenant puede publicar' }, { status: 403 });
  }
  const { membership } = await requireAdmin(ownerMembership.tenantSlug);
  // P2b: esto pasa a `canPublish(actor)` sobre el tenant dueño del proyecto,
  // resuelto sin buscar memberships (hoy, alguien de Vrotta no tiene ninguna
  // y se lleva un 403). Por ahora se conserva la regla de siempre: publica
  // el Administrador de la inmobiliaria.
  if (membership.role !== 'owner') {
    return NextResponse.json({ error: 'Sólo el dueño del tenant puede publicar' }, { status: 403 });
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
