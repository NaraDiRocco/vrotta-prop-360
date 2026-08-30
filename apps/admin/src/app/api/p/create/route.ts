/**
 * Alta de proyecto.
 *
 * El alta mínima es nombre + tipo + slug. La plantilla de estructura viaja en
 * el mismo POST porque es una sola decisión del operador ("acepto la
 * estructura sugerida"), y partirla en dos requests deja la puerta abierta a
 * un proyecto creado con la plantilla a medio aplicar.
 *
 * Si la plantilla falla DESPUÉS de crear el proyecto no se revierte el
 * proyecto: es preferible un proyecto vacío que se puede completar a mano
 * antes que perder el alta y que el operador tenga que empezar de cero.
 * El error se devuelve igual, con el proyecto ya creado adentro.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getRepo } from '@/lib/data/index.ts';
import { requireAdmin } from '@/lib/auth.ts';
import type { NewGroupInput, NewProjectInput, NewUnitTypeInput } from '@/lib/data/repo.ts';
import type { ProjectRow } from '@/lib/data/types.ts';
import { PROJECT_KINDS } from '@/lib/onboarding/templates.ts';
import { slugError, slugify } from '@/lib/onboarding/slug.ts';

export interface CreateProjectBody {
  tenantSlug: string;
  name: string;
  kind: string;
  slug?: string;
  location?: { address?: string; lat?: number; lng?: number };
  template?: { groups: NewGroupInput[]; unitTypes: NewUnitTypeInput[] };
}

export interface CreateProjectResponse {
  project: ProjectRow;
  groupsCreated: number;
  typesCreated: number;
  /** La plantilla falló pero el proyecto quedó creado. */
  templateError: string | null;
}

export async function POST(request: NextRequest) {
  let body: CreateProjectBody;
  try {
    body = (await request.json()) as CreateProjectBody;
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }

  const tenantSlug = String(body.tenantSlug ?? '');
  if (tenantSlug.length === 0) return NextResponse.json({ error: 'Falta el cliente.' }, { status: 400 });
  const { membership } = await requireAdmin(tenantSlug);
  if (membership.role !== 'owner' && membership.role !== 'editor') {
    return NextResponse.json({ error: 'Tu rol no puede crear proyectos.' }, { status: 403 });
  }

  const name = String(body.name ?? '').trim();
  if (name.length === 0) return NextResponse.json({ error: 'El proyecto necesita un nombre.' }, { status: 400 });

  const kind = String(body.kind ?? '');
  if (!(PROJECT_KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: `Tipo de proyecto desconocido: «${kind}».` }, { status: 400 });
  }

  const slug = (body.slug ?? '').trim().length > 0 ? String(body.slug).trim() : slugify(name);
  // `new` es una ruta estática del panel (/t/[tenant]/p/new) y ganaría sobre
  // el proyecto: un proyecto con ese slug sería inalcanzable.
  const badSlug = slugError(slug, { reserved: ['new'] });
  if (badSlug) return NextResponse.json({ error: badSlug }, { status: 400 });

  const input: NewProjectInput = {
    slug,
    name,
    kind: kind as NewProjectInput['kind'],
    location: sanitizeLocation(body.location),
  };

  const repo = getRepo();
  let project: ProjectRow;
  try {
    project = await repo.createProject(tenantSlug, input);
  } catch (cause) {
    return NextResponse.json({ error: message(cause) }, { status: 409 });
  }

  let groupsCreated = 0;
  let typesCreated = 0;
  let templateError: string | null = null;

  if (body.template) {
    try {
      const groups = body.template.groups ?? [];
      const types = body.template.unitTypes ?? [];
      if (groups.length > 0) await repo.createGroups(project.id, groups);
      if (types.length > 0) await repo.createUnitTypes(project.id, types);
      groupsCreated = groups.length;
      typesCreated = types.length;
    } catch (cause) {
      templateError = message(cause);
    }
  }

  const payload: CreateProjectResponse = { project, groupsCreated, typesCreated, templateError };
  return NextResponse.json(payload, { status: 201 });
}

/** Descartar un alta recién hecha. Sólo el dueño; el cascade limpia el resto. */
export async function DELETE(request: NextRequest) {
  const tenantSlug = request.nextUrl.searchParams.get('tenant') ?? '';
  const projectId = request.nextUrl.searchParams.get('project') ?? '';
  if (tenantSlug.length === 0 || projectId.length === 0) {
    return NextResponse.json({ error: 'Faltan `tenant` y `project`.' }, { status: 400 });
  }
  const { membership } = await requireAdmin(tenantSlug);
  if (membership.role !== 'owner') {
    return NextResponse.json({ error: 'Sólo el dueño del cliente puede borrar un proyecto.' }, { status: 403 });
  }
  try {
    await getRepo().deleteProject(projectId);
  } catch (cause) {
    return NextResponse.json({ error: message(cause) }, { status: 400 });
  }
  return NextResponse.json({ deleted: true });
}

function sanitizeLocation(raw: CreateProjectBody['location']): NewProjectInput['location'] {
  const out: NewProjectInput['location'] = {};
  if (!raw) return out;
  if (typeof raw.address === 'string' && raw.address.trim().length > 0) out.address = raw.address.trim();
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180) {
    out.lat = lat;
    out.lng = lng;
  }
  return out;
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Error desconocido.';
}
