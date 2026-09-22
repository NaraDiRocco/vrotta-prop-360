/**
 * Navegación entre escenas + deep link.
 *
 * Hash canónico:  #/scene/{slug}            → escena
 *                 #/scene/{slug}/unit/{code} → escena con una unidad enfocada
 *
 * El hash es la única fuente de verdad de "dónde estoy": así el visitante puede
 * copiar la URL y mandarle a su pareja el lote exacto que está mirando, que es
 * el gesto que más convierte en este producto.
 */
import type { AvailabilityFile, Hotspot, Scene, TourManifest } from '@r360/core';
import type { UnitFacts } from './polygons.ts';
import type { FloorplanRenderer } from './floorplan.ts';
import type { PanoramaRenderer } from './panorama.ts';

export interface UnitClickPayload {
  hotspotId: string;
  unitCode: string | null;
  facts: UnitFacts;
}

export interface SceneRenderer {
  mount(scene: Scene, hotspots: readonly Hotspot[], availability: AvailabilityFile | null): void;
  updateStatuses(codes: readonly string[], availability: AvailabilityFile | null): void;
  focusUnit(code: string): void;
  show(): void;
  hide(): void;
  destroy(): void;
}

export interface Route {
  slug: string | null;
  unitCode: string | null;
}

export function parseHash(hash: string): Route {
  const m = /^#\/scene\/([^/]+)(?:\/unit\/([^/?#]+))?/.exec(hash);
  if (!m) return { slug: null, unitCode: null };
  return { slug: decodeURIComponent(m[1]!), unitCode: m[2] ? decodeURIComponent(m[2]) : null };
}

export function buildHash(slug: string, unitCode?: string | null): string {
  const base = `#/scene/${encodeURIComponent(slug)}`;
  return unitCode ? `${base}/unit/${encodeURIComponent(unitCode)}` : base;
}

// ----------------------------------------------------------------- controller

/**
 * Slugs que viven en el mismo espacio de hash que las escenas
 * (`#/scene/llegada`) pero NO son escenas: son los tramos del recorrido
 * guiado, que dibuja `tour-rail.ts`. El controlador tiene que ignorarlos en
 * vez de "corregirlos" al masterplan — si no, entrar por el link de un tramo
 * reescribía el hash y el visitante perdía la dirección que le mandaron.
 * Quién es virtual lo decide quien monta el visor; este módulo no conoce el
 * recorrido guiado.
 */
export interface SceneControllerOptions {
  virtualSlugs?: readonly string[];
}

export class SceneController {
  private readonly scenes = new Map<string, Scene>();
  private readonly virtual: Set<string>;
  private readonly bySceneId = new Map<string, Hotspot[]>();
  private pano: PanoramaRenderer | null = null;
  private plan: FloorplanRenderer | null = null;
  private currentSlug: string | null = null;
  private availability: AvailabilityFile | null;

  constructor(
    private readonly host: HTMLElement,
    private readonly tour: TourManifest,
    availability: AvailabilityFile | null,
    opts: SceneControllerOptions = {},
  ) {
    this.availability = availability;
    this.virtual = new Set(opts.virtualSlugs ?? []);
    for (const s of tour.scenes) this.scenes.set(s.slug, s);
    for (const h of tour.hotspots) {
      const list = this.bySceneId.get(h.sceneId) ?? [];
      list.push(h);
      this.bySceneId.set(h.sceneId, list);
    }
    window.addEventListener('hashchange', this.onHashChange);
  }

  get slug(): string | null { return this.currentSlug; }

  /** Arranca en el hash si es válido; si no, en `tour.start`. */
  start(): void {
    const route = parseHash(location.hash);
    // Un tramo del recorrido guiado: se monta la escena de arranque por
    // debajo, pero el hash es del tramo y se deja intacto.
    if (route.slug && this.virtual.has(route.slug)) {
      this.goTo(this.tour.start, null, { keepHash: true });
      return;
    }
    const slug = route.slug && this.scenes.has(route.slug) ? route.slug : this.tour.start;
    this.goTo(slug, route.unitCode, { replaceHash: true });
  }

