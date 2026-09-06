/**
 * Alta de cliente (tenant). Reemplaza a `POST /api/t/[tenant]` (borrado):
 * ahora el slug viaja en el cuerpo, no en la URL, porque ya no hay una ruta
 * `/t/[tenant]` involucrada en el alta — la pantalla que llama a esto es
 * `/admin/clients/new`, fuera de cualquier tenant.
 *
 * Sólo Vrotta Admin (`canCreateTenant`). `createTenant` en `supabase-repo.ts`
 * escribe con la sesión de quien llama: la policy `tenants_insert` de la
 * migración 0019 es la que de verdad autoriza esto en la base, este chequeo
 * es la vidriera que evita mostrarle a cualquiera un botón que iba a fallar.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { resolvePlatformActor } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { canCreateTenant } from '@/lib/roles.ts';
import { RESERVED_TENANT_SLUGS, slugError } from '@/lib/onboarding/slug.ts';

export interface CreateClientBody {
  slug: string;
  name: string;
}

export interface CreateClientResponse {
  tenant: { id: string; slug: string; name: string };
}

export async function POST(request: NextRequest) {
  // `resolvePlatformActor`, no `requirePlatform`: esa última hace notFound(),
  // que en un Route Handler devuelve el 404 de PÁGINA (HTML) — inservible
  // para el fetch() del panel.
  const resolved = await resolvePlatformActor();
  if (!resolved) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });
  if (!canCreateTenant(resolved.actor)) {
    return NextResponse.json({ error: 'Sólo Vrotta Admin puede dar de alta un cliente nuevo.' }, { status: 403 });
  }

  let body: CreateClientBody;
  try {
    body = (await request.json()) as CreateClientBody;
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }

  const slug = String(body.slug ?? '').trim();
  const bad = slugError(slug, { reserved: RESERVED_TENANT_SLUGS });
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });

  const name = String(body.name ?? '').trim();
  if (name.length === 0) return NextResponse.json({ error: 'El cliente necesita un nombre.' }, { status: 400 });

  try {
    const tenant = await getRepo().createTenant({ slug, name });
    return NextResponse.json({ tenant } satisfies CreateClientResponse, { status: 201 });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'No pude crear el cliente.' },
      { status: 409 },
    );
  }
}
