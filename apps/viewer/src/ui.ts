/**
 * Capa de interfaz del visor: galería de escenas, ficha de unidad y lightbox.
 *
 * El resto del visor (scenes/floorplan/polygons) dibuja el recorrido; acá vive
 * TODO lo que el visitante toca con el dedo. Está separado a propósito: el
 * recorrido se puede embeber sin esta capa (`mountViewer` no la monta sola),
 * y esta capa no sabe nada de Leaflet ni de PSV — habla sólo con
 * `SceneController` y con el manifiesto.
 *
 * Tres piezas:
 *
 *  1. GALERÍA. Un recorrido de Nivel 1 (brochure + renders, sin panorámicas)
 *     no tiene "adentro": lo que hay para mostrar son los renders. Cada uno es
 *     una escena `floorplan` del manifiesto (ver decisión #7 en
 *     tools/baleia/scripts/build_tour.py), así que la galería es, literalmente,
 *     "todas las escenas menos la de arranque", con su miniatura.
 *
 *  2. FICHA. En este masterplan los polígonos son BLOQUES, no unidades: sin
 *     ficha no habría forma de llegar a la unidad B2-A ni de ver su planta.
 *     La ficha de un bloque lista sus unidades con el color de su estado; la
 *     de una unidad muestra sus datos y su imagen. La ficha es también el
 *     único consumidor de `units[].media` en todo el visor.
 *
 *  3. LIGHTBOX. La imagen de la unidad en grande, que es como se mira una
 *     planta de verdad.
 *
 * MINIATURAS POR CONVENCIÓN: `X.webp` -> `X.thumb.webp` (ver decisión #8 del
 * builder). Si la miniatura no existe, el `onerror` deja la imagen grande: la
 * convención se puede romper sin que se rompa la galería.
 */
import {
  INFO_TOKEN,
  STATUS_TOKENS,
  isUnitStatus,
  type AvailabilityFile,
  type Scene,
  type TourManifest,
} from '@r360/core';
import { escapeHtml } from './polygons.ts';
import { parseHash, type SceneController, type UnitClickPayload } from './scenes.ts';

export interface UiOptions {
  container: HTMLElement;
  tour: TourManifest;
  controller: SceneController;
  /** Disponibilidad viva: se lee en cada apertura, no se cachea. */
  availability: () => AvailabilityFile | null;
  /** URL del `tour.json`, para resolver las rutas relativas de `media`. */
  tourUrl: string;
}

const THUMB = (url: string) => url.replace(/\.webp$/i, '.thumb.webp');

export class ViewerUi {
  private readonly root: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly sceneName: HTMLElement;
  private readonly backBtn: HTMLButtonElement;
  private readonly galleryBtn: HTMLButtonElement;
  private readonly gallery: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly lightbox: HTMLElement;
  private readonly base: URL;

  constructor(private readonly opts: UiOptions) {
    this.base = new URL(opts.tourUrl, location.href);
    this.root = document.createElement('div');
    this.root.className = 'r360-ui';
    this.root.innerHTML = `
      <div class="r360-bar">
        <button class="r360-btn r360-back" hidden>&larr; Masterplan</button>
        <span class="r360-scene-name"></span>
        <button class="r360-btn r360-gallery-btn"></button>
      </div>
      <div class="r360-gallery" hidden></div>
      <aside class="r360-panel" hidden></aside>
      <div class="r360-lightbox" hidden></div>`;
    opts.container.appendChild(this.root);

    this.bar = this.root.querySelector('.r360-bar')!;
    this.sceneName = this.root.querySelector('.r360-scene-name')!;
    this.backBtn = this.root.querySelector('.r360-back')!;
    this.galleryBtn = this.root.querySelector('.r360-gallery-btn')!;
    this.gallery = this.root.querySelector('.r360-gallery')!;
    this.panel = this.root.querySelector('.r360-panel')!;
    this.lightbox = this.root.querySelector('.r360-lightbox')!;

    const others = this.galleryScenes();
    this.galleryBtn.textContent = `Galería · ${others.length}`;
    this.galleryBtn.hidden = others.length === 0;
    this.renderGallery(others);

    this.backBtn.addEventListener('click', () => this.go(this.opts.tour.start));
    this.galleryBtn.addEventListener('click', () => this.toggleGallery());
    opts.container.addEventListener('r360:unit-click', this.onUnitClick as EventListener);
    window.addEventListener('hashchange', this.syncScene);
    document.addEventListener('keydown', this.onKey);

    this.syncScene();
    // Deep link a una unidad que no tiene polígono propio (B2-A y compañía):
    // el controlador no puede enfocarla, pero la ficha sí puede abrirla.
    const { unitCode } = parseHash(location.hash);
    if (unitCode && opts.tour.units[unitCode]) this.openUnit(unitCode);
  }

