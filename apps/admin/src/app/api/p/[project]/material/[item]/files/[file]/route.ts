import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { removeMaterialObject, signedMaterialUrl } from '@/lib/material/storage.ts';

async function findFile(projectId: string, fileId: string) {
  const files = await getRepo().listMaterialFiles(projectId);
  return files.find((f) => f.id === fileId) ?? null;
}

/** URL firmada de descarga (vida corta). El bucket es privado. */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ project: string; file: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });

  const { project, file } = await ctx.params;
  const row = await findFile(project, file);
  if (!row) return NextResponse.json({ error: 'Archivo inexistente' }, { status: 404 });

  const url = await signedMaterialUrl(row.storagePath, 'panel');
  return NextResponse.json({ url, filename: row.filename });
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ project: string; file: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });

  const { project, file } = await ctx.params;
  const row = await findFile(project, file);
  if (!row) return NextResponse.json({ error: 'Archivo inexistente' }, { status: 404 });

  // Primero la fila y después el objeto: si falla el borrado del byte queda un
  // huérfano en el bucket (barato de limpiar), y no una fila que apunta a nada.
  await getRepo().deleteMaterialFile(project, file);
  try {
    await removeMaterialObject(row.storagePath);
  } catch {
    /* huérfano en el bucket: no bloquea al operador */
  }
  return new NextResponse(null, { status: 204 });
}
