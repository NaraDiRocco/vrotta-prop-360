import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { assessSchemaChange, type SchemaImpact } from '@/lib/units/attrs.ts';
import type { GroupRow, UnitTypeRow } from '@/lib/data/types.ts';

interface SaveGroups {
  kind: 'groups';
  groups: GroupRow[];
}

interface SaveType {
  kind: 'type';
  type: UnitTypeRow;
  /** true = sólo simular el impacto, no guardar. */
  dryRun: boolean;
}

export interface StructureSaveResponse {
  saved: boolean;
  impact?: SchemaImpact;
}

/**
 * Guardado de estructura.
 *
 * Un cambio de `attr_schema` SIEMPRE se evalúa contra las unidades existentes
 * antes de commitear: agregar un `required` o cambiar un tipo puede dejar
 * cientos de unidades inválidas, y eso hay que decirlo con el número en la
 * mano, no descubrirlo tres semanas después.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ project: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });

  const { project } = await ctx.params;
  const body = (await request.json()) as SaveGroups | SaveType;
  const repo = getRepo();

  if (body.kind === 'groups') {
    await repo.saveGroups(project, body.groups);
    return NextResponse.json({ saved: true } satisfies StructureSaveResponse);
  }

  if (body.kind === 'type') {
    const units = await repo.getAllUnits(project);
    const affected = units
      .filter((unit) => unit.unitTypeId === body.type.id)
      .map((unit) => ({ code: unit.code, attrs: unit.attrs }));
    const impact = assessSchemaChange(body.type.attrSchema, affected);

    if (body.dryRun) return NextResponse.json({ saved: false, impact } satisfies StructureSaveResponse);

    await repo.saveUnitType(project, body.type);
    return NextResponse.json({ saved: true, impact } satisfies StructureSaveResponse);
  }

  return NextResponse.json({ error: 'kind desconocido' }, { status: 400 });
}
