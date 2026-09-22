import { NextResponse, type NextRequest } from 'next/server';
import { getSession, resolveProjectActor } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import {
  DEFAULT_SHARE_TTL_DAYS,
  expiresAtFromDays,
  shareLinkState,
  validateTtlDays,
} from '@/lib/material/share.ts';
import { canShareMaterialLink } from '@/lib/roles.ts';
import type { CreateShareLinkRequest, ShareLinkDto } from '@/lib/material/api-types.ts';
import type { MaterialShareLinkRow } from '@/lib/material/types.ts';

const MAX_LABEL = 120;

function toDto(link: MaterialShareLinkRow): ShareLinkDto {
  return { ...link, estado: shareLinkState(link), path: `/m/${link.token}` };
}

export async function GET(_request: NextRequest, ctx: { params: Promise<{ project: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });

  const { project } = await ctx.params;
  const links = await getRepo().listMaterialShareLinks(project);
  return NextResponse.json(links.map(toDto));
}

/**
 * Emite un link nuevo. No hay "el link del proyecto": se emite uno por
 * destinatario (`label`), así revocar el que se le mandó a un proveedor no le
 * corta el acceso al cliente.
 *
 * `canShareMaterialLink` excluye explícitamente al Gestor (sólo Administrador
 * y Vrotta), pero la policy `material_share_links_insert` de RLS permite
 * `owner`/`editor` por igual, y esta ruta sólo chequeaba sesión. Se agrega el
 * chequeo acá, en la ruta (no en RLS: mismo razonamiento que el resto de esta
 * auditoría, ver `publish/preview-tokens/route.ts`). El GET no se toca: ver
 * qué links existen ya es `canViewMaterial`, universal, y así lo confirma la
 * policy `material_share_links_select` (permite owner/editor) — acá el
 * producto sí reserva sólo la escritura, no la lectura.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ project: string }> }) {
  const lookup = await resolveProjectActor((await ctx.params).project);
  if (!lookup) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });
  if (lookup === 'sin-proyecto') return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  if (!lookup.actor || !canShareMaterialLink(lookup.actor)) {
    return NextResponse.json({ error: 'No podés emitir links de material en este proyecto' }, { status: 403 });
  }

  const { project } = await ctx.params;

  let raw: unknown = {};
  try {
    raw = await request.json();
  } catch {
    /* cuerpo vacío: se emite con los valores por defecto */
  }
  const body = (raw === null || typeof raw !== 'object' ? {} : raw) as CreateShareLinkRequest;

  if (body.label !== undefined && body.label !== null) {
    if (typeof body.label !== 'string' || body.label.length > MAX_LABEL) {
      return NextResponse.json({ error: `Etiqueta inválida (máximo ${MAX_LABEL} caracteres)`, field: 'label' }, { status: 400 });
    }
  }

  let expiresAt: string | null;
  if (body.ttlDays === null) {
    expiresAt = null; // sin vencimiento, decisión explícita del operador
  } else {
    const days = body.ttlDays === undefined ? DEFAULT_SHARE_TTL_DAYS : body.ttlDays;
    const invalid = validateTtlDays(days);
    if (invalid) return NextResponse.json({ error: invalid, field: 'ttlDays' }, { status: 400 });
    expiresAt = expiresAtFromDays(days);
  }

  try {
    const link = await getRepo().createMaterialShareLink(project, {
      label: body.label ?? null,
      expiresAt,
    });
    return NextResponse.json(toDto(link), { status: 201 });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'No se pudo crear el link' },
      { status: 422 },
    );
  }
}
