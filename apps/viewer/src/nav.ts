/**
 * Barra inferior de navegación (móvil-first): tres pestañas fijas al alcance
 * del pulgar. Reemplaza el patrón "menú hamburguesa + barra superior de 7
 * ítems" que usa el competidor (ver `docs/06-BENCHMARK/3-PLAN-EXPERIENCIA.md`
 * §2). El recorrido tiene sólo dos niveles reales — el plano y una vista/
 * ficha — así que tres pestañas alcanzan y no crecen.
 *
 * No decide navegación por sí sola: sólo dibuja y avisa (`onSelect`). Quien
 * la monta (`ui.ts`) decide qué hacer con cada toque.
 */

/**
 * `views` (la galería de renders) dejó de ser una pestaña: el recorrido
 * guiado de seis tramos ocupa ese lugar (spec de experiencia §1, "el
 * Recorrido reemplaza a Vistas"). Los renders no se pierden — viven dentro
 * del Tramo 1 y del Tramo 3, enmarcados y etiquetados como proyecto, que es
 * donde significan algo; sueltos en una grilla sólo competían con las fotos
 * reales sin decir cuál era cuál.
 */
export type NavTab = 'tour' | 'plan' | 'units';

export interface NavBarOptions {
  container: HTMLElement;
  onSelect: (tab: NavTab) => void;
}

// La casa se llama Inicio y lleva a la portada. Antes decía "Recorrido" y
// abría el riel de tramos: con ícono de casa, prometía volver al principio y
// no lo hacía. El recorrido se empieza desde la portada, que es su lugar.
/**
 * Los íconos son SVG propios, no glifos de texto. Antes eran `⌂`, `▦` y `☰`:
 * los dibuja la fuente del sistema, así que cambiaban de forma, de grosor y de
 * alineación según el dispositivo, y ninguno de los tres tenía el mismo peso
 * visual. Acá los tres comparten caja de 24, trazo de 1.6 y remates
 * redondeados, y heredan `currentColor` para que el estado activo siga
 * saliendo del CSS.
 */
const svg = (cuerpo: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"` +
  ` stroke-linecap="round" stroke-linejoin="round">${cuerpo}</svg>`;

const ICONOS: Record<NavTab, string> = {
  // Casa: el arranque del recorrido.
  tour: svg('<path d="M4 10.3 12 4l8 6.3V19a1.2 1.2 0 0 1-1.2 1.2H5.2A1.2 1.2 0 0 1 4 19z"/>'),
  // Plano: el predio visto desde arriba, con la calle y los bloques.
  plan: svg(
    '<rect x="3.4" y="4.2" width="17.2" height="15.6" rx="2.2"/>' +
    '<path d="M9.6 4.2v15.6"/><path d="M3.4 12.2h6.2"/><path d="M14.4 8.6h6.2"/>' +
    '<path d="M14.4 15.8h6.2"/>',
  ),
  // Unidades: un listado, no un menú hamburguesa.
  units: svg(
    '<path d="M9.4 6.6h10.2"/><path d="M9.4 12h10.2"/><path d="M9.4 17.4h10.2"/>' +
    '<circle cx="5.1" cy="6.6" r="1.1"/><circle cx="5.1" cy="12" r="1.1"/>' +
    '<circle cx="5.1" cy="17.4" r="1.1"/>',
  ),
};

const TABS: ReadonlyArray<{ id: NavTab; icon: string; label: string }> = [
  { id: 'tour', icon: ICONOS.tour, label: 'Inicio' },
  { id: 'plan', icon: ICONOS.plan, label: 'Plano' },
  { id: 'units', icon: ICONOS.units, label: 'Unidades' },
];

export class NavBar {
  readonly el: HTMLElement;
  private active: NavTab = 'tour';

  constructor(private readonly opts: NavBarOptions) {
    this.el = document.createElement('nav');
    this.el.className = 'r360-nav';
    this.el.setAttribute('aria-label', 'Navegación del recorrido');
    this.el.addEventListener('click', this.onClick);
    this.render();
    opts.container.appendChild(this.el);
  }

  /** Cuál pestaña se ve "encendida". `null` = ninguna (p. ej. lightbox abierto). */
  setActive(tab: NavTab | null): void {
    this.active = tab ?? this.active;
    for (const btn of this.el.querySelectorAll<HTMLButtonElement>('.r360-nav__tab')) {
      const isActive = btn.dataset.tab === (tab ?? this.active);
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-current', isActive ? 'page' : 'false');
    }
  }

  destroy(): void {
    this.el.removeEventListener('click', this.onClick);
    this.el.remove();
  }

  private render(): void {
    this.el.innerHTML = TABS.map(
      (t) => `<button type="button" class="r360-nav__tab" data-tab="${t.id}" aria-current="false">
          <span class="r360-nav__icon" aria-hidden="true">${t.icon}</span>
          <span class="r360-nav__label">${t.label}</span>
        </button>`,
    ).join('');
  }

  private onClick = (e: Event): void => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.r360-nav__tab');
    const tab = btn?.dataset.tab as NavTab | undefined;
    if (!btn || !tab) return;
    // Señal de toque inmediata (regla dura del plan: <100ms de respuesta
    // visible), independiente de cuánto tarde en abrir la hoja.
    btn.classList.add('is-pressed');
    setTimeout(() => btn.classList.remove('is-pressed'), 160);
    this.opts.onSelect(tab);
  };
}
