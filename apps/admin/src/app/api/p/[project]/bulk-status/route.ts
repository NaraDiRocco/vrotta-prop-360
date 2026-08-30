import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import type { BulkStatusResponse } from '@/lib/units/api-types.ts';
import { validateBulkStatusBody } from '@/lib/units/bulk-status-validation.ts';
import { matchingCodes } from '@/lib/units/query.ts';
import { chunk, planBulkStatusChange, type RpcFilter } from '@/lib/units/selection.ts';

/**
 * Cambio masivo de estado.
 *
 * El camino feliz no materializa nada: la selección viaja como predicado y se
 * traduce a una o pocas llamadas a `set_units_status`. Cambiar 800 lotes son
 * ~200 bytes de request.
 *
 * Cuando el filtro se sale del vocabulario del RPC (rangos de m², "sin
 * polígono", exclusiones a mano), acá — en el servidor, no en el navegador —
 * se resuelven los códigos que matchean y se mandan en tandas. La respuesta
 * dice qué camino se tomó, y la UI lo muestra: nada de magia silenciosa.
 *
 * La validación del body vive en `bulk-status-validation.ts` (testeada
 * aparte): un body incompleto o malformado devuelve 400 con el campo que
 * falta, en vez de tirar una excepción no atrapada camino a un 500 vacío.
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

  const validated = validateBulkStatusBody(raw);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error, field: validated.field }, { status: 400 });
  }
  const body = validated.body;

  const plan = planBulkStatusChange(body.selection, project);
  const repo = getRepo();

  try {
    if (plan.kind === 'predicate') {
      const changed = await repo.setUnitsStatus(plan.calls, body.status, body.note);
      const response: BulkStatusResponse = { changed, strategy: 'predicate' };
      return NextResponse.json(response);
    }

    const all = await repo.getAllUnits(project);
    let codes = matchingCodes(all, body.params);
    if (body.selection.mode === 'filter' && body.selection.excluded.length > 0) {
      const excluded = new Set(body.selection.excluded);
      codes = codes.filter((code) => !excluded.has(code));
    }
    const calls: RpcFilter[] = chunk(codes, plan.chunkSize).map((codeChunk) => ({
      ...plan.base,
      code_in: codeChunk,
    }));
    const changed = await repo.setUnitsStatus(calls, body.status, body.note);
    const response: BulkStatusResponse = { changed, strategy: 'materialize', reason: plan.reason };
    return NextResponse.json(response);
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'No se pudo cambiar el estado' },
      { status: 422 },
    );
  }
}
