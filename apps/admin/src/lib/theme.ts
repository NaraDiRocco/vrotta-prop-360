/**
 * Tema del panel.
 *
 * El claro es el default de producto y no depende del sistema operativo: el
 * panel se mira ocho horas seguidas sobre tablas densas. El oscuro es opt-in
 * explícito, vive entero en el selector `[data-theme="dark"]` de globals.css
 * (los componentes sólo consumen tokens) y se persiste acá.
 *
 * El editor de hotspots no participa de esto: fuerza oscuro con sus propias
 * variables --ed-* por una razón óptica, no de preferencia.
 */
export const THEME_STORAGE_KEY = 'r360.theme';

export type Theme = 'light' | 'dark';

export function readStoredTheme(): Theme {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Aplica el atributo en <html> y lo persiste. El bootstrap del layout lee lo mismo. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'dark') root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* navegador sin storage: el tema vale para esta pestaña y listo */
  }
}
