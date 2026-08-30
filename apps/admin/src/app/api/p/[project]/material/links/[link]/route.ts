import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';

/**
 * Revoca un link. Es inmediato y no se deshace: para volver a dar acceso se
 * emite uno nuevo. La fila queda (no se borra) para poder auditar después qué
 * link se usó para subir qué.
 */
export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ project: string; link: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });

  const { project, link } = await ctx.params;
  const links = await getRepo().listMaterialShareLinks(project);
  if (!links.some((l) => l.id === link)) {
    return NextResponse.json({ error: 'Link inexistente' }, { status: 404 });
  }

  await getRepo().revokeMaterialShareLink(project, link);
  return new NextResponse(null, { status: 204 });
}
