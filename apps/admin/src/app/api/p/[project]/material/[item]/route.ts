import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { isMaterialItemId } from '@/lib/material/catalog.ts';
import { isMaterialStatus } from '@/lib/material/types.ts';
import type { MaterialPatchRequest } from '@/lib/material/api-types.ts';

const MAX_NOTES = 2000;

/** Cambia el estado o la nota de un ítem. Sólo desde el panel, nunca por el link. */
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ project: string; item: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });

  const { project, item } = await ctx.params;
  if (!isMaterialItemId(item)) {
    return NextResponse.json({ error: 'Ítem de material desconocido', field: 'item' }, { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido', field: 'body' }, { status: 400 });
  }
  if (raw === null || typeof raw !== 'object') {
    return NextResponse.json({ error: 'Cuerpo inválido', field: 'body' }, { status: 400 });
  }
  const body = raw as MaterialPatchRequest;

  if (body.status !== undefined && !isMaterialStatus(body.status)) {
    return NextResponse.json({ error: 'Estado inválido', field: 'status' }, { status: 400 });
  }
  if (body.notes !== undefined && body.notes !== null) {
    if (typeof body.notes !== 'string') {
      return NextResponse.json({ error: 'Nota inválida', field: 'notes' }, { status: 400 });
    }
    if (body.notes.length > MAX_NOTES) {
      return NextResponse.json({ error: `La nota no puede superar ${MAX_NOTES} caracteres`, field: 'notes' }, { status: 400 });
    }
  }
  if (body.status === undefined && body.notes === undefined) {
    return NextResponse.json({ error: 'Nada que cambiar', field: 'body' }, { status: 400 });
  }

  try {
    const patch: { status?: typeof body.status; notes?: string | null } = {};
    if (body.status !== undefined) patch.status = body.status;
    if (body.notes !== undefined) patch.notes = body.notes;
    const row = await getRepo().setMaterialState(project, item, patch);
    return NextResponse.json(row);
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'No se pudo guardar el estado' },
      { status: 422 },
    );
  }
}
