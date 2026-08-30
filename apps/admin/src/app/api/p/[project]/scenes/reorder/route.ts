import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import type { ReorderScenesRequest } from '@/lib/scenes/api-types.ts';

export async function POST(request: NextRequest, ctx: { params: Promise<{ project: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });

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
