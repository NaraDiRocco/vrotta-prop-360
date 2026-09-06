import { NextResponse, type NextRequest } from 'next/server';
import { resolveProjectActor } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { canDeleteLead, canManageLeads } from '@/lib/roles.ts';
import type { LeadPatch } from '@/lib/data/types.ts';

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ project: string; lead: string }> }) {
  const { project, lead } = await ctx.params;
  const lookup = await resolveProjectActor(project);
  if (!lookup) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });
  if (lookup === 'sin-proyecto') return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  // Vrotta Operador VE los leads (para dar soporte) pero no los gestiona: el
  // seguimiento comercial es de la inmobiliaria.
  if (!lookup.actor || !canManageLeads(lookup.actor)) {
    return NextResponse.json({ error: 'No podés gestionar leads en este proyecto' }, { status: 403 });
  }

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

/** Borrar un lead. Sólo Administrador (owner) y Vrotta Admin — el Gestor
 *  gestiona pero no borra, y Vrotta Operador ni gestiona ni borra. */
export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ project: string; lead: string }> }) {
  const { project, lead } = await ctx.params;
  const lookup = await resolveProjectActor(project);
  if (!lookup) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });
  if (lookup === 'sin-proyecto') return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  if (!lookup.actor || !canDeleteLead(lookup.actor)) {
    return NextResponse.json({ error: 'No podés borrar leads en este proyecto' }, { status: 403 });
  }

  try {
    await getRepo().deleteLead(lead);
    return NextResponse.json({ ok: true });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'No se pudo borrar' },
      { status: 422 },
    );
  }
}
