/**
 * Quién puede dar de alta un tenant nuevo (`/t/new` y `POST /api/t/[tenant]`).
 *
 * MEDIDA PUENTE (hallazgo B7 de la auditoría): antes cualquier sesión válida
 * podía crear tenants ilimitados usando la service key de Supabase (ver
 * `service-client.ts`) — un agujero, porque el registro era abierto. Hasta
 * que exista un rol de plataforma en la base (lo está diseñando otro agente
 * en paralelo, con su propio modelo de invitaciones), la autorización vive
 * acá: una lista de emails en una variable de entorno de SERVIDOR. Cuando
 * ese rol exista, este archivo se reemplaza por una consulta a esa tabla y
 * se puede borrar entero — no hay que tocar nada más en este módulo.
 *
 * Env var: `R360_PLATFORM_ADMINS`, emails separados por coma. Nunca
 * `NEXT_PUBLIC_`: si el navegador pudiera leerla, cualquiera vería quién
 * tiene permiso de crear clientes nuevos. Si falta o queda vacía, el alta de
 * tenants queda CERRADA para todos — el default es cerrado, no abierto.
 */

/** Parsea la lista cruda de la env var. Lógica pura para poder testearla. */
export function parsePlatformAdmins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
}

/**
 * ¿Este email está en la lista de administradores de plataforma? La
 * comparación es case-insensitive porque el email de la sesión puede venir
 * con mayúsculas distintas a como se cargó la env var.
 */
export function isPlatformAdmin(email: string | null | undefined, raw: string | undefined): boolean {
  if (!email) return false;
  return parsePlatformAdmins(raw).includes(email.trim().toLowerCase());
}

/** Wrapper fino sobre `process.env` para el código de rutas/páginas. */
export function isCurrentUserPlatformAdmin(email: string | null | undefined): boolean {
  return isPlatformAdmin(email, process.env['R360_PLATFORM_ADMINS']);
}
