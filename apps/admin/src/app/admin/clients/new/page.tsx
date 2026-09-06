import Link from 'next/link';
import { NewTenantScreen } from '@/components/onboarding/new-tenant-screen.tsx';
import { requirePlatformAdmin } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';

/**
 * Alta de cliente. Reemplaza a `/t/new`: ahora sólo Vrotta Admin da de alta
 * inmobiliarias (`canCreateTenant`, `tenants_insert` en la migración 0019).
 *
 * Fuera del `AppShell` a propósito, igual que antes: el shell se dibuja
 * alrededor de un tenant, y acá justamente todavía no hay ninguno.
 *
 * `requirePlatformAdmin` devuelve 404 (no 403) a quien no sea de plataforma:
 * ver la nota en `lib/auth.ts` — no tiene por qué enterarse de que la
 * pantalla existe.
 */
export default async function NewClientPage() {
  await requirePlatformAdmin();
  const existingSlugs = (await getRepo().listTenants()).map((t) => t.slug);

  return (
    <main style={{ padding: 24, display: 'grid', gap: 14, maxWidth: 460 }}>
      <header style={{ display: 'grid', gap: 4 }}>
        <h1 style={{ fontSize: 16, fontWeight: 600 }}>Nuevo cliente</h1>
        <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
          Una inmobiliaria o desarrolladora. Sus proyectos cuelgan de acá.
        </p>
      </header>

      <NewTenantScreen existingSlugs={existingSlugs} />

      <Link href="/admin" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
        ← Volver a Clientes
      </Link>
    </main>
  );
}