  destroy(): void {
    this.opts.container.removeEventListener('r360:unit-click', this.onUnitClick as EventListener);
    window.removeEventListener('hashchange', this.syncScene);
    document.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }

  // --------------------------------------------------------------- galería

  private galleryScenes(): Scene[] {
    return [...this.opts.tour.scenes]
      .filter((s) => s.slug !== this.opts.tour.start)
      .sort((a, b) => a.sort - b.sort);
  }

  private renderGallery(scenes: Scene[]): void {
    this.gallery.innerHTML = scenes
      .map((s) => {
        const url = 'url' in s.source ? this.resolve(s.source.url) : '';
        return `<button class="r360-thumb" data-slug="${escapeHtml(s.slug)}">
            <img loading="lazy" alt="" src="${escapeHtml(THUMB(url))}"
                 data-full="${escapeHtml(url)}" />
            <span>${escapeHtml(s.name)}</span>
          </button>`;
      })
      .join('');
    // La miniatura es una convención de nombre, no un dato del manifiesto: si
    // el archivo no está, se cae a la imagen grande en vez de dejar el hueco.
    for (const img of this.gallery.querySelectorAll<HTMLImageElement>('img[data-full]')) {
      img.addEventListener('error', () => { img.src = img.dataset.full!; }, { once: true });
    }
    this.gallery.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('.r360-thumb');
      if (btn?.dataset.slug) this.go(btn.dataset.slug);
    });
  }

  private toggleGallery(): void {
    this.gallery.hidden = !this.gallery.hidden;
    this.galleryBtn.classList.toggle('is-on', !this.gallery.hidden);
  }

  private go(slug: string): void {
    this.gallery.hidden = true;
    this.galleryBtn.classList.remove('is-on');
    this.closePanel();
    this.opts.controller.goTo(slug);
    this.syncScene();
  }

  private syncScene = (): void => {
    const slug = this.opts.controller.slug ?? this.opts.tour.start;
    const scene = this.opts.tour.scenes.find((s) => s.slug === slug);
    this.sceneName.textContent = scene?.name ?? '';
    this.backBtn.hidden = slug === this.opts.tour.start;
  };

  // ----------------------------------------------------------------- ficha

  private onUnitClick = (e: Event): void => {
    const d = (e as CustomEvent<UnitClickPayload>).detail;
    if (d.unitCode) this.openUnit(d.unitCode);
    else this.openInfo(d.facts.label);
  };

  private openInfo(label: string): void {
    this.panel.innerHTML =
      this.header(label, { base: INFO_TOKEN.base, label: INFO_TOKEN.label }) +
      `<p class="r360-panel__note">Punto de interés del complejo.</p>`;
    this.showPanel();
  }

  /** `parent` deja el rastro para el botón "volver al bloque". */
  private openUnit(code: string, parent?: string): void {
    const tour = this.opts.tour;
    const unit = tour.units[code];
    if (!unit) return;

    const chip = this.chipFor(code);
    const codes = (unit.attrs?.unitCodes as string[] | undefined) ?? null;
    const rows: string[] = [];
    const attrs = unit.attrs ?? {};
    if (attrs.tipologia) rows.push(row('Tipología', String(attrs.tipologia)));
    if (attrs.superficieCubiertaM2 != null) rows.push(row('Cubierta', `${num(attrs.superficieCubiertaM2)} m²`));
    if (unit.areaTotalM2 != null) rows.push(row('Total', `${num(unit.areaTotalM2)} m²`));
    if (codes) rows.push(row('Unidades', String(codes.length)));
    if (attrs.superficieTotalUnidadesM2 != null) {
      rows.push(row('Suma de superficies', `${num(attrs.superficieTotalUnidadesM2)} m²`));
    }

    const media = (unit.media ?? []).map((m) => this.resolve(m));
    const back = parent
      ? `<button class="r360-link r360-panel__back" data-unit="${escapeHtml(parent)}">&larr; ${escapeHtml(
          tour.units[parent]?.label ?? parent,
        )}</button>`
      : '';

    this.panel.innerHTML =
      back +
      this.header(unit.label ?? code, chip) +
      (rows.length ? `<dl class="r360-facts">${rows.join('')}</dl>` : '') +
      (codes ? this.unitGrid(code, codes) : '') +
      (media.length
        ? `<div class="r360-media">` +
          media
            .map(
              (m) =>
                `<button class="r360-media__item" data-full="${escapeHtml(m)}">
                   <img loading="lazy" alt="Ubicación de la unidad en el bloque" src="${escapeHtml(m)}" />
                 </button>`,
            )
            .join('') +
          // La imagen es la del brochure tal cual: algunas de sus páginas
          // cubren dos unidades a la vez (la de planta alta y la de planta
          // baja del mismo módulo), y entonces se ven las dos. Se dice, en
          // vez de recortar la imagen y arriesgar mostrar la que no es.
          `<p class="r360-panel__note">Ubicación de la unidad dentro del bloque, según el brochure.
             Algunas páginas muestran dos unidades juntas (planta alta y planta baja).
             Tocá la imagen para ampliar.</p></div>`
        : codes
          ? ''
          : `<p class="r360-panel__note">Sin imagen de esta unidad en el material disponible.</p>`);

    this.showPanel();
    if (!parent && !codes) history.replaceState(null, '', hashFor(this.opts.controller.slug, code));
  }

  /** Grilla de unidades de un bloque, cada una con el color de su estado. */
  private unitGrid(blockCode: string, codes: string[]): string {
    const items = codes
      .map((c) => {
        const chip = this.chipFor(c);
        const u = this.opts.tour.units[c];
        const area = u?.areaTotalM2 != null ? `${num(u.areaTotalM2)} m²` : '';
        return `<button class="r360-unit" data-unit="${escapeHtml(c)}" data-parent="${escapeHtml(blockCode)}">
            <i style="background:${chip.base}"></i>
            <b>${escapeHtml(u?.label ?? c)}</b>
            <span>${escapeHtml(area)}</span>
          </button>`;
      })
      .join('');
    return `<div class="r360-units">${items}</div>`;
  }

  private chipFor(code: string): { base: string; label: string } {
    const entry = this.opts.availability()?.units[code];
    const s = entry && isUnitStatus(entry.s) ? entry.s : null;
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

  private showPanel(): void {
    this.panel.hidden = false;
    this.panel.scrollTop = 0;
    this.panel.onclick = (e) => {
      const el = e.target as HTMLElement;
      if (el.closest('.r360-close')) return this.closePanel();
      const back = el.closest<HTMLElement>('.r360-panel__back');
      if (back?.dataset.unit) return this.openUnit(back.dataset.unit);
      const unit = el.closest<HTMLElement>('.r360-unit');
      if (unit?.dataset.unit) return this.openUnit(unit.dataset.unit, unit.dataset.parent);
      const media = el.closest<HTMLElement>('.r360-media__item');
      if (media?.dataset.full) return this.openLightbox(media.dataset.full);
    };
  }

  private closePanel(): void {
    this.panel.hidden = true;
  }

  // -------------------------------------------------------------- lightbox

  private openLightbox(url: string): void {
    this.lightbox.innerHTML =
      `<button class="r360-close" aria-label="Cerrar">×</button><img alt="" src="${escapeHtml(url)}" />`;
    this.lightbox.hidden = false;
    this.lightbox.onclick = () => { this.lightbox.hidden = true; };
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    if (!this.lightbox.hidden) this.lightbox.hidden = true;
    else if (!this.gallery.hidden) this.toggleGallery();
    else if (!this.panel.hidden) this.closePanel();
  };

  /** `media`/`source.url` son relativas al `tour.json`, no al documento. */
  private resolve(url: string): string {
    return new URL(url, this.base).href;
  }
}

function hashFor(slug: string | null, code: string): string {
  return slug ? `#/scene/${encodeURIComponent(slug)}/unit/${encodeURIComponent(code)}` : location.hash;
}

const NUM = new Intl.NumberFormat('es-AR');
const num = (v: unknown) => NUM.format(Number(v));
const row = (k: string, v: string) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`;

export function mountUi(opts: UiOptions): ViewerUi {
  return new ViewerUi(opts);
}
