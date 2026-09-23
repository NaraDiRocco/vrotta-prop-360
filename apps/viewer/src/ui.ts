/**
 * Capa de interfaz del visor: navegación, galería, ficha de unidad y lightbox.
 *
 * El resto del visor (scenes/floorplan/polygons) dibuja el recorrido; acá vive
 * TODO lo que el visitante toca con el dedo. Está separado a propósito: el
 * recorrido se puede embeber sin esta capa (`mountViewer` no la monta sola),
 * y esta capa no sabe nada de Leaflet ni de PSV — habla sólo con
 * `SceneController` y con el manifiesto.
 *
 * Piezas, ver `docs/06-BENCHMARK/3-PLAN-EXPERIENCIA.md` §2-4:
 *
 *  1. BARRA INFERIOR (`nav.ts`). Plano / Vistas / Unidades, al alcance del
 *     pulgar. Reemplaza el botón "← Masterplan" + botón "Galería" de antes.
 *
 *  2. HOJAS (`sheet.ts`). Ficha (tres alturas), galería de vistas y lista de
 *     unidades son la misma mecánica de arrastre con distinto contenido.
 *
 *  3. HISTORIA POR CAPAS. Cada hoja/lightbox que se abre empuja una entrada
 *     de `history`; el botón Atrás del teléfono las deshace en orden en vez
 *     de sacar al visitante del recorrido de un salto (§2, "el gesto de
 *     volver").
 *
 *  4. GALERÍA / SWIPE. En un render (zoom al mínimo) un arrastre horizontal
 *     dominante pasa al siguiente/anterior; con zoom hecho, es paneo.
 *
 *  5. LIGHTBOX. Visor de imagen con pinch-zoom/pan propio (sin Leaflet: la
 *     planta es una imagen suelta, no necesita geometría) y la misma regla
 *     de rotación que el masterplan (`plan-orientation.ts`).
 *
 * MINIATURAS POR CONVENCIÓN: `X.webp` -> `X.thumb.webp` (ver decisión #8 del
 * builder). Si la miniatura no existe, el `onerror` deja la imagen grande.
 */
import {
  INFO_TOKEN,
  STATUS_TOKENS,
  calcularPlanDePago,
  calcularTablaAmortizacion,
  isUnitStatus,
  type AvailabilityFile,
  type Scene,
  type TourManifest,
  type UnitStatus,
} from '@r360/core';
import { escapeHtml, formatPrice, priceTextForUnit } from './polygons.ts';
// El cotizador (motor en `@r360/core::cotizador.ts`) decide SI se muestra y
// arma su HTML acá, no en `ui.ts`: es lógica pura, testeada con `node --test`
// sin DOM, igual que `unidad.ts` y `contact.ts` — esta capa sólo la integra
// con el tour/availability de la unidad que se está mirando.
import { cotizadorPanelHtml, formatMonto, puedeCotizarse } from './cotizador-panel.ts';
import { parseHash, type SceneController, type UnitClickPayload } from './scenes.ts';
import { shouldRotate } from './plan-orientation.ts';
import { mountBrochure, type BrochureHandle } from './brochure.ts';
import { NavBar, type NavTab } from './nav.ts';
import { Sheet, type SnapPoint } from './sheet.ts';
// El CTA de contacto (mensaje prellenado + link de WhatsApp) es lógica pura,
// sin DOM, y ya vive testeada en `contact.ts` — es EL punto de integración
// que ese módulo espera (ver su comentario de cabecera): esta ficha arma el
// contexto y dibuja lo que `buildCta` le devuelve, sin reinventar el mensaje.
import { buildCta, ctaContextFor, deepLink, messageFromWhatsappHref } from './contact.ts';
// El recorrido guiado de seis tramos es una pieza propia (`tour-rail.ts` +
// su modelo puro `tour-rail.model.ts`): esta capa sólo lo monta y le presta
// dos cosas que ya sabe hacer — abrir la ficha de una unidad y volver al
// plano. Ni un `if` del recorrido vive acá.
import { mountTourRail, marcaPath, type TourRail } from './tour-rail.ts';
// Mismo pinch-zoom que usa el riel para la foto a pantalla completa: la clase
// estaba duplicada acá y allá (ninguna de las dos se podía importar de la
// otra sin cerrar un ciclo de módulos) y ahora vive en su propio archivo.
import { PinchZoom, type Punto } from './pinch-zoom.ts';
import { mountWelcome, type WelcomeHandle } from './welcome.ts';
// Cómo se nombra y cómo se presenta una unidad (número comercial, letra,
// etapa futura, "quiero visitarla"): lógica pura, probada con `node --test`.
import {
  ETAPA_FUTURA_NOTA,
  esEtapaFutura,
  lineaEnVenta,
  nombreCortoDeUnidad,
  numeroComercial,
  puedeVisitarse,
  resumenEnVenta,
  tituloDeUnidad,
} from './unidad.ts';
import {
  LAST_UNIT_SEEN_KEY,
  WELCOME_SEEN_KEY,
  buildRailContent,
  parseTramoHash,
  shouldShowWelcome,
  welcomePhotos,
  type TramoId,
} from './tour-rail.model.ts';

export interface UiOptions {
  container: HTMLElement;
  tour: TourManifest;
  controller: SceneController;
  /** Disponibilidad viva: se lee en cada apertura, no se cachea. */
  availability: () => AvailabilityFile | null;
  /** URL del `tour.json`, para resolver las rutas relativas de `media`. */
  tourUrl: string;
  /**
   * `object URL` de la foto de portada que el arranque ya bajó (ver
   * `ViewerHandle.heroImageUrl` en `main.ts`). La bienvenida la usa para su
   * `<img>` en vez de volver a pedirle la misma foto al servidor. `null` o
   * `undefined` si no hubo bienvenida, o si la descarga del arranque falló:
   * en ese caso la bienvenida simplemente pide la URL real, como siempre.
   */
  heroImageUrl?: string | null;
}

/** Capas que empujan historia; el orden de cierre es el orden inverso al de apertura. */
type Layer = 'lightbox' | 'panel' | 'units';

const THUMB = (url: string) => url.replace(/\.webp$/i, '.thumb.webp');

/**
 * `./scenes/p-b2a-living/tiles` → `./scenes/p-b2a-living/preview.webp`.
 * `preview.webp` es un archivo que el pipeline ya publica al lado de
 * `tiles/` para CADA panorámica (no hay ninguna que no lo tenga: es del
 * mismo paso que genera las teselas) — no es un campo del manifiesto, es una
 * convención de carpeta, así que se deriva de `TiledSource.base` en vez de
 * agregar un campo nuevo a `Scene` para una sola pantalla. `null` si algún
 * día `base` no termina en `/tiles` (una fuente no tiled, o el pipeline
 * cambió la convención): sin imagen, el botón de 360 sigue funcionando, sólo
 * que sin miniatura.
 */
function panoramaPreviewUrl(base: string): string | null {
  return base.endsWith('/tiles') ? `${base.slice(0, -'/tiles'.length)}/preview.webp` : null;
}
const NUM = new Intl.NumberFormat('es-AR');
const num = (v: unknown) => NUM.format(Number(v));
/** Entrega del Bloque 2, la única unidad construida hoy (README §3.1). No
 *  hay ese dato por unidad, así que no varía entre fichas. */
const ENTREGA_LABEL = 'Entrega dic 2026';
const row = (k: string, v: string) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`;
// La ficha (unidad o bloque) es la pantalla donde se decide: abre SIEMPRE a
// pantalla completa en móvil, no a media hoja (camino a la consulta, punto
// 2) — antes tenía tres alturas y el arrastre a `peek`/`mid` dejaba los
// botones del cierre del riel asomando por encima de la hoja. Un solo snap,
// nombrado igual que el CSS que lo hace ocupar el viewport entero
// (`.r360-panel[data-height="full"]`, `styles.css`).
const PANEL_SNAPS: SnapPoint[] = [{ name: 'full', ratio: 0.98 }];
const SINGLE_SNAP = (ratio: number): SnapPoint[] => [{ name: 'open', ratio }];

function hashFor(slug: string | null, code: string): string {
  return slug ? `#/scene/${encodeURIComponent(slug)}/unit/${encodeURIComponent(code)}` : location.hash;
}

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** Gira la imagen 90° en sentido horario a un blob nuevo (mismo truco que el
 *  masterplan en `floorplan.ts`, pero acá la imagen es efímera y suelta: no
 *  vale la pena compartir la clase entera por esto). */
