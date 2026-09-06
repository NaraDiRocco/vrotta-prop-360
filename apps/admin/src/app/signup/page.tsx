import Link from 'next/link';
import { buildContactLinks } from '@/lib/onboarding/contact.ts';

/**
 * Vrotta Prop 360 se vende uno a uno: la dueña da de alta cada inmobiliaria a
 * mano (hallazgo B7). Acá antes había un formulario de `auth.signUp()` que
 * dejaba crear una cuenta a cualquiera con un email — y de ahí, un tenant
 * ilimitado (ver `/t/new`). Esta pantalla ya no simula un registro: explica
 * que el acceso es por invitación y ofrece un camino de contacto real.
 *
 * Los links salen de `R360_CONTACT_EMAIL` / `R360_CONTACT_WHATSAPP` (env de
 * servidor, se leen acá porque este es un server component). Si ninguna de
 * las dos está configurada, no se ofrece ningún link roto: sólo el texto.
 */
export default async function SignupPage() {
  const links = buildContactLinks({
    email: process.env['R360_CONTACT_EMAIL'],
    whatsapp: process.env['R360_CONTACT_WHATSAPP'],
  });

  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', padding: 24 }}>
      <div style={{ width: 320, display: 'grid', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Vrotta Prop 360</h1>
          <p style={{ color: 'var(--fg-muted)' }}>Acceso por invitación</p>
        </div>

        <p style={{ fontSize: 13 }}>
          No hay alta abierta: cada inmobiliaria se suma al panel por invitación directa.
          {links.length > 0
            ? ' Escribinos y te damos de alta.'
            : ' Por ahora no hay un canal de contacto configurado — probá de nuevo más tarde.'}
        </p>

        {links.length > 0 && (
          <div style={{ display: 'grid', gap: 8 }}>
            {links.map((link) => (
              <a key={link.href} className="r-btn" data-variant="primary" href={link.href}>
                {link.label}
              </a>
            ))}
          </div>
        )}

        <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
          ¿Ya tenés cuenta? <Link href="/login">Iniciá sesión</Link>
        </span>
      </div>
    </main>
  );
}
