import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ project: string; token: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });

  const { project, token } = await ctx.params;
  await getRepo().revokePreviewToken(project, decodeURIComponent(token));
  return NextResponse.json({ ok: true });
}
