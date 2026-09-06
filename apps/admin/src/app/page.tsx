import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth.ts';

/**
 * Landing tras el login: cada tipo de sesión tiene un único lugar natural
 * donde caer.
 *
 *  - Plataforma (Vrotta) → `/admin`, la lista de clientes: no tiene sentido
 *    elegir un tenant de entrada, ese es justamente el trabajo de esa
 *    pantalla.
 *  - Administrador/Gestor de una inmobiliaria → su panel.
 *  - Vendedor → el shell móvil, que es otra aplicación.
 *  - Sin plataforma y sin ninguna membership: no hay a dónde mandarlo. El
 *    `?error=sin-tenant` en `/login` es lo que dispara el mensaje de "pedile
 *    a tu inmobiliaria o a Vrotta que te inviten" — no un panel vacío.
 */
export default async function Home() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.platformRole) redirect('/admin');

  const first = session.memberships[0];
  if (!first) redirect('/login?error=sin-tenant');
  if (first.role === 'sales') redirect(`/s/t/${first.tenantSlug}`);
  redirect(`/t/${first.tenantSlug}/p`);
}
