/**
 * Alta de cliente (tenant).
 *
 * El slug va en la ruta y no en el cuerpo a propósito: la URL del alta es la
 * URL que el cliente va a tener para siempre (`/t/<slug>/p`), así que
 * conviene que se vea desde el momento en que se elige.
 *
 * Crear un tenant es la única operación del panel que no puede pasar por la
 * RLS del usuario — ver `lib/onboarding/service-client.ts`.
 *
 * (Hallazgo B7 — medida puente) Este POST usaba la service key para crear
 * tenants a partir de CUALQUIER sesión válida: registro abierto en
 * `/signup` + esto era alta ilimitada de inmobiliarias en la infraestructura
 * de la dueña. Ahora exige que el email de la sesión esté en
 * `R360_PLATFORM_ADMINS`. Este chequeo del servidor es el que manda — el de
 * `/t/new/page.tsx` sólo evita mostrar un botón que iba a fallar acá. Es
 * transitorio: en cuanto exista un rol de plataforma en la base (lo está
 * diseñando otro agente en paralelo), esto se reemplaza por esa consulta.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { isCurrentUserPlatformAdmin } from '@/lib/onboarding/platform-admins.ts';
import { RESERVED_TENANT_SLUGS, slugError } from '@/lib/onboarding/slug.ts';

export interface CreateTenantBody {
  name: string;
}

export interface CreateTenantResponse {
  tenant: { id: string; slug: string; name: string };
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ tenant: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sin sesión.' }, { status: 401 });

  if (!isCurrentUserPlatformAdmin(session.email)) {
    return NextResponse.json(
      { error: 'El alta de clientes nuevos es solo por invitación de la dueña de Vrotta Prop 360.' },
      { status: 403 },
    );
  }

  const { tenant: slug } = await ctx.params;
  const bad = slugError(slug, { reserved: RESERVED_TENANT_SLUGS });
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });

  if (session.memberships.some((m) => m.tenantSlug === slug)) {
    return NextResponse.json({ error: `Ya sos miembro de «${slug}».` }, { status: 409 });
  }

  let body: CreateTenantBody;
  try {
    body = (await request.json()) as CreateTenantBody;
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }

  const name = String(body.name ?? '').trim();
  if (name.length === 0) return NextResponse.json({ error: 'El cliente necesita un nombre.' }, { status: 400 });

  try {
    const tenant = await getRepo().createTenant({ slug, name });
    return NextResponse.json({ tenant } satisfies CreateTenantResponse, { status: 201 });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'No pude crear el cliente.' },
      { status: 409 },
    );
  }
}
