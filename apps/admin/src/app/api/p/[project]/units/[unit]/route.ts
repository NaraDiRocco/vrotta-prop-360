import { NextResponse, type NextRequest } from 'next/server';
import { isUnitStatus } from '@r360/core';
import { getSession, resolveProjectActor } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { canEditStructure, canEditUnitAttributes } from '@/lib/roles.ts';
import type { UnitDetailResponse } from '@/lib/units/api-types.ts';
import type { UnitPatch } from '@/lib/data/types.ts';

type Ctx = { params: Promise<{ project: string; unit: string }> };

/** Detalle de una unidad: precios e historial de estado. */
export async function GET(_request: NextRequest, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });

  const { unit } = await ctx.params;
  const repo = getRepo();
  const [prices, log] = await Promise.all([repo.getUnitPrices(unit), repo.getUnitLog(unit)]);
  const body: UnitDetailResponse = { prices, log };
  return NextResponse.json(body);
}

/**
 * Edición inline. Devuelve la fila ya guardada para que el cliente reemplace
 * el valor optimista; si tira 4xx, el cliente hace rollback y marca la fila.
 */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });

  const { project, unit } = await ctx.params;
  const raw: unknown = await request.json();
  if (typeof raw !== 'object' || raw === null) {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;
  const patch: UnitPatch = {};

  if ('status' in body) {
    if (!isUnitStatus(body['status'])) return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
    patch.status = body['status'];
  }
  if ('areaTotalM2' in body) {
    const value = body['areaTotalM2'];
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
      return NextResponse.json({ error: 'La superficie tiene que ser un número positivo' }, { status: 400 });
    }
    patch.areaTotalM2 = value as number | null;
  }
  if ('groupId' in body) patch.groupId = body['groupId'] === null ? null : String(body['groupId']);
  if ('unitTypeId' in body) patch.unitTypeId = body['unitTypeId'] === null ? null : String(body['unitTypeId']);
  if ('attrs' in body) {
    const attrs = body['attrs'];
    if (typeof attrs !== 'object' || attrs === null || Array.isArray(attrs)) {
      return NextResponse.json({ error: 'attrs tiene que ser un objeto' }, { status: 400 });
    }
    patch.attrs = attrs as Record<string, unknown>;
  }

  // `groupId`/`unitTypeId` son estructura: Vrotta la arma a partir del
  // material, la inmobiliaria no la toca. El trigger `units_tenant_update_guard`
  // de la base lo frenaría igual, pero con un 500 críptico en vez de un 403
  // con motivo — devolver acá antes de tocar la base.
  if (patch.groupId !== undefined || patch.unitTypeId !== undefined) {
    const lookup = await resolveProjectActor(project);
    if (!lookup) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });
    if (lookup === 'sin-proyecto') return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
    if (!lookup.actor || !canEditStructure(lookup.actor)) {
      return NextResponse.json({ error: 'No podés editar la estructura de este proyecto' }, { status: 403 });
    }
  }
  // m² y atributos: Administrador y Gestor sí los editan (decisión de la
  // dueña, ver roles.ts), pero el Vendedor no — mismo trigger de la base.
  if (patch.areaTotalM2 !== undefined || patch.attrs !== undefined) {
    const lookup = await resolveProjectActor(project);
    if (!lookup) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });
    if (lookup === 'sin-proyecto') return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
    if (!lookup.actor || !canEditUnitAttributes(lookup.actor)) {
      return NextResponse.json({ error: 'No podés editar m² ni atributos en este proyecto' }, { status: 403 });
    }
  }

  try {
    const updated = await getRepo().updateUnit(project, unit, patch);
    return NextResponse.json(updated);
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'No se pudo guardar' },
      { status: 422 },
    );
  }
}
