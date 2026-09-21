/**
 * El riel de seis tramos — la capa de DOM.
 *
 * Toda la lógica (qué tramo, qué capas, qué hace Atrás, qué foto va en qué
 * tramo, qué dice cada chapa) vive en `tour-rail.model.ts` y está probada con
 * `node --test`. Acá sólo se dibuja lo que ese modelo decide y se traducen
 * gestos a acciones. Si algo de este archivo tiene que decidir una regla del
 * recorrido, la regla está en el lugar equivocado.
 *
 * Reparto de responsabilidades con el resto del visor:
 *  - `ui.ts` monta el riel y le presta dos cosas que ya sabe hacer: abrir la
 *    ficha de una unidad y volver al plano. El riel no conoce `Sheet`, ni
 *    Leaflet, ni la ficha.
 *  - `beforeafter.ts` es una pieza cerrada: se consume por su API pública
 *    (`BeforeAfterSlider`), nunca por dentro. Este archivo sí lee
 *    `pair.before.url`/`pair.after.url` para pasárselas —es el único par
 *    antes/después del recorrido y ninguno de los dos está `restricted`.
 *  - El estado del recorrido viaja en el hash (`#/scene/llegada`) y en la
 *    historia del navegador: Atrás camina los tramos visitados y, con una
 *    foto abierta, primero la cierra.
 *
 * MÓVIL PRIMERO. El riel es una hoja a pantalla completa por encima de la
 * escena y por debajo de las pestañas: el pulgar tiene el botón "Siguiente"
 * y los seis puntos siempre en el tercio inferior, y el contenido scrollea
 * en vertical (profundidad) mientras las series scrollean en horizontal
 * (hermanos) con scroll nativo y `scroll-snap` — así el gesto es el del
 * sistema, con su inercia y su accesibilidad, y no una emulación con
 * `touchmove`.
 */
import './tour-rail.css';
import {
  STATUS_TOKENS,
  isUnitStatus,
  type AvailabilityFile,
  type BeforeAfterPair,
  type PhotoTourItem,
  type TourManifest,
} from '@r360/core';
import { escapeHtml, formatPrice, priceTextForUnit } from './polygons.ts';
import {
  buildCta,
  ctaContextFor,
  formatWhatsappDisplay,
  messageFromWhatsappHref,
  whatsappUrl,
  type Cta,
} from './contact.ts';
import { BeforeAfterSlider, type BeforeAfterHandle } from './beforeafter.ts';
// Pinch-zoom compartido con la ficha (`ui.ts`). Vivía duplicado en los dos
// archivos porque `ui.ts` no lo exportaba y además importa este módulo:
// sacarlo a `pinch-zoom.ts` rompe el ciclo y deja una sola implementación.
import { PinchZoom } from './pinch-zoom.ts';
import {
  TRAMOS,
  AMBIENTE_MODELO,
  LAST_UNIT_SEEN_KEY,
  TRAMO_UNIDAD_MODELO,
  buildRailContent,
  captionSinChapa,
  chapaFor,
  chapaVisible,
  indiceDeAmbiente,
  initialRailState,
  parseTramoHash,
  railCtaLabel,
  railCtaMessage,
  railNextLabel,
  railReduce,
  resumenDeBloque,
  resumenLinea,
  serieIndex,
  tramoDef,
  tramoIndex,
  type ChapaKind,
  type RailAction,
  type RailContent,
  type RailRender,
  type RailState,
  type TramoId,
} from './tour-rail.model.ts';

export interface TourRailOptions {
  container: HTMLElement;
  tour: TourManifest;
  /** Disponibilidad viva: se lee al dibujar, no se cachea. */
  availability: () => AvailabilityFile | null;
  /** URL del `tour.json`, para resolver las rutas relativas del material. */
  tourUrl: string;
  /** Abre la ficha de una unidad o bloque (la dibuja `ui.ts`). */
  onOpenUnit: (code: string) => void;
  /** Vuelve al plano (pestaña Plano). */
  onOpenPlan: () => void;
  /** El riel dejó de estar a la vista (Atrás, o "Ir al plano"). */
  onClosed: () => void;
  /** El riel volvió a estar a la vista. */
  onOpened: () => void;
  /** Volver al inicio: lo dispara el logo de la barra superior. */
  onHome: () => void;
  /** Abrir una escena del recorrido por su slug (las panoramicas 360). */
  onOpenScene: (slug: string) => void;
}

/** Mismos números que el resto del visor: separador de miles y coma decimal. */
const NUM = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Funde la imagen cuando llega, sobre la miniatura borrosa que ya está de
 * fondo. El `img.complete` no es paranoia: si la foto ya está en el cache del
 * navegador (la bienvenida bajó la hero, y volver a un tramo vuelve a
 * pintarla) el `load` puede no volver a dispararse, y sin esta línea la
 * imagen se quedaría transparente para siempre.
 */
/**
 * Pinta un texto respetando los saltos de línea que traiga el manifiesto: un
 * `\n` en la caption se dibuja como salto. Sirve para decidir dónde corta una
 * frase desde el dato y no a fuerza de ancho de caja, que cambia con cada
 * pantalla. Va por nodos de texto, no por `innerHTML`: la caption viene del
 * manifiesto y no se interpreta como marcado.
 */
/**
 * La composición del bloque editorial de cada foto del paseo, elegida a mano
 * mirando la imagen: dónde entra la línea, hacia dónde va y de qué lado queda
 * el texto. Ver `.r360-editorial` en `tour-rail.css`.
 */
const COMPOSICION: Record<string, 'ab-der' | 'ar-izq' | 'ar-der' | 'ar-der-b'> = {
  '16_living_comedor_amplio': 'ab-der',
  '14_living_ventanales_vista_verde': 'ar-izq',
  '17_cocina_equipada_completa': 'ar-der',
  '21_escalera_interna_duplex': 'ab-der',
  '20_dormitorio_placard_vacio': 'ar-izq',
  '19_bano_completo_ducha': 'ar-der',
  '12_terraza_pergolotecho_parrillero': 'ar-der-b',
  '22_parrillero_empotrado_detalle': 'ab-der',
  '13_terraza_sillon_vista_verde': 'ar-izq',
  '11_vista_terraza_peninsula_skyline': 'ar-der',
  // Tramo 4, lo proyectado.
  'render:amenities': 'ab-der',
  '01_aerea_contexto_costa_lejos': 'ar-izq',
  'render:complejo-laguna': 'ar-der',
  'render:complejo-pergola': 'ar-der-b',
  'render:complejo-llegada': 'ab-der',
  'render:complejo-terrazas': 'ar-izq',
  'render:complejo-fachada': 'ar-der',
};

/**
 * Cuánto mide un paso de la serie. No es el ancho de la pantalla: las fotos
 * del paseo dejan asomar un pedazo de la siguiente, así que miden un poco
 * menos y el salto tiene que seguir a la foto, no al marco.
 */
function pasoSerie(track: HTMLElement): number {
  const primera = track.firstElementChild as HTMLElement | null;
  return primera?.offsetWidth || track.clientWidth || 1;
}

function pintarConSaltos(el: HTMLElement, texto: string): void {
  const lineas = texto.split('\n');
  lineas.forEach((linea, i) => {
    if (i > 0) el.appendChild(document.createElement('br'));
    el.appendChild(document.createTextNode(linea));
  });
}

function fadeIn(img: HTMLImageElement): void {
  const on = () => img.classList.add('is-on');
  img.addEventListener('load', on, { once: true });
  if (img.complete && img.naturalWidth > 0) on();
}

/**
 * El archivo de marca del proyecto, SIEMPRE al lado del `tour.json`: cada
 * recorrido publicado trae el suyo y este archivo no conoce ninguna marca en
 * particular. Lo copia `build_tour.py` (desde `material/marca/`) en cada
 * corrida, así sobrevive a que `--publish` borre y recree la carpeta
 * publicada entera — antes hacía falta una segunda copia versionada en
 * `apps/viewer/public/marca/` justamente para eso, y era el mismo archivo
 * dos veces, con una sola de las dos dentro del pipeline.
 */
export const MARCA_SVG = 'marca/baleia-logo-blanco.svg';

/**
 * De dónde sale el logo: del manifiesto (`brandLogo`, que el builder emite y
 * `--publish` prefija junto al resto de las rutas) o, si no viene, de la
 * convención de al lado del `tour.json`. Las dos rutas se resuelven contra el
 * manifiesto, nunca contra la raíz del visor.
 */
export function marcaPath(tour: Pick<TourManifest, 'brandLogo'>): string {
  return tour.brandLogo ?? MARCA_SVG;
}

/**
 * Deja el logo puesto al principio de `host`, con su caída a texto: un
 * manifiesto sin marca publicada muestra el nombre del proyecto, nunca un
 * cartel vacío ni el ícono roto del navegador.
 */
