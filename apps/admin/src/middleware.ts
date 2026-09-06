import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

/**
 * Rutas que NO exigen sesión.
 *
 * `/m` es la página que el cliente abre desde WhatsApp y `/api/material` es la
 * API que esa página consume: si el middleware la mandara al login, el link
 * compartible no serviría para nada. La autorización de esas dos rutas no la
 * da una sesión sino el token del link, que se valida en el propio endpoint
 * (ver `lib/material/share.ts`).
 *
 * `/signup`, `/forgot-password` y `/reset-password` son, junto con `/login`,
 * los únicos lugares del panel donde por definición todavía no hay sesión.
 */
const PUBLIC_PATHS = ['/login', '/signup', '/forgot-password', '/reset-password', '/auth', '/m', '/api/material'];

/**
 * Renueva la sesión de Supabase en cada request y saca del panel a quien no
 * esté logueado.
 *
 * (Hallazgo I6) El default es CERRADO: sólo se salta el chequeo si el modo
 * mock está prendido explícitamente (`=== '1'`). Antes era al revés
 * (`!== '0'`), así que si esta variable faltaba en el deploy — un `.env` mal
 * copiado, una var que no llegó a la imagen — el panel quedaba abierto de
 * par en par en producción. Olvidarse una variable ahora deja el panel
 * cerrado, no abierto.
 */
export async function middleware(request: NextRequest) {
  if (process.env['NEXT_PUBLIC_R360_MOCK'] === '1') return NextResponse.next();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  if (!url || !key) {
    // Sin mock y sin Supabase configurado no hay forma de autenticar a
    // nadie: mismo criterio de I6, esto también cierra en vez de abrir.
    if (isPublic) return NextResponse.next();
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.searchParams.set('next', path);
    return NextResponse.redirect(login);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(items: { name: string; value: string; options: CookieOptions }[]) {
        for (const item of items) request.cookies.set(item.name, item.value);
        response = NextResponse.next({ request });
        for (const item of items) response.cookies.set(item.name, item.value, item.options);
      },
    },
  });

  const { data } = await supabase.auth.getUser();

  if (!data.user && !isPublic) {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.searchParams.set('next', path);
    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)'],
};
