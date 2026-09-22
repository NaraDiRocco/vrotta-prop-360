import { NextResponse, type NextRequest } from 'next/server';
import { resolveProjectActor } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { canManageScenes } from '@/lib/roles.ts';

type Ctx = { params: Promise<{ project: string; scene: string }> };

/**
 * Renombrar y/o marcar como inicial. Gestionar escenas es tarea de Vrotta
 * (`canManageScenes`): ver el razonamiento completo en `../route.ts`.
 */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const lookup = await resolveProjectActor((await ctx.params).project);
  if (!lookup) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });
  if (lookup === 'sin-proyecto') return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  if (!lookup.actor || !canManageScenes(lookup.actor)) {
    return NextResponse.json({ error: 'No podés editar escenas en este proyecto' }, { status: 403 });
  }

  const { project, scene } = await ctx.params;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }
  if (raw === null || typeof raw !== 'object') {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }
  const body = raw as { name?: unknown; isInitial?: unknown };
  const repo = getRepo();

  try {
    if ('name' in body) {
      if (typeof body.name !== 'string' || body.name.trim() === '') {
        return NextResponse.json({ error: 'Nombre inválido', field: 'name' }, { status: 400 });
      }
      await repo.renameScene(project, scene, body.name.trim());
    }
    if (body.isInitial === true) {
      await repo.setInitialScene(project, scene);
    }
    const scenes = await repo.listScenes(project);
    return NextResponse.json(scenes.find((s) => s.id === scene) ?? null);
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'No se pudo guardar' },
      { status: 422 },
    );
  }
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const lookup = await resolveProjectActor((await ctx.params).project);
  if (!lookup) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });
  if (lookup === 'sin-proyecto') return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  if (!lookup.actor || !canManageScenes(lookup.actor)) {
    return NextResponse.json({ error: 'No podés borrar escenas en este proyecto' }, { status: 403 });
  }

  const { project, scene } = await ctx.params;
  try {
    await getRepo().deleteScene(project, scene);
    return NextResponse.json({ ok: true });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'No se pudo eliminar' },
      { status: 422 },
    );
  }
}
