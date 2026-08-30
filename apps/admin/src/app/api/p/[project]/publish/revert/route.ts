import { NextResponse, type NextRequest } from 'next/server';
import { canPublish, getSession } from '@/lib/auth.ts';
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
  if (!session.memberships.some((m) => canPublish(m.role))) {
    return NextResponse.json({ error: 'Sólo el dueño del tenant puede revertir' }, { status: 403 });
  }

  const { project } = await ctx.params;
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
