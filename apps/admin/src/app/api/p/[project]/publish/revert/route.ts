import { NextResponse, type NextRequest } from 'next/server';
import { canPublish, getSession, requireAdmin } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';

/**
 * Revierte el puntero de versión activa. IMPORTANTE (ver worker/routes/rollback.ts):
 * esto NO revierte los estados de unidad — se leen en vivo de availability.json,
 * que sigue reflejando el inventario actual de Supabase sin importar qué
 * versión del tour esté activa. La UI tiene que dejarlo explícito, no sólo
 * esta ruta.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ project: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });

  // Mismo bug que en publish/route.ts: el rol se valida contra el tenant
  // DUEÑO de ESTE proyecto, no contra cualquier membership del usuario.
  const { project } = await ctx.params;
  const projectRow = await getRepo().getProjectById(project);
  if (!projectRow) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const ownerMembership = session.memberships.find((m) => m.tenantId === projectRow.tenantId);
  if (!ownerMembership) {
    return NextResponse.json({ error: 'Sólo el dueño del tenant puede revertir' }, { status: 403 });
  }
  const { membership } = await requireAdmin(ownerMembership.tenantSlug);
  if (!canPublish(membership.role)) {
    return NextResponse.json({ error: 'Sólo el dueño del tenant puede revertir' }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }
  const body = raw as { version?: unknown };
  if (typeof body.version !== 'number') {
    return NextResponse.json({ error: 'Falta version', field: 'version' }, { status: 400 });
  }

  try {
    await getRepo().revertPublication(project, body.version);
    return NextResponse.json({ ok: true });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'No se pudo revertir' },
      { status: 422 },
    );
  }
}
