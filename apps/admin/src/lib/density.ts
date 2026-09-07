/**
 * Densidad del panel.
 *
 * Mismo patrón que `theme.ts` y mismo motivo: sin un bootstrap inline que
 * aplique el atributo ANTES del primer pintado, el panel arrancaría en un
 * preset y saltaría al otro cuando React hidrata, que es peor que no tener
 * el control.
 *
 * A diferencia del tema, acá no hay un default único: Vrotta opera tablas de
 * miles de filas y arranca en `compact` (13px, fila de 32px — lo de
 * siempre); la inmobiliaria mira la misma pantalla de a ratos, sobre tablas
 * de 20 a 640 filas, y arranca en `comfortable` (14px, fila de 40px). El
 * porqué completo está en el comentario de cabecera de `globals.css`. La
 * persona puede cambiar el preset desde el menú de usuario en cualquier
 * momento; esa elección se persiste y gana sobre el default del rol.
 */
import type { SessionUser } from './data/types.ts';

export const DENSITY_STORAGE_KEY = 'r360.density';

export type Density = 'compact' | 'comfortable';

/**
 * Vrotta (`platformRole` presente) trabaja sobre tablas de miles de filas
 * varias horas por día: compacta. Una inmobiliaria — o nadie, fuera de
 * sesión — mira de a ratos: cómoda. Toma `SessionUser` y no `Actor` porque
 * el layout raíz no resuelve el tenant de la URL: `platformRole` alcanza
 * para esta decisión, que es más gruesa que un permiso puntual.
 */
export function defaultDensityForSession(session: SessionUser | null): Density {
  return session?.platformRole ? 'compact' : 'comfortable';
}

/** Lee la preferencia guardada; si no hay ninguna, manda el default por rol. */
export function readStoredDensity(fallback: Density): Density {
  try {
    const stored = window.localStorage.getItem(DENSITY_STORAGE_KEY);
    return stored === 'compact' || stored === 'comfortable' ? stored : fallback;
  } catch {
    return fallback;
  }
}

/** Aplica el atributo en <html> y lo persiste. El bootstrap del layout lee lo mismo. */
export function applyDensity(density: Density): void {
  document.documentElement.setAttribute('data-density', density);
  try {
    window.localStorage.setItem(DENSITY_STORAGE_KEY, density);
  } catch {
    /* navegador sin storage: la densidad vale para esta pestaña y listo */
  }
}
