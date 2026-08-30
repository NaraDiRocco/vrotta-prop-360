import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import {
  DEFAULT_SHARE_TTL_DAYS,
  expiresAtFromDays,
  shareLinkState,
  validateTtlDays,
} from '@/lib/material/share.ts';
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
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ project: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });

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
