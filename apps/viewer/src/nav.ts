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

export type NavTab = 'plan' | 'views' | 'units';

export interface NavBarOptions {
  container: HTMLElement;
  /** Cantidad de vistas (renders) para el contador de la pestaña. */
  viewsCount: number;
  onSelect: (tab: NavTab) => void;
}

const TABS: ReadonlyArray<{ id: NavTab; icon: string; label: string }> = [
  { id: 'plan', icon: '⌂', label: 'Plano' },
  { id: 'views', icon: '▣', label: 'Vistas' },
  { id: 'units', icon: '☰', label: 'Unidades' },
];

export class NavBar {
  readonly el: HTMLElement;
  private active: NavTab = 'plan';
  private viewsCount: number;

  constructor(private readonly opts: NavBarOptions) {
    this.viewsCount = opts.viewsCount;
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
    this.el.innerHTML = TABS.map((t) => {
      const count = t.id === 'views' && this.viewsCount ? ` <b>${this.viewsCount}</b>` : '';
      return `<button type="button" class="r360-nav__tab" data-tab="${t.id}" aria-current="false">
          <span class="r360-nav__icon" aria-hidden="true">${t.icon}</span>
          <span class="r360-nav__label">${t.label}${count}</span>
        </button>`;
    }).join('');
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
