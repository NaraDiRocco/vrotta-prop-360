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
import { Viewer } from '@photo-sphere-viewer/core';
import { CubemapTilesAdapter } from '@photo-sphere-viewer/cubemap-tiles-adapter';
import { MarkersPlugin, events as markerEvents } from '@photo-sphere-viewer/markers-plugin';
import {
  normalizeYaw,
  sphericalCentroid,
  type AvailabilityFile,
  type Hotspot,
  type Scene,
  type Sph,
  type TiledSource,
  type TourManifest,
} from '@r360/core';
import {
  buildMarkers,
  svgStyleFor,
  tooltipHtml,
  unitFacts,
  type MarkerMeta,
  type UnitFacts,
} from './polygons.ts';
import { tiledSourceToPsvPanorama } from './tiledCubemap.ts';
import type { FloorplanRenderer } from './floorplan.ts';

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

// ------------------------------------------------------------------ panorama

function isTiled(s: Scene['source']): s is TiledSource {
  return 'base' in s;
}

/**
 * Resuelve una ruta de `TiledSource.base` (relativa a la raíz del sitio,
 * normalmente algo como `/t/{tenant}/{proyecto}/v{N}/scenes/{slug}/tiles`)
 * contra la ubicación actual del documento.
 */
function resolveTileUrl(path: string): string {
  return new URL(path, location.href).href;
}

/** Adaptador PSV + tipo de panorama a usar para una escena dada. */
type PanoramaKind = 'equirect' | 'cubemap-tiles';

function panoramaKindFor(scene: Scene): PanoramaKind {
  return isTiled(scene.source) ? 'cubemap-tiles' : 'equirect';
}

export class PanoramaRenderer implements SceneRenderer {
  viewer?: Viewer;
  private markers?: MarkersPlugin;
  private readonly el: HTMLElement;
  private meta = new Map<string, MarkerMeta>();
  private codeToIds = new Map<string, string[]>();
  private anchors = new Map<string, Sph>();
  /** El adaptador PSV queda fijo por instancia de Viewer: si la escena
   * siguiente necesita otro adaptador (tiles ↔ equirectangular simple), se
   * recrea el Viewer entero en vez de intentar mutarlo. */
  private kind: PanoramaKind | null = null;
  /** Único hotspot resaltado a la vez: si no, se acumulan bordes gruesos. */
  private highlighted: string | null = null;

  constructor(
    host: HTMLElement,
    private readonly tour: TourManifest,
    private readonly onUnitClick: (p: UnitClickPayload) => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'r360-pano';
    host.appendChild(this.el);
  }

  private ensureViewer(kind: PanoramaKind): boolean {
    if (this.kind === kind) return false;
    this.viewer?.destroy();
    this.kind = kind;

    this.viewer = new Viewer({
      container: this.el,
      // El placeholder transparente sólo es una panorámica válida para el
      // adaptador equirectangular (una URL de imagen); CubemapTilesAdapter
      // exige un objeto `{ tileUrl, ... }` desde el arranque, así que para
      // ese caso se omite acá y se resuelve en el primer `mount()`.
      panorama: kind === 'equirect' ? TRANSPARENT_PIXEL : undefined,
      navbar: ['zoom', 'move', 'fullscreen'],
      defaultZoomLvl: 45,
      touchmoveTwoFingers: true,
      adapter: kind === 'cubemap-tiles' ? CubemapTilesAdapter : undefined,
      plugins: [[MarkersPlugin, { defaultHoverScale: false }]],
    });
    this.markers = this.viewer.getPlugin<MarkersPlugin>(MarkersPlugin);

    this.markers.addEventListener(markerEvents.SelectMarkerEvent.type, (e) => {
      const id = String(e.marker.config.id).replace(/::label$/, '');
      const meta = this.meta.get(id);
      if (meta) this.onUnitClick({ hotspotId: id, unitCode: meta.unitCode, facts: meta.facts });
    });
    return true;
  }

  mount(scene: Scene, hotspots: readonly Hotspot[], availability: AvailabilityFile | null): void {
    this.highlighted = null;
    const built = buildMarkers(hotspots, this.tour, availability);
    this.meta = built.meta;
    this.codeToIds = new Map();
    this.anchors = new Map();
    for (const h of hotspots) {
      if (h.geometryKind !== 'polygon_sph' && h.geometryKind !== 'point_sph') continue;
      this.anchors.set(h.id, (h.anchor as Sph) ?? sphericalCentroid(h.geometry as Sph[]));
      if (!h.unitCode) continue;
      const list = this.codeToIds.get(h.unitCode) ?? [];
      list.push(h.id);
      this.codeToIds.set(h.unitCode, list);
    }
    if (built.fallbackCount) {
      console.warn(
        `[r360] ${built.fallbackCount} hotspot(s) de "${scene.slug}" se dibujan con el ` +
          `estado de fallback. Se ven, pero el dato no llegó.`,
      );
    }

    const apply = () => {
      this.markers!.setMarkers(built.markers);
      if (scene.initialView) {
        this.viewer!.rotate({ yaw: scene.initialView.yaw, pitch: scene.initialView.pitch });
        this.viewer!.zoom(fovToZoom(scene.initialView.fov));
      }
    };

    const kind = panoramaKindFor(scene);
    const recreated = this.ensureViewer(kind);

    if (kind === 'cubemap-tiles') {
      const panorama = tiledSourceToPsvPanorama(scene.source as TiledSource, resolveTileUrl);
      // El adaptador de tiles no soporta `transition` sin un `baseUrl` de
      // cubemap de baja resolución (que no generamos: nuestro preview del
      // pipeline es equirectangular, no un cubemap de 6 caras). Se corta en
      // seco a la textura nueva; es el mismo comportamiento que un
      // `showLoader` sin cross-fade.
      this.viewer!.setPanorama(panorama, { transition: false, showLoader: true }).then(apply, warn);
    } else if (!recreated) {
      // `transition: true` hace el cross-fade entre escenas; los marcadores se
      // limpian antes para que no queden polígonos de la escena anterior
      // flotando sobre la nueva mientras dura el fundido.
      this.markers!.clearMarkers();
      this.viewer!
        .setPanorama((scene.source as { url: string }).url, {
          transition: { speed: 900, effect: 'fade', rotation: false },
          showLoader: true,
        })
        .then(apply, warn);
    } else {
      this.viewer!
        .setPanorama((scene.source as { url: string }).url, { transition: false, showLoader: true })
        .then(apply, warn);
    }
  }

