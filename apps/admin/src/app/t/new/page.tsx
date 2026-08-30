import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NewTenantScreen } from '@/components/onboarding/new-tenant-screen.tsx';
import { requireSession } from '@/lib/auth.ts';

/**
 * Alta de cliente. Está fuera del `AppShell` a propósito: el shell se dibuja
 * alrededor de un tenant, y acá justamente todavía no hay ninguno.
 *
 * La ruta es estática y gana sobre `/t/[tenant]`, por eso `new` está en
 * RESERVED_TENANT_SLUGS.
 */
export default async function NewTenantPage() {
  const session = await requireSession();
  if (session.memberships.every((m) => m.role === 'sales') && session.memberships.length > 0) {
    redirect(`/s/t/${session.memberships[0]?.tenantSlug ?? ''}`);
  }

  return (
    <main style={{ padding: 24, display: 'grid', gap: 14, maxWidth: 460 }}>
      <header style={{ display: 'grid', gap: 4 }}>
        <h1 style={{ fontSize: 16, fontWeight: 600 }}>Nuevo cliente</h1>
        <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
          Una inmobiliaria o desarrolladora. Sus proyectos cuelgan de acá.
        </p>
      </header>

      <NewTenantScreen existingSlugs={session.memberships.map((m) => m.tenantSlug)} />

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
