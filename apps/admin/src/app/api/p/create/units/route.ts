/**
 * Alta masiva de unidades: por patrón (generador) o desde CSV (importación).
 *
 * Las dos formas convergen en `Repo.createUnits`, y las dos VALIDAN acá,
 * en el servidor, con las mismas funciones que usa la vista previa del
 * navegador. Que la preview y el commit compartan código es el punto: si el
 * patrón se expandiera distinto de un lado y del otro, el operador aprobaría
 * una lista y se crearía otra.
 *
 * Con `dryRun` no escribe nada y devuelve exactamente lo que escribiría.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { isUnitStatus, type UnitStatus } from '@r360/core';
import { resolveTenantActor } from '@/lib/auth.ts';
import { canEditStructure } from '@/lib/roles.ts';
import { getRepo } from '@/lib/data/index.ts';
import type { CreateUnitsResult, NewUnitInput } from '@/lib/data/repo.ts';
import { buildImportPlan, type CsvMapping, type RowIssue } from '@/lib/onboarding/csv.ts';
import { generateCodes, MAX_GENERATED, parseCodePattern, previewCodes, type CodePreview } from '@/lib/onboarding/codes.ts';

interface BaseBody {
  tenantSlug: string;
  projectId: string;
  dryRun?: boolean;
}

export interface GenerateBody extends BaseBody {
  source: 'pattern';
  pattern: string;
  /** Valores de las variables del patrón: `{manzana}` → "3". */
  vars?: Record<string, string>;
  groupCode?: string | null;
  typeCode?: string | null;
  status?: UnitStatus;
  areaTotalM2?: number | null;
}

export interface ImportBody extends BaseBody {
  source: 'csv';
  csv: string;
  mapping?: CsvMapping;
  defaultStatus?: UnitStatus;
  defaultCurrency?: string;
  createMissingGroups?: boolean;
  groupKind?: string;
}

export type CreateUnitsBody = GenerateBody | ImportBody;

export interface CreateUnitsResponse {
  dryRun: boolean;
  /** Cuántas unidades se crearían/crearon. */
  planned: number;
  preview: CodePreview | null;
  issues: RowIssue[];
  missingGroups: string[];
  missingTypes: { code: string; name: string }[];
  duplicates: string[];
  result: CreateUnitsResult | null;
}

export async function POST(request: NextRequest) {
  let body: CreateUnitsBody;
  try {
    body = (await request.json()) as CreateUnitsBody;
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }

  const tenantSlug = String(body.tenantSlug ?? '');
  const projectId = String(body.projectId ?? '');
  if (tenantSlug.length === 0 || projectId.length === 0) {
    return NextResponse.json({ error: 'Faltan `tenantSlug` y `projectId`.' }, { status: 400 });
  }

  // Alta/baja de unidades es "editar estructura" (`canEditStructure`), tarea
  // de Vrotta — sin `requireAdmin`, que redirige/hace notFound() en vez de
  // devolver un JSON limpio (bug cerrado en P2b).
  const resolved = await resolveTenantActor(tenantSlug);
  if (resolved === null) return NextResponse.json({ error: 'Sin sesión.' }, { status: 401 });
  if (!resolved.actor) return NextResponse.json({ error: 'Cliente no encontrado.' }, { status: 404 });
  if (!canEditStructure(resolved.actor)) {
    return NextResponse.json({ error: 'Tu rol no puede crear unidades.' }, { status: 403 });
  }

  const repo = getRepo();
  const dryRun = body.dryRun === true;

  const [structure, existingUnits] = await Promise.all([
    repo.getStructure(projectId),
    repo.getAllUnits(projectId),
  ]);
  const existingCodes = existingUnits.map((u) => u.code);

  if (body.source === 'pattern') {
    let plan;
    try {
      plan = parseCodePattern(body.pattern, body.vars ?? {});
    } catch (cause) {
      return NextResponse.json({ error: message(cause) }, { status: 400 });
    }
    if (plan.total > MAX_GENERATED) {
      return NextResponse.json({ error: `Máximo ${MAX_GENERATED} unidades por operación.` }, { status: 400 });
    }

    const status: UnitStatus = isUnitStatus(body.status) ? body.status : 'disponible';
    const area = typeof body.areaTotalM2 === 'number' && Number.isFinite(body.areaTotalM2) ? body.areaTotalM2 : null;
    const groupCode = body.groupCode && body.groupCode.length > 0 ? body.groupCode : null;
    const typeCode = body.typeCode && body.typeCode.length > 0 ? body.typeCode : null;

    const codes = generateCodes(plan);
    const taken = new Set(existingCodes);
    const duplicates = codes.filter((c) => taken.has(c));

    const units: NewUnitInput[] = codes.map((code, i) => ({
      code,
      groupCode,
      typeCode,
      typeName: null,
      status,
      areaTotalM2: area,
      attrs: {},
      sort: existingUnits.length + i + 1,
    }));

    const payload: CreateUnitsResponse = {
      dryRun,
      planned: codes.length - duplicates.length,
      preview: previewCodes(plan),
      issues: [],
      missingGroups: groupCode && !structure.groups.some((g) => g.code === groupCode) ? [groupCode] : [],
      missingTypes: [],
      duplicates,
      result: null,
    };

    if (dryRun) return NextResponse.json(payload);

    try {
      payload.result = await repo.createUnits(projectId, units, {
        createMissingGroups: true,
        groupKind: 'grupo',
        createMissingTypes: false,
      });
    } catch (cause) {
      return NextResponse.json({ error: message(cause) }, { status: 400 });
    }
    return NextResponse.json(payload, { status: 201 });
  }

  if (body.source === 'csv') {
    const importPlan = buildImportPlan(String(body.csv ?? ''), {
      ...(body.mapping ? { mapping: body.mapping } : {}),
      ...(isUnitStatus(body.defaultStatus) ? { defaultStatus: body.defaultStatus } : {}),
      ...(body.defaultCurrency ? { defaultCurrency: body.defaultCurrency } : {}),
      existingGroupCodes: structure.groups.map((g) => g.code),
      existingTypeCodes: structure.types.map((t) => t.code),
      existingUnitCodes: existingCodes,
    });

    const payload: CreateUnitsResponse = {
      dryRun,
      planned: importPlan.units.length - importPlan.duplicatesInProject.length,
      preview: null,
      issues: importPlan.issues,
      missingGroups: importPlan.missingGroups,
      missingTypes: importPlan.missingTypes,
      duplicates: importPlan.duplicatesInProject,
      result: null,
    };

    // Regla dura: con UN error de fila no se escribe NADA.
    if (dryRun || importPlan.issues.length > 0) {
      return NextResponse.json(payload, { status: importPlan.issues.length > 0 && !dryRun ? 422 : 200 });
    }

    try {
      payload.result = await repo.createUnits(projectId, importPlan.units, {
        createMissingGroups: body.createMissingGroups !== false,
        groupKind: body.groupKind ?? 'grupo',
        createMissingTypes: true,
      });
    } catch (cause) {
      return NextResponse.json({ error: message(cause) }, { status: 400 });
    }
    return NextResponse.json(payload, { status: 201 });
  }

  return NextResponse.json({ error: '`source` tiene que ser `pattern` o `csv`.' }, { status: 400 });
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Error desconocido.';
}
