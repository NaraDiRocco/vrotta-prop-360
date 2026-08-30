import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import type { LeadPatch } from '@/lib/data/types.ts';

/**
 * Lista los leads del proyecto (con filtros por querystring). `project` acá
 * es el id, igual que en el resto de `/api/p/[project]/*`; para filtrar por
 * proyecto usamos el id como `projectId` y resolvemos el tenant a partir de
 * la sesión (mismo patrón simplificado que en publish/route.ts).
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ project: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });

  const { project } = await ctx.params;
  const tenantSlug = session.memberships[0]?.tenantSlug;
  if (!tenantSlug) return NextResponse.json([]);

  const sp = request.nextUrl.searchParams;
  const leads = await getRepo().listLeads(tenantSlug, {
    projectId: project,
    status: sp.get('status') ?? undefined,
    unitCode: sp.get('unitCode') ?? undefined,
    from: sp.get('from') ?? undefined,
    to: sp.get('to') ?? undefined,
    text: sp.get('q') ?? undefined,
  });
  return NextResponse.json(leads);
}

/** Acción masiva: `{ leadIds: string[], patch: LeadPatch }`. */
export async function POST(request: NextRequest, _ctx: { params: Promise<{ project: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }
  const body = raw as { leadIds?: unknown; patch?: unknown };
  if (!Array.isArray(body.leadIds) || body.leadIds.some((id) => typeof id !== 'string') || body.leadIds.length === 0) {
    return NextResponse.json({ error: 'Falta leadIds', field: 'leadIds' }, { status: 400 });
  }
  if (typeof body.patch !== 'object' || body.patch === null) {
    return NextResponse.json({ error: 'Falta patch', field: 'patch' }, { status: 400 });
  }

  const changed = await getRepo().bulkUpdateLeads(body.leadIds, body.patch as LeadPatch);
  return NextResponse.json({ changed });
}
