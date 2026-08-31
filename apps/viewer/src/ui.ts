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
  isUnitStatus,
  type AvailabilityFile,
  type Scene,
  type TourManifest,
  type UnitStatus,
} from '@r360/core';
import { escapeHtml, formatPrice, priceTextForUnit } from './polygons.ts';
import { parseHash, type SceneController, type UnitClickPayload } from './scenes.ts';
import { shouldRotate } from './plan-orientation.ts';
import { NavBar, type NavTab } from './nav.ts';
import { Sheet, type SnapPoint } from './sheet.ts';
// El CTA de contacto (mensaje prellenado + link de WhatsApp) es lógica pura,
// sin DOM, y ya vive testeada en `contact.ts` — es EL punto de integración
// que ese módulo espera (ver su comentario de cabecera): esta ficha arma el
// contexto y dibuja lo que `buildCta` le devuelve, sin reinventar el mensaje.
import { buildCta, ctaContextFor, deepLink } from './contact.ts';

export interface UiOptions {
  container: HTMLElement;
  tour: TourManifest;
  controller: SceneController;
  /** Disponibilidad viva: se lee en cada apertura, no se cachea. */
  availability: () => AvailabilityFile | null;
  /** URL del `tour.json`, para resolver las rutas relativas de `media`. */
  tourUrl: string;
}

/** Capas que empujan historia; el orden de cierre es el orden inverso al de apertura. */
type Layer = 'lightbox' | 'panel' | 'gallery' | 'units';

