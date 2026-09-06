/**
 * Validación de contraseña del lado del cliente. Tiene que reflejar
 * `password_requirements` / `minimum_password_length` de `supabase/config.toml`:
 * la idea es que la persona vea el problema ANTES del viaje de red, no
 * después de que Supabase la rechace. Si cambia la política allá, hay que
 * tocar esto también (y viceversa).
 */

export const MIN_PASSWORD_LENGTH = 8;

export interface PasswordCheck {
  ok: boolean;
  error: string | null;
}

/** Sola, sin la confirmación: longitud + que combine letras y números. */
export function checkPassword(password: string): PasswordCheck {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { ok: false, error: 'Tiene que incluir al menos una letra.' };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, error: 'Tiene que incluir al menos un número.' };
  }
  return { ok: true, error: null };
}

/**
 * Chequeo completo de un formulario de alta/cambio de contraseña: valida la
 * contraseña y, aparte, que coincida con su confirmación. Un solo punto de
 * entrada para no repetir el orden de los chequeos en cada pantalla.
 */
export function checkNewPassword(password: string, confirmation: string): PasswordCheck {
  const base = checkPassword(password);
  if (!base.ok) return base;
  if (password !== confirmation) {
    return { ok: false, error: 'Las contraseñas no coinciden.' };
  }
  return { ok: true, error: null };
}
