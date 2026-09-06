import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NewTenantScreen } from '@/components/onboarding/new-tenant-screen.tsx';
import { requireSession } from '@/lib/auth.ts';
import { isCurrentUserPlatformAdmin } from '@/lib/onboarding/platform-admins.ts';

/**
 * Alta de cliente. Está fuera del `AppShell` a propósito: el shell se dibuja
 * alrededor de un tenant, y acá justamente todavía no hay ninguno.
 *
 * La ruta es estática y gana sobre `/t/[tenant]`, por eso `new` está en
 * RESERVED_TENANT_SLUGS.
 *
 * (Hallazgo B7 — medida puente) Antes cualquier sesión llegaba hasta acá y
 * creaba tenants sin límite. Ahora sólo se muestra el formulario a quien
 * figure en `R360_PLATFORM_ADMINS`; el resto ve un aviso, sin formulario que
 * vaya a fallar. Esto es sólo la vidriera: quien de verdad protege es el
 * mismo chequeo en `POST /api/t/[tenant]`, que no confía en esta pantalla.
 */
export default async function NewTenantPage() {
  const session = await requireSession();
  if (session.memberships.every((m) => m.role === 'sales') && session.memberships.length > 0) {
    redirect(`/s/t/${session.memberships[0]?.tenantSlug ?? ''}`);
  }

  const authorized = isCurrentUserPlatformAdmin(session.email);

  return (
    <main style={{ padding: 24, display: 'grid', gap: 14, maxWidth: 460 }}>
      <header style={{ display: 'grid', gap: 4 }}>
        <h1 style={{ fontSize: 16, fontWeight: 600 }}>Nuevo cliente</h1>
        <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
          Una inmobiliaria o desarrolladora. Sus proyectos cuelgan de acá.
        </p>
      </header>

      {authorized ? (
        <NewTenantScreen existingSlugs={session.memberships.map((m) => m.tenantSlug)} />
      ) : (
        <p style={{ fontSize: 12, color: 'var(--fg-muted)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
          El alta de clientes nuevos es solo por invitación: la gestiona la dueña de Vrotta Prop 360. Si necesitás uno,
          escribile directamente a ella.
        </p>
      )}

      {session.memberships.length > 0 && (
        <nav style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Tus clientes</span>
          {session.memberships.map((m) => (
            <Link key={m.tenantSlug} href={`/t/${m.tenantSlug}/p`} style={{ fontSize: 12 }}>
              {m.tenantName}
            </Link>
          ))}
        </nav>
      )}
    </main>
  );
}
