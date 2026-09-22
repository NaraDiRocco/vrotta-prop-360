import { NextResponse, type NextRequest } from 'next/server';
import { resolveProjectActor } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { canIssuePreviewTokens } from '@/lib/roles.ts';

/** Mismo hueco y mismo criterio de cierre que `../route.ts`: ver el comentario ahí. */
export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ project: string; token: string }> }) {
  const lookup = await resolveProjectActor((await ctx.params).project);
  if (!lookup) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });
  if (lookup === 'sin-proyecto') return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  if (!lookup.actor || !canIssuePreviewTokens(lookup.actor)) {
    return NextResponse.json({ error: 'No podés revocar tokens de preview en este proyecto' }, { status: 403 });
  }

  const { project, token } = await ctx.params;
  await getRepo().revokePreviewToken(project, decodeURIComponent(token));
  return NextResponse.json({ ok: true });
}