export function montarMarca(host: HTMLElement, src: string, nombre: string): void {
  const img = document.createElement('img');
  img.alt = nombre;
  img.decoding = 'async';
  img.addEventListener('error', () => {
    if (nombre) img.replaceWith(Object.assign(document.createElement('b'), { textContent: nombre }));
    else img.remove();
  });
  img.src = src;
  host.prepend(img);
}

/** Un par vertical (2:3) entra entero en el teléfono; uno apaisado se recorta (spec §3.1). */
function aspectOf(pair: BeforeAfterPair): '2:3' | '4:3' {
  return pair.before.height > pair.before.width ? '2:3' : '4:3';
}

/**
 * Qué piezas ocupan una PANTALLA entera y cuáles se agrupan en una pantalla de
 * texto (auditoría §4, Idea 1). Es la única regla de maquetado que necesita
 * saber `renderTramo`: cada `render…()` sigue armando sus piezas en orden y el
 * agrupado pasa después, en un solo lugar.
 */
const CLASES_MEDIA = [
  'r360-rail__foto',
  'r360-rail__render',
  'r360-rail__slider',
  'r360-rail__serie',
  'r360-rail__video',
  'r360-rail__switch',
  'r360-rail__diagonal',
  'r360-rail__cierre-final',
];

function esMedia(el: HTMLElement): boolean {
  return CLASES_MEDIA.some((c) => el.classList.contains(c));
}

export class TourRail {
  readonly el: HTMLElement;
  private state: RailState = initialRailState;
  private readonly content: RailContent;
  private readonly base: URL;
  private readonly scroll: HTMLElement;
  private readonly head: HTMLElement;
  private readonly marca: HTMLButtonElement;
  private readonly dots: HTMLElement;
  private readonly prevBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;
  private readonly layerEl: HTMLElement;
  private readonly sliders: BeforeAfterHandle[] = [];
  private readonly seriesCleanup: Array<() => void> = [];
  /** Piezas del tramo en curso, antes de agruparlas en pantallas. */
  private piezas: HTMLElement[] = [];
  /** Naturaleza de la última pieza que llevó chapa en este tramo. */
  private chapaPrev: ChapaKind | null = null;
  private pinch: PinchZoom | null = null;
  private layerCleanup: Array<() => void> = [];
  /** Serie y foto a la que hay que llegar en cuanto el tramo esté dibujado. */
  private foco: { serie: string; index: number } | null = null;

