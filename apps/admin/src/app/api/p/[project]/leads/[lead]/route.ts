import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import type { LeadPatch } from '@/lib/data/types.ts';

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ project: string; lead: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });

  const { lead } = await ctx.params;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }
  if (raw === null || typeof raw !== 'object') {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }

  try {
    const updated = await getRepo().updateLead(lead, raw as LeadPatch);
    return NextResponse.json(updated);
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'No se pudo guardar' },
      { status: 422 },
    );
  }
}
