import { NextResponse, type NextRequest } from 'next/server';
import { resolveProjectActor } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { canShareMaterialLink } from '@/lib/roles.ts';

/**
 * Revoca un link. Es inmediato y no se deshace: para volver a dar acceso se
 * emite uno nuevo. La fila queda (no se borra) para poder auditar después qué
 * link se usó para subir qué.
 *
 * Mismo hueco que `../route.ts` (POST): `canShareMaterialLink` es "emitir O
 * revocar", así que el chequeo va también acá. La policy `material_share_
 * links_update` de RLS (que es lo que usa `revokeMaterialShareLink` por
 * debajo) también permite `owner`/`editor`, no sólo Administrador+Vrotta.
 */
export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ project: string; link: string }> }) {
  const lookup = await resolveProjectActor((await ctx.params).project);
  if (!lookup) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });
  if (lookup === 'sin-proyecto') return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  if (!lookup.actor || !canShareMaterialLink(lookup.actor)) {
    return NextResponse.json({ error: 'No podés revocar links de material en este proyecto' }, { status: 403 });
  }

  const { project, link } = await ctx.params;
  const links = await getRepo().listMaterialShareLinks(project);
  if (!links.some((l) => l.id === link)) {
    return NextResponse.json({ error: 'Link inexistente' }, { status: 404 });
  }

  await getRepo().revokeMaterialShareLink(project, link);
  return new NextResponse(null, { status: 204 });
}
