/**
 * Links de contacto directo de un lead (llamar / WhatsApp) — lógica pura,
 * sin JSX, para poder testearla sin montar ningún componente.
 *
 * Nace acá (no en `components/leads/`, que es de la Ola 2) porque el shell
 * de ventas la necesita ya: es la misma cuenta que hace `lead-detail.tsx`
 * (`lead.phone?.replace(/[^\d]/g, '')` para armar el `wa.me`) pero repetida
 * inline ahí. Cuando la Ola 2 toque ese archivo, migrarlo a este helper
 * evita que las dos pantallas hagan el strip de dígitos cada una a su modo.
 */

/** `tel:` acepta el número casi tal cual (con `+`, espacios y guiones). */
export function telHref(phone: string): string {
  return `tel:${phone.trim()}`;
}

/** wa.me exige el número en dígitos, sin '+', espacios ni guiones. */
export function waHref(phone: string): string | null {
  const digits = phone.replace(/[^0-9]/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}`;
}
