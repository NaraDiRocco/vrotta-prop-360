import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { isMaterialItemId } from '@/lib/material/catalog.ts';
import { receiveUpload } from '@/lib/material/receive.ts';
import { MaterialStorageError } from '@/lib/material/storage.ts';

/** Subida desde el panel: multipart con el campo `file`. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ project: string; item: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });

  const { project, item } = await ctx.params;
  if (!isMaterialItemId(item)) {
    return NextResponse.json({ error: 'Ítem de material desconocido', field: 'item' }, { status: 404 });
  }

  const repo = getRepo();
  const projectRow = await repo.getProjectById(project);
  if (!projectRow) return NextResponse.json({ error: 'Proyecto inexistente' }, { status: 404 });

  try {
    const result = await receiveUpload(request, project, item, 'panel');
    if (!result.ok) return NextResponse.json(result.rejection, { status: 400 });
    const row = await repo.registerMaterialFile(project, { ...result.file, uploadedVia: 'panel' });
    return NextResponse.json(row, { status: 201 });
  } catch (cause) {
    const status = cause instanceof MaterialStorageError ? 502 : 422;
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'No se pudo guardar el archivo' },
      { status },
    );
  }
}
