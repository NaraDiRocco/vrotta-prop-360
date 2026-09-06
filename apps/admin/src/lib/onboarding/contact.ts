/**
 * Vrotta Prop 360 no tiene alta abierta (hallazgo B7 de la auditoría): cada
 * inmobiliaria entra por invitación directa de la dueña, no llenando un
 * formulario en `/signup`. Esto arma los links de contacto reales que
 * reemplazan a ese formulario — mailto y/o WhatsApp, según lo que esté
 * configurado por variable de entorno.
 *
 * Lógica pura (no toca `process.env`) para poder testearla sin mockear
 * entorno: quien la llama (el server component de `/signup`) le pasa los
 * valores ya leídos.
 */

export interface ContactLink {
  label: string;
  href: string;
}

/** wa.me exige el número en dígitos, sin '+', espacios ni guiones. */
function onlyDigits(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

export interface ContactEnv {
  email?: string | undefined;
  whatsapp?: string | undefined;
}

/**
 * Devuelve los links de contacto disponibles, en orden de preferencia
 * (email primero). Si ninguna de las dos variables está configurada, devuelve
 * una lista vacía — la pantalla que llama a esto tiene que mostrar algo
 * sensato en ese caso, nunca un link roto.
 */
export function buildContactLinks(env: ContactEnv): ContactLink[] {
  const links: ContactLink[] = [];

  const email = env.email?.trim();
  if (email) {
    const subject = encodeURIComponent('Acceso a Vrotta Prop 360');
    links.push({ label: `Escribir a ${email}`, href: `mailto:${email}?subject=${subject}` });
  }

  const digits = env.whatsapp ? onlyDigits(env.whatsapp) : '';
  if (digits) {
    links.push({ label: 'Escribir por WhatsApp', href: `https://wa.me/${digits}` });
  }

  return links;
}
