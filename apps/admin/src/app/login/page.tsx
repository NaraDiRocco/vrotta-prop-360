import { isMockMode } from '@/lib/data/repo.ts';
import { translateAuthError } from '@/lib/auth/errors.ts';
import { LoginForm } from './login-form.tsx';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = typeof params['next'] === 'string' ? params['next'] : '/';
  // El callback de magic link / recuperación de contraseña vuelve acá con
  // `?error=` cuando el code exchange falla (enlace vencido, ya usado, etc.).
  const rawError = typeof params['error'] === 'string' ? params['error'] : null;
  // `sin-tenant` no es un error de Supabase Auth (la raíz lo dispara cuando
  // el login funcionó pero la sesión no tiene ni membership ni rol de
  // plataforma): `translateAuthError` no lo reconoce y mostraría el código
  // crudo. Se traduce acá, aparte, con el mensaje que le sirve a la persona.
  const message =
    rawError === 'sin-tenant'
      ? 'Todavía no formás parte de ninguna inmobiliaria. Pedile a tu inmobiliaria, o directamente a Vrotta, que te inviten.'
      : rawError
        ? translateAuthError(rawError)
        : null;
  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', padding: 24 }}>
      <div style={{ width: 320 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Vrotta Prop 360</h1>
        <p style={{ color: 'var(--fg-muted)', marginBottom: 16 }}>Panel de administración</p>
        <LoginForm next={next} mock={isMockMode()} initialError={message} />
      </div>
    </main>
  );
}
