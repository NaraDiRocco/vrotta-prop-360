import type { ReactNode } from 'react';
import { buildContactLinks } from '@/lib/onboarding/contact.ts';
import './auth.css';

/**
 * Layout compartido de las cinco pantallas fuera de sesión (login, signup,
 * invitación, recuperar/cambiar contraseña). Antes cada una era una columna
 * de 320 px sin marca ni imagen — la primera impresión que se lleva una
 * inmobiliaria cuando le llega el link por WhatsApp. Server component: no
 * necesita estado, y arma los links de contacto leyendo el entorno acá para
 * no repetirlo en cada página.
 *
 * `title` es el propósito de la pantalla, no el nombre del producto (que ya
 * está en el panel de marca): "Entrá al panel", "Aceptá tu invitación", etc.
 */
const TAGLINE = 'Recorridos 360° con disponibilidad en vivo para tu proyecto.';

export interface AuthLayoutProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Pie "¿Necesitás acceso? Escribinos". Por defecto sí: es el mismo texto
   *  en las cinco pantallas. Se apaga donde el contenido principal YA es
   *  ese mismo mensaje (signup, invitación vencida) para no repetirlo. */
  contactFooter?: boolean;
}

export function AuthLayout({ title, description, children, contactFooter = true }: AuthLayoutProps) {
  const links = buildContactLinks({
    email: process.env['R360_CONTACT_EMAIL'],
    whatsapp: process.env['R360_CONTACT_WHATSAPP'],
  });

  return (
    <div className="auth-shell">
      {/*
       * Nadie es experto en un login: estas cinco pantallas van siempre en
       * densidad cómoda, sin importar la preferencia guardada de la persona
       * (que puede ser "compacta" si es de Vrotta y llega acá para cambiar
       * su propia contraseña). El layout raíz ya manda "cómoda" por defecto
       * para quien no tiene sesión (`defaultDensityForSession`), así que
       * esto es sólo la red de seguridad para ese caso con sesión.
       */}
      <script
        // eslint-disable-next-line react/no-danger -- mismo patrón que el bootstrap de tema/densidad de app/layout.tsx
        dangerouslySetInnerHTML={{
          __html: 'document.documentElement.setAttribute("data-density","comfortable")',
        }}
      />
      <div className="auth-brand" aria-hidden="true">
        <div className="auth-brand-top">
          <span className="auth-wordmark">
            Vrotta <strong>Prop 360</strong>
          </span>
          <p className="auth-tagline">{TAGLINE}</p>
        </div>
        <div className="auth-brand-image" />
      </div>
      <main className="auth-main">
        <div className="r-surface auth-card">
          <div className="auth-card-header">
            <h1 className="auth-title">{title}</h1>
            {description && <p className="auth-desc">{description}</p>}
          </div>
          <div className="auth-body">{children}</div>
          {contactFooter && <AuthContactFooter links={links} />}
        </div>
      </main>
    </div>
  );
}

function AuthContactFooter({ links }: { links: { label: string; href: string }[] }) {
  return (
    <div className="auth-contact-footer">
      {links.length > 0 ? (
        <>
          <p>¿Necesitás acceso?</p>
          <div className="auth-contact-links">
            {links.map((link) => (
              <a key={link.href} className="r-btn" data-variant="ghost" href={link.href}>
                {link.label}
              </a>
            ))}
          </div>
        </>
      ) : (
        <p>¿Necesitás acceso? Consultá con quien administra tu cuenta en tu inmobiliaria.</p>
      )}
    </div>
  );
}
