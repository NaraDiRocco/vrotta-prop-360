import Link from 'next/link';
import { requirePlatform } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { canCreateTenant, PLATFORM_ROLE_LABEL } from '@/lib/roles.ts';
import { AppShell } from '@/components/app-shell.tsx';

/**
 * "Clientes": la puerta de entrada del equipo de Vrotta. Cada fila es una
 * inmobiliaria y lleva a `/t/<slug>/p` — desde ahí el panel es el mismo de
 * siempre, con todos los botones de plataforma prendidos (`requireAdmin`
 * ya sabe resolver el tenant por slug para un actor de plataforma).
 *
 * Usa el mismo `AppShell` que el resto del panel, en modo plataforma (sin
 * tenant): antes quedaba afuera del shell "porque todavía no hay cliente" y
 * el resultado era que la pantalla de aterrizaje del equipo de Vrotta parecía
 * otra aplicación — sin navegación, con un toggle de tema suelto y sin forma
 * de cerrar sesión. Que no haya cliente elegido es justamente lo que el
 * sidebar en modo plataforma sabe decir.
 */
export default async function AdminClientsPage() {
  const { role, actor } = await requirePlatform();
  const clients = await getRepo().getAdminClientsSummary();
  const sorted = [...clients].sort((a, b) => a.tenant.name.localeCompare(b.tenant.name));
  const canCreate = canCreateTenant(actor);

  return (
    <AppShell
      actor={actor}
      crumbs={[{ label: 'Clientes' }]}
      actions={
        canCreate ? (
          <Link href="/admin/clients/new" className="r-btn" data-variant="primary">
            Nuevo cliente
          </Link>
        ) : undefined
      }
    >
      <div style={{ padding: '20px 24px', display: 'grid', gap: 16, maxWidth: 1100, margin: '0 auto' }}>
        <header style={{ display: 'grid', gap: 2 }}>
          <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>Clientes</h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-muted)' }}>
            Todas las inmobiliarias de Vrotta Prop 360 — {PLATFORM_ROLE_LABEL[role]}
          </p>
        </header>

      {sorted.length === 0 ? (
        <div className="r-surface" style={{ padding: 24, textAlign: 'center', color: 'var(--fg-muted)', fontSize: 'var(--text-base)' }}>
          Todavía no hay ningún cliente cargado.
          {canCreate && (
            <>
              {' '}
              <Link href="/admin/clients/new">Dar de alta el primero.</Link>
            </>
          )}
        </div>
      ) : (
        <div className="r-surface" style={{ overflow: 'hidden' }}>
          <table className="r-table">
            <thead>
              <tr>
                <th className="r-th">Cliente</th>
                <th className="r-th" style={{ width: 110, textAlign: 'right' }}>
                  Proyectos
                </th>
                <th className="r-th" style={{ width: 150, textAlign: 'right' }}>
                  Material pendiente
                </th>
                <th className="r-th" style={{ width: 160 }}>
                  Última publicación
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((client) => (
                <tr key={client.tenant.id} className="r-row">
                  <td className="r-td">
                    <Link href={`/t/${client.tenant.slug}/p`} style={{ fontWeight: 600 }}>
                      {client.tenant.name}
                    </Link>
                    <span style={{ marginLeft: 6, fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>
                      /{client.tenant.slug}
                    </span>
                  </td>
                  <td className="r-td tnum" style={{ textAlign: 'right' }}>
                    {client.projectsCount}
                  </td>
                  <td className="r-td tnum" style={{ textAlign: 'right' }}>
                    {client.pendingMaterialCount > 0 ? (
                      <span style={{ color: 'var(--ui-warn)' }}>{client.pendingMaterialCount}</span>
                    ) : (
                      <span style={{ color: 'var(--fg-muted)' }}>0</span>
                    )}
                  </td>
                  <td className="r-td" suppressHydrationWarning>
                    {client.lastPublishedAt ? new Date(client.lastPublishedAt).toLocaleDateString('es-UY') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </AppShell>
  );
}
