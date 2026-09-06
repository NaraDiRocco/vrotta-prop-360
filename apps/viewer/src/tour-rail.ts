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
 *    (`BeforeAfterSlider`), nunca por dentro. La imagen de IA no sale de ahí
 *    — este archivo jamás toca `pair.after.url`.
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
import { whatsappUrl } from './contact.ts';
import { BeforeAfterSlider, type BeforeAfterHandle } from './beforeafter.ts';
// Pinch-zoom compartido con la ficha (`ui.ts`). Vivía duplicado en los dos
// archivos porque `ui.ts` no lo exportaba y además importa este módulo:
// sacarlo a `pinch-zoom.ts` rompe el ciclo y deja una sola implementación.
import { PinchZoom } from './pinch-zoom.ts';
import {
  TRAMOS,
  AMBIENTE_MODELO,
  TRAMO_UNIDAD_MODELO,
  buildRailContent,
  captionSinChapa,
  chapaFor,
  chapaVisible,
  esVistaDePunta,
  indiceDeAmbiente,
  puntaAnclaje,
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
  private readonly marca: HTMLElement;
  private readonly dots: HTMLElement;
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
    this.marca = document.createElement('div');
    this.marca.className = 'r360-rail__marca';
    this.marca.hidden = true;
    montarMarca(this.marca, this.resolve(marcaPath(opts.tour)), opts.tour.project);
    opts.container.appendChild(this.marca);

    this.scroll = this.el.querySelector('.r360-rail__scroll')!;
    this.head = this.el.querySelector('.r360-rail__head')!;
    this.dots = this.el.querySelector('.r360-rail__dots')!;
    this.nextBtn = this.el.querySelector('.r360-rail__next')!;
    this.layerEl = this.el.querySelector('.r360-rail__layer')!;

    this.renderDots();
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
    this.marca.hidden = !this.state.open;
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
    const next = railNextLabel(this.state.tramo);
    this.nextBtn.hidden = !next;
    if (next) {
      this.nextBtn.textContent = `${next.label} →`;
      this.nextBtn.setAttribute('aria-label', next.aria);
    }
  }

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

    if (def.id === 'llegada') this.renderLlegada();
    else if (def.id === 'bloque-2') this.renderBloque();
    else if (def.id === 'amenities') this.renderAmenities();
    else if (def.id === 'video') this.renderVideo();
    else if (def.id === 'unidades') this.renderUnidades();
    else this.renderConsultar();

    // El acceso al plano y a WhatsApp está en TODOS los tramos: el masterplan
    // siempre a un toque (spec §1) y el canal de consulta siempre abierto
    // (spec §6), sin obligar a llegar al final.
    if (def.id !== 'consultar') this.add(this.tramoFooter());
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
      track?.scrollTo({ left: foco.index * track.clientWidth, behavior: 'auto' });
    });
  }

  // ------------------------------------------------------------ los tramos

  private renderLlegada(): void {
    const [contexto, skyline] = this.content.llegada.fotos;
    if (contexto) this.add(this.fotoCard(contexto));
    if (skyline) {
      // Etiqueta anclada a lo que se ve en la foto (spec §3.2, punto 4): sólo
      // lo verificable en la imagen. Ninguna distancia ni tiempo de viaje:
      // ese dato no está en el material del proyecto. Tocarla acerca la
      // cámara al skyline (auditoría §4, Idea 2).
      this.add(
        this.fotoCard(skyline, {
          caption: 'Desde la azotea del Bloque 2, la península. Tocá la etiqueta para acercarte.',
        }),
      );
      const nota = document.createElement('p');
      nota.className = 'r360-rail__nota';
      nota.textContent = 'Distancias y tiempos: te los pasa el vendedor.';
      this.add(nota);
    }

    // El plano, a un toque: el trazo del acceso a los bloques se recorre en el
    // masterplan de verdad (girado a pantalla completa), no en una copia.
    const plano = document.createElement('div');
    plano.className = 'r360-rail__card r360-rail__plan';
    plano.innerHTML =
      `<p class="r360-rail__lead">El terreno baja de oeste a este: el Bloque 1 es el más alto, el 5 el más bajo. ` +
      `Los amenities, abajo, contra la Ruta 10.</p>` +
      `<ul class="r360-rail__estados">` +
      `<li><b>Bloque 2</b> · Construido, entrega diciembre 2026</li>` +
      `<li><b>Bloques 1 y 3</b> · Próximamente</li>` +
      `<li><b>Bloques 4 y 5</b> · Etapa futura, sin información comercial todavía</li>` +
      `</ul>`;
    const btn = this.button('Abrir el masterplan', 'is-ghost', () => this.opts.onOpenPlan());
    plano.appendChild(btn);
    this.add(plano);

    if (this.content.llegada.render) {
      this.add(
        this.renderCard(this.content.llegada.render, 'El acceso al complejo, como está proyectado.'),
      );
    }
  }

  private renderBloque(): void {
    const c = this.content.bloque;
    if (c.hero) this.add(this.fotoCard(c.hero, { pushIn: true }));

    for (const pair of c.pares) this.add(this.sliderCard(pair));

    if (c.fachadas.length) {
      this.add(
        this.serieCard('fachadas', c.fachadas, {
          titulo: 'La fachada, de día y al atardecer',
        }),
      );
    }

    if (c.paseo.length) {
      const intro = document.createElement('p');
      intro.className = 'r360-rail__lead r360-rail__lead--sep';
      intro.textContent =
        'Adentro: el paseo por la unidad modelo, en el orden en que se recorre una casa.';
      this.add(intro);
      this.add(this.serieCard('paseo', c.paseo, { ambientes: true }));
      const nota = document.createElement('p');
      nota.className = 'r360-rail__nota';
      nota.textContent =
        'Unidad modelo del Bloque 2.';
      this.add(nota);
    }

    const acciones = document.createElement('div');
    acciones.className = 'r360-rail__acciones';
    if (c.bloque) {
      const resumen = resumenDeBloque(c.bloque.codes, this.opts.availability());
      acciones.appendChild(
        this.button(`Ver las ${resumen.total} unidades del ${c.bloque.label}`, 'is-primary', () =>
          this.opts.onOpenUnit(c.bloque!.code),
        ),
      );
    }
    const visita = this.ctaLink('visita');
    if (visita) acciones.appendChild(visita);
    this.add(acciones);

    const transicion = document.createElement('p');
    transicion.className = 'r360-rail__nota r360-rail__nota--transicion';
    transicion.textContent = 'Lo que sigue todavía no está construido. Lo mostramos como proyecto.';
    this.add(transicion);
  }

  private renderAmenities(): void {
    const c = this.content.amenities;

    const donde = document.createElement('div');
    donde.className = 'r360-rail__card r360-rail__plan';
    donde.innerHTML =
      `<p class="r360-rail__lead">El sector de amenities está en el punto más bajo del terreno, junto a la Ruta 10: ` +
      `piscina, piscina infantil, rincón de fuego y laguna.</p>`;
    donde.appendChild(this.button('Ver el sector en el plano', 'is-ghost', () => this.opts.onOpenPlan()));
    this.add(donde);

    // El interruptor Proyecto/Hoy (spec §4): la única variable que acá importa
    // es el tiempo, y las dos imágenes ya existen.
    if (c.renders.length && c.hoy) {
      const wrap = document.createElement('div');
      wrap.className = 'r360-rail__switch';
      wrap.innerHTML =
        `<div class="r360-rail__toggle" role="group" aria-label="Proyecto o estado actual">` +
        `<button type="button" data-modo="proyecto" class="is-on" aria-pressed="true">Proyecto</button>` +
        `<button type="button" data-modo="hoy" aria-pressed="false">Hoy</button>` +
        `</div>`;
      const stage = document.createElement('div');
      stage.className = 'r360-rail__switch-stage';
      wrap.appendChild(stage);

      // Las dos imágenes APILADAS y un fundido cruzado, no un nodo que
      // reemplaza a otro (auditoría §3): que sean el mismo lugar en dos
      // momentos tiene que verse, y reemplazar el nodo además volvía a pedir
      // la imagen en cada toque.
      const proyecto = this.renderCard(
        c.renders[0]!,
        'Acá va a estar la piscina, el rincón de fuego y la laguna.',
      );
      const hoy = this.fotoCard(c.hoy!, {
        caption: 'El sector, hoy. Los amenities se construyen con las etapas siguientes.',
      });
      stage.append(proyecto, hoy);

      const pintar = (modo: 'proyecto' | 'hoy') => {
        proyecto.classList.toggle('is-on', modo === 'proyecto');
        hoy.classList.toggle('is-on', modo === 'hoy');
        proyecto.setAttribute('aria-hidden', String(modo !== 'proyecto'));
        hoy.setAttribute('aria-hidden', String(modo !== 'hoy'));
        for (const b of wrap.querySelectorAll<HTMLButtonElement>('[data-modo]')) {
          const on = b.dataset.modo === modo;
          b.classList.toggle('is-on', on);
          b.setAttribute('aria-pressed', String(on));
        }
      };
      wrap.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>('[data-modo]');
        if (b?.dataset.modo) pintar(b.dataset.modo as 'proyecto' | 'hoy');
      });
      pintar('proyecto');
      this.add(wrap);
    }

    for (const r of c.renders.slice(1)) {
      this.add(
        this.renderCard(
          r,
          r.slug === 'complejo-laguna'
            ? 'El conjunto entero, visto desde la laguna. Es la única imagen que muestra los cinco bloques a la vez.'
            : null,
        ),
      );
    }

    const nota = document.createElement('p');
    nota.className = 'r360-rail__nota';
    nota.textContent =
      'Los cuatro amenities aparecen en esta vista. Fecha de amenities: consultá al vendedor.';
    this.add(nota);

    if (c.otros.length) {
      const h = document.createElement('h3');
      h.className = 'r360-rail__otros-title';
      h.textContent = 'Otras vistas del proyecto';
      this.add(h);
      for (const r of c.otros) this.add(this.renderCard(r, r.name));
    }
  }

  private renderVideo(): void {
    const scene = this.content.video.scene;
    if (scene && 'url' in scene.source) {
      const card = document.createElement('div');
      card.className = 'r360-rail__card r360-rail__video';
      const video = document.createElement('video');
      // Fuente liviana en pantallas angostas, pesada en escritorio: dos
      // <source media="…"> nativos — el navegador elige uno solo, antes de
      // pedir nada, sin JS de por medio. `mobileUrl` es aditivo
      // (packages/core/src/types.ts) y puede no venir todavía: sin él, el
      // único <source> (desktop) sirve en cualquier pantalla.
      if (scene.mobileUrl) {
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
      const poster = this.content.video.poster;
      if (poster) video.poster = this.resolve(poster.url);
      card.appendChild(video);

      const cap = document.createElement('p');
      cap.className = 'r360-rail__caption r360-rail__caption--sobre';
      cap.textContent = 'La obra terminada, filmada. Arranca sin sonido: activalo con el control.';
      card.appendChild(cap);

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
          // `availability.json` a propósito, `tools/baleia/README.md` §3.3) se
          // dice "Sin dato", que es la verdad: la celda en blanco se leía como
          // una página rota, no como una decisión (auditoría §2.2).
          const trailing = price ?? (estado && isUnitStatus(estado) ? STATUS_TOKENS[estado].label : 'Sin dato');
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
  }

  private renderConsultar(): void {
    const bloque = this.content.bloque.bloque;
    const card = document.createElement('div');
    card.className = 'r360-rail__card r360-rail__cierre';
    card.innerHTML =
      `<h3>¿Seguimos por WhatsApp?</h3>` +
      `<p>Escribile al vendedor con lo que estuviste mirando. El mensaje va prellenado y con el link exacto.</p>`;
    this.add(card);

    const acciones = document.createElement('div');
    acciones.className = 'r360-rail__acciones';
    for (const kind of ['visita', 'plano', 'tramo'] as const) {
      const link = this.ctaLink(kind, kind === 'visita');
      if (link) acciones.appendChild(link);
    }
    this.add(acciones);

    if (bloque) {
      const ver = document.createElement('div');
      ver.className = 'r360-rail__acciones';
      ver.appendChild(
        this.button(`Elegir una unidad del ${bloque.label}`, 'is-ghost', () => this.opts.onOpenUnit(bloque.code)),
      );
      this.add(ver);
    }

    const nota = document.createElement('p');
    nota.className = 'r360-rail__nota';
    const contacto = this.opts.tour.contact?.name;
    nota.textContent = contacto
      ? `Valores de lista de septiembre 2026, a confirmar por el vendedor (${contacto}).`
      : 'Valores de lista de septiembre 2026, a confirmar por el vendedor.';
    this.add(nota);

    // "Qué es real en este recorrido" (spec §5.2): el inventario del material,
    // contado con los números del propio manifiesto — nada escrito a mano.
    this.add(this.queEsReal());
  }

  private queEsReal(): HTMLElement {
    const items = this.opts.tour.photoTour?.items ?? [];
    const fotos = items.filter((i) => i.procedencia.kind === 'foto').length;
    const ia = items.filter((i) => i.procedencia.kind === 'ia').length;
    const pares = this.opts.tour.photoTour?.pairs?.length ?? 0;
    const renders = this.opts.tour.scenes.filter((s) => s.procedencia?.kind === 'render').length;
    const plantas = new Set(
      Object.values(this.opts.tour.units).flatMap((u) => u.media ?? []),
    ).size;

    const el = document.createElement('div');
    el.className = 'r360-rail__card r360-rail__real';
    el.innerHTML =
      `<h3>Qué es real en este recorrido</h3>` +
      `<p><b>${fotos}</b> fotografías reales del predio, <b>${plantas}</b> imágenes de planta y plano de unidad, ` +
      `<b>${renders}</b> imágenes del proyecto (renders y masterplan) y <b>${Math.max(ia, pares)}</b> ` +
      `recreaciones con IA sobre foto real, que sólo se ven dentro de su comparador. ` +
      `Panorámicas 360: todavía no.</p>`;
    return el;
  }

  // -------------------------------------------------------------- piezas

  /** Pie común de cada tramo: el plano a un toque y el canal de consulta. */
  private tramoFooter(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'r360-rail__acciones r360-rail__acciones--pie';
    el.appendChild(this.button('Ver el plano', 'is-ghost', () => this.opts.onOpenPlan()));
    const cta = this.ctaLink('tramo');
    if (cta) el.appendChild(cta);
    return el;
  }

  private button(label: string, cls: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `r360-rail__btn ${cls}`;
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

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
          detail: { unitCode: null, kind: `rail-${kind}`, tramo: this.state.tramo },
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
    this.tagDePunta(fig, item);

    fig.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.r360-rail__chapa, .r360-rail__tag')) return;
      this.openFoto(item);
    });

    // La caption va SOBRE la foto, abajo, con el degradado de la bienvenida:
    // así la imagen llega hasta el borde y el texto sigue siendo legible.
    const caption = opts.caption ?? captionSinChapa(item.caption);
    if (caption) {
      const p = document.createElement('figcaption');
      p.className = 'r360-rail__caption r360-rail__caption--sobre';
      p.textContent = caption;
      fig.appendChild(p);
    }
    card.appendChild(fig);
    return card;
  }

  /** Un render: SIEMPRE enmarcado, con filete y chapa arriba a la izquierda. */
  private renderCard(r: RailRender, caption: string | null): HTMLElement {
    const card = document.createElement('div');
    card.className = 'r360-rail__card r360-rail__render';
    const fig = document.createElement('figure');
    fig.className = 'r360-rail__frame is-render';
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = r.name;
    img.src = this.resolve(r.url);
    fadeIn(img);
    fig.appendChild(img);
    this.chapaSiCorresponde(fig, r.procedencia);
    card.appendChild(fig);
    const p = document.createElement('p');
    p.className = 'r360-rail__caption';
    p.textContent = caption ?? r.name;
    card.appendChild(p);
    return card;
  }

  /**
   * La chapa, una vez por tramo y después sólo cuando cambia la naturaleza del
   * material (auditoría §2.13): en el Tramo 2 aparecía 17 veces. Quién decide
   * es `chapaVisible`; acá sólo se lleva la cuenta del tramo en curso.
   */
  private chapaSiCorresponde(fig: HTMLElement, procedencia: Parameters<typeof chapaFor>[0]): void {
    const chapa = chapaFor(procedencia);
    if (!chapa || !chapaVisible(this.chapaPrev, chapa.kind)) return;
    this.chapaPrev = chapa.kind;
    fig.appendChild(this.chapaEl(chapa.kind, chapa.text, chapa.detail));
  }

  /**
   * Idea 2 — la Punta como protagonista. En las dos fotos donde el skyline
   * está a la vista, tocar la etiqueta acerca la cámara sobre la imagen que ya
   * está cargada: 2,5×, 600 ms, centrado en el horizonte. Ni un byte más de
   * red, y es el argumento que ningún render puede dar.
   */
  private tagDePunta(fig: HTMLElement, item: PhotoTourItem): void {
    if (!esVistaDePunta(item)) return;
    const ancla = puntaAnclaje(item.id);
    fig.classList.add('is-punta');
    if (ancla) {
      fig.style.setProperty('--r360-punta-tag', `${(ancla.etiqueta * 100).toFixed(1)}%`);
      fig.style.setProperty('--r360-punta-horizonte', `${(ancla.horizonte * 100).toFixed(1)}%`);
    }
    const tag = document.createElement('button');
    tag.type = 'button';
    tag.className = 'r360-rail__tag';
    tag.innerHTML = `<i aria-hidden="true"></i>Punta del Este`;
    const rotular = (cerca: boolean) => {
      tag.setAttribute('aria-pressed', String(cerca));
      tag.setAttribute(
        'aria-label',
        cerca ? 'Punta del Este: alejar la cámara' : 'Punta del Este: acercar la cámara al skyline',
      );
    };
    rotular(false);
    tag.addEventListener('click', (e) => {
      e.stopPropagation();
      rotular(fig.classList.toggle('is-cerca'));
    });
    fig.appendChild(tag);
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
   * El deslizador antes/después. Se consume por su API pública y nada más: la
   * imagen de IA nunca sale de acá (no hay miniatura, ni portada, ni compartir
   * de esa imagen en todo el recorrido).
   */
  private sliderCard(pair: BeforeAfterPair): HTMLElement {
    const card = document.createElement('div');
    card.className = 'r360-rail__card r360-rail__slider';
    const host = document.createElement('div');
    card.appendChild(host);
    const slider = new BeforeAfterSlider({
      container: host,
      real: { src: this.resolve(pair.before.url), alt: pair.before.caption ?? 'Foto real del bloque' },
      ia: { src: this.resolve(pair.after.url), alt: pair.label ?? 'Recreación con IA sobre la foto real' },
      aspect: aspectOf(pair),
    });
    this.sliders.push(slider);
    const p = document.createElement('p');
    p.className = 'r360-rail__caption';
    p.textContent = pair.label
      ? `${pair.label}. Arrastrá para comparar con la foto de hoy.`
      : 'Arrastrá para comparar.';
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
    opts: { titulo?: string; ambientes?: boolean } = {},
  ): HTMLElement {
    const card = document.createElement('div');
    card.className = 'r360-rail__card r360-rail__serie';
    // La ficha de la unidad puede pedir que el recorrido abra en una foto
    // concreta de esta serie (`aplicarFoco`): la necesita poder encontrar.
    card.dataset.serie = id;
    if (opts.titulo) {
      const h = document.createElement('h3');
      h.className = 'r360-rail__serie-title';
      h.textContent = opts.titulo;
      card.appendChild(h);
    }

    let tira: HTMLElement | null = null;
    if (opts.ambientes) {
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
      this.tagDePunta(slide, item);
      slide.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.r360-rail__chapa, .r360-rail__tag')) return;
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
        const w = track.clientWidth || 1;
        const index = Math.round(track.scrollLeft / w);
        const { state, effect } = railReduce(this.state, { type: 'serie', id, index, length: items.length });
        this.state = state;
        if (effect !== 'nada') paint();
      });
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    this.seriesCleanup.push(() => track.removeEventListener('scroll', onScroll));

    const goTo = (index: number) => {
      track.scrollTo({ left: index * track.clientWidth, behavior: reducedMotion() ? 'auto' : 'smooth' });
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
    if (guardado > 0) requestAnimationFrame(() => track.scrollTo({ left: guardado * track.clientWidth }));
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
  }

  private resolve(url: string): string {
    return new URL(url, this.base).href;
  }
}

export function mountTourRail(opts: TourRailOptions): TourRail {
  return new TourRail(opts);
}
