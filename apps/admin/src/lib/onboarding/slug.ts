/**
 * Slugs y normalización de texto libre.
 *
 * El slug de un proyecto viaja en la URL pública del recorrido y es único por
 * tenant. Se autogenera del nombre pero SIEMPRE queda editable: el nombre
 * comercial cambia ("Baleia" → "Baleia Punta Ballena") y el slug no debería
 * cambiar con él una vez publicado.
 */

/** Quita acentos y baja a ASCII. `Dúplex` → `duplex`. */
export function deaccent(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function slugify(value: string): string {
  return deaccent(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Clave de comparación de encabezados/códigos: sin acentos, minúsculas y con
 * cualquier separador colapsado a `_`. `Superficie Cubierta (m2)` →
 * `superficie_cubierta_m2`.
 */
export function normalizeKey(value: string): string {
  return deaccent(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Slugs que no se pueden usar porque chocan con rutas estáticas del panel. */
export const RESERVED_TENANT_SLUGS: readonly string[] = ['new', 'api', 'login', 'auth', 's', 't', 'p'];

export function slugError(slug: string, opts: { reserved?: readonly string[] } = {}): string | null {
  if (slug.length === 0) return 'El slug no puede quedar vacío.';
  if (slug.length > 60) return 'El slug no puede pasar de 60 caracteres.';
  if (!SLUG_RE.test(slug)) return 'Sólo minúsculas, números y guiones simples (sin acentos ni espacios).';
  if ((opts.reserved ?? []).includes(slug)) return `«${slug}» está reservado por el panel.`;
  return null;
}

/** `baleia` ya existe → `baleia-2`. Determinista, para poder testearlo. */
export function uniqueSlug(base: string, taken: readonly string[]): string {
  const set = new Set(taken);
  if (!set.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`;
    if (!set.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}
