import { NextResponse, type NextRequest } from 'next/server';
import { resolveProjectActor } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { canManageScenes } from '@/lib/roles.ts';

/** La cola de procesamiento es tarea de Vrotta (`canManageScenes`): ver `../../../route.ts`. */
export async function POST(_request: NextRequest, ctx: { params: Promise<{ project: string; job: string }> }) {
  const lookup = await resolveProjectActor((await ctx.params).project);
  if (!lookup) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });
  if (lookup === 'sin-proyecto') return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  if (!lookup.actor || !canManageScenes(lookup.actor)) {
    return NextResponse.json({ error: 'No podés reintentar jobs en este proyecto' }, { status: 403 });
  }

  const { project, job } = await ctx.params;
  try {
    await getRepo().retryJob(project, job);
    return NextResponse.json({ ok: true });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'No se pudo reintentar' },
      { status: 422 },
    );
  }
}
