import { NextResponse, type NextRequest } from 'next/server';
import { resolveProjectActor } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { canIssuePreviewTokens } from '@/lib/roles.ts';

/**
 * Auditoría de seguridad (escalada dentro del propio tenant, no cruza
 * inquilinos): estas rutas sólo chequeaban que hubiera sesión y delegaban
 * toda la autorización a la RLS de `projects` — pero `createPreviewToken`/
 * `revokePreviewToken` escriben pisando `projects.settings` con un
 * `update()`, y la policy `projects_update` (0019) permite `owner`/`editor`,
 * no sólo plataforma. Resultado: un Gestor podía emitir (o listar/revocar)
 * un link de preview sin auth al recorrido en borrador, algo que el producto
 * reserva a Vrotta (`canIssuePreviewTokens`).
 *
 * El cierre va acá, en la ruta, y no en la policy de RLS: tocar RLS es más
 * riesgoso (puede romper lecturas legítimas del panel y no hay forma de
 * probarlo contra producción ahora mismo), mientras que este chequeo es
 * acotado, se testea con un `resolveProjectActor` + `canX` como el resto del
 * panel, y se puede revertir con un solo commit. Deuda pendiente: lo ideal a
 * futuro es que la policy sea la fuente de verdad y la ruta no tenga que
 * duplicar la regla.
 */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ project: string }> }) {
  const lookup = await resolveProjectActor((await ctx.params).project);
  if (!lookup) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });
  if (lookup === 'sin-proyecto') return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  if (!lookup.actor || !canIssuePreviewTokens(lookup.actor)) {
    return NextResponse.json({ error: 'No podés ver los tokens de preview de este proyecto' }, { status: 403 });
  }

  const { project } = await ctx.params;
  const tokens = await getRepo().listPreviewTokens(project);
  return NextResponse.json(tokens);
}

const MIN_TTL_MINUTES = 5;
const MAX_TTL_MINUTES = 60 * 24 * 30; // 30 días

export async function POST(request: NextRequest, ctx: { params: Promise<{ project: string }> }) {
  const lookup = await resolveProjectActor((await ctx.params).project);
  if (!lookup) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });
  if (lookup === 'sin-proyecto') return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  if (!lookup.actor || !canIssuePreviewTokens(lookup.actor)) {
    return NextResponse.json({ error: 'No podés emitir tokens de preview en este proyecto' }, { status: 403 });
  }

  const { project } = await ctx.params;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }
  const body = raw as { ttlMinutes?: unknown; note?: unknown };
  if (typeof body.ttlMinutes !== 'number' || body.ttlMinutes < MIN_TTL_MINUTES || body.ttlMinutes > MAX_TTL_MINUTES) {
    return NextResponse.json(
      { error: `ttlMinutes tiene que estar entre ${MIN_TTL_MINUTES} y ${MAX_TTL_MINUTES}`, field: 'ttlMinutes' },
      { status: 400 },
    );
  }
  if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') {
    return NextResponse.json({ error: 'Nota inválida', field: 'note' }, { status: 400 });
  }

  const token = await getRepo().createPreviewToken(project, body.ttlMinutes, (body.note as string | null | undefined) ?? null);
  return NextResponse.json(token, { status: 201 });
}
