/**
 * Subida por el link público. Sin sesión, a propósito.
 *
 * Lo que la protege: el token se revalida acá y otra vez adentro de la RPC
 * `material_link_register_file` (security definer), el project_id lo pone el
 * servidor a partir del token —nunca el cuerpo de la request—, la extensión y
 * el tamaño se validan con las mismas reglas que en el panel, y el nombre del
 * archivo se sanea antes de tocar el storage. Lo subido entra como `recibido`,
 * nunca como `aprobado`: aprobar sigue siendo una decisión del operador.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getRepo } from '@/lib/data/index.ts';
import { isMaterialItemId } from '@/lib/material/catalog.ts';
import { receiveUpload } from '@/lib/material/receive.ts';
import { isShareTokenShaped } from '@/lib/material/share.ts';
import { MaterialStorageError } from '@/lib/material/storage.ts';

const NOT_FOUND = { error: 'El link no existe o ya no está vigente' };

export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!isShareTokenShaped(token)) return NextResponse.json(NOT_FOUND, { status: 404 });

  const itemId = new URL(request.url).searchParams.get('item') ?? '';
  if (!isMaterialItemId(itemId)) {
    return NextResponse.json({ error: 'Ítem de material desconocido', field: 'item' }, { status: 400 });
  }

  const repo = getRepo();
  const context = await repo.resolveMaterialShareToken(token);
  if (!context) return NextResponse.json(NOT_FOUND, { status: 404 });

  try {
    const result = await receiveUpload(request, context.projectId, itemId, 'link');
    if (!result.ok) return NextResponse.json(result.rejection, { status: 400 });

    // Segunda validación del token, ya adentro de la base: entre el chequeo de
    // arriba y esta línea el operador pudo haberlo revocado.
    const row = await repo.registerMaterialFileByToken(token, result.file);
    if (!row) return NextResponse.json(NOT_FOUND, { status: 404 });

    return NextResponse.json(
      { id: row.id, itemId: row.itemId, filename: row.filename, sizeBytes: row.sizeBytes, createdAt: row.createdAt },
      { status: 201 },
    );
  } catch (cause) {
    const status = cause instanceof MaterialStorageError ? 502 : 422;
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'No se pudo guardar el archivo' },
      { status },
    );
  }
}
