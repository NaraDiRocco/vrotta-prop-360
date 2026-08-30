import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import type { CreateSceneRequest, ScenesResponse } from '@/lib/scenes/api-types.ts';

const SCENE_KINDS = ['panorama', 'floorplan', 'map', 'video'];

/** Listado de escenas + cola de procesamiento del proyecto, en una sola llamada. */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ project: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });

  const { project } = await ctx.params;
  const repo = getRepo();
  const [scenes, jobs] = await Promise.all([repo.listScenes(project), repo.listJobs(project)]);
  const body: ScenesResponse = { scenes, jobs };
  return NextResponse.json(body);
}

/**
 * Crea la escena (después de que el cliente validó el archivo) y encola el
 * job de procesamiento. La subida real del byte a R2/tiles la resuelve el
 * pipeline de `apps/worker`; acá sólo se registra la intención y arranca la
 * cola — coherente con que esta pantalla no tiene acceso a ese storage.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ project: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });

  const { project } = await ctx.params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido', field: 'body' }, { status: 400 });
  }
  if (raw === null || typeof raw !== 'object') {
    return NextResponse.json({ error: 'Cuerpo inválido', field: 'body' }, { status: 400 });
  }
  const body = raw as Partial<CreateSceneRequest>;
  if (typeof body.slug !== 'string' || body.slug.trim() === '') {
    return NextResponse.json({ error: 'Falta slug', field: 'slug' }, { status: 400 });
  }
  if (typeof body.kind !== 'string' || !SCENE_KINDS.includes(body.kind)) {
    return NextResponse.json({ error: 'Tipo de escena inválido', field: 'kind' }, { status: 400 });
  }
  if (typeof body.name !== 'string' || body.name.trim() === '') {
    return NextResponse.json({ error: 'Falta name', field: 'name' }, { status: 400 });
  }

  try {
    const scene = await getRepo().createScene(project, {
      slug: body.slug,
      kind: body.kind as CreateSceneRequest['kind'],
      name: body.name,
      source: body.source ?? {},
    });
    return NextResponse.json(scene, { status: 201 });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'No se pudo crear la escena' },
      { status: 422 },
    );
  }
}
