/**
 * Render de escenas panorámicas (equirectangular y cubemap por tiles) con
 * Photo Sphere Viewer.
 *
 * Este módulo es el único que importa `@photo-sphere-viewer/*` (el visor
 * base, el adaptador de tiles y el plugin de marcadores): minificado pesa
 * ~670 KB, ~176 KB gzip (ver `dist/assets/index.module-*.js` del build).
 * Antes vivía arriba de todo en `scenes.ts`, que `main.ts` importa estático,
 * así que ese peso se descargaba en el arranque de CUALQUIER visita —aunque
 * lo primero que viera el visitante fuera el masterplan (Leaflet, que ya se
 * baja aparte) o la bienvenida (una foto), ninguno de los dos necesita PSV—.
 * `SceneController` (`scenes.ts`) baja este módulo con `import()` recién al
 * montar la primera escena panorámica: mismo criterio que ya usaba
 * `floorplan.ts`/Leaflet para el plano, sólo que aplicado al otro lado.
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
} from './polygons.ts';
import { tiledSourceToPsvPanorama } from './tiledCubemap.ts';
import type { SceneRenderer, UnitClickPayload } from './scenes.ts';

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