const THUMB = (url: string) => url.replace(/\.webp$/i, '.thumb.webp');
const NUM = new Intl.NumberFormat('es-AR');
const num = (v: unknown) => NUM.format(Number(v));
const row = (k: string, v: string) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`;
const PANEL_SNAPS: SnapPoint[] = [
  { name: 'peek', ratio: 0.32 },
  { name: 'mid', ratio: 0.6 },
  { name: 'full', ratio: 0.92 },
];
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

interface Point { x: number; y: number }
function dist(a: Point, b: Point): number { return Math.hypot(a.x - b.x, a.y - b.y); }
function clampScale(s: number): number { return Math.max(1, Math.min(4, s)); }

/** Pinch-zoom + pan de dos dedos sobre una imagen suelta, sin Leaflet: la
 *  planta no tiene geometría que proyectar, sólo hay que poder agrandarla y
 *  recorrerla con el dedo (plan §4, "La planta a pantalla completa"). */
class PinchZoom {
  private scale = 1;
  private x = 0;
  private y = 0;
  private readonly pointers = new Map<number, Point>();
  private lastDist = 0;
  private pan: { x: number; y: number; ox: number; oy: number } | null = null;

  constructor(private readonly stage: HTMLElement, private readonly img: HTMLElement) {
    stage.addEventListener('pointerdown', this.onDown);
    stage.addEventListener('pointermove', this.onMove);
    stage.addEventListener('pointerup', this.onUp);
    stage.addEventListener('pointercancel', this.onUp);
    stage.addEventListener('dblclick', this.onDblClick);
  }

  destroy(): void {
    this.stage.removeEventListener('pointerdown', this.onDown);
    this.stage.removeEventListener('pointermove', this.onMove);
    this.stage.removeEventListener('pointerup', this.onUp);
    this.stage.removeEventListener('pointercancel', this.onUp);
    this.stage.removeEventListener('dblclick', this.onDblClick);
  }

  private apply(): void {
    this.img.style.transform = `translate(${this.x}px, ${this.y}px) scale(${this.scale})`;
  }

  private onDown = (e: PointerEvent): void => {
    try { this.stage.setPointerCapture(e.pointerId); } catch { /* no-op */ }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.pan = { x: e.clientX, y: e.clientY, ox: this.x, oy: this.y };
    } else if (this.pointers.size === 2) {
      this.pan = null;
      const [a, b] = [...this.pointers.values()];
      this.lastDist = dist(a!, b!);
    }
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = dist(a!, b!);
      if (this.lastDist > 0) this.scale = clampScale(this.scale * (d / this.lastDist));
      this.lastDist = d;
      this.apply();
    } else if (this.pointers.size === 1 && this.pan && this.scale > 1) {
      this.x = this.pan.ox + (e.clientX - this.pan.x);
      this.y = this.pan.oy + (e.clientY - this.pan.y);
      this.apply();
    }
  };

  private onUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.lastDist = 0;
    if (this.pointers.size === 1) {
      const [p] = [...this.pointers.values()];
      this.pan = { x: p!.x, y: p!.y, ox: this.x, oy: this.y };
    }
    if (this.pointers.size === 0) {
      this.pan = null;
      if (this.scale < 1.02) { this.scale = 1; this.x = 0; this.y = 0; this.apply(); }
    }
  };

  private onDblClick = (): void => {
    this.scale = this.scale > 1 ? 1 : 2.5;
    this.x = 0;
    this.y = 0;
    this.apply();
  };
}

export class ViewerUi {
  private readonly root: HTMLElement;
  private readonly sceneName: HTMLElement;
  private readonly backBtn: HTMLButtonElement;
  private readonly shareBtn: HTMLButtonElement;
  private readonly counter: HTMLElement;
  private readonly filmstrip: HTMLElement;
  private readonly gallery: HTMLElement;
  private readonly units: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly lightbox: HTMLElement;
  private readonly nav: NavBar;
  private readonly gallerySheet: Sheet;
  private readonly unitsSheet: Sheet;
  private readonly panelSheet: Sheet;
  private readonly base: URL;
  private readonly layers: Layer[] = [];
  private pinch: PinchZoom | null = null;
  private swipeStart: (Point & { atMinZoom: boolean }) | null = null;

  constructor(private readonly opts: UiOptions) {
    this.base = new URL(opts.tourUrl, location.href);
    this.root = document.createElement('div');
    this.root.className = 'r360-ui';
    this.root.innerHTML = `
      <div class="r360-bar">
        <button class="r360-btn r360-icon-btn r360-back" aria-label="Volver al plano" hidden>&larr;</button>
        <span class="r360-scene-name"></span>
        <span class="r360-bar__counter" hidden></span>
        <button class="r360-btn r360-icon-btn r360-share" aria-label="Compartir">&#9092;</button>
      </div>
      <div class="r360-filmstrip" hidden></div>
      <div class="r360-gallery r360-sheet" hidden>
        <div class="r360-sheet__handle"><i></i></div>
        <div class="r360-sheet__body r360-gallery__grid"></div>
      </div>
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
    this.gallery = this.root.querySelector('.r360-gallery')!;
    this.units = this.root.querySelector('.r360-units')!;
    this.panel = this.root.querySelector('.r360-panel')!;
    this.lightbox = this.root.querySelector('.r360-lightbox')!;

    this.nav = new NavBar({
      container: this.root,
      viewsCount: this.galleryScenes().length,
      onSelect: (tab) => this.onNavSelect(tab),
    });

    this.gallerySheet = new Sheet({
      el: this.gallery,
      handle: this.gallery.querySelector('.r360-sheet__handle')!,
      snaps: SINGLE_SNAP(0.72),
      onClose: () => this.onSheetGestureClose('gallery'),
    });
    this.unitsSheet = new Sheet({
      el: this.units,
      handle: this.units.querySelector('.r360-sheet__handle')!,
      snaps: SINGLE_SNAP(0.85),
      onClose: () => this.onSheetGestureClose('units'),
    });
    this.panelSheet = new Sheet({
      el: this.panel,
      handle: this.panel.querySelector('.r360-sheet__handle')!,
      snaps: PANEL_SNAPS,
      onClose: () => this.onSheetGestureClose('panel'),
    });

    this.renderGallery(this.galleryScenes());
    this.renderUnitsTab();

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
    this.gallerySheet.destroy();
    this.unitsSheet.destroy();
    this.panelSheet.destroy();
    this.pinch?.destroy();
    this.root.remove();
  }

  // ------------------------------------------------------------ navegación

  private onNavSelect(tab: NavTab): void {
    if (tab === 'plan') { this.go(this.opts.tour.start); return; }
    if (tab === 'views') { this.openGallery(); return; }
    this.openUnitsTab();
  }

  private galleryScenes(): Scene[] {
    return [...this.opts.tour.scenes]
      .filter((s) => s.slug !== this.opts.tour.start)
      .sort((a, b) => a.sort - b.sort);
  }

  private go(slug: string): void {
    // Una navegación explícita de escena colapsa cualquier hoja abierta: son
    // capas de la escena actual, no algo que sobreviva a cambiar de escena.
    this.closeAllLayers();
    this.opts.controller.goTo(slug);
    this.syncScene();
  }

  private syncScene = (): void => {
    const slug = this.opts.controller.slug ?? this.opts.tour.start;
    const scene = this.opts.tour.scenes.find((s) => s.slug === slug);
    const isStart = slug === this.opts.tour.start;
    this.sceneName.textContent = scene?.name ?? '';
    this.backBtn.hidden = isStart;
    this.nav.setActive(isStart ? 'plan' : 'views');
    // En un render no hay polígonos: la leyenda de estados no explica nada
    // de lo que se está viendo, así que se guarda hasta volver al plano.
    document.body.classList.toggle('r360-no-legend', !isStart);

    const scenes = this.galleryScenes();
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

  // -------------------------------------------------------- galería (Vistas)

  private renderGallery(scenes: Scene[]): void {
    const grid = this.gallery.querySelector('.r360-gallery__grid')!;
    grid.innerHTML = scenes
      .map((s) => {
        // Una escena de panorámica no trae `source.url`: su imagen vive
        // troceada en tiles bajo `source.base`. Sin este caso la miniatura
        // quedaba con `src` vacío y la galería mostraba un hueco justo para
        // las escenas 360, que son las que más ganas dan de mirar.
        // El pipeline emite `poster.webp` + `poster.thumb.webp` al lado de
        // los tiles, con la misma convención de nombre que el resto.
        const url =
          'url' in s.source
            ? this.resolve(s.source.url)
            : this.resolve(`${s.source.base}/poster.webp`);
        return `<button class="r360-thumb" data-slug="${escapeHtml(s.slug)}">
            <img loading="lazy" alt="" src="${escapeHtml(THUMB(url))}"
                 data-full="${escapeHtml(url)}" />
            <span>${escapeHtml(s.name)}</span>
          </button>`;
      })
      .join('');
    for (const img of grid.querySelectorAll<HTMLImageElement>('img[data-full]')) {
      img.addEventListener('error', () => { img.src = img.dataset.full!; }, { once: true });
    }
    grid.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('.r360-thumb');
      if (btn?.dataset.slug) this.go(btn.dataset.slug);
    });
  }

  private openGallery(): void {
    this.pushLayer('gallery');
    this.gallerySheet.open(0);
    this.nav.setActive('views');
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
      .map((g) => ({ ...g, codes: g.codes.sort() }));
  }

  private renderUnitsTab(): void {
    const list = this.units.querySelector('.r360-units__list')!;
    const groups = this.groupedUnits();
    const total = groups.reduce((n, g) => n + g.codes.length, 0);
    const avail = this.opts.availability();
    const availCount = groups
      .flatMap((g) => g.codes)
      .filter((c) => avail?.units[c]?.s === 'disponible').length;

    list.innerHTML =
      `<p class="r360-units__summary">${total} unidades · ${availCount} disponibles</p>` +
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
                  <b>${escapeHtml(u?.label ?? code)}</b>
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
    this.pushLayer('units');
    this.unitsSheet.open(0);
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

    const avail = this.opts.availability();
    const chip = this.chipFor(code);
    const price = priceTextForUnit(code, avail);
    const codes = (unit.attrs?.unitCodes as string[] | undefined) ?? null;
    const label = unit.label ?? code;

    const rows: string[] = [];
    const attrs = unit.attrs ?? {};
    if (attrs.tipologia) rows.push(row('Tipología', String(attrs.tipologia)));
    if (attrs.superficieCubiertaM2 != null) rows.push(row('Cubierta', `${num(attrs.superficieCubiertaM2)} m²`));
    if (unit.areaTotalM2 != null) rows.push(row('Total', `${num(unit.areaTotalM2)} m²`));
    if (codes) rows.push(row('Unidades', String(codes.length)));
    if (attrs.superficieTotalUnidadesM2 != null) {
      rows.push(row('Suma de superficies', `${num(attrs.superficieTotalUnidadesM2)} m²`));
    }
    if (parent) rows.push(row('Bloque', tour.units[parent]?.label ?? parent));

    const media = (unit.media ?? []).map((m) => this.resolve(m));
    const back = parent
      ? `<button class="r360-link r360-panel__back" data-unit="${escapeHtml(parent)}">&larr; ${escapeHtml(
          tour.units[parent]?.label ?? parent,
        )}</button>`
      : '';

    const priceRow = codes
      ? this.blockSummary(codes)
      : price
        ? `<div class="r360-panel__price">${escapeHtml(price)}</div>`
        : '';

    const cta = this.ctaHtml(code);

    this.renderPanel(
      back +
        this.header(label, chip) +
        priceRow +
        cta +
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
        `<button class="r360-link r360-panel__share" data-share-unit="${escapeHtml(code)}">&#9092; Compartir esta unidad</button>`,
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
  private ctaHtml(code: string): string {
    const ctx = ctaContextFor(code, this.opts.tour, this.opts.availability(), this.opts.controller.slug, location.href);
    const cta = buildCta(this.opts.tour.contact, ctx);
    if (!cta) return '';
    const disclaimer = ctx.price
      ? '<p class="r360-panel__note r360-panel__note--muted">Valores de lista, a confirmar por el vendedor.</p>'
      : '';
    return `<a class="r360-cta" href="${escapeHtml(cta.href)}" target="_blank" rel="noopener"
        data-cta-unit="${escapeHtml(cta.unitCode)}" data-cta-kind="${escapeHtml(cta.kind)}">
        &#128172; ${escapeHtml(cta.label)}
      </a>${disclaimer}`;
  }

  private statusOf(code: string): UnitStatus | null {
    const entry = this.opts.availability()?.units[code];
    return entry && isUnitStatus(entry.s) ? entry.s : null;
  }

  private chipFor(code: string): { base: string; label: string } {
    const s = this.statusOf(code);
    const t = s ? STATUS_TOKENS[s] : null;
    const theme = s ? this.opts.tour.theme?.states?.[s] : undefined;
    // Igual que en el mapa: sin dato NO se oculta, se muestra en gris y dicho.
    return t
      ? { base: theme?.base ?? t.base, label: t.label }
      : { base: STATUS_TOKENS.no_disponible.base, label: 'Sin dato' };
  }

  private header(title: string, chip: { base: string; label: string }): string {
    return `<div class="r360-panel__head">
        <h2>${escapeHtml(title)}</h2>
        <button class="r360-close" aria-label="Cerrar">×</button>
      </div>
      <div class="r360-panel__status"><i style="background:${chip.base}"></i>${escapeHtml(chip.label)}</div>`;
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
      const cta = el.closest<HTMLElement>('.r360-cta');
      if (cta) {
        this.opts.container.dispatchEvent(
          new CustomEvent('r360:cta', {
            detail: { unitCode: cta.dataset.ctaUnit, kind: cta.dataset.ctaKind },
            bubbles: true,
          }),
        );
        return; // deja que el link a wa.me navegue normalmente
      }
      const share = el.closest<HTMLElement>('[data-share-unit]');
      if (share?.dataset.shareUnit) return this.shareUnit(share.dataset.shareUnit);
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
    else if (name === 'gallery') { this.gallerySheet.close(); }
    else if (name === 'units') { this.unitsSheet.close(); }
  }

  private afterLayerClosed(name: Layer): void {
    if (name === 'panel') document.body.classList.remove('r360-panel-open');
    if (name === 'gallery' || name === 'units') this.nav.setActive(this.opts.controller.slug === this.opts.tour.start ? 'plan' : 'views');
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

    const scenes = this.galleryScenes();
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
