import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { summaryFor } from '@/lib/material/summary.ts';

/**
 * Resumen barato para el checklist de salud: cuántos obligatorios faltan.
 * Existe separado del GET completo porque la portada del proyecto lo pide en
 * cada render y no necesita el catálogo entero.
 */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ project: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });

  const { project } = await ctx.params;
  const repo = getRepo();
  const projectRow = await repo.getProjectById(project);
  if (!projectRow) return NextResponse.json({ error: 'Proyecto inexistente' }, { status: 404 });

  const [states, files] = await Promise.all([repo.listMaterial(project), repo.listMaterialFiles(project)]);
  return NextResponse.json(summaryFor(projectRow.kind, states, files));
}
