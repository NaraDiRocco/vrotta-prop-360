import { NextResponse, type NextRequest } from 'next/server';
import { resolveProjectActor } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { canEditPrices } from '@/lib/roles.ts';
import { validatePriceInput } from '@/lib/units/price-validation.ts';

type Ctx = { params: Promise<{ project: string; unit: string }> };

/**
 * Carga un precio nuevo para la unidad. No existía: "editar precio" era una
 * pantalla que no estaba construida. Sólo Administrador, Gestor y Vrotta
 * (`canEditPrices`); el Vendedor no llega ni a ver el botón en la interfaz, y
 * si de todos modos pega acá, la policy `unit_prices_write` de la base
 * también lo frena.
 */
export async function PUT(request: NextRequest, ctx: Ctx) {
  const { project, unit } = await ctx.params;
  const lookup = await resolveProjectActor(project);
  if (!lookup) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });
  if (lookup === 'sin-proyecto') return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  if (!lookup.actor || !canEditPrices(lookup.actor)) {
    return NextResponse.json({ error: 'No podés editar precios en este proyecto' }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }

  const validated = validatePriceInput(raw);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.message, field: validated.field }, { status: 400 });
  }

  try {
    const price = await getRepo().setUnitPrice(unit, validated.value);
    return NextResponse.json(price);
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'No se pudo guardar el precio' },
      { status: 422 },
    );
  }
}
