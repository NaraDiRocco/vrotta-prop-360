import { NextResponse, type NextRequest } from 'next/server';
import { resolveProjectActor } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { canManageScenes } from '@/lib/roles.ts';
import type { ReorderScenesRequest } from '@/lib/scenes/api-types.ts';

/** Gestionar escenas es tarea de Vrotta (`canManageScenes`): ver `../route.ts`. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ project: string }> }) {
  const lookup = await resolveProjectActor((await ctx.params).project);
  if (!lookup) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });
  if (lookup === 'sin-proyecto') return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  if (!lookup.actor || !canManageScenes(lookup.actor)) {
    return NextResponse.json({ error: 'No podés reordenar escenas en este proyecto' }, { status: 403 });
  }

  const { project } = await ctx.params;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }
  const body = raw as Partial<ReorderScenesRequest>;
  if (!Array.isArray(body.orderedSceneIds) || body.orderedSceneIds.some((id) => typeof id !== 'string')) {
    return NextResponse.json({ error: 'Falta orderedSceneIds', field: 'orderedSceneIds' }, { status: 400 });
  }

  await getRepo().reorderScenes(project, body.orderedSceneIds);
  return NextResponse.json({ ok: true });
}