  updateStatuses(codes: readonly string[], availability: AvailabilityFile | null): void {
    for (const code of codes) {
      for (const id of this.codeToIds.get(code) ?? []) {
        const meta = this.meta.get(id);
        if (!meta) continue;
        meta.facts = unitFacts(
          { id, sceneId: '', unitCode: code, geometryKind: 'polygon_sph', geometry: [] },
          this.tour,
          availability,
        );
        // `render: false`: un solo repintado al final del lote (ver spike).
        this.markers!.updateMarker(
          {
            id,
            svgStyle: svgStyleFor(meta.facts.status, this.tour),
            tooltip: { content: tooltipHtml(meta.facts, this.tour), position: 'top center' },
          },
          false,
        );
      }
    }
    this.viewer!.needsUpdate();
  }

  focusUnit(code: string): void {
    const id = this.codeToIds.get(code)?.[0];
    if (!id) return;
    this.clearHighlight();
    const at = this.anchors.get(id);
    if (at) this.viewer!.animate({ yaw: normalizeYaw(at[0]), pitch: at[1], speed: '10rpm' });
    const meta = this.meta.get(id);
    if (meta) {
      this.markers!.updateMarker({ id, svgStyle: svgStyleFor(meta.facts.status, this.tour, { highlighted: true }) });
      this.highlighted = id;
    }
  }

  private clearHighlight(): void {
    const prev = this.highlighted;
    this.highlighted = null;
    if (!prev) return;
    const meta = this.meta.get(prev);
    if (meta) this.markers!.updateMarker({ id: prev, svgStyle: svgStyleFor(meta.facts.status, this.tour) });
  }

  show(): void { this.el.classList.remove('r360-hidden'); this.viewer?.needsUpdate(); }
  hide(): void { this.el.classList.add('r360-hidden'); }
  destroy(): void { this.viewer?.destroy(); this.el.remove(); }
}

function warn(err: unknown): void {
  console.warn('[r360] No se pudo cargar la panorámica:', err);
}

/** PSV expresa el zoom en 0..100; las escenas guardan FOV en grados. */
export function fovToZoom(fovDeg: number, min = 30, max = 100): number {
  const clamped = Math.min(max, Math.max(min, fovDeg));
  return ((max - clamped) / (max - min)) * 100;
}

const TRANSPARENT_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// ----------------------------------------------------------------- controller

export class SceneController {
  private readonly scenes = new Map<string, Scene>();
  private readonly bySceneId = new Map<string, Hotspot[]>();
  private pano: PanoramaRenderer | null = null;
  private plan: FloorplanRenderer | null = null;
  private currentSlug: string | null = null;
  private availability: AvailabilityFile | null;

  constructor(
    private readonly host: HTMLElement,
    private readonly tour: TourManifest,
    availability: AvailabilityFile | null,
  ) {
    this.availability = availability;
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
    const slug = route.slug && this.scenes.has(route.slug) ? route.slug : this.tour.start;
    this.goTo(slug, route.unitCode, { replaceHash: true });
  }

  goTo(slug: string, unitCode: string | null = null, opts: { replaceHash?: boolean } = {}): void {
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
        this.pano ??= new PanoramaRenderer(this.host, this.tour, (p) => this.emitUnit(p));
        this.pano.show();
        this.pano.mount(scene, hotspots, this.availability);
      } else {
        this.pano?.hide();
        // Leaflet se descarga sólo si el tour tiene alguna escena de plano.
        // En un embed, 40 KB gzip que la mayoría de los recorridos no usa.
        void this.mountPlan(scene, hotspots);
      }
    }

    const hash = buildHash(slug, unitCode);
    if (location.hash !== hash) {
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

  private active(): SceneRenderer | null {
    const scene = this.currentSlug ? this.scenes.get(this.currentSlug) : null;
    if (!scene) return null;
    return scene.kind === 'panorama' || scene.kind === 'video' ? this.pano : this.plan;
  }

  private onHashChange = (): void => {
    const route = parseHash(location.hash);
    if (!route.slug) return;
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
