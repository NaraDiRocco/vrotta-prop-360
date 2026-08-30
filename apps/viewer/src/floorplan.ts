/**
 * Escenas `floorplan` y `map`: geometría `polygon_px` sobre una imagen plana.
 *
 * Leaflet con `L.CRS.Simple` — sin proyección geográfica, el plano es su
 * propio sistema de coordenadas. Los vértices llegan normalizados 0..1 sobre
 * el master, así que el mismo dato sirve para cualquier resolución publicada.
 */
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { AvailabilityFile, Hotspot, Px, Scene, TourManifest } from '@r360/core';
import { svgStyleFor, tokenFor, tooltipHtml, unitFacts, type MarkerMeta, type UnitFacts } from './polygons.ts';
import { INFO_TOKEN } from '@r360/core';

/** Un amenity no tiene estado comercial: se pinta con su propio token. */
function paintFor(facts: UnitFacts, tour: Parameters<typeof tokenFor>[1]) {
  return facts.informational ? { base: INFO_TOKEN.base, fill: INFO_TOKEN.fill } : tokenFor(facts.status, tour);
}
import type { SceneRenderer, UnitClickPayload } from './scenes.ts';

interface PlanSource { url: string; width: number; height: number }

function isPlanSource(s: Scene['source']): s is PlanSource {
  return 'url' in s && typeof s.url === 'string';
}

export class FloorplanRenderer implements SceneRenderer {
  private map: L.Map | null = null;
  private layers = new Map<string, L.Path>();
  private meta = new Map<string, MarkerMeta>();
  private codeToIds = new Map<string, string[]>();
  private highlighted: string | null = null;
  private readonly el: HTMLElement;

  constructor(
    private readonly host: HTMLElement,
    private readonly tour: TourManifest,
    private readonly onUnitClick: (p: UnitClickPayload) => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'r360-plan';
    this.host.appendChild(this.el);
  }

  mount(scene: Scene, hotspots: readonly Hotspot[], availability: AvailabilityFile | null): void {
    if (!isPlanSource(scene.source)) {
      console.warn(`[r360] La escena "${scene.slug}" es ${scene.kind} pero no trae source.url.`);
      return;
    }
    const { url, width, height } = scene.source;
    this.destroyMap();

    const bounds = L.latLngBounds([0, 0], [height, width]);
    this.map = L.map(this.el, {
      crs: L.CRS.Simple,
      minZoom: -4,
      maxZoom: 4,
      zoomControl: true,
      attributionControl: false,
      maxBounds: bounds.pad(0.25),
    });
    L.imageOverlay(url, bounds).addTo(this.map);

    for (const h of hotspots) {
      if (h.geometryKind !== 'polygon_px' && h.geometryKind !== 'point_px') continue;
      const facts = unitFacts(h, this.tour, availability);
      const { base, fill } = paintFor(facts, this.tour);
      const toLatLng = (p: Px): L.LatLngExpression => [(1 - p[1]) * height, p[0] * width];

      const layer: L.Path =
        h.geometryKind === 'point_px'
          ? L.circleMarker(toLatLng((h.geometry as Px[])[0] ?? [0.5, 0.5]), { radius: 7 })
          : L.polygon((h.geometry as Px[]).map(toLatLng));

      layer.setStyle({ color: base, weight: 2, fillColor: base, fillOpacity: fill });
      layer.bindTooltip(tooltipHtml(facts, this.tour), { sticky: true, className: 'r360-leaflet-tip' });
      // Lee `facts` de `this.meta` (no de la closure de arriba): si no,
      // un click después de un refresco de disponibilidad emite el estado
      // viejo con el que se montó la escena, aunque el polígono ya se haya
      // repintado con el color nuevo.
      layer.on('click', () => {
        const current = this.meta.get(h.id)?.facts ?? facts;
        this.onUnitClick({ hotspotId: h.id, unitCode: h.unitCode, facts: current });
      });
      layer.addTo(this.map);

      this.layers.set(h.id, layer);
      this.meta.set(h.id, { hotspotId: h.id, unitCode: h.unitCode, facts });
      if (h.unitCode) {
        const list = this.codeToIds.get(h.unitCode) ?? [];
        list.push(h.id);
        this.codeToIds.set(h.unitCode, list);
      }
    }
    // El contenedor puede nacer con tamaño 0: primero se le informa el tamaño
    // real y recién después se encuadra, o el fitBounds sale calculado sobre
    // 0x0 y el plano aparece del tamaño de una estampilla.
    requestAnimationFrame(() => {
      this.map?.invalidateSize({ animate: false });
      this.map?.fitBounds(bounds);
    });
  }

  /** Repinta sólo las unidades cambiadas: no se recrea ninguna capa. */
  updateStatuses(codes: readonly string[], availability: AvailabilityFile | null): void {
    for (const code of codes) {
      for (const id of this.codeToIds.get(code) ?? []) {
        const layer = this.layers.get(id);
        const meta = this.meta.get(id);
        if (!layer || !meta) continue;
        const facts = unitFacts(
          { id, sceneId: '', unitCode: code, geometryKind: 'polygon_px', geometry: [] },
          this.tour,
          availability,
        );
        meta.facts = { ...meta.facts, ...facts };
        const { base, fill } = paintFor(facts, this.tour);
        layer.setStyle({ color: base, fillColor: base, fillOpacity: fill });
        layer.setTooltipContent(tooltipHtml(meta.facts, this.tour));
      }
    }
  }

  focusUnit(code: string): void {
    const prev = this.highlighted ? this.layers.get(this.highlighted) : undefined;
    prev?.setStyle({ weight: 2 });
    this.highlighted = null;
    const id = this.codeToIds.get(code)?.[0];
    const layer = id ? this.layers.get(id) : undefined;
    if (!layer || !this.map) return;
    this.highlighted = id!;
    if ('getBounds' in layer) this.map.fitBounds((layer as L.Polygon).getBounds(), { maxZoom: 2 });
    layer.setStyle({ weight: 4 });
    layer.openTooltip();
  }

  show(): void {
    this.el.classList.remove('r360-hidden');
    requestAnimationFrame(() => this.map?.invalidateSize());
  }

  hide(): void {
    this.el.classList.add('r360-hidden');
  }

  destroy(): void {
    this.destroyMap();
    this.el.remove();
  }

  private destroyMap(): void {
    this.map?.remove();
    this.map = null;
    this.highlighted = null;
    this.layers.clear();
    this.meta.clear();
    this.codeToIds.clear();
  }
}
