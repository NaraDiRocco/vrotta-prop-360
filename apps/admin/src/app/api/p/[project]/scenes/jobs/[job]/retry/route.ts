import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';

export async function POST(_request: NextRequest, ctx: { params: Promise<{ project: string; job: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });

  const { project, job } = await ctx.params;
  try {
    await getRepo().retryJob(project, job);
    return NextResponse.json({ ok: true });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'No se pudo reintentar' },
      { status: 422 },
    );
  }
}