  constructor(private readonly opts: TourRailOptions) {
    this.base = new URL(opts.tourUrl, location.href);
    this.content = buildRailContent(opts.tour);

    this.el = document.createElement('section');
    this.el.className = 'r360-rail';
    this.el.hidden = true;
    this.el.setAttribute('aria-label', 'Recorrido guiado');
    this.el.innerHTML =
      `<header class="r360-rail__head"></header>` +
      `<div class="r360-rail__scroll" tabindex="-1"></div>` +
      `<footer class="r360-rail__foot">` +
      `<button type="button" class="r360-rail__prev"></button>` +
      `<div class="r360-rail__dots" role="tablist" aria-label="Tramos del recorrido"></div>` +
      `<button type="button" class="r360-rail__next"></button>` +
      `</footer>` +
      `<div class="r360-rail__layer" hidden></div>`;
    opts.container.appendChild(this.el);

    // La marca vive fuera del riel, en la franja de la barra superior: con el
    // recorrido abierto la barra decía "Masterplan" (el nombre de la escena
    // que está debajo) y en ninguna pantalla aparecía el nombre del proyecto
    // (auditoría §2.8). El logo se resuelve contra el `tour.json`, así que
    // cada proyecto trae el suyo y este archivo no conoce ninguna marca.
    // El logo es el boton de inicio, como en cualquier sitio: desde cualquier
    // pantalla vuelve a la portada. Es un <button> y no un <div> con listener
    // para que el teclado y el lector de pantalla lo traten como lo que es.
    this.marca = document.createElement('button');
    this.marca.type = 'button';
    this.marca.className = 'r360-rail__marca';
    this.marca.setAttribute('aria-label', 'Volver al inicio');
    this.marca.addEventListener('click', () => opts.onHome());
    montarMarca(this.marca, this.resolve(marcaPath(opts.tour)), opts.tour.project);
    opts.container.appendChild(this.marca);

    this.scroll = this.el.querySelector('.r360-rail__scroll')!;
    // El encabezado flota sobre la pantalla que esté a la vista. Casi todas
    // son oscuras, pero la lámina del render es clara y ahí el texto blanco
    // desaparece: se marca cuál se está viendo para que la hoja de estilos
    // pase el encabezado a tinta. Es lo mismo que hace una barra de navegación
    // que cambia de color al pasar sobre una sección clara.
    this.scroll.addEventListener('scroll', this.onScrollPantalla, { passive: true });
    this.head = this.el.querySelector('.r360-rail__head')!;
    this.dots = this.el.querySelector('.r360-rail__dots')!;
    this.prevBtn = this.el.querySelector('.r360-rail__prev')!;
    this.nextBtn = this.el.querySelector('.r360-rail__next')!;
    this.layerEl = this.el.querySelector('.r360-rail__layer')!;

    this.renderDots();
    this.prevBtn.addEventListener('click', () => this.dispatch({ type: 'anterior' }));
    this.nextBtn.addEventListener('click', () => this.dispatch({ type: 'siguiente' }));
    this.dots.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-tramo]');
      if (btn?.dataset.tramo) this.dispatch({ type: 'ir', tramo: btn.dataset.tramo as TramoId });
    });
    window.addEventListener('popstate', this.onPopState);
    window.addEventListener('hashchange', this.onPopState);
    document.addEventListener('keydown', this.onKey);
  }

  get isOpen(): boolean {
    return this.state.open;
  }

  /** Abre el riel (empujando historia) en el tramo pedido o en el último visto. */
  show(tramo?: TramoId): void {
    this.dispatch({ type: 'abrir', tramo }, { push: true });
  }

  /**
   * ¿Hay un paseo fotografiado por la unidad modelo? La ficha ofrece el
   * enlace "Ver la unidad modelo fotografiada" sólo si existe: sin material,
   * no hay a dónde llevar (auditoría §4, Idea 3).
   */
  get tieneUnidadModelo(): boolean {
    return indiceDeAmbiente(this.content.bloque.paseo, AMBIENTE_MODELO) != null;
  }

  /**
   * Abre el Tramo 2 en la foto del living del paseo. La ficha de la unidad
   * queda a un toque del material real: es la unidad de al lado, fotografiada,
   * y hasta ahora la ficha ni la mencionaba.
   */
  mostrarUnidadModelo(): void {
    const index = indiceDeAmbiente(this.content.bloque.paseo, AMBIENTE_MODELO);
    if (index == null) return;
    this.foco = { serie: 'paseo', index };
    this.show(TRAMO_UNIDAD_MODELO);
    // Si ya estaba parado en ese tramo, `railReduce` no repinta nada y el foco
    // sigue sin consumir: se aplica sobre lo que ya está dibujado.
    if (this.foco) this.aplicarFoco();
  }

  /** Lo esconde sin tocar la historia: lo usa `ui.ts` cuando el visitante toca otra pestaña. */
  hideQuiet(): void {
    this.state = railReduce(this.state, { type: 'cerrar' }).state;
    this.paintVisibility();
  }

  destroy(): void {
    window.removeEventListener('popstate', this.onPopState);
    window.removeEventListener('hashchange', this.onPopState);
    document.removeEventListener('keydown', this.onKey);
    this.clearTramo();
    this.closeLayerUi();
    this.marca.remove();
    this.el.remove();
  }

  // ------------------------------------------------------------- despacho

  private dispatch(action: RailAction, opts: { push?: boolean } = {}): void {
    const before = this.state;
    const { state, effect } = railReduce(this.state, action);
    this.state = state;
    if (effect === 'nada') return;

    if (effect === 'abierto' || effect === 'tramo') {
      if (before.tramo !== state.tramo || effect === 'abierto') this.renderTramo();
      this.paintVisibility();
      if (opts.push !== false) this.pushHash();
      this.opts.onOpened();
    } else if (effect === 'al-plano') {
      this.paintVisibility();
      this.opts.onClosed();
    } else if (effect === 'capa-cerrada') {
      this.closeLayerUi();
    }
  }

  /**
   * El hash es la dirección del tramo (spec, Anexo: `#/scene/llegada`). Se
   * empuja una entrada por tramo visitado: así Atrás camina el recorrido en
   * el orden en que el visitante lo hizo, en vez de saltar afuera.
   */
  private pushHash(): void {
    const hash = `#/scene/${this.state.tramo}`;
    if (location.hash === hash) return;
    // Se conserva el estado de capas de `ui.ts` (`r360Layers`): esta entrada
    // se suma a la pila, no la reemplaza.
    const prev = (history.state ?? {}) as Record<string, unknown>;
    history.pushState({ ...prev, r360Tramo: this.state.tramo }, '', hash);
  }

  private onPopState = (): void => {
    const tramo = parseTramoHash(location.hash);
    if (tramo) {
      if (this.state.layers.length) this.dispatch({ type: 'atras' });
      if (!this.state.open || this.state.tramo !== tramo) {
        this.dispatch({ type: 'ir', tramo }, { push: false });
      }
      return;
    }
    if (this.state.open) {
      // El hash ya no es un tramo (el visitante fue al plano o a una unidad):
      // el riel se aparta sin pelear con quien haya navegado.
      this.state = railReduce(this.state, { type: 'cerrar' }).state;
      this.paintVisibility();
      this.opts.onClosed();
    }
  };

  private onKey = (e: KeyboardEvent): void => {
    if (!this.state.open) return;
    if (e.key === 'Escape' && this.state.layers.length) {
      e.preventDefault();
      this.dispatch({ type: 'atras' });
    }
  };

  private paintVisibility(): void {
    this.el.hidden = !this.state.open;
    // La marca NO se oculta al cerrar el riel: acompaña al visitante en todas
    // las pantallas —el plano, las unidades, las panorámicas— y es además el
    // botón de volver al inicio. Aparecía sólo dentro de los tramos, así que
    // justo donde uno se pierde no estaba.
    document.body.classList.toggle('r360-rail-open', this.state.open);
    if (this.state.open) this.scroll.scrollTop = 0;
  }

  // ------------------------------------------------------------- el riel

  private renderDots(): void {
    this.dots.innerHTML = TRAMOS.map(
      (t, i) =>
        `<button type="button" role="tab" class="r360-rail__dot" data-tramo="${t.id}"
           aria-selected="false" aria-label="Tramo ${i + 1} de ${TRAMOS.length}: ${escapeHtml(t.short)}">
           <i aria-hidden="true"></i><span>${escapeHtml(t.short)}</span>
         </button>`,
    ).join('');
  }

  private paintDots(): void {
    const i = tramoIndex(this.state.tramo);
    for (const btn of this.dots.querySelectorAll<HTMLElement>('.r360-rail__dot')) {
      const idx = TRAMOS.findIndex((t) => t.id === btn.dataset.tramo);
      btn.classList.toggle('is-active', idx === i);
      btn.classList.toggle('is-done', idx < i);
      btn.setAttribute('aria-selected', idx === i ? 'true' : 'false');
    }
    // Las dos flechas ocupan lugar SIEMPRE, aunque no lleven a ningún lado:
    // en las puntas del recorrido se atenúan y dejan de responder, pero no se
    // van. Si desaparecieran, la tira de puntos dejaría de estar centrada
    // justo en el primer y el último tramo.
    const anterior = TRAMOS[i - 1] ?? null;
    this.prevBtn.textContent = '←';
    this.prevBtn.disabled = !anterior;
    this.prevBtn.setAttribute(
      'aria-label',
      anterior ? `Volver: ${anterior.title}` : 'No hay tramo anterior',
    );
    if (anterior) this.prevBtn.title = anterior.title;

    const next = railNextLabel(this.state.tramo);
    this.nextBtn.textContent = '→';
    this.nextBtn.disabled = !next;
    if (next) {
      // Sólo la flecha: el rótulo del paso ya lo dice el chip de la izquierda,
      // y el texto completo empujaba el pie a lo ancho. El `aria-label` sigue
      // diciendo a dónde lleva, que es lo que lee un lector de pantalla.
      this.nextBtn.setAttribute('aria-label', next.aria);
      this.nextBtn.title = next.label;
    } else {
      this.nextBtn.setAttribute('aria-label', 'No hay tramo siguiente');
    }
  }

  /**
   * Marca si la pantalla que se está viendo es clara, para que el encabezado
   * flotante se lea sobre ella. Se mide contra el borde superior del riel,
   * que es donde vive el encabezado.
   */
  private readonly onScrollPantalla = (): void => {
    const y = this.scroll.getBoundingClientRect().top + 72;
    let clara = false;
    for (const p of this.scroll.querySelectorAll<HTMLElement>('.r360-rail__pantalla')) {
      const r = p.getBoundingClientRect();
      if (r.top <= y && r.bottom > y) {
        // Papel: la lámina del render (spec §4) y el tramo de unidades, que
        // va en fondo blanco. El resto de las pantallas de texto dejaron de ir
        // en claro (fondo unificado, `tour-rail.css`) y no cuentan acá.
        clara = !!p.querySelector('.r360-rail__frame.is-render');
        break;
      }
    }
    const modo = clara ? 'clara' : 'oscura';
    this.el.dataset.pantalla = modo;
    // También en `body`: la marca y la barra superior viven FUERA del riel
    // (las monta `ui.ts` en el contenedor), así que un selector colgado de
    // `.r360-rail` no las alcanza.
    document.body.dataset.pantalla = modo;
  };

  private clearTramo(): void {
    for (const s of this.sliders.splice(0)) s.destroy();
    for (const off of this.seriesCleanup.splice(0)) off();
    this.scroll.innerHTML = '';
    this.piezas = [];
    this.chapaPrev = null;
  }

  /** Una pieza más del tramo, en orden. El agrupado en pantallas pasa después. */
  private add(el: HTMLElement): void {
    this.piezas.push(el);
  }

  /**
   * Idea 1: cada pieza de material ocupa una pantalla entera y el texto que la
   * rodea se junta en la suya. El agrupado vive acá y no repartido por cada
   * `render…()`: así el orden del tramo se sigue leyendo como una lista y la
   * decisión de maquetado se cambia en un solo lugar.
   */
  private flush(): void {
    let texto: HTMLElement | null = null;
    for (const pieza of this.piezas) {
      if (esMedia(pieza)) {
        texto = null;
        const p = document.createElement('section');
        p.className = 'r360-rail__pantalla r360-rail__pantalla--media';
        p.appendChild(pieza);
        this.scroll.appendChild(p);
      } else {
        if (!texto) {
          texto = document.createElement('section');
          texto.className = 'r360-rail__pantalla r360-rail__pantalla--texto';
          this.scroll.appendChild(texto);
        }
        texto.appendChild(pieza);
      }
    }
    this.piezas = [];
  }

  private renderTramo(): void {
    this.clearTramo();
    const def = tramoDef(this.state.tramo);
    const i = tramoIndex(def.id);

    // El título flota SOBRE la primera foto (no le come alto a la imagen) y se
    // queda mientras dura el tramo: dice dónde estás sin ocupar una franja.
    this.head.innerHTML =
      `<p class="r360-rail__step">Tramo ${i + 1} de ${TRAMOS.length}</p>` +
      `<h2>${escapeHtml(def.title)}</h2>`;

    // Qué tramo se está viendo, para que la hoja de estilos pueda vestirlo
    // sin que este archivo sepa de colores ni de fondos.
    this.el.dataset.tramo = def.id;
    // Al entrar a un tramo el scroll no se dispara: se evalúa a mano.
    requestAnimationFrame(() => this.onScrollPantalla());
    // El tramo de unidades es una grilla de fichas sobre negro plano: se le
    // pone detrás una foto real del bloque, muy velada, y las fichas flotan
    // encima en vidrio. La foto sale del material del propio tramo, no está
    // nombrada acá.
    const fondo = this.content.bloque.fachadas[0] ?? this.content.bloque.paseo[0];
    if (fondo) this.el.style.setProperty('--r360-rail-fondo', `url("${this.resolve(fondo.url)}")`);

    if (def.id === 'llegada') this.renderLlegada();
    else if (def.id === 'bloque-2') this.renderBloque();
    else if (def.id === 'amenities') this.renderAmenities();
    else if (def.id === 'video') this.renderVideo();
    else this.renderConsultar();

    // Ya no hay tarjeta de cierre por tramo. Cada tramo entra en una pantalla,
    // y esa tarjeta agregaba una segunda —vacía salvo por un "Lo que sigue" y
    // un botón—. Al tramo siguiente se pasa con la flecha del pie, que está
    // en todas las pantallas; la consulta vive en el Tramo 5 y en la ficha de
    // cada unidad.
    this.flush();
    this.paintDots();
    this.aplicarFoco();
  }

  /**
   * Lleva la vista a la foto pedida (hoy sólo desde "Ver la unidad modelo
   * fotografiada"). Se hace en el cuadro siguiente a propósito: `paintVisibility`
   * corre después de `renderTramo` y deja el scroll vertical en 0, así que
   * mover la pantalla acá mismo no serviría de nada.
   */
  private aplicarFoco(): void {
    const foco = this.foco;
    this.foco = null;
    if (!foco) return;
    const card = this.scroll.querySelector<HTMLElement>(`[data-serie="${foco.serie}"]`);
    if (!card) return;
    const track = card.querySelector<HTMLElement>('.r360-rail__track');
    requestAnimationFrame(() => {
      const pantalla = card.closest<HTMLElement>('.r360-rail__pantalla') ?? card;
      pantalla.scrollIntoView({ block: 'start', behavior: 'auto' });
      if (track) track.scrollTo({ left: foco.index * pasoSerie(track), behavior: 'auto' });
    });
  }

  // ------------------------------------------------------------ los tramos

  /**
   * La llegada, en el orden en que se llega a un lugar: primero se ve dónde
   * está, después se entra, y recién entonces se mira desde adentro. Los datos
   * van al final, cuando ya hay algo que ubicar.
   *
   * Antes la segunda pantalla era la vista DESDE LA AZOTEA del Bloque 2 y el
   * acceso venía dos pantallas después: se estaba arriba del edificio antes de
   * haber cruzado la entrada. Y el bloque de datos partía la serie de fotos al
   * medio.
   */
  private renderLlegada(): void {
    // Una sola imagen y una sola frase. Antes el tramo encadenaba cuatro
    // pantallas —el terreno, el render del acceso, el skyline desde la azotea
    // y una tarjeta con el estado de los bloques—: demasiado para una
    // apertura, que tiene que ubicar y nada más. Lo que se sacó no se perdió;
    // el recorrido lo cuenta igual más adelante.
    const [contexto] = this.content.llegada.fotos;
    if (contexto) this.add(this.fotoCard(contexto));
  }

  private renderBloque(): void {
    const c = this.content.bloque;

    // El tramo queda en UNA sola pantalla: el paseo por la unidad modelo. Lo
    // que salió —la aérea de apertura, el deslizador render/obra y la serie de
    // fachadas— sigue generándose en el manifiesto y no se borró de ningún
    // lado; simplemente ya no se arma acá.
    if (c.paseo.length) {
      // Antes esto era un párrafo suelto, pantalla propia y vacía salvo esa
      // frase (spec, pantallas vacías → caption): ahora es el título que
      // corona la primera foto del paseo, en la MISMA pantalla — el mismo
      // patrón que ya usa `serieCard` para "fachadas".
      this.add(
        this.serieCard('paseo', c.paseo, { editorial: true }),
      );
    }

    // Sin nota ni botonera: el tramo queda en UNA pantalla, sólo el paseo. El
    // WhatsApp de este bloque, la entrada al 360 y el listado de unidades
    // salieron de acá. El 360 sigue a mano desde la ficha de cada unidad
    // ("Recorrer en 360°") y las unidades desde la pestaña de la barra
    // inferior; el canal de consulta, desde el tramo de cierre.
    // La frase "lo que sigue todavía no está construido" YA NO va acá: con el
    // nuevo orden narrativo (llegada → bloque → video → unidades →
    // amenities), lo que sigue a este tramo es el VIDEO, que es tan real
    // como las fotos que se acaban de ver. La transición a lo proyectado
    // (los amenities) se anuncia al cierre de "Elegí tu unidad", que es
    // donde de verdad se deja atrás el material real (ver `renderUnidades`).
  }

  /**
   * El tramo de lo proyectado: UNA sola imagen, quieta, partida en diagonal.
   * A un lado el render del sector de amenities; al otro, la misma esquina
   * del terreno hoy.
   *
   * Antes eran cinco o seis pantallas —el interruptor Proyecto/Hoy sobre una
   * tarjeta blanca, la caption debajo, una nota suelta, un encabezado "Otras
   * vistas"— y en un teléfono se pisaban entre sí. El corte en diagonal dice
   * lo mismo que decía el interruptor, pero sin pedir que el visitante toque
   * nada: las dos épocas se ven juntas, de una.
   *
   * El borde blanco no se dibuja aparte: es una tercera capa con el MISMO
   * polígono corrido dos píxeles, debajo de la foto. Así la línea cae exacto
   * sobre el corte, sin rotaciones que haya que hacer coincidir a mano.
   */
  private renderAmenities(): void {
    const c = this.content.amenities;
    const todos = [...c.renders, ...c.otros];
    const sector = todos.find((r) => r.slug === 'amenities') ?? todos[0];
    if (!sector) return;

    const card = document.createElement('div');
    card.className = 'r360-rail__card r360-rail__diagonal';

    const capa = (src: string, alt: string, clase: string, foco?: string): HTMLElement => {
      const fig = document.createElement('figure');
      fig.className = `r360-diagonal__capa ${clase}`;
      const img = document.createElement('img');
      img.decoding = 'async';
      img.alt = alt;
      img.src = this.resolve(src);
      if (foco) img.style.objectPosition = foco;
      fadeIn(img);
      fig.appendChild(img);
      return fig;
    };

    const borde = document.createElement('div');
    borde.className = 'r360-diagonal__borde';
    borde.setAttribute('aria-hidden', 'true');

    // El MISMO render de los dos lados, encuadrado distinto: a la izquierda
    // el sector entero —piscina y rincón de fuego— y a la derecha la laguna
    // de cerca. Es el recurso que pidió la dueña: una sola imagen partida que
    // muestra el conjunto y el detalle a la vez.
    card.append(
      capa(sector.url, sector.name, 'is-proyecto', '18% 50%'),
      borde,
      capa(sector.url, 'La laguna del proyecto', 'is-hoy', '72% 64%'),
    );

    const rotulo = (clase: string, titulo: string, texto: string): HTMLElement => {
      const el = document.createElement('div');
      el.className = `r360-diagonal__rotulo ${clase}`;
      const h = document.createElement('h3');
      h.className = 'r360-editorial__titulo';
      h.textContent = titulo;
      const p = document.createElement('p');
      p.className = 'r360-editorial__texto';
      pintarConSaltos(p, texto);
      el.append(h, p);
      return el;
    };

    card.append(
      rotulo('is-proyecto', 'La piscina', 'Con solárium y piscina infantil,\ny el rincón de fuego al lado.'),
      rotulo('is-hoy', 'La laguna', 'Deck de madera y luz baja,\npara el final del día.'),
    );

    // Sin chapa de "Render del proyecto": acá no hay nada que se pueda
    // confundir con una foto —el título del tramo dice "como están
    // proyectados" y las dos mitades son la misma imagen de síntesis—, así
    // que la chapa sólo tapaba.

    this.add(card);
  }

  private renderVideo(): void {
    const scene = this.content.video.scene;
    if (scene && 'url' in scene.source) {
      const card = document.createElement('div');
      card.className = 'r360-rail__card r360-rail__video';
      const video = document.createElement('video');
      const portrait = scene.portrait;
      // Pantalla angosta: si hay un corte VERTICAL (decisión 18,
      // build_tour.py), ese manda — es otro video, no el horizontal más
      // liviano, y por eso también dimensiona la caja distinto (ver
      // tour-rail.css, `.r360-rail__video[data-portrait]`). Sin `portrait`,
      // sigue el criterio de siempre: `mobileUrl` (mismo corte, más
      // liviano) en angosto, `source.url` en cualquier otra pantalla. Todo
      // resuelto con <source media="…"> nativos — el navegador elige uno
      // solo, antes de pedir nada, sin JS de por medio.
      if (portrait) {
        card.dataset.portrait = '';
        const vertical = document.createElement('source');
        vertical.src = this.resolve(portrait.mobileUrl ?? portrait.url);
        vertical.type = 'video/mp4';
        vertical.media = '(max-width: 767px)';
        video.appendChild(vertical);
      } else if (scene.mobileUrl) {
        const mobile = document.createElement('source');
        mobile.src = this.resolve(scene.mobileUrl);
        mobile.type = 'video/mp4';
        mobile.media = '(max-width: 767px)';
        video.appendChild(mobile);
      }
      const desktop = document.createElement('source');
      desktop.src = this.resolve(scene.source.url);
      desktop.type = 'video/mp4';
      video.appendChild(desktop);
      video.controls = true;
      video.playsInline = true;
      video.muted = true;
      video.loop = true;
      // `muted` + `playsInline` es exactamente lo que los navegadores piden
      // para dejar arrancar solo: faltaba pedirlo (auditoría §2.6). Antes
      // había además un `preload = 'none'` que otra línea pisaba con
      // `'metadata'` tres sentencias después; queda uno solo.
      video.autoplay = true;
      video.preload = 'metadata';
      // El atributo `poster` no tiene equivalente a `<source media>`: no
      // hay forma declarativa de que el navegador elija uno según el ancho
      // de pantalla, así que se decide una sola vez, al montar la tarjeta
      // (no reacciona a un resize en vivo — esta pantalla no lo necesita,
      // el riel se remonta al cambiar de tramo).
      const angosta = window.matchMedia('(max-width: 767px)').matches;
      const poster = this.content.video.poster;
      const posterUrl = angosta && portrait?.poster ? portrait.poster.url : poster?.url;
      if (posterUrl) video.poster = this.resolve(posterUrl);
      card.appendChild(video);

      // Sin leyenda: el video se explica solo y el texto encima le comía la
      // imagen. Que arranca en silencio lo dice el propio control de sonido,
      // que está a la vista en el reproductor.

      // Pantalla completa a la vista: son 83 segundos de obra real y el
      // control nativo la esconde detrás de un ícono de 20 px.
      const full = document.createElement('button');
      full.type = 'button';
      full.className = 'r360-rail__full';
      full.textContent = '⛶ Pantalla completa';
      full.addEventListener('click', () => {
        const anyVideo = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
        if (video.requestFullscreen) void video.requestFullscreen().catch(() => undefined);
        else anyVideo.webkitEnterFullscreen?.();
      });
      card.appendChild(full);

      this.add(card);

      // NUNCA una puerta (spec §1, Tramo 4): el tramo ya está dibujado y el
      // video arranca solo cuando entra en pantalla. Si el navegador rechaza
      // el `play()`, quedan los controles nativos y no pasa nada más.
      if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              if (e.isIntersecting) void video.play().catch(() => undefined);
              else video.pause();
            }
          },
          { threshold: 0.5 },
        );
        io.observe(video);
        this.seriesCleanup.push(() => io.disconnect());
      }
      return;
    }

    const falta = document.createElement('div');
    falta.className = 'r360-rail__card r360-rail__falta';
    falta.innerHTML =
      `<h3>El video llega en unos días</h3>` +
      `<p>La filmación de la obra terminada, del 2 de septiembre de 2026, todavía no está en esta versión del recorrido. ` +
      `Pedísela al vendedor y te la manda.</p>` +
      `<p class="r360-rail__nota">Todo lo que se ve en los tramos anteriores es fotografía real de ese mismo día.</p>`;
    this.add(falta);
  }

  private renderUnidades(): void {
    const avail = this.opts.availability();
    for (const bloque of this.content.unidades.bloques) {
      const resumen = resumenDeBloque(bloque.codes, avail);
      const card = document.createElement('div');
      card.className = 'r360-rail__card r360-rail__bloque';
      card.innerHTML =
        `<h3>${escapeHtml(bloque.label)}</h3>` +
        `<p class="r360-rail__nota">${escapeHtml(
          resumenLinea(resumen, resumen.desde ? formatPrice(resumen.desde) : null),
        )}</p>`;

      const grid = document.createElement('div');
      grid.className = 'r360-rail__grid';
      grid.innerHTML = bloque.codes
        .map((code) => {
          const u = this.opts.tour.units[code];
          const price = priceTextForUnit(code, avail);
          const estado = avail?.units[code]?.s ?? null;
          // Sin precio público no queda un hueco: se dice el estado. Una celda
          // vacía se lee como "falta el dato" y acá el dato existe.
          //
          // Y cuando el dato NO existe (B3-K está ausente de
          // `availability.json` a propósito, `tools/baleia/README.md` §3.3) no
          // se dice la cadena "Sin dato" — no se le muestra nunca al
          // visitante. Se cae al mismo token "No disponible"
          // (`STATUS_TOKENS.no_disponible`, FALLBACK_STATUS) que usa el mapa
          // para el mismo caso en `polygons.ts::resolveStatus`, así la celda
          // no dice algo distinto de lo que dice el polígono.
          const trailing =
            price ?? STATUS_TOKENS[estado && isUnitStatus(estado) ? estado : 'no_disponible'].label;
          const meta = [
            u?.attrs?.tipologia ? String(u.attrs.tipologia) : '',
            u?.areaTotalM2 != null ? `${NUM.format(u.areaTotalM2)} m²` : '',
          ]
            .filter(Boolean)
            .join(' · ');
          return `<button type="button" class="r360-rail__unidad" data-unit="${escapeHtml(code)}" data-estado="${escapeHtml(estado ?? '')}">
              <b>${escapeHtml(u?.label ?? code)}</b>
              <span>${escapeHtml(meta)}</span>
              <em>${escapeHtml(trailing)}</em>
            </button>`;
        })
        .join('');
      grid.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-unit]');
        if (btn?.dataset.unit) this.opts.onOpenUnit(btn.dataset.unit);
      });
      card.appendChild(grid);
      this.add(card);
    }

    const cond = document.createElement('div');
    cond.className = 'r360-rail__card';
    cond.innerHTML =
      `<h3>Condiciones publicadas</h3>` +
      `<p>50% de anticipo + 12 cuotas mensuales al 6% anual. Gastos de ocupación 4% aparte. ` +
      `Cochera incluida. Entrega diciembre 2026.</p>` +
      `<p class="r360-rail__nota">Precios de lista, septiembre 2026, sujetos a modificación sin previo aviso. ` +
      `La cuota exacta te la arma el vendedor.</p>`;
    this.add(cond);

    // Con el nuevo orden narrativo, ACÁ es donde el recorrido deja atrás lo
    // fotografiado/filmado de verdad (llegada, bloque, video) y entra a lo
    // proyectado (los amenities, que siguen). Antes esta frase vivía al
    // cierre del Bloque 2, cuando el tramo siguiente todavía era real (el
    // video) — quedaba anunciando una transición que no pasaba hasta acá.
    const transicion = document.createElement('p');
    transicion.className = 'r360-rail__nota r360-rail__nota--transicion';
    transicion.textContent = 'Lo que sigue todavía no está construido. Lo mostramos como proyecto.';
    this.add(transicion);
  }

  /**
   * El cierre del recorrido. Camino a la consulta: UN botón grande de
   * WhatsApp y nada que le compita — ni "Elegir una unidad" (quien llegó
   * hasta acá ya eligió o no va a elegir), ni tres variantes de mensaje que
   * se ven idénticas. "Qué es real" va ARRIBA del botón, no abajo: es lo que
   * responde la objeción ("¿esto es de verdad?") antes de pedir el paso de
   * escribir, no después.
   */
  /**
   * El cierre: una sola pantalla, con la mejor foto del recorrido de fondo y
   * una sola cosa para hacer.
   *
   * Antes eran dos tarjetas grises sobre negro —"Qué es real en este
   * recorrido" y "¿Seguimos por WhatsApp?"—, el botón, y abajo dos párrafos
   * de letra chica que terminaban pisados por el encabezado del tramo. Todo
   * eso competía con lo único que esta pantalla tiene que lograr. Ahora el
   * inventario honesto sigue estando, pero en una línea al pie: informa sin
   * pelearle el lugar a la acción.
   */
  private renderConsultar(): void {
    const card = document.createElement('div');
    card.className = 'r360-rail__card r360-rail__cierre-final';

    // De fondo, la vista desde la terraza: es la imagen que mejor resume por
    // qué alguien escribiría, y ya está cargada de antes.
    const fondo = this.content.bloque.paseo.at(-1) ?? this.content.bloque.fachadas[0] ?? null;
    if (fondo) {
      const img = document.createElement('img');
      img.className = 'r360-cierre__fondo';
      img.alt = '';
      img.decoding = 'async';
      img.src = this.resolve(fondo.url);
      fadeIn(img);
      card.appendChild(img);
    }

    const texto = document.createElement('div');
    texto.className = 'r360-cierre__texto';
    texto.innerHTML =
      `<h2 class="r360-cierre__titulo">Consultá por el proyecto</h2>` +
      `<p class="r360-cierre__bajada">El mensaje se envía prellenado, ` +
      `con el enlace exacto de lo que estuviste viendo.</p>`;

    const primario = this.consultarPrimario();
    if (primario) {
      primario.classList.add('is-grande');
      texto.appendChild(primario);
    }

    // Para quien no usa WhatsApp: el número escrito como texto (no un link
    // que asume una app) y el nombre de quien atiende — datos reales de la
    // lista de precios del cliente, nunca inventados.
    const contact = this.opts.tour.contact;
    if (contact?.name || contact?.whatsapp) {
      const directo = document.createElement('p');
      directo.className = 'r360-cierre__contacto';
      const numero = contact.whatsapp ? formatWhatsappDisplay(contact.whatsapp) : null;
      directo.textContent = [contact.name, numero].filter(Boolean).join(' · ');
      texto.appendChild(directo);
    }

    const pie = document.createElement('p');
    pie.className = 'r360-cierre__pie';
    pie.textContent = `${this.resumenReal()} · Valores de lista de septiembre 2026, sujetos a modificación.`;
    texto.appendChild(pie);

    card.appendChild(texto);
    this.add(card);
  }

  /**
   * El único botón de WhatsApp del cierre. El mensaje cambia según lo último
   * que el visitante miró (spec, camino a la consulta): si abrió la ficha de
   * una unidad puntual, pregunta por ESA unidad; si sólo vio el bloque
   * construido, invita a visitarlo; si ninguna de las dos cosas hay, cae al
   * mensaje genérico del proyecto. Nunca faltan las tres — sólo se elige UNA.
   */
  private consultarPrimario(): HTMLAnchorElement | null {
    const tour = this.opts.tour;
    if (!tour.contact?.whatsapp) return null;

    let code: string | null = null;
    try { code = sessionStorage.getItem(LAST_UNIT_SEEN_KEY); } catch { /* modo privado */ }
    const unit = code ? tour.units[code] : null;
    const esUnidadHoja = !!unit && !Array.isArray(unit.attrs?.unitCodes);
    if (code && esUnidadHoja) {
      const ctx = ctaContextFor(code, tour, this.opts.availability(), tour.start, location.href);
      const cta = buildCta(tour.contact, ctx);
      if (cta) return this.ctaAnchorFromCta(cta);
    }

    return this.ctaLink('visita', true) ?? this.ctaLink('tramo', true);
  }

  private ctaAnchorFromCta(cta: Cta): HTMLAnchorElement {
    const a = document.createElement('a');
    a.className = 'r360-rail__btn is-wa';
    a.href = cta.href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = cta.label;
    a.addEventListener('click', () => {
      this.opts.container.dispatchEvent(
        new CustomEvent('r360:cta', {
          detail: { unitCode: cta.unitCode, kind: cta.kind, message: cta.message },
          bubbles: true,
        }),
      );
    });
    return a;
  }

  /**
   * El inventario honesto del recorrido, en una línea. Los números salen del
   * manifiesto y no de una frase escrita a mano: cuando entraron las 15
   * panorámicas de la unidad A, la versión escrita seguía diciendo que no
   * había ninguna, y en una frase que promete decir qué es real, un dato
   * viejo es peor que no ponerlo.
   */
  private resumenReal(): string {
    const items = this.opts.tour.photoTour?.items ?? [];
    const fotos = items.filter((i) => i.procedencia.kind === 'foto').length;
    const renders = this.opts.tour.scenes.filter((s) => s.procedencia?.kind === 'render').length;
    const panoramas = this.opts.tour.scenes.filter((s) => s.kind === 'panorama').length;
    const partes = [
      `${fotos} fotos reales del predio`,
      `${renders} imágenes del proyecto`,
      panoramas > 0 ? `${panoramas} panorámicas 360` : 'panorámicas 360: todavía no',
    ];
    return partes.join(' · ');
  }

  // -------------------------------------------------------------- piezas

  /**
   * Cierre de cada tramo: da por terminado lo que se vino viendo y anuncia lo
   * que sigue, con el plano y la consulta abajo.
   *
   * Antes era sólo los dos botones sueltos. Como última pantalla de un tramo
   * dejaba la sensación de que la historia se cortaba: ninguna línea decía que
   * ese capítulo había terminado ni hacia dónde iba el siguiente.
   */
  /**
   * CTA de WhatsApp a nivel de TRAMO (sin unidad elegida). El mensaje lo arma
   * `tour-rail.model.ts` y el enlace lo normaliza `contact.ts`: acá no se
   * escribe ni un número de teléfono ni un texto de mensaje.
   */
  private ctaLink(kind: 'tramo' | 'visita' | 'plano', primary = false): HTMLAnchorElement | null {
    const contact = this.opts.tour.contact;
    if (!contact?.whatsapp) return null;
    const bloqueLabel = this.content.bloque.bloque?.label ?? null;
    if ((kind === 'visita' || kind === 'plano') && !bloqueLabel) return null;
    const ctx = {
      project: this.opts.tour.project,
      tramo: this.state.tramo,
      bloqueLabel,
      url: `${location.href.split('#')[0]}#/scene/${this.state.tramo}`,
    };
    const href = whatsappUrl(contact.whatsapp, railCtaMessage(kind, ctx));
    if (!href) return null;
    const a = document.createElement('a');
    a.className = `r360-rail__btn ${primary || kind !== 'tramo' ? 'is-wa' : 'is-ghost'}`;
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = railCtaLabel(kind, ctx);
    a.addEventListener('click', () => {
      this.opts.container.dispatchEvent(
        new CustomEvent('r360:cta', {
          detail: {
            unitCode: null,
            kind: `rail-${kind}`,
            tramo: this.state.tramo,
            message: messageFromWhatsappHref(href),
          },
          bubbles: true,
        }),
      );
    });
    return a;
  }

  /**
   * Una foto real: a sangre, borde a borde, con su chapa abajo a la izquierda
   * y su caption tal como está escrita en el manifiesto (spec §4: la foto
   * ocupa todo, el render está "en un cuadro").
   */
  private fotoCard(item: PhotoTourItem, opts: { caption?: string; pushIn?: boolean } = {}): HTMLElement {
    const card = document.createElement('div');
    card.className = 'r360-rail__card r360-rail__foto';

    const fig = document.createElement('figure');
    fig.className = 'r360-rail__frame is-foto';
    if (opts.pushIn && !reducedMotion()) fig.classList.add('is-pushin');
    // Sin `aspect-ratio`: la foto ya no vive en una caja de 250 px con la
    // forma del archivo, ocupa la pantalla y `object-fit: cover` recorta.
    // Blur-up: la miniatura de ~15 KB pinta el color y la forma al instante y
    // la de 2000 px se funde encima cuando llega.
    fig.style.backgroundImage = `url("${this.resolve(item.thumbUrl)}")`;

    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = item.caption ?? item.ambiente ?? 'Fotografía del proyecto';
    img.src = this.resolve(item.url);
    fadeIn(img);
    fig.appendChild(img);

    this.chapaSiCorresponde(fig, item.procedencia);

    fig.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.r360-rail__chapa')) return;
      this.openFoto(item);
    });

    // La caption va SOBRE la foto, abajo, con el degradado de la bienvenida:
    // así la imagen llega hasta el borde y el texto sigue siendo legible.
    const caption = opts.caption ?? captionSinChapa(item.caption);
    if (caption) {
      const p = document.createElement('figcaption');
      p.className = 'r360-rail__caption r360-rail__caption--sobre';
      pintarConSaltos(p, caption);
      fig.appendChild(p);
    }
    card.appendChild(fig);
    return card;
  }

  /**
   * Un render: por defecto enmarcado, con filete y chapa arriba a la izquierda
   * — "la foto ocupa todo, el render está en un cuadro" (spec §4).
   *
   * `aSangre` es la excepción del Tramo 1: ahí el render del acceso va entre
   * dos fotos a pantalla completa, y el cuadro claro en el medio partía la
   * secuencia en dos. Tratado como las fotos —a sangre, sin chapa, con la
   * leyenda encima— el tramo se lee de corrido. Que es un render lo dice la
   * leyenda ("como está proyectado"), no una chapa.
   *
   * `foco` corre el recorte horizontal: un render 3:2 en una pantalla de
   * 375x752 muestra un tercio de su ancho, así que el centro no siempre es
   * lo que hay que mostrar.
   */
  private renderCard(
    r: RailRender,
    caption: string | null,
    opts: { aSangre?: boolean; foco?: string } = {},
  ): HTMLElement {
    const card = document.createElement('div');
    card.className = 'r360-rail__card r360-rail__render';
    const fig = document.createElement('figure');
    fig.className = opts.aSangre ? 'r360-rail__frame is-foto' : 'r360-rail__frame is-render';
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = r.name;
    img.src = this.resolve(r.url);
    if (opts.foco) img.style.objectPosition = opts.foco;
    fadeIn(img);
    fig.appendChild(img);
    if (!opts.aSangre) this.chapaSiCorresponde(fig, r.procedencia);
    card.appendChild(fig);
    const texto = caption ?? r.name;
    if (opts.aSangre) {
      // Encima de la imagen, con el degradado, igual que en `fotoCard`.
      const cap = document.createElement('figcaption');
      cap.className = 'r360-rail__caption r360-rail__caption--sobre';
      cap.textContent = texto;
      fig.appendChild(cap);
    } else {
      const p = document.createElement('p');
      p.className = 'r360-rail__caption';
      p.textContent = texto;
      card.appendChild(p);
    }
    return card;
  }

  /**
   * La chapa de "Foto real" aparece una vez por tramo y después sólo cuando
   * cambia la naturaleza del material (auditoría §2.13): en el Tramo 2
   * aparecía 17 veces. La del render NO se deduplica: va en TODO render,
   * siempre — la foto es la norma del recorrido, el render la excepción, y
   * cuatro renders seguidos sin chapa (Tramo 3) se leen como fotos del
   * edificio terminado. Quién decide es `chapaVisible`; acá sólo se lleva
   * la cuenta del tramo en curso.
   */
  private chapaSiCorresponde(fig: HTMLElement, procedencia: Parameters<typeof chapaFor>[0]): void {
    const chapa = chapaFor(procedencia);
    if (!chapa || !chapaVisible(this.chapaPrev, chapa.kind)) return;
    this.chapaPrev = chapa.kind;
    // "Foto real · 2 sep 2026" no se dibuja: que el material sea fotografía
    // real es la norma del recorrido, no la excepción, y repetirlo encima de
    // cada imagen ensucia sin informar. Lo que SÍ se rotula es lo que no es
    // una foto —el render—, que es donde el visitante necesita saberlo.
    // `chapaPrev` se actualiza igual, para que la cuenta de alternancia entre
    // foto y render siga siendo correcta.
    if (chapa.kind === 'foto') return;
    fig.appendChild(this.chapaEl(chapa.kind, chapa.text, chapa.detail));
  }

  private chapaEl(kind: 'foto' | 'render', text: string, detail: string): HTMLElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `r360-rail__chapa is-${kind}`;
    b.textContent = text;
    b.title = detail;
    b.setAttribute('aria-label', `${text}. ${detail}`);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      b.classList.toggle('is-expanded');
      b.textContent = b.classList.contains('is-expanded') ? detail : text;
    });
    return b;
  }

  /**
   * El deslizador antes/después: la fachada del Bloque 2 hoy contra el
   * mismo ángulo con el paisajismo terminado. Se consume por su API
   * pública y nada más — ninguna de las dos imágenes está `restricted`,
   * así que acá no hay nada que esconder; lo único que este componente
   * garantiza es que el estado por defecto sea la foto real, nunca la
   * imagen de "después" (ver `beforeafter.ts`).
   */
  private sliderCard(pair: BeforeAfterPair): HTMLElement {
    const card = document.createElement('div');
    card.className = 'r360-rail__card r360-rail__slider';
    const host = document.createElement('div');
    card.appendChild(host);
    // `pair.before` es la foto real, `pair.after` la imagen con el
    // paisajismo terminado (build_tour.py::BEFORE_AFTER_PAIRS) — mismo
    // orden que los campos de `BeforeAfterSlider`, que arranca mostrando
    // "before" y revela "after" al arrastrar.
    const slider = new BeforeAfterSlider({
      container: host,
      before: {
        src: this.resolve(pair.before.url),
        alt: pair.before.caption ?? 'La fachada del Bloque 2 hoy, sin paisajismo.',
      },
      after: {
        src: this.resolve(pair.after.url),
        alt: pair.label ?? 'La fachada del Bloque 2 con el paisajismo terminado.',
      },
      aspect: aspectOf(pair),
    });
    this.sliders.push(slider);
    const p = document.createElement('p');
    p.className = 'r360-rail__caption';
    p.textContent = pair.label ? `${pair.label}. Arrastrá para comparar.` : 'Arrastrá para comparar.';
    card.appendChild(p);
    return card;
  }

  /**
   * Una serie de hermanos: scroll horizontal nativo con `scroll-snap`. El
   * gesto horizontal se queda acá adentro y jamás cambia de tramo; el scroll
   * vertical de la página sigue funcionando porque no se intercepta ningún
   * `touchmove`.
   */
  private serieCard(
    id: string,
    items: readonly PhotoTourItem[],
    opts: { titulo?: string; ambientes?: boolean; editorial?: boolean } = {},
  ): HTMLElement {
    const card = document.createElement('div');
    card.className = 'r360-rail__card r360-rail__serie';
    // La ficha de la unidad puede pedir que el recorrido abra en una foto
    // concreta de esta serie (`aplicarFoco`): la necesita poder encontrar.
    card.dataset.serie = id;
    if (opts.editorial) card.classList.add('is-editorial');
    if (opts.titulo && !opts.editorial) {
      const h = document.createElement('h3');
      h.className = 'r360-rail__serie-title';
      h.textContent = opts.titulo;
      card.appendChild(h);
    }

    let tira: HTMLElement | null = null;
    if (opts.ambientes && !opts.editorial) {
      // La tira desbordaba 587 px en 375 de ancho, con la barra oculta y sin
      // ninguna señal: "Terraza" y "La vista" no existían para quien no
      // arrastraba (auditoría §2.9). Ahora el envoltorio pone un degradado en
      // el borde derecho y el ambiente activo se trae solo a la vista.
      const wrap = document.createElement('div');
      wrap.className = 'r360-rail__tirawrap';
      tira = document.createElement('div');
      tira.className = 'r360-rail__tira';
      tira.setAttribute('role', 'tablist');
      tira.setAttribute('aria-label', 'Ambientes de la unidad');
      // Un botón por AMBIENTE (no por foto): la tira dice dónde estás en la
      // casa, no cuántas fotos hay de cada ambiente.
      const vistos: string[] = [];
      for (const it of items) {
        const amb = it.ambiente!;
        if (!vistos.includes(amb)) vistos.push(amb);
      }
      tira.innerHTML = vistos
        .map((amb) => {
          const first = items.findIndex((i) => i.ambiente === amb);
          return `<button type="button" role="tab" class="r360-rail__amb" data-index="${first}" aria-selected="false">${escapeHtml(amb)}</button>`;
        })
        .join('');
      wrap.appendChild(tira);
      card.appendChild(wrap);
    }

    const track = document.createElement('div');
    track.className = 'r360-rail__track';
    track.setAttribute('role', 'group');
    track.setAttribute('aria-label', 'Serie de fotos: deslizá para ver la siguiente');
    track.tabIndex = 0;
    for (const item of items) {
      const slide = document.createElement('figure');
      slide.className = 'r360-rail__slide is-foto';
      slide.style.backgroundImage = `url("${this.resolve(item.thumbUrl)}")`;
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = item.caption ?? item.ambiente ?? '';
      img.src = this.resolve(item.url);
      fadeIn(img);
      slide.appendChild(img);
      this.chapaSiCorresponde(slide, item.procedencia);
      // Lenguaje del brochure: una guía que entra desde arriba y termina en un
      // punto, el ambiente en mayúsculas y la descripción debajo, las dos
      // alineadas a la derecha. El texto sale del manifiesto —`ambiente` y
      // `caption` de cada foto—, así que no hay copia nueva que mantener.
      if (opts.editorial && (item.ambiente || item.caption)) {
        const ed = document.createElement('div');
        // Cuatro composiciones distintas: si todas las fotos llevaran el bloque
        // en el mismo lugar, diez pantallas seguidas se leerían como una
        // plantilla. Ninguna cae abajo a la izquierda, que es donde vive el
        // encabezado del tramo.
        //
        // Cuál le toca a cada foto está fijado por id y no por el lugar que
        // ocupa en la serie: la línea señala algo distinto en cada imagen —el
        // horno, el placard, el horizonte— y con una rotación por índice
        // bastaba sacar o agregar una foto para que todas las siguientes
        // cambiaran de composición. Las que no figuren acá caen en la
        // rotación, que sigue sirviendo de red.
        const POSICIONES = ['ab-der', 'ar-izq', 'ar-der', 'ar-der-b'] as const;
        const pos =
          COMPOSICION[item.id] ?? POSICIONES[track.childElementCount % POSICIONES.length];
        ed.className = `r360-editorial is-${pos}`;
        // La guía y el título viajan juntos en una caja que se ajusta al ANCHO
        // DEL TÍTULO: así el punto cae en el centro del título y no en el del
        // párrafo, que es más ancho y dejaba el punto corrido.
        if (item.ambiente) {
          const cabeza = document.createElement('div');
          cabeza.className = 'r360-editorial__cabeza';
          const guia = document.createElement('span');
          guia.className = 'r360-editorial__guia';
          guia.setAttribute('aria-hidden', 'true');
          const h = document.createElement('h3');
          h.className = 'r360-editorial__titulo';
          h.textContent = item.ambiente;
          cabeza.append(guia, h);
          ed.appendChild(cabeza);
        }
        const texto = captionSinChapa(item.caption);
        if (texto) {
          const pp = document.createElement('p');
          pp.className = 'r360-editorial__texto';
          // Mismo trato que el pie de las fotos: los saltos que trae el
          // manifiesto se respetan, porque ahí se decide dónde corta la frase.
          pintarConSaltos(pp, texto);
          ed.appendChild(pp);
        }
        slide.appendChild(ed);
      }
      slide.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.r360-rail__chapa')) return;
        this.openFoto(item, items);
      });
      track.appendChild(slide);
    }
    card.appendChild(track);

    const pie = document.createElement('div');
    pie.className = 'r360-rail__seriepie';
    const caption = document.createElement('p');
    caption.className = 'r360-rail__caption';
    const contador = document.createElement('span');
    contador.className = 'r360-rail__contador';
    pie.append(caption, contador);
    card.appendChild(pie);

    // Con mouse, una pista de scroll horizontal con la barra oculta era
    // irrecorrible: 0 botones y `cursor: auto` (auditoría §2.17). Las flechas
    // sólo se dibujan donde hay puntero fino (CSS); acá siempre existen para
    // que el teclado también las alcance.
    const flecha = (dir: 'prev' | 'next'): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `r360-rail__flecha r360-rail__flecha--${dir}`;
      b.textContent = dir === 'prev' ? '‹' : '›';
      b.setAttribute('aria-label', dir === 'prev' ? 'Foto anterior de la serie' : 'Foto siguiente de la serie');
      return b;
    };
    const prev = flecha('prev');
    const next = flecha('next');
    card.append(prev, next);

    const paint = () => {
      const i = serieIndex(this.state, id, items.length);
      const item = items[i];
      caption.textContent = item?.caption ?? '';
      contador.textContent = `${i + 1}/${items.length}`;
      if (tira) {
        for (const b of tira.querySelectorAll<HTMLElement>('.r360-rail__amb')) {
          const on = items[Number(b.dataset.index)]?.ambiente === item?.ambiente;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-selected', String(on));
          // El ambiente activo se trae solo: los dos mejores estaban fuera de
          // pantalla y nada avisaba (auditoría §2.9).
          if (on) b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
        }
      }
      prev.disabled = i <= 0;
      next.disabled = i >= items.length - 1;
    };

    // El índice sale del scroll real, que es la única verdad de dónde quedó el
    // dedo. Se agrupa en un rAF: `scroll` dispara en ráfaga.
    let pending = false;
    const onScroll = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        const index = Math.round(track.scrollLeft / pasoSerie(track));
        const { state, effect } = railReduce(this.state, { type: 'serie', id, index, length: items.length });
        this.state = state;
        if (effect !== 'nada') paint();
      });
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    this.seriesCleanup.push(() => track.removeEventListener('scroll', onScroll));

    const goTo = (index: number) => {
      track.scrollTo({ left: index * pasoSerie(track), behavior: reducedMotion() ? 'auto' : 'smooth' });
    };
    tira?.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-index]');
      if (b) goTo(Number(b.dataset.index));
    });
    const paso = (delta: number) => () => {
      const i = serieIndex(this.state, id, items.length);
      goTo(Math.min(items.length - 1, Math.max(0, i + delta)));
    };
    prev.addEventListener('click', paso(-1));
    next.addEventListener('click', paso(1));
    track.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const i = serieIndex(this.state, id, items.length);
      goTo(Math.min(items.length - 1, Math.max(0, i + (e.key === 'ArrowRight' ? 1 : -1))));
    });

    // Restaura la posición guardada (volver a un tramo te deja donde estabas).
    const guardado = serieIndex(this.state, id, items.length);
    if (guardado > 0) requestAnimationFrame(() => track.scrollTo({ left: guardado * pasoSerie(track) }));
    paint();
    return card;
  }

  // ------------------------------------------------------- capa: foto grande

  /**
   * Toque = entrar: la foto a pantalla completa. Atrás la cierra, y sólo a ella.
   *
   * Hasta acá "entrar" ENTREGABA MENOS que no entrar: la capa dibujaba la foto
   * a 343×229 en un teléfono donde el riel ya la mostraba a 375×250 (auditoría
   * §2.5). Ahora ocupa la pantalla entera, hace pinch-zoom y —cuando la foto
   * viene de una serie— pasa a la hermana con el dedo, con las flechas o con
   * el teclado.
   */
  private openFoto(item: PhotoTourItem, hermanas: readonly PhotoTourItem[] = []): void {
    const lista = hermanas.length ? hermanas : [item];
    let i = Math.max(0, lista.findIndex((x) => x.id === item.id));

    this.closeLayerUi();
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'r360-close r360-rail__layer-close';
    close.setAttribute('aria-label', 'Cerrar la foto');
    close.textContent = '×';
    close.addEventListener('click', () => this.closeFotoByGesture());

    const stage = document.createElement('div');
    stage.className = 'r360-rail__layer-stage';
    const img = document.createElement('img');
    stage.appendChild(img);

    const cuenta = document.createElement('span');
    cuenta.className = 'r360-rail__layer-count';
    cuenta.hidden = lista.length < 2;

    const caption = document.createElement('p');
    caption.className = 'r360-rail__caption r360-rail__layer-caption';

    const nav = (dir: 'prev' | 'next'): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `r360-rail__layer-nav r360-rail__layer-nav--${dir}`;
      b.textContent = dir === 'prev' ? '‹' : '›';
      b.setAttribute('aria-label', dir === 'prev' ? 'Foto anterior' : 'Foto siguiente');
      b.hidden = lista.length < 2;
      return b;
    };
    const prevBtn = nav('prev');
    const nextBtn = nav('next');

    this.layerEl.append(stage, close, cuenta, prevBtn, nextBtn, caption);
    this.pinch = new PinchZoom(stage, img);

    let chapaEl: HTMLElement | null = null;
    const pintar = () => {
      const it = lista[i]!;
      img.src = this.resolve(it.url);
      img.alt = it.caption ?? it.ambiente ?? '';
      this.pinch?.reset();
      caption.textContent = it.caption ?? '';
      cuenta.textContent = `${i + 1}/${lista.length}`;
      prevBtn.disabled = i <= 0;
      nextBtn.disabled = i >= lista.length - 1;
      chapaEl?.remove();
      chapaEl = null;
      // Acá la chapa va SIEMPRE: es una foto sola, fuera de la secuencia del
      // tramo, y la regla de "una por tramo" no la alcanza.
      const chapa = chapaFor(it.procedencia);
      if (chapa) {
        chapaEl = this.chapaEl(chapa.kind, chapa.text, chapa.detail);
        this.layerEl.appendChild(chapaEl);
      }
    };
    const mover = (delta: number) => {
      const next = Math.min(lista.length - 1, Math.max(0, i + delta));
      if (next === i) return;
      i = next;
      pintar();
    };
    prevBtn.addEventListener('click', () => mover(-1));
    nextBtn.addEventListener('click', () => mover(1));

    // Swipe entre hermanas — sólo con la foto SIN acercar: con dos dedos
    // encima, el gesto horizontal es del zoom, no de la navegación.
    let desde: { x: number; y: number } | null = null;
    const onStart = (e: TouchEvent) => {
      desde = e.touches.length === 1 ? { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY } : null;
    };
    const onEnd = (e: TouchEvent) => {
      const d = desde;
      desde = null;
      if (!d || !this.pinch?.sinAcercar || lista.length < 2) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - d.x;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(t.clientY - d.y)) return;
      mover(dx < 0 ? 1 : -1);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); mover(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); mover(-1); }
    };
    stage.addEventListener('touchstart', onStart, { passive: true });
    stage.addEventListener('touchend', onEnd, { passive: true });
    this.layerEl.addEventListener('keydown', onKey);
    this.layerCleanup.push(() => {
      stage.removeEventListener('touchstart', onStart);
      stage.removeEventListener('touchend', onEnd);
      this.layerEl.removeEventListener('keydown', onKey);
    });

    pintar();
    this.layerEl.hidden = false;
    // Marca en el cuerpo para que la franja de arriba deje de taparle el
    // botón de cerrar (ver `body.r360-foto-open` en `styles.css`).
    document.body.classList.add('r360-foto-open');
    close.focus();

    // La capa empuja historia: Atrás del teléfono la cierra en vez de sacar
    // al visitante del tramo.
    const prev = (history.state ?? {}) as Record<string, unknown>;
    history.pushState({ ...prev, r360RailFoto: item.id }, '', location.href);
    this.state = railReduce(this.state, { type: 'abrir-capa', layer: 'foto' }).state;
  }

  private closeFotoByGesture(): void {
    // Se cierra navegando Atrás para que la historia quede consistente con lo
    // que se ve (misma regla que las hojas de `ui.ts`).
    history.back();
  }

  private closeLayerUi(): void {
    for (const off of this.layerCleanup.splice(0)) off();
    this.pinch?.destroy();
    this.pinch = null;
    this.layerEl.hidden = true;
    this.layerEl.innerHTML = '';
    document.body.classList.remove('r360-foto-open');
  }

  private resolve(url: string): string {
    return new URL(url, this.base).href;
  }
}

export function mountTourRail(opts: TourRailOptions): TourRail {
  return new TourRail(opts);
}
