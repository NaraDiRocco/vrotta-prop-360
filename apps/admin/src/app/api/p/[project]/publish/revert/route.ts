import { NextResponse, type NextRequest } from 'next/server';
import { resolveProjectActor } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { canPublish } from '@/lib/roles.ts';

/**
 * Revierte el puntero de versión activa. IMPORTANTE (ver worker/routes/rollback.ts):
 * esto NO revierte los estados de unidad — se leen en vivo de availability.json,
 * que sigue reflejando el inventario actual de Supabase sin importar qué
 * versión del tour esté activa. La UI tiene que dejarlo explícito, no sólo
 * esta ruta.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ project: string }> }) {
  const { project } = await ctx.params;

  // Mismo criterio que publish/route.ts: el chequeo va contra el tenant
  // DUEÑO de ESTE proyecto (no cualquier membership del usuario), resuelto
  // sin `requireAdmin`/`requireTenant` para no devolverle HTML de una
  // redirección a un fetch() (bug cerrado en P2b).
  const resolved = await resolveProjectActor(project);
  if (resolved === null) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });
  if (resolved === 'sin-proyecto') return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  if (!resolved.actor || !canPublish(resolved.actor)) {
    return NextResponse.json({ error: 'No tenés permiso para revertir este proyecto' }, { status: 403 });
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