async function rotatedImageUrl(src: string): Promise<string | null> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('no cargo'));
      img.src = src;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalHeight;
    canvas.height = img.naturalWidth;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', 0.92));
    return blob ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}

/** Estados en los que la ficha no ofrece consulta: no hay nada que preguntar. */
const SIN_CONSULTA = new Set(['vendido', 'bloqueado', 'proximamente', 'no_disponible']);

/**
 * El color del estado, corregido para que se lea sobre el papel de la ficha.
 * "Bloqueado" es blanco en la paleta de estados —pensado para el plano, sobre
 * la foto— y escrito en blanco sobre blanco no se veía.
 */
function tintaLegible(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const luz = (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return luz > 0.62 ? '#55636f' : hex;
}

export class ViewerUi {
  private readonly root: HTMLElement;
  private readonly sceneName: HTMLElement;
  private readonly backBtn: HTMLButtonElement;
  private readonly shareBtn: HTMLButtonElement;
  private readonly counter: HTMLElement;
  private readonly filmstrip: HTMLElement;
  private readonly units: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly lightbox: HTMLElement;
  private readonly nav: NavBar;
  private readonly rail: TourRail;
  private welcome: WelcomeHandle | null = null;
  private brochure: BrochureHandle | null = null;
  private readonly unitsSheet: Sheet;
  private readonly panelSheet: Sheet;
  private readonly base: URL;
  private readonly layers: Layer[] = [];
  private pinch: PinchZoom | null = null;
  private swipeStart: (Punto & { atMinZoom: boolean }) | null = null;
  /**
   * El bloque que el recorrido identificó como CONSTRUIDO (lo deduce de los
   * nombres de archivo de las fotos reales, `tour-rail.model.ts`). Es lo que
   * habilita "Quiero visitarla": no se puede visitar lo que no está hecho.
   */
  private readonly bloqueConstruido: string | null;

  constructor(private readonly opts: UiOptions) {
    this.base = new URL(opts.tourUrl, location.href);
    this.root = document.createElement('div');
    this.root.className = 'r360-ui';
    this.root.innerHTML = `
      <div class="r360-bar">
        <button class="r360-btn r360-icon-btn r360-back" aria-label="Volver al plano" hidden>&larr;</button>
        <span class="r360-scene-name"></span>
        <span class="r360-bar__counter" hidden></span>
        <button class="r360-btn r360-icon-btn r360-share" aria-label="Compartir"></button>
      </div>
      <div class="r360-filmstrip" hidden></div>
      <div class="r360-units r360-sheet" hidden>
        <div class="r360-sheet__handle"><i></i></div>
        <div class="r360-sheet__body r360-units__list"></div>
      </div>
      <aside class="r360-panel r360-sheet" hidden>
        <div class="r360-sheet__handle"><i></i></div>
        <div class="r360-sheet__body"></div>
      </aside>
      <div class="r360-lightbox" hidden></div>`;
    opts.container.appendChild(this.root);

    this.sceneName = this.root.querySelector('.r360-scene-name')!;
    this.backBtn = this.root.querySelector('.r360-back')!;
    this.shareBtn = this.root.querySelector('.r360-share')!;
    this.counter = this.root.querySelector('.r360-bar__counter')!;
    this.filmstrip = this.root.querySelector('.r360-filmstrip')!;
    this.units = this.root.querySelector('.r360-units')!;
    this.panel = this.root.querySelector('.r360-panel')!;
    this.lightbox = this.root.querySelector('.r360-lightbox')!;

    // La barra va colgada del contenedor raíz, NO de `.r360-ui`. `.r360-ui`
    // vive en z-index 50 y la bienvenida en 150 (`welcome.css`), las dos hijas
    // de `.r360-root`: un z-index sólo compite dentro del contexto de su
    // padre, así que la barra quedaba debajo de la portada por más alto que se
    // le pusiera. Colgada de la raíz es hermana de la bienvenida y su z-index
    // 200 sí gana. Así Inicio/Plano/Unidades están disponibles desde la
    // portada, no sólo después de entrar al recorrido.
    this.nav = new NavBar({
      container: opts.container,
      onSelect: (tab) => this.onNavSelect(tab),
    });

    this.unitsSheet = new Sheet({
      el: this.units,
      handle: this.units.querySelector('.r360-sheet__handle')!,
      // 72% y no 85%: la hoja de unidades se abre SOBRE el masterplan, y a 85%
      // dejaba 58 px de plano —una franja en la que no se reconocía nada—. El
      // alto fino lo fija el CSS (`.r360-units[data-height]`), que le gana a
      // este valor; acá va el mismo número para que el arrastre coincida.
      snaps: SINGLE_SNAP(0.72),
      onClose: () => this.onSheetGestureClose('units'),
    });
    this.panelSheet = new Sheet({
      el: this.panel,
      handle: this.panel.querySelector('.r360-sheet__handle')!,
      snaps: PANEL_SNAPS,
      onClose: () => this.onSheetGestureClose('panel'),
    });

    this.bloqueConstruido = buildRailContent(opts.tour).bloque.bloque?.code ?? null;

    this.renderUnitsTab();

    this.rail = mountTourRail({
      container: opts.container,
      tour: opts.tour,
      availability: opts.availability,
      tourUrl: opts.tourUrl,
      onOpenUnit: (code) => this.openUnit(code, undefined, { fresh: true }),
      onOpenPlan: () => this.goPlan(),
      onOpened: () => this.nav.setActive('tour'),
      onClosed: () => this.nav.setActive('plan'),
      onHome: () => this.mostrarInicio(),
      // Entrar a una panorámica cierra el riel de tramos: el recorrido 360 se
      // navega con sus propias flechas, y la barra de abajo sigue disponible
      // para volver al inicio o al plano.
      onOpenScene: (slug: string) => { this.rail.hideQuiet(); this.go(slug); },
    });

    this.backBtn.addEventListener('click', () => this.go(this.opts.tour.start));
    this.shareBtn.addEventListener('click', () => this.share());
    opts.container.addEventListener('r360:unit-click', this.onUnitClick as EventListener);
    // `r360:scene` cubre los saltos que hace el propio recorrido (un hotspot
    // `goto` de amenity); `hashchange`, los que hace el visitante con el
    // botón Atrás del navegador o pegando una URL.
    opts.container.addEventListener('r360:scene', this.syncScene);
    window.addEventListener('hashchange', this.syncScene);
    window.addEventListener('popstate', this.onPopState);
    document.addEventListener('keydown', this.onKey);
    opts.container.addEventListener('touchstart', this.onSwipeStart, { passive: true });
    opts.container.addEventListener('touchend', this.onSwipeEnd, { passive: true });

    this.syncScene();
    // Deep link a una unidad que no tiene polígono propio (B2-A y compañía):
    // el controlador no puede enfocarla, pero la ficha sí puede abrirla.
    const { unitCode } = parseHash(location.hash);
    if (unitCode && opts.tour.units[unitCode]) this.openUnit(unitCode, undefined, { fresh: true });
    this.openingSequence();
  }

  destroy(): void {
    this.opts.container.removeEventListener('r360:unit-click', this.onUnitClick as EventListener);
    this.opts.container.removeEventListener('r360:scene', this.syncScene);
    window.removeEventListener('hashchange', this.syncScene);
    window.removeEventListener('popstate', this.onPopState);
    document.removeEventListener('keydown', this.onKey);
    this.opts.container.removeEventListener('touchstart', this.onSwipeStart);
    this.opts.container.removeEventListener('touchend', this.onSwipeEnd);
    this.nav.destroy();
    this.rail.destroy();
    this.welcome?.close();
    this.unitsSheet.destroy();
    this.panelSheet.destroy();
    this.pinch?.destroy();
    this.root.remove();
  }

  // ------------------------------------------------------------ navegación

  private onNavSelect(tab: NavTab): void {
    // La pestaña de la casa vuelve al INICIO —la portada—, no al riel de
    // tramos. Con el ícono de casa y el rótulo "Recorrido" prometía una cosa y
    // hacía otra: no había forma de volver a la portada desde ningún lado.
    if (tab === 'tour') { this.mostrarInicio(); return; }
    // El plano y las unidades viven en `.r360-ui` (z-index 50), debajo de la
    // portada (150): si la portada sigue montada, el destino se abre tapado y
    // el botón parece no responder. Se cierra primero.
    this.cerrarPortada();
    if (tab === 'plan') { this.goPlan(); return; }
    this.openUnitsTab();
  }

  /**
   * Baja la portada, si está en pantalla, y la da por vista — lo mismo que
   * hacen sus propios botones. Sirve para cualquier navegación que salga de
   * ella sin pasar por "Empezar el recorrido" ni "Ir directo al plano".
   */
  private cerrarPortada(): void {
    if (!this.welcome) return;
    this.welcome.close();
    this.welcome = null;
    try { localStorage.setItem(WELCOME_SEEN_KEY, '1'); } catch { /* modo privado */ }
  }

  /** El plano: cierra el recorrido guiado (sin tocar la historia) y vuelve al masterplan. */
  private goPlan(): void {
    this.rail.hideQuiet();
    this.go(this.opts.tour.start);
    this.nav.setActive('plan');
  }

  /**
   * Qué se ve al llegar (spec §2). La bienvenida es fotografía real y no
   * bloquea nada; se saltea en los tres casos que decide `shouldShowWelcome`,
   * y ahí el visitante aterriza donde pidió: su tramo, su unidad, o el plano.
   */
  private openingSequence(): void {
    const tramo = parseTramoHash(location.hash);
    const { hero } = welcomePhotos(this.opts.tour);

    if (!hero || !shouldShowWelcome({ hash: location.hash, start: this.opts.tour.start })) {
      if (tramo) this.rail.show(tramo);
      else this.nav.setActive('plan');
      return;
    }

    this.mostrarInicio();
  }

  /**
   * Monta la portada. Se usa al llegar y también cada vez que el visitante
   * vuelve al inicio (el logo, o la pestaña Inicio).
   *
   * Abrir el link SIEMPRE aterriza acá. Antes, quien ya había entrado una vez
   * caía directo en el masterplan: el navegador se acordaba y el visor le
   * salteaba la portada para siempre. La portada es el inicio del recorrido,
   * no un cartel de una sola vez.
   *
   * Lo único que la saltea es un hash que nombre un destino —una unidad, un
   * tramo, una panorámica—, porque eso lo eligió alguien.
   */
  /**
   * El brochure, encima de lo que haya en pantalla. No cierra la portada: al
   * salir del brochure se vuelve exactamente a donde se estaba.
   */
  private abrirBrochure(): void {
    const pages = this.opts.tour.brochurePages ?? [];
    if (!pages.length || this.brochure) return;
    this.brochure = mountBrochure({
      container: this.opts.container,
      pages: pages.map((u) => this.resolve(u)),
      onClose: () => { this.brochure = null; },
    });
  }

  mostrarInicio(): void {
    if (this.welcome) return;   // ya está en pantalla
    const { hero, segunda } = welcomePhotos(this.opts.tour);
    if (!hero) { this.goPlan(); return; }

    // La portada es el arranque del recorrido: baja todo lo que haya quedado
    // abierto (la hoja de unidades, la ficha, el visor de fotos). Si no, la
    // portada las tapa y reaparecen al tocar Plano sin que nadie las pidiera.
    this.closeAllLayers();
    this.rail.hideQuiet();
    const marcarVista = () => {
      try { localStorage.setItem(WELCOME_SEEN_KEY, '1'); } catch { /* modo privado */ }
      this.welcome = null;
    };
    this.welcome = mountWelcome({
      container: this.opts.container,
      logo: marcaPath(this.opts.tour),
      // El lema de la marca, tal cual la portada del brochure. Antes acá iba
      // "El Bloque 2 ya está construido": cierto y verificable, pero es un
      // argumento de venta, no una apertura. El hecho de que esté construido
      // lo demuestra el recorrido entero — no hace falta anunciarlo.
      headline: 'El placer de habitar el presente',
      onBrochure: (this.opts.tour.brochurePages?.length ?? 0) > 0
        ? () => this.abrirBrochure()
        : null,
      hero,
      segunda,
      // La portada (`hero.url`) el arranque ya la bajó completa para medir el
      // progreso (`fetchWithProgress` en `main.ts`): si acá se le vuelve a
      // pedir la URL real, el navegador la trae de nuevo en vez de una —
      // confirmado con Resource Timing, dos entradas para la misma foto. Se
      // sirve del `object URL` que ya está en memoria; todo lo demás (la
      // segunda foto, el logo) sigue resolviendo como siempre.
      resolve: (u) => (u === hero.url && this.opts.heroImageUrl ? this.opts.heroImageUrl : this.resolve(u)),
      onStart: (t: TramoId) => { marcarVista(); this.rail.show(t); },
    });
    this.nav.setActive('tour');
  }

  /** Las escenas que no son el plano de arranque: los renders del proyecto,
   *  para el contador "3/7" y la tira de puntos cuando se está adentro de uno. */
  private otherScenes(): Scene[] {
    return [...this.opts.tour.scenes]
      .filter((s) => s.slug !== this.opts.tour.start)
      .sort((a, b) => a.sort - b.sort);
  }

  private go(slug: string): void {
    // Una navegación explícita de escena colapsa cualquier hoja abierta: son
    // capas de la escena actual, no algo que sobreviva a cambiar de escena.
    this.closeAllLayers();
    this.rail.hideQuiet();
    this.opts.controller.goTo(slug);
    this.syncScene();
  }

  private syncScene = (): void => {
    const slug = this.opts.controller.slug ?? this.opts.tour.start;
    const scene = this.opts.tour.scenes.find((s) => s.slug === slug);
    const isStart = slug === this.opts.tour.start;
    this.sceneName.textContent = scene?.name ?? '';
    this.backBtn.hidden = isStart;
    this.nav.setActive(this.rail.isOpen ? 'tour' : 'plan');
    // En un render no hay polígonos: la leyenda de estados no explica nada
    // de lo que se está viendo, así que se guarda hasta volver al plano.
    document.body.classList.toggle('r360-no-legend', !isStart);

    const scenes = this.otherScenes();
    const idx = scenes.findIndex((s) => s.slug === slug);
    if (!isStart && idx >= 0) {
      this.counter.hidden = false;
      this.counter.textContent = `${idx + 1}/${scenes.length}`;
      this.renderFilmstrip(scenes, idx);
      this.filmstrip.hidden = false;
    } else {
      this.counter.hidden = true;
      this.filmstrip.hidden = true;
    }
  };

  private share(): void {
    const url = location.href;
    const title = `Mirá ${this.opts.tour.project} en el recorrido`;
    if (navigator.share) {
      navigator.share({ title, url }).catch(() => { /* el visitante canceló, no es un error */ });
      return;
    }
    navigator.clipboard?.writeText(url).then(() => this.flashShareCopied());
  }

  private flashShareCopied(): void {
    const original = this.shareBtn.innerHTML;
    this.shareBtn.textContent = 'Copiado ✓';
    this.shareBtn.classList.add('is-on');
    window.setTimeout(() => {
      this.shareBtn.innerHTML = original;
      this.shareBtn.classList.remove('is-on');
    }, 1400);
  }

  // ------------------------------------------------------- pestaña Unidades

  private groupedUnits(): Array<{ code: string; label: string; codes: string[] }> {
    const tour = this.opts.tour;
    const groups = new Map<string, { code: string; label: string; codes: string[] }>();
    for (const [code, u] of Object.entries(tour.units)) {
      if (!u.groupCode) continue; // es un bloque, no una unidad hoja
      const g = groups.get(u.groupCode) ?? {
        code: u.groupCode,
        label: tour.units[u.groupCode]?.label ?? u.groupCode,
        codes: [],
      };
      g.codes.push(code);
      groups.set(u.groupCode, g);
    }
    return [...groups.values()]
      .filter((g) => g.codes.length > 0)
      .sort((a, b) => a.code.localeCompare(b.code))
      // Se ordena por el número comercial cuando lo hay, y por el código
      // cuando no. Ordenar siempre por el código dejaba la lista salteada
      // -207, 203, 204, 205, 206, 202, 209, 201, 208- porque la letra del
      // brochure y el número de la lista de precios no van en el mismo orden.
      // Quien busca "la 201" la barre de arriba abajo, así que la lista tiene
      // que ir en el orden del nombre que se muestra.
      .map((g) => ({ ...g, codes: g.codes.sort((a, b) => this.ordenDeUnidad(a) - this.ordenDeUnidad(b) || a.localeCompare(b)) }));
  }

  /**
   * El número comercial como número, para ordenar. Las unidades sin número
   * confirmado van al final: no se les inventa una posición entre las que sí
   * lo tienen, se las deja juntas y en orden de código.
   */
  private ordenDeUnidad(code: string): number {
    const numero = numeroComercial(this.opts.tour.units[code]?.attrs);
    const n = numero ? Number.parseInt(numero, 10) : Number.NaN;
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
  }

  private renderUnitsTab(): void {
    const list = this.units.querySelector('.r360-units__list')!;
    const groups = this.groupedUnits();
    const avail = this.opts.availability();
    // "20 unidades · 5 disponibles" contaba las 11 del Bloque 3, que no está a
    // la venta: al lado del 5, ese 20 se leía como stock (auditoría §2.15).
    const resumen = resumenEnVenta(
      groups.flatMap((g) => g.codes),
      (c) => avail?.units[c]?.s ?? null,
    );

    // La marca, DENTRO de la hoja blanca. Flotando arriba quedaba en la franja
    // oscura del plano, encimada con "Masterplan" y en tinta sobre fondo
    // oscuro: ilegible y con pinta de error. Acá va en el flujo, arriba del
    // resumen, y se desplaza con la lista.
    const logo = marcaPath(this.opts.tour);
    list.innerHTML =
      (logo ? `<img class="r360-units__marca" src="${escapeHtml(this.resolve(logo))}" alt="Baleia">` : '') +
      `<p class="r360-units__summary">${escapeHtml(lineaEnVenta(resumen))}</p>` +
      groups
        .map((g) => {
          const rows = g.codes
            .map((code) => {
              const u = this.opts.tour.units[code];
              const chip = this.chipFor(code);
              const price = priceTextForUnit(code, avail);
              const tipologia = u?.attrs?.tipologia ? String(u.attrs.tipologia) : '';
              const area = u?.areaTotalM2 != null ? `${num(u.areaTotalM2)} m²` : '';
              const trailing = price ?? chip.label;
              return `<button class="r360-urow" data-unit="${escapeHtml(code)}">
                  <i style="background:${chip.base}"></i>
                  <b>${escapeHtml(nombreCortoDeUnidad({ code, label: u?.label, numero: numeroComercial(u?.attrs) }))}</b>
                  <span>${escapeHtml([tipologia, area].filter(Boolean).join(' · '))}</span>
                  <em>${escapeHtml(trailing)}</em>
                  <s aria-hidden="true">&rsaquo;</s>
                </button>`;
            })
            .join('');
          return `<div class="r360-ugroup">
              <button class="r360-ugroup__head" data-unit="${escapeHtml(g.code)}">${escapeHtml(g.label)}</button>
              ${rows}
            </div>`;
        })
        .join('');

    list.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-unit]');
      if (btn?.dataset.unit) this.openUnit(btn.dataset.unit, undefined, { fresh: true });
    });
  }

  private openUnitsTab(): void {
    this.renderUnitsTab(); // la disponibilidad puede haber cambiado desde el montaje
    // La hoja se apoya SOBRE el masterplan, así que el plano tiene que estar
    // dibujado detrás. Entrando directo desde la portada —alguien que no
    // quiere el recorrido y va a ver precios— nunca se había montado y
    // quedaba un vacío negro atrás de la hoja.
    if (!this.rail.isOpen) this.go(this.opts.tour.start);
    this.pushLayer('units');
    this.unitsSheet.open(0);
    // La hoja trae su propia marca adentro: mientras está abierta, la flotante
    // del riel se oculta (ver `body.r360-units-open` en `styles.css`).
    document.body.classList.add('r360-units-open');
    this.nav.setActive('units');
  }

  // ----------------------------------------------------------------- ficha

  private onUnitClick = (e: Event): void => {
    const d = (e as CustomEvent<UnitClickPayload>).detail;
    if (d.unitCode) this.openUnit(d.unitCode, undefined, { fresh: true });
    else this.openInfo(d.facts.label);
  };

  private openInfo(label: string): void {
    this.renderPanel(
      this.header(label, { base: INFO_TOKEN.base, label: INFO_TOKEN.label }) +
        `<p class="r360-panel__note">Punto de interés del complejo.</p>`,
    );
    this.showPanel({ fresh: true });
  }

  /** `parent` deja el rastro para el botón "volver al bloque".
   *  `fresh: true` = apertura nueva (empuja capa de historia); `false` =
   *  navegación interna dentro de la ficha ya abierta (block ↔ unidad), que
   *  sólo actualiza el contenido y el hash sin agregar una capa más — si no,
   *  el botón Atrás tendría que deshacer cada paso del recorrido dentro de
   *  la misma ficha antes de cerrarla. */
  private openUnit(code: string, parent: string | undefined, opts: { fresh: boolean }): void {
    const tour = this.opts.tour;
    const unit = tour.units[code];
    if (!unit) return;

    // Único punto donde el visor confirma "se está mostrando la ficha de
    // esta unidad", sin importar por dónde se llegó (click en el plano, lista
    // de unidades, navegación bloque↔unidad, deep link al montar). Nadie
    // escucha este evento hoy — lo agrega `embed-bridge.ts` para el
    // `tour:unitView` del protocolo de embed — así que sumarlo acá no cambia
    // nada del comportamiento existente.
    this.opts.container.dispatchEvent(
      new CustomEvent<{ unitCode: string }>('r360:unit-view', { detail: { unitCode: code }, bubbles: true }),
    );

    const avail = this.opts.availability();
    const price = priceTextForUnit(code, avail);
    const attrs = unit.attrs ?? {};
    const codes = (attrs.unitCodes as string[] | undefined) ?? null;
    const label = unit.label ?? code;
    const numero = numeroComercial(attrs);
    // "201 · Unidad A" cuando el número está VERIFICADO por superficie; si no,
    // la letra sola. El número no se deduce del código en ningún lado del
    // visor: llega en `attrs.numeroComercial` o no existe (ver `unidad.ts`).
    const titulo = codes ? label : tituloDeUnidad({ code, label, numero });

    // Camino a la consulta, Tramo 6: si esto es una unidad hoja (no un
    // bloque), queda marcada como "lo último que se miró" — el cierre del
    // recorrido usa esto para armar el mensaje de WhatsApp por ESA unidad en
    // vez de la invitación genérica a visitar el bloque.
    if (!codes) {
      try { sessionStorage.setItem(LAST_UNIT_SEEN_KEY, code); } catch { /* modo privado */ }
    }

    const back = parent
      ? `<button class="r360-link r360-panel__back" data-unit="${escapeHtml(parent)}">&larr; ${escapeHtml(
          tour.units[parent]?.label ?? parent,
        )}</button>`
      : '';

    // Bloque 4 y 5: de ellos no hay NINGÚN dato, ni siquiera "próximamente".
    // El chip decía "No disponible", que afirma algo que no sabemos. Lo único
    // que se puede decir es que son etapa futura (plan §5.3).
    if (esEtapaFutura({ codes, tieneEstado: !!avail?.units[code] })) {
      this.renderPanel(
        back +
          this.header(titulo, null) +
          `<p class="r360-panel__note">${escapeHtml(ETAPA_FUTURA_NOTA)}</p>`,
      );
      this.showPanel({ fresh: opts.fresh });
      history.replaceState(history.state, '', hashFor(this.opts.controller.slug, code));
      return;
    }

    const chip = this.chipFor(code);
    const rows: string[] = [];
    if (attrs.tipologia) rows.push(row('Tipología', String(attrs.tipologia)));
    if (attrs.superficieCubiertaM2 != null) rows.push(row('Cubierta', `${num(attrs.superficieCubiertaM2)} m²`));
    if (unit.areaTotalM2 != null) rows.push(row('Total', `${num(unit.areaTotalM2)} m²`));
    if (numero) rows.push(row('Unidad del brochure', label));
    if (codes) rows.push(row('Unidades', String(codes.length)));
    if (attrs.superficieTotalUnidadesM2 != null) {
      rows.push(row('Suma de superficies', `${num(attrs.superficieTotalUnidadesM2)} m²`));
    }
    if (parent) rows.push(row('Bloque', tour.units[parent]?.label ?? parent));

    const media = (unit.media ?? []).map((m) => this.resolve(m));

    const priceRow = codes ? this.blockSummary(codes) : '';
    // La ficha de UNA unidad es la pantalla donde se decide la compra: la
    // cabecera dice, en una línea, lo que hace falta para decidir — código,
    // tipología, m², precio, entrega y estado (camino a la consulta, punto
    // 2). La ficha de un bloque sigue mostrando el resumen de siempre
    // (`blockSummary`, arriba).
    const lineaDecision = codes ? '' : this.lineaDecisionHtml({ titulo, attrs, areaTotalM2: unit.areaTotalM2 ?? null, price, chip });
    // Sin botón de consulta en lo que no está a la venta: una unidad vendida,
    // bloqueada o "próximamente" no tiene nada que consultar, y ofrecer el
    // canal ahí hace perder el tiempo a las dos partes. La ficha sigue
    // mostrando todo lo demás —plano, medidas, estado—, que es lo que el
    // visitante vino a mirar.
    const sinConsulta = !codes && SIN_CONSULTA.has(this.statusOf(code) ?? '');

    // Pedir la visita sólo si la unidad se puede comprar: en una bloqueada o
    // reservada el único botón tiene que ser la consulta, no "quiero
    // visitarla" — `puedeVisitarse` mira si el bloque está construido, que es
    // otra pregunta.
    const visitable = !codes
      && this.statusOf(code) === 'disponible'
      && puedeVisitarse({
        groupCode: unit.groupCode ?? parent ?? null,
        bloqueConstruido: this.bloqueConstruido,
        status: this.statusOf(code),
      });

    this.renderPanel(
      back +
        this.header(titulo, codes ? chip : null, { tituloOculto: !codes }) +
        priceRow +
        lineaDecision +
        // Justo debajo del precio y antes del recorrido 360: es ahí donde
        // aparece la pregunta "¿y cómo lo pago?", con el precio todavía a
        // la vista (ver la decisión de UX en `cotizador-panel.ts`).
        this.cotizadorHtml(code, !!codes, sinConsulta) +
        this.recorrido360Html(attrs) +
        (sinConsulta ? '' : this.ctaHtml(code, visitable)) +
        this.accionesHtml(code, unit.groupCode ?? parent ?? null, attrs) +
        this.plano3dHtml(attrs) +
        (rows.length ? `<dl class="r360-facts">${rows.join('')}</dl>` : '') +
        (codes ? this.unitGrid(code, codes) : '') +
        (media.length
          ? `<div class="r360-media">` +
            media
              .map(
                (m) =>
                  `<button class="r360-media__item" data-full="${escapeHtml(m)}">
                     <img loading="lazy" alt="Ubicación de la unidad en el bloque" src="${escapeHtml(m)}" />
                     <span>&#10530; Ver planta grande</span>
                   </button>`,
              )
              .join('') +
            // La imagen es la del brochure tal cual: algunas de sus páginas
            // cubren dos unidades a la vez (planta alta y planta baja del
            // mismo módulo), y entonces se ven las dos. Se dice, en vez de
            // recortar la imagen y arriesgar mostrar la que no es.
            `<p class="r360-panel__note">Ubicación de la unidad dentro del bloque, según el brochure.
               Algunas páginas muestran dos unidades juntas (planta alta y planta baja).
               Tocá la imagen para ampliar.</p></div>`
          : codes
            ? ''
            : `<p class="r360-panel__note">Sin imagen de esta unidad en el material disponible.</p>`) +
        this.unidadModeloHtml(code, codes) +
        // "Compartir esta unidad" es una acción de UNA unidad puntual: en la
        // ficha de un bloque quedaba duplicada (no hay "esta unidad" todavía,
        // hay nueve) y se sacó de ahí.
        (codes
          ? ''
          : `<button class="r360-link r360-panel__share" data-share-unit="${escapeHtml(code)}">` +
            `<i class="r360-ico-share" aria-hidden="true"></i>Compartir esta unidad</button>`),
    );

    this.showPanel({ fresh: opts.fresh });
    // `pushLayer` (dentro de `showPanel`) empujó la entrada con el hash de
    // ANTES de abrir la ficha; acá se corrige a la del deep link de la
    // unidad, conservando el mismo estado de capas que ya se empujó.
    history.replaceState(history.state, '', hashFor(this.opts.controller.slug, code));
  }

  /** Grilla de unidades de un bloque, cada una con el color de su estado y su precio/estado. */
  private unitGrid(blockCode: string, codes: string[]): string {
    const avail = this.opts.availability();
    const items = codes
      .map((c) => {
        const chip = this.chipFor(c);
        const u = this.opts.tour.units[c];
        const area = u?.areaTotalM2 != null ? `${num(u.areaTotalM2)} m²` : '';
        const price = priceTextForUnit(c, avail);
        return `<button class="r360-unit" data-unit="${escapeHtml(c)}" data-parent="${escapeHtml(blockCode)}">
            <i style="background:${chip.base}"></i>
            <b>${escapeHtml(u?.label ?? c)}</b>
            <span>${escapeHtml([area, price ?? chip.label].filter(Boolean).join(' · '))}</span>
          </button>`;
      })
      .join('');
    return `<div class="r360-units-grid">${items}</div>`;
  }

  private blockSummary(codes: string[]): string {
    const avail = this.opts.availability();
    const availableCodes = codes.filter((c) => avail?.units[c]?.s === 'disponible');
    const prices = availableCodes
      .map((c) => avail?.units[c]?.p)
      .filter((p): p is { a: number; c: string } => !!p);
    const cheapest = prices.length ? prices.reduce((min, p) => (p.a < min.a ? p : min)) : null;
    const from = cheapest ? ` · desde ${escapeHtml(formatPrice(cheapest))}` : '';
    return `<div class="r360-panel__price">${codes.length} unidades · ${availableCodes.length} disponibles${from}</div>`;
  }

  /** Arma el contexto (código/precio/estado/deep link) y le pide el CTA a
   *  `contact.ts`, que decide el texto según haya planta, sea bloque o falte
   *  el material — nada de eso se decide acá. `null` cuando el proyecto no
   *  tiene `contact` cargado: sin botón, no un botón que no lleva a nada. */
  private ctaHtml(code: string, visitable = false): string {
    // "Consultar por la 201" y "Quiero visitarla" abrían los dos el mismo
    // WhatsApp, uno debajo del otro: dos botones para una sola acción. Queda
    // uno, y cuando la unidad se puede ir a ver pide la visita, que es el
    // pedido más fuerte y el que sólo Baleia puede ofrecer.
    const ctx = ctaContextFor(
      code,
      this.opts.tour,
      this.opts.availability(),
      this.opts.controller.slug,
      location.href,
      visitable ? 'visita' : undefined,
    );
    const cta = buildCta(this.opts.tour.contact, ctx);
    if (!cta) return '';
    const disclaimer = ctx.price
      ? '<p class="r360-panel__note r360-panel__note--muted">Valores de lista, a confirmar por el vendedor.</p>'
      : '';
    // El contorno toma el color del estado: verde en las disponibles, rojo en
    // las vendidas, gris en las próximamente. Era siempre el verde de
    // WhatsApp, que decía el canal y no la unidad.
    const chip = this.chipFor(code);
    return `<a class="r360-cta" style="border-color:${tintaLegible(chip.base)}"
        href="${escapeHtml(cta.href)}" target="_blank" rel="noopener"
        data-cta-unit="${escapeHtml(cta.unitCode)}" data-cta-kind="${escapeHtml(cta.kind)}">
        ${escapeHtml(cta.label)}
      </a>${disclaimer}`;
  }

  /**
   * El cotizador: arma el plan de pago (`@r360/core::calcularPlanDePago`) y
   * su tabla de amortización, y le pide el HTML a `cotizador-panel.ts` —
   * ahí vive la decisión de si corresponde mostrarlo y cómo se ve, testeada
   * sin DOM. Acá sólo se junta lo que ese módulo necesita: el precio y el
   * estado de ESTA unidad, tal como ya los resuelve el resto de la ficha.
   *
   * `sinConsulta` llega calculado por `openUnit` (mismo corte que ya usa el
   * CTA de contacto — vendida, bloqueada, próximamente o sin dato): no tiene
   * sentido simular el pago de algo que ni siquiera admite la consulta.
   */
  private cotizadorHtml(code: string, esBloque: boolean, sinConsulta: boolean): string {
    const condiciones = this.opts.tour.cotizador;
    const price = this.opts.availability()?.units[code]?.p ?? null;
    if (!puedeCotizarse({ cotizador: condiciones, esBloque, price, sinConsulta })) return '';
    // `puedeCotizarse` ya confirmó que los dos existen; TypeScript no puede
    // seguir esa garantía a través de la llamada, así que se repite acá como
    // guarda (nunca debería disparar) para que el resto del método trabaje
    // con los dos ya no-nulos.
    if (!condiciones || !price) return '';
    const plan = calcularPlanDePago(price.a, condiciones);
    const amortizacion = calcularTablaAmortizacion(price.a, condiciones);

    // El mismo `ctaContextFor` que arma el CTA de contacto (`ctaHtml`,
    // arriba), forzado a `kind: 'cotizador'` — así el mensaje lleva la unidad,
    // sus datos y el deep link igual que cualquier otro CTA, y encima el plan
    // ya calculado (ver `CtaContext.plan` en `contact.ts`).
    const ctx = ctaContextFor(code, this.opts.tour, this.opts.availability(), this.opts.controller.slug, location.href, 'cotizador');
    const cta = buildCta(this.opts.tour.contact, {
      ...ctx,
      plan: {
        anticipoTexto: formatMonto({ a: plan.anticipo, c: price.c }),
        cuotaTexto: formatMonto({ a: plan.cuotaMensual, c: price.c }),
        plazoMeses: plan.plazoMeses,
      },
    });

    return cotizadorPanelHtml({ condiciones, plan, amortizacion, moneda: price.c, cta });
  }

  /**
   * Las dos acciones que sólo Baleia puede ofrecer (plan §6, auditoría §4
   * Idea 3), debajo del precio: la unidad **está construida** (se puede ir a
   * verla) y el plano **existe** (se puede bajar). Cada una aparece sólo si
   * su condición es real: sin bloque construido no hay visita, y sin PDF
   * publicado no hay descarga — un botón que no lleva a nada es peor que la
   * ausencia del botón.
   */
  private accionesHtml(_code: string, _grupo: string | null, attrs: Record<string, unknown>): string {
    const partes: string[] = [];

    const pdf = typeof attrs.planoPdf === 'string' ? attrs.planoPdf : null;
    if (pdf) {
      partes.push(
        `<a class="r360-panel__accion" href="${escapeHtml(this.resolve(pdf))}" download target="_blank" rel="noopener">` +
          `&#11015; Descargar el plano (PDF)</a>`,
      );
    }

    return partes.length ? `<div class="r360-panel__acciones">${partes.join('')}</div>` : '';
  }

  /**
   * El plano 3D de la tipología como imagen principal de la ficha.
   *
   * Es material generado con IA sobre el plano real y se etiqueta como tal,
   * igual que todo lo demás en este recorrido (plan §5.1): la chapa no es un
   * descargo legal, es la caption. Es la única imagen de IA que sale fuera de
   * un deslizador, y por eso lleva la chapa SIEMPRE visible y el plano
   * acotado real queda justo debajo, para poder contrastarla.
   */
  private plano3dHtml(attrs: Record<string, unknown>): string {
    const url = typeof attrs.plano3d === 'string' ? attrs.plano3d : null;
    if (!url) return '';
    const full = this.resolve(url);
    return `<figure class="r360-panel__plano3d">
        <button class="r360-media__item" data-full="${escapeHtml(full)}">
          <img loading="lazy" alt="Plano 3D de la tipología" src="${escapeHtml(THUMB(full))}"
               onerror="this.onerror=null;this.src='${escapeHtml(full)}'" />
        </button>
        <figcaption class="r360-chapa-ia">Plano 3D · recreación sobre el plano real</figcaption>
      </figure>`;
  }

  /**
   * "Recorrer en 360°", en la ficha de las unidades cuya tipología está
   * fotografiada en panorámicas.
   *
   * Las 15 panorámicas son de UNA unidad dúplex, y las cinco dúplex del
   * Bloque 2 comparten tipología: ver el recorrido en cualquiera de ellas
   * dice lo mismo. Por eso el rótulo aclara "unidad modelo" — no se promete
   * que sean las fotos de esa unidad en particular.
   *
   * La condición es la tipología, no una lista de códigos: cuando entren las
   * panorámicas de un monoambiente, aparecen solas en esas fichas.
   */
  private recorrido360Html(attrs: Record<string, unknown> | null): string {
    const escena = this.primeraPanoramica();
    if (!escena) return '';
    const tip = String(attrs?.tipologia ?? '');
    if (!/duplex|dúplex/i.test(tip)) return '';
    // Imagen grande y tocable, no un botón de texto (camino a la consulta,
    // punto 2): el `preview.webp` vive siempre al lado de `tiles/` en cada
    // panorámica publicada (convención del builder, `panoramaPreviewUrl`),
    // así que no hace falta un campo nuevo en el manifiesto para mostrarla.
    const scene = this.opts.tour.scenes.find((sc) => sc.slug === escena);
    const preview =
      scene && 'base' in scene.source ? panoramaPreviewUrl(scene.source.base) : null;
    const img = preview
      ? `<img loading="lazy" alt="Panorámica 360° de la unidad modelo" src="${escapeHtml(this.resolve(preview))}" />`
      : '';
    return `<button class="r360-cta360" data-abrir360="${escapeHtml(escena)}" aria-label="Recorrer en 360°, unidad modelo de la misma tipología">
        ${img}
        <span class="r360-cta360__tag"><i aria-hidden="true"></i>Recorrer en 360&deg;</span>
      </button>
      <p class="r360-panel__note r360-panel__note--360">Unidad modelo de la misma tipología, fotografiada adentro.</p>`;
  }

  /** La primera panorámica del recorrido, por orden de guion. */
  private primeraPanoramica(): string | null {
    const pans = this.opts.tour.scenes
      .filter((sc) => sc.kind === 'panorama')
      .sort((a, b) => a.sort - b.sort);
    return pans[0]?.slug ?? null;
  }

  /**
   * "Ver la unidad modelo fotografiada →": la ficha estaba a un tramo de
   * distancia de las 11 fotos reales del interior y no las mencionaba
   * (auditoría §3). No se ofrece en la ficha de un bloque (ahí el paseo ya
   * está a la vista) ni si el recorrido no tiene ese material.
   */
  private unidadModeloHtml(code: string, codes: string[] | null): string {
    if (codes || !this.rail.tieneUnidadModelo) return '';
    return `<button class="r360-link r360-panel__modelo" data-unidad-modelo="${escapeHtml(code)}">
        Ver la unidad modelo fotografiada &rarr;</button>`;
  }

  private statusOf(code: string): UnitStatus | null {
    const entry = this.opts.availability()?.units[code];
    return entry && isUnitStatus(entry.s) ? entry.s : null;
  }

  private chipFor(code: string): { base: string; label: string } {
    const s = this.statusOf(code);
    const t = s ? STATUS_TOKENS[s] : null;
    const theme = s ? this.opts.tour.theme?.states?.[s] : undefined;
    // Igual que en el mapa (`polygons.ts::resolveStatus`, FALLBACK_STATUS):
    // sin dato NO se oculta ni se dice "Sin dato" (esa cadena no se le
    // muestra nunca al visitante) — cae al mismo token "No disponible" que
    // ya usa el mapa para el mismo caso, así la ficha no dice algo distinto
    // de lo que dice el polígono para la misma unidad.
    return t
      ? { base: theme?.base ?? t.base, label: t.label }
      : { base: STATUS_TOKENS.no_disponible.base, label: STATUS_TOKENS.no_disponible.label };
  }

  /** `chip: null` = no hay estado comercial que mostrar y no se inventa ninguno. */
  private header(
    title: string,
    chip: { base: string; label: string } | null,
    opts: { tituloOculto?: boolean } = {},
  ): string {
    return `<div class="r360-panel__head">
        <h2${opts.tituloOculto ? ' class="r360-solo-lectores"' : ''}>${escapeHtml(title)}</h2>
        <button class="r360-close" aria-label="Cerrar">×</button>
      </div>` +
      (chip
        ? `<div class="r360-panel__status"><i style="background:${chip.base}"></i>${escapeHtml(chip.label)}</div>`
        : '');
  }

  /**
   * La línea que decide la compra (camino a la consulta, punto 2): tipología,
   * m², precio, entrega y estado, en una sola línea legible bajo el título.
   * `Entrega dic 2026` es la fecha de entrega del Bloque 2 — la única
   * construida hoy y la única de la que hay fecha (`tools/baleia/README.md`
   * §3.1); no hay ese dato por unidad en ningún lado del manifiesto, así que
   * no se inventa una distinta para cada una.
   *
   * `price` ya viene resuelto por `priceTextForUnit`, que es quien sabe
   * cuándo NO hay que decir nada (206/207 bloqueadas: ni precio ni
   * "Consultar" — README §3.2): acá sólo se agrega el segmento si no es
   * `null`, nunca se rearma esa regla.
   */
  private lineaDecisionHtml(opts: {
    titulo: string;
    attrs: Record<string, unknown>;
    areaTotalM2: number | null;
    price: string | null;
    chip: { base: string; label: string };
  }): string {
    // El precio manda: va solo, grande. Lo demás lo acompaña en una fila de
    // datos, y el estado es una chapa —no la última palabra de una enumeración,
    // donde se perdía justo el dato que decide si la unidad se puede comprar.
    const datos: string[] = [];
    if (opts.attrs.tipologia) datos.push(escapeHtml(String(opts.attrs.tipologia)));
    if (opts.areaTotalM2 != null) datos.push(escapeHtml(`${num(opts.areaTotalM2)} m²`));
    datos.push(ENTREGA_LABEL);
    const precio = opts.price
      ? `<p class="r360-ficha__precio">${escapeHtml(opts.price)}</p>`
      : '';
    return `<div class="r360-ficha">` +
      `<p class="r360-ficha__disponible" style="color:${tintaLegible(opts.chip.base)}">` +
      `${escapeHtml(opts.chip.label)}</p>` +
      `<p class="r360-ficha__estado"><i style="background:${opts.chip.base}"></i>` +
      `${escapeHtml(opts.titulo)}</p>` +
      precio +
      `<p class="r360-ficha__datos">${datos.join(' <span>&middot;</span> ')}</p>` +
      `</div>`;
  }

  private renderPanel(html: string): void {
    this.panel.querySelector('.r360-sheet__body')!.innerHTML = html;
  }

  private showPanel(opts: { fresh: boolean }): void {
    if (opts.fresh) {
      this.pushLayer('panel');
      this.panelSheet.open(0);
    } else if (!this.panelSheet.isOpen) {
      this.pushLayer('panel');
      this.panelSheet.open(0);
    }
    // En móvil la ficha es una hoja inferior y cae justo encima de la
    // leyenda de estados: se la esconde mientras la ficha está abierta.
    document.body.classList.add('r360-panel-open');
    this.panel.querySelector('.r360-sheet__body')!.scrollTop = 0;
    this.panel.onclick = (e) => {
      const el = e.target as HTMLElement;
      if (el.closest('.r360-close')) return this.requestClose('panel');
      // El desplegable del cotizador: un botón real con `aria-expanded`, que
      // esta ficha alterna a mano (no hay `<details>` acá porque el pedido
      // es específicamente un botón operable por teclado con ese atributo).
      // El cuerpo se identifica por `aria-controls`, no por una referencia
      // guardada aparte, para no duplicar la relación entre los dos.
      const cotizadorToggle = el.closest<HTMLElement>('.r360-cotizador__toggle');
      if (cotizadorToggle) {
        const abierto = cotizadorToggle.getAttribute('aria-expanded') === 'true';
        const id = cotizadorToggle.getAttribute('aria-controls');
        const body = id ? this.panel.querySelector<HTMLElement>(`#${CSS.escape(id)}`) : null;
        cotizadorToggle.setAttribute('aria-expanded', String(!abierto));
        if (body) body.hidden = abierto;
        return;
      }
      // `[data-cta-unit]` y no `.r360-cta`: así cualquier CTA de la ficha
      // queda registrado, sea el botón principal o uno que se agregue después.
      const cta = el.closest<HTMLElement>('[data-cta-unit]');
      if (cta) {
        // El mensaje ya quedó codificado en `?text=` del propio link a wa.me
        // al armar la ficha (`buildCta`): se relee de ahí en vez de
        // recalcularlo, para no duplicar esa decisión acá.
        const message = messageFromWhatsappHref(cta.getAttribute('href') ?? '');
        this.opts.container.dispatchEvent(
          new CustomEvent('r360:cta', {
            detail: { unitCode: cta.dataset.ctaUnit || null, kind: cta.dataset.ctaKind ?? null, message },
            bubbles: true,
          }),
        );
        return; // deja que el link a wa.me navegue normalmente
      }
      const share = el.closest<HTMLElement>('[data-share-unit]');
      if (share?.dataset.shareUnit) return this.shareUnit(share.dataset.shareUnit);
      // La ficha se aparta antes de mostrar el paseo: la foto tiene que ser lo
      // único que se vea. Se cierra SIN caminar la historia hacia atrás
      // (`requestClose`), porque el `popstate` de `history.back()` llega
      // después del salto de tramo y lo deshace: el riel volvía al tramo de
      // donde salió. Es la misma decisión que ya toma `go()` cuando el
      // visitante cambia de escena con una hoja abierta.
      const b360 = el.closest<HTMLElement>('[data-abrir360]');
      if (b360?.dataset.abrir360) {
        // Cierra la ficha y el riel: la panorámica se recorre a pantalla
        // completa, con sus propias flechas.
        this.closeAllLayers();
        this.rail.hideQuiet();
        this.go(b360.dataset.abrir360);
        return;
      }
      if (el.closest('[data-unidad-modelo]')) {
        this.closeAllLayers();
        this.rail.mostrarUnidadModelo();
        return;
      }
      const back = el.closest<HTMLElement>('.r360-panel__back');
      if (back?.dataset.unit) return this.openUnit(back.dataset.unit, undefined, { fresh: false });
      const unit = el.closest<HTMLElement>('.r360-unit');
      if (unit?.dataset.unit) return this.openUnit(unit.dataset.unit, unit.dataset.parent, { fresh: false });
      const media = el.closest<HTMLElement>('.r360-media__item');
      if (media?.dataset.full) return this.openLightbox(media.dataset.full);
    };
  }

  private shareUnit(code: string): void {
    const unit = this.opts.tour.units[code];
    const url = deepLink(this.opts.controller.slug, code, location.href);
    const title = `Mirá esta unidad en ${this.opts.tour.project}: ${unit?.label ?? code}`;
    if (navigator.share) {
      navigator.share({ title, url }).catch(() => { /* cancelado */ });
    } else {
      navigator.clipboard?.writeText(url);
    }
  }

  // ----------------------------------------------------------- capas/historia

  /** Empuja una entrada de historia por cada capa (ficha/hoja/lightbox) que
   *  se abre, para que el botón Atrás del teléfono la cierre en vez de
   *  salirse del recorrido de un salto (plan §2, "el gesto de volver"). */
  private pushLayer(name: Layer): void {
    this.layers.push(name);
    history.pushState({ r360Layers: [...this.layers] }, '', location.href);
  }

  /** Cierre por gesto explícito (×, arrastre): si la capa está en la punta de
   *  la pila, se deshace navegando Atrás (así la historia queda consistente
   *  con lo que se ve); si no, se cierra directo. */
  private requestClose(name: Layer): void {
    if (this.layers[this.layers.length - 1] === name) {
      history.back();
      return;
    }
    this.layers.splice(this.layers.lastIndexOf(name), 1);
    this.hideLayer(name);
  }

  /** Igual que `requestClose`, pero ya invocado DESDE el cierre por arrastre
   *  de `Sheet` (que ya ocultó visualmente la hoja): sólo hay que sincronizar
   *  la historia, no volver a ocultar. */
  private onSheetGestureClose(name: Layer): void {
    if (this.layers[this.layers.length - 1] === name) {
      history.back();
    } else {
      this.layers.splice(this.layers.lastIndexOf(name), 1);
    }
    this.afterLayerClosed(name);
  }

  private onPopState = (): void => {
    const state = history.state as { r360Layers?: Layer[] } | null;
    const newLayers = state?.r360Layers ?? [];
    while (this.layers.length > newLayers.length) {
      const top = this.layers.pop()!;
      this.hideLayer(top);
      this.afterLayerClosed(top);
    }
    this.layers.length = 0;
    this.layers.push(...newLayers);
  };

  private hideLayer(name: Layer): void {
    if (name === 'lightbox') { this.closeLightboxUi(); }
    else if (name === 'panel') { this.panelSheet.close(); }
    else if (name === 'units') { this.unitsSheet.close(); }
  }

  private afterLayerClosed(name: Layer): void {
    if (name === 'panel') document.body.classList.remove('r360-panel-open');
    if (name === 'units') {
      document.body.classList.remove('r360-units-open');
      this.nav.setActive(this.rail.isOpen ? 'tour' : 'plan');
    }
  }

  private closeAllLayers(): void {
    while (this.layers.length) this.hideLayer(this.layers.pop()!);
    document.body.classList.remove('r360-panel-open');
  }

  // -------------------------------------------------------------- lightbox

  private openLightbox(url: string): void {
    this.pushLayer('lightbox');
    this.lightbox.innerHTML =
      `<button class="r360-close r360-lightbox__close" aria-label="Cerrar">×</button>
       <div class="r360-lightbox__stage"><img class="r360-lightbox__img" alt="" /></div>`;
    this.lightbox.hidden = false;
    const stage = this.lightbox.querySelector<HTMLElement>('.r360-lightbox__stage')!;
    const img = this.lightbox.querySelector<HTMLImageElement>('.r360-lightbox__img')!;
    this.lightbox.querySelector('.r360-close')!.addEventListener('click', () => this.requestClose('lightbox'));

    const probe = new Image();
    probe.onload = () => {
      if (this.lightbox.hidden) return; // se cerró mientras cargaba
      const rotate = shouldRotate(probe.naturalWidth, probe.naturalHeight, stage.clientWidth || 1, stage.clientHeight || 1);
      if (rotate) {
        stage.classList.add('r360-lightbox__stage--rot');
        rotatedImageUrl(url).then((rotated) => { img.src = rotated ?? url; });
      } else {
        img.src = url;
      }
    };
    probe.onerror = () => { img.src = url; };
    probe.src = url;

    this.pinch?.destroy();
    this.pinch = new PinchZoom(stage, img);
  }

  private closeLightboxUi(): void {
    this.pinch?.destroy();
    this.pinch = null;
    this.lightbox.hidden = true;
    this.lightbox.innerHTML = '';
  }

  private onKey = (e: KeyboardEvent): void => {
    // Escape sigue funcionando en escritorio; en el teléfono no existe, así
    // que nunca es la ÚNICA vía de cierre (siempre hay × táctil + Atrás).
    if (e.key !== 'Escape') return;
    if (this.layers.length) this.requestClose(this.layers[this.layers.length - 1]!);
  };

  // ------------------------------------------------------------- galería-swipe

  /** Sólo un arrastre horizontal dominante, con el plano en su zoom mínimo,
   *  pasa al render siguiente/anterior — con zoom hecho, todo gesto es
   *  paneo de Leaflet (plan §2). Se lee el zoom desde el DOM que ya pinta
   *  el propio control de Leaflet (`leaflet-disabled` en el botón "-"): no
   *  hace falta tocar `floorplan.ts` para saberlo. */
  private isPlanAtMinZoom(): boolean {
    const zoomOut = document.querySelector('.r360-plan .leaflet-control-zoom-out');
    return zoomOut ? zoomOut.classList.contains('leaflet-disabled') : true;
  }

  private onSwipeStart = (e: TouchEvent): void => {
    if (this.layers.length) { this.swipeStart = null; return; } // no pelear con una hoja abierta
    const isStart = (this.opts.controller.slug ?? this.opts.tour.start) === this.opts.tour.start;
    if (isStart) { this.swipeStart = null; return; }
    const t = e.touches[0];
    if (!t) return;
    this.swipeStart = { x: t.clientX, y: t.clientY, atMinZoom: this.isPlanAtMinZoom() };
  };

  private onSwipeEnd = (e: TouchEvent): void => {
    const start = this.swipeStart;
    this.swipeStart = null;
    if (!start || !start.atMinZoom) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.4) return;

    const scenes = this.otherScenes();
    const idx = scenes.findIndex((s) => s.slug === this.opts.controller.slug);
    if (idx < 0) return;
    const nextIdx = dx < 0 ? idx + 1 : idx - 1;
    const next = scenes[nextIdx];
    if (next) this.go(next.slug);
  };

  private renderFilmstrip(scenes: Scene[], activeIdx: number): void {
    this.filmstrip.innerHTML =
      `<button class="r360-filmstrip__arrow r360-filmstrip__arrow--prev" aria-label="Vista anterior" ${activeIdx <= 0 ? 'disabled' : ''}>&lsaquo;</button>` +
      `<span class="r360-filmstrip__dots">` +
      scenes
        .map((s, i) => `<button class="r360-dot ${i === activeIdx ? 'is-active' : ''}" data-slug="${escapeHtml(s.slug)}" aria-label="${escapeHtml(s.name)}"></button>`)
        .join('') +
      `</span>` +
      `<button class="r360-filmstrip__arrow r360-filmstrip__arrow--next" aria-label="Vista siguiente" ${activeIdx >= scenes.length - 1 ? 'disabled' : ''}>&rsaquo;</button>`;
    this.filmstrip.onclick = (e) => {
      const el = e.target as HTMLElement;
      if (el.closest('.r360-filmstrip__arrow--prev')) { const s = scenes[activeIdx - 1]; if (s) this.go(s.slug); return; }
      if (el.closest('.r360-filmstrip__arrow--next')) { const s = scenes[activeIdx + 1]; if (s) this.go(s.slug); return; }
      const dot = el.closest<HTMLElement>('.r360-dot');
      if (dot?.dataset.slug) this.go(dot.dataset.slug);
    };
  }

  /** `media`/`source.url` son relativas al `tour.json`, no al documento. */
  private resolve(url: string): string {
    return new URL(url, this.base).href;
  }
}

export function mountUi(opts: UiOptions): ViewerUi {
  return new ViewerUi(opts);
}

// Re-exportado por conveniencia: quien monte la UI puede necesitar el tipo.
export type { NavTab };
export { reducedMotion as prefersReducedMotion };