  goTo(slug: string, unitCode: string | null = null, opts: { replaceHash?: boolean; keepHash?: boolean } = {}): void {
    const scene = this.scenes.get(slug);
    if (!scene) {
      console.warn(`[r360] Escena "${slug}" inexistente; se abre "${this.tour.start}".`);
      if (slug !== this.tour.start) this.goTo(this.tour.start, null, opts);
      return;
    }
    const hotspots = this.bySceneId.get(scene.id) ?? [];
    const changingScene = this.currentSlug !== slug;
    this.currentSlug = slug;

    if (changingScene) {
      if (scene.kind === 'panorama' || scene.kind === 'video') {
        this.plan?.hide();
        // Photo Sphere Viewer se descarga sólo al entrar a la primera escena
        // panorámica (~670 KB minificados, ~176 KB gzip: ver cabecera de
        // `panorama.ts`), no en el arranque. Si el recorrido abre en el
        // masterplan o en la bienvenida, ninguno de los dos necesita PSV
        // todavía. Mismo criterio que Leaflet dos líneas más abajo.
        void this.mountPano(scene, hotspots);
      } else {
        this.pano?.hide();
        // Leaflet se descarga sólo si el tour tiene alguna escena de plano.
        // En un embed, 40 KB gzip que la mayoría de los recorridos no usa.
        void this.mountPlan(scene, hotspots);
      }
    }

    const hash = buildHash(slug, unitCode);
    if (!opts.keepHash && location.hash !== hash) {
      if (opts.replaceHash) history.replaceState(null, '', hash);
      else history.pushState(null, '', hash);
    }
    if (unitCode) {
      // La escena puede estar cargando la textura todavía.
      setTimeout(() => this.active()?.focusUnit(unitCode), changingScene ? 350 : 0);
    }

    // `history.pushState` NO dispara `hashchange`: cualquier interfaz que se
    // sincronice sólo con el hash se queda mostrando la escena anterior
    // cuando el salto lo hace un hotspot `goto`. Este evento es el aviso.
    this.host.dispatchEvent(
      new CustomEvent<Route>('r360:scene', { detail: { slug, unitCode }, bubbles: true }),
    );
  }

  applyAvailability(next: AvailabilityFile, changedCodes: readonly string[]): void {
    this.availability = next;
    this.pano?.updateStatuses(changedCodes, next);
    this.plan?.updateStatuses(changedCodes, next);
  }

  destroy(): void {
    window.removeEventListener('hashchange', this.onHashChange);
    this.pano?.destroy();
    this.plan?.destroy();
  }

  private async mountPlan(scene: Scene, hotspots: readonly Hotspot[]): Promise<void> {
    if (!this.plan) {
      const { FloorplanRenderer } = await import('./floorplan.ts');
      // Mientras se descargaba el chunk el usuario pudo cambiar de escena.
      if (this.currentSlug !== scene.slug) return;
      this.plan = new FloorplanRenderer(this.host, this.tour, (p) => this.emitUnit(p));
    }
    this.plan.show();
    this.plan.mount(scene, hotspots, this.availability);
  }

  private async mountPano(scene: Scene, hotspots: readonly Hotspot[]): Promise<void> {
    if (!this.pano) {
      const { PanoramaRenderer } = await import('./panorama.ts');
      // Mientras se descargaba el chunk el usuario pudo cambiar de escena.
      if (this.currentSlug !== scene.slug) return;
      this.pano = new PanoramaRenderer(this.host, this.tour, (p) => this.emitUnit(p));
    }
    this.pano.show();
    this.pano.mount(scene, hotspots, this.availability);
  }

  private active(): SceneRenderer | null {
    const scene = this.currentSlug ? this.scenes.get(this.currentSlug) : null;
    if (!scene) return null;
    return scene.kind === 'panorama' || scene.kind === 'video' ? this.pano : this.plan;
  }

  private onHashChange = (): void => {
    const route = parseHash(location.hash);
    if (!route.slug) return;
    if (this.virtual.has(route.slug)) return; // es un tramo, lo maneja el riel
    this.goTo(route.slug, route.unitCode, { replaceHash: true });
  };

  private emitUnit(p: UnitClickPayload): void {
    const hotspot = this.tour.hotspots.find((h) => h.id === p.hotspotId);
    // Un hotspot puede ser un salto de escena o un link, no sólo una unidad.
    if (hotspot?.action?.kind === 'goto') { this.goTo(hotspot.action.sceneSlug); return; }
    if (hotspot?.action?.kind === 'url') { window.open(hotspot.action.href, '_blank', 'noopener'); return; }

    if (p.unitCode && this.currentSlug) {
      history.replaceState(null, '', buildHash(this.currentSlug, p.unitCode));
    }
    this.host.dispatchEvent(
      new CustomEvent<UnitClickPayload>('r360:unit-click', { detail: p, bubbles: true }),
    );
  }
}
