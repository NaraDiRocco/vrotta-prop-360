import { NextResponse, type NextRequest } from 'next/server';
import { isUnitStatus } from '@r360/core';
import { getSession } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import type { BulkStatusRequest, BulkStatusResponse } from '@/lib/units/api-types.ts';
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
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ project: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });

  const { project } = await ctx.params;
  const body = (await request.json()) as BulkStatusRequest;

  if (!isUnitStatus(body.status)) return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
  if (!body.selection) return NextResponse.json({ error: 'Falta la selección' }, { status: 400 });

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
