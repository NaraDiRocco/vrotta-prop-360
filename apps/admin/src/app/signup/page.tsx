import Link from 'next/link';
import { buildContactLinks } from '@/lib/onboarding/contact.ts';
import { AuthLayout } from '@/components/auth/auth-layout.tsx';

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
 *
 * `contactFooter={false}` en el layout: el pie estándar diría lo mismo que
 * ya dice el cuerpo de esta pantalla en grande, dos veces.
 */
export default async function SignupPage() {
  const links = buildContactLinks({
    email: process.env['R360_CONTACT_EMAIL'],
    whatsapp: process.env['R360_CONTACT_WHATSAPP'],
  });

  return (
    <AuthLayout title="Acceso por invitación" contactFooter={false}>
      <p className="auth-status-line">
        Vrotta Prop 360 no tiene alta abierta: cada inmobiliaria se suma al panel cuando nosotros la invitamos.
      </p>
      <p className="auth-status-line">
        {links.length > 0
          ? 'Escribinos y te damos de alta.'
          : 'Por ahora no hay un canal de contacto configurado — probá de nuevo más tarde.'}
      </p>

      {links.length > 0 && (
        <div className="auth-actions">
          {links.map((link, index) => (
            <a key={link.href} className="r-btn" data-variant={index === 0 ? 'primary' : 'secondary'} href={link.href}>
              {link.label}
            </a>
          ))}
        </div>
      )}

      <span className="auth-field-link">
        ¿Ya tenés cuenta? <Link href="/login">Iniciá sesión</Link>
      </span>
    </AuthLayout>
  );
}
