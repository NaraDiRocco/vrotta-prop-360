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
 */
const PUBLIC_PATHS = ['/login', '/auth', '/m', '/api/material'];

/**
 * Renueva la sesión de Supabase en cada request y saca del panel a quien no
 * esté logueado. En modo mock no hace nada: no hay sesión que renovar.
 */
export async function middleware(request: NextRequest) {
  if (process.env['NEXT_PUBLIC_R360_MOCK'] !== '0') return NextResponse.next();

  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  if (!url || !key) return NextResponse.next();

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
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

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
