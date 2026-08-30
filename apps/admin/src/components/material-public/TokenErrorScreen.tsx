import type { ReactNode } from 'react';
import { CircleSlash, MessageCircle, ShieldAlert, TimerOff } from 'lucide-react';
import type { MaterialContact, MaterialTokenResolution } from './types.ts';

type ErrorResolution = Exclude<MaterialTokenResolution, { status: 'ok' }>;

function copyFor(resolution: ErrorResolution): { icon: ReactNode; title: string; desc: string } {
  switch (resolution.status) {
    case 'vencido':
      return {
        icon: <TimerOff size={26} aria-hidden />,
        title: 'Este link venció',
        desc: 'Los links de material tienen una vigencia limitada por seguridad. Escribile a tu contacto y te mandamos uno nuevo en un minuto.',
      };
    case 'revocado':
      return {
        icon: <ShieldAlert size={26} aria-hidden />,
        title: 'Este link ya no está disponible',
        desc: 'Fue desactivado del lado nuestro. Si necesitás seguir subiendo material, escribinos y te pasamos uno nuevo.',
      };
    case 'invalido':
    default:
      return {
        icon: <CircleSlash size={26} aria-hidden />,
        title: 'No encontramos este link',
        desc: 'Puede que esté mal copiado o incompleto. Revisá que lo hayas pegado entero, o pedile a tu contacto que te lo reenvíe.',
      };
  }
}

function contactHref(contact: MaterialContact): string {
  if (contact.medio === 'whatsapp') {
    const digits = contact.valor.replace(/[^\d]/g, '');
    return `https://wa.me/${digits}`;
  }
  return `mailto:${contact.valor}`;
}

export function TokenErrorScreen({ resolution }: { resolution: ErrorResolution }) {
  const { icon, title, desc } = copyFor(resolution);
  const contacto = 'contacto' in resolution ? resolution.contacto : null;

  return (
    <div className="mp mp-error-shell">
      <div className="mp-error-card">
        <div className="mp-error-icon">{icon}</div>
        <h1 className="mp-error-title">{title}</h1>
        <p className="mp-error-desc">{desc}</p>
        {contacto ? (
          <a className="mp-error-contact" href={contactHref(contacto)} target="_blank" rel="noopener noreferrer">
            <MessageCircle size={18} aria-hidden />
            Escribirle a {contacto.nombre}
          </a>
        ) : null}
      </div>
    </div>
  );
}
