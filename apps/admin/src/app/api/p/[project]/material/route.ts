import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { buildEntries, summarize } from '@/lib/material/summary.ts';
import type { MaterialResponse } from '@/lib/material/api-types.ts';

/** Catálogo del proyecto con el estado y los archivos de cada ítem, en una llamada. */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ project: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });

  const { project } = await ctx.params;
  const repo = getRepo();
  const projectRow = await repo.getProjectById(project);
  if (!projectRow) return NextResponse.json({ error: 'Proyecto inexistente' }, { status: 404 });

  const [states, files] = await Promise.all([repo.listMaterial(project), repo.listMaterialFiles(project)]);
  const entries = buildEntries(projectRow.kind, states, files);
  const body: MaterialResponse = {
    projectKind: projectRow.kind,
    entries: entries.map((e) => ({
      item: e.item,
      status: e.status,
      notes: e.notes,
      updatedAt: e.updatedAt,
      files: e.files,
    })),
    summary: summarize(entries),
  };
  return NextResponse.json(body);
}
