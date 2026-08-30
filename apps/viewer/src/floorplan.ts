/**
 * Escenas `floorplan` y `map`: geometría `polygon_px` sobre una imagen plana.
 *
 * Leaflet con `L.CRS.Simple` — sin proyección geográfica, el plano es su
 * propio sistema de coordenadas. Los vértices llegan normalizados 0..1 sobre
 * el master, así que el mismo dato sirve para cualquier resolución publicada.
 *
 * También vive acá todo lo que el plan de experiencia (§3, §5) pide sobre el
 * plano: la pestaña Unidades con sus filtros reflejados en el mapa, la capa
 * de precio conmutable, y el toque tolerante sobre lotes chicos. Toda la
 * aritmética de esas tres cosas está en módulos aparte (`filters.ts`,
 * `price-layer.ts`, `touch.ts`) y se verifica con tests; acá sólo se cablean
 * a Leaflet.
 */
import 'leaflet/dist/leaflet.css';
import './units.css';
import L from 'leaflet';
import type { AvailabilityFile, Hotspot, Px, Scene, TourManifest } from '@r360/core';
import { shouldRotate, toLatLng as planToLatLng } from './plan-orientation.ts';
import { svgStyleFor, tokenFor, tooltipHtml, unitFacts, escapeHtml, type MarkerMeta, type UnitFacts } from './polygons.ts';
import { INFO_TOKEN } from '@r360/core';
import { mountUnitsPanel, type UnitsPanel } from './units-panel.ts';
import { availablePrices, bandForPrice, bandLabel, deriveBands, minAvailablePrice, unitCodesFor, type PriceBand } from './price-layer.ts';
import { averagePolygonSize, resolveTouch, GATE_ZOOM_FACTOR, type ScreenPolygon } from './touch.ts';

/** Un amenity no tiene estado comercial: se pinta con su propio token. */
function paintFor(facts: UnitFacts, tour: Parameters<typeof tokenFor>[1]) {
  return facts.informational ? { base: INFO_TOKEN.base, fill: INFO_TOKEN.fill } : tokenFor(facts.status, tour);
}
import type { SceneRenderer, UnitClickPayload } from './scenes.ts';

interface PlanSource { url: string; width: number; height: number }

function isPlanSource(s: Scene['source']): s is PlanSource {
  return 'url' in s && typeof s.url === 'string';
}

/** Gira la imagen 90° en sentido horario. Devuelve null si no se pudo. */
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
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', 0.9));
    return blob ? URL.createObjectURL(blob) : null;
  } catch {
    // Si falla, se muestra sin girar: chico, pero funcional. Nunca en blanco.
    return null;
  }
}

/** Gris neutro para lo que un filtro descarta y para lo no disponible en modo precio. */
const DIM_COLOR = '#64748b';

export class FloorplanRenderer implements SceneRenderer {
  private map: L.Map | null = null;
  private layers = new Map<string, L.Path>();
  private meta = new Map<string, MarkerMeta>();
  private codeToIds = new Map<string, string[]>();
  private highlighted: string | null = null;
  private readonly el: HTMLElement;

  private availability: AvailabilityFile | null = null;
  private readonly unitsPanel: UnitsPanel;
  private readonly priceToggleEl: HTMLElement;
  private readonly priceLegendEl: HTMLElement;
  private filterMatch: Set<string> | null = null;
  private priceMode = false;
  private priceBands: PriceBand[] = [];
  private touchPickEl: HTMLElement | null = null;
  private readonly legendObserver: MutationObserver;

  constructor(
    private readonly host: HTMLElement,
    private readonly tour: TourManifest,
    private readonly onUnitClick: (p: UnitClickPayload) => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'r360-plan';
    this.host.appendChild(this.el);

    // La pestaña Unidades y el toggle Estado/Precio persisten mientras dure
    // el visor (no se recrean por escena): son overlays hermanos del plano,
    // no parte de él.
    this.unitsPanel = mountUnitsPanel({
      host: this.host,
      tour: this.tour,
      getAvailability: () => this.availability,
      onSelectUnit: (code) => this.selectUnitFromList(code),
      onFilterChange: (matched) => this.applyFilter(matched),
    });

    this.priceToggleEl = document.createElement('div');
    this.priceToggleEl.className = 'r360-price-toggle';
    this.priceToggleEl.innerHTML =
      `<button type="button" data-mode="estado" class="is-on">Estado</button>` +
      `<button type="button" data-mode="precio">Precio</button>`;
    this.priceToggleEl.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-mode]');
      if (btn) this.setPriceMode(btn.dataset.mode === 'precio');
    });
    this.host.appendChild(this.priceToggleEl);

    this.priceLegendEl = document.createElement('div');
    this.priceLegendEl.className = 'r360-price-legend';
    this.priceLegendEl.hidden = true;
    this.host.appendChild(this.priceLegendEl);

    // La esquina inferior es de todos: `#legend` (leyenda de estados,
    // `main.ts`) y, cuando exista, la barra inferior de pestañas (`ui.ts`,
    // fuera de este agente también). Ninguno de los dos se toca acá; en vez
    // de asumir su alto a mano (que cambia con el ancho de pantalla y con
    // los cambios de esos archivos), se mide en vivo CUALQUIER chrome fijo
    // que toque el borde inferior del viewport y se docka todo lo propio
    // arriba de él. Así no hay que volver a tocar esto si el otro agente
    // agrega o cambia la barra inferior.
    this.syncLegendOffset();
    window.addEventListener('resize', this.scheduleLegendSync);
    // `subtree:true` sobre `document.body` puede disparar en ráfaga (tooltips
    // de Leaflet, refrescos de disponibilidad): se agrupa en un solo rAF por
    // tanda en vez de re-escanear el DOM en cada mutación suelta.
    this.legendObserver = new MutationObserver(this.scheduleLegendSync);
    this.legendObserver.observe(document.body, { attributes: true, childList: true, subtree: true });
  }

  private legendSyncScheduled = false;
  private scheduleLegendSync = (): void => {
    if (this.legendSyncScheduled) return;
    this.legendSyncScheduled = true;
    requestAnimationFrame(() => { this.legendSyncScheduled = false; this.syncLegendOffset(); });
  };

  /** Elementos propios: se excluyen de la medición de "chrome ajeno" para no auto-empujarse. */
  private isOwnDockEl(el: HTMLElement): boolean {
    return (
      el === this.priceToggleEl ||
      el === this.priceLegendEl ||
      el === this.touchPickEl ||
      el.closest('.r360-units-mount, .r360-price-toggle, .r360-price-legend, .r360-touch-pick') != null
    );
  }

  /**
   * Alto del chrome fijo que hoy ocupa el borde inferior del viewport
   * (leyenda de estados, barra de pestañas si existe, lo que sea), publicado
   * como variable CSS para que `units.css` dockee todo lo propio arriba.
   */
  private syncLegendOffset = (): void => {
    const vh = window.innerHeight;
    let topMost = vh;
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      if (this.isOwnDockEl(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      // Sólo lo que efectivamente toca (o casi) el borde inferior del viewport.
      if (rect.bottom >= vh - 2 && rect.top < topMost) topMost = rect.top;
    }
    const offset = Math.max(0, vh - topMost);
    document.documentElement.style.setProperty('--r360-legend-h', `${offset}px`);
  };

  mount(scene: Scene, hotspots: readonly Hotspot[], availability: AvailabilityFile | null): void {
    if (!isPlanSource(scene.source)) {
      console.warn(`[r360] La escena "${scene.slug}" es ${scene.kind} pero no trae source.url.`);
      return;
    }
    const { url, width, height } = scene.source;
    this.destroyMap();
    this.availability = availability;
    this.recomputePriceBands();

    // Girar el plano cuando es apaisado y la pantalla vertical (ver
    // `shouldRotate`). Al girar, alto y ancho del lienzo se intercambian.
    const rot = shouldRotate(width, height, this.el.clientWidth, this.el.clientHeight);
    const planW = rot ? height : width;
    const planH = rot ? width : height;

    const bounds = L.latLngBounds([0, 0], [planH, planW]);
    this.map = L.map(this.el, {
      crs: L.CRS.Simple,
      // Piso provisorio: el definitivo se calcula abajo contra el tamaño real
      // del contenedor. Un masterplan de 7945px de ancho NO entra en 375px
      // con `minZoom:-4` (ese piso da 496px de ancho mínimo) y el plano
      // aparecía cortado en móvil.
      minZoom: -10,
      maxZoom: 4,
      zoomControl: true,
      attributionControl: false,
      maxBounds: bounds.pad(0.25),
    });
    const overlay = L.imageOverlay(url, bounds).addTo(this.map);
    if (rot) {
      // Se pinta primero sin girar (se ve deformada un instante) y se cambia
      // por la girada apenas está lista. Preferible a una pantalla vacía
      // mientras el canvas trabaja sobre una imagen de 15 megapíxeles.
      void rotatedImageUrl(url).then((rotatedUrl) => {
        if (rotatedUrl && this.map) overlay.setUrl(rotatedUrl);
      });
    }

    for (const h of hotspots) {
      if (h.geometryKind !== 'polygon_px' && h.geometryKind !== 'point_px') continue;
      const facts = unitFacts(h, this.tour, availability);
      // Girado 90° horario: el punto (px,py) pasa a (1-py, px) y el lienzo
      // intercambia sus lados. Verificado con las cuatro esquinas.
      const toLatLng = (p: Px): L.LatLngExpression => planToLatLng(p, width, height, rot);

      const layer: L.Path =
        h.geometryKind === 'point_px'
          ? L.circleMarker(toLatLng((h.geometry as Px[])[0] ?? [0.5, 0.5]), { radius: 7 })
          : L.polygon((h.geometry as Px[]).map(toLatLng));

      layer.bindTooltip(tooltipHtml(facts, this.tour), { sticky: true, className: 'r360-leaflet-tip' });
      layer.addTo(this.map);

      this.layers.set(h.id, layer);
      this.meta.set(h.id, { hotspotId: h.id, unitCode: h.unitCode, facts });
      if (h.unitCode) {
        const list = this.codeToIds.get(h.unitCode) ?? [];
        list.push(h.id);
        this.codeToIds.set(h.unitCode, list);
      }
      this.paintLayer(h.id);
    }
    // El toque no se resuelve por el `click` nativo de cada polígono (hit-test
    // exacto de Leaflet): se centraliza en el mapa para poder aplicar
    // zoom-gating, tolerancia y desambiguación (plan §3) de manera uniforme,
    // incluso sobre el vacío entre dos lotes vecinos.
    this.map.on('click', this.handleMapClick);

    // El contenedor puede nacer con tamaño 0: primero se le informa el tamaño
    // real y recién después se encuadra, o el fitBounds sale calculado sobre
    // 0x0 y el plano aparece del tamaño de una estampilla.
    requestAnimationFrame(() => {
      if (!this.map) return;
      this.map.invalidateSize({ animate: false });
      // "Todo el plano visible" es el zoom mínimo útil: más lejos sólo se
      // agrega fondo vacío. Se calcula acá porque depende del tamaño del
      // contenedor, que recién ahora es el real (y cambia entre móvil y
      // escritorio, y entre el masterplan y un render).
      this.map.setMinZoom(this.map.getBoundsZoom(bounds));
      this.map.fitBounds(bounds);
    });

    this.unitsPanel.refresh();
  }

  /** Repinta sólo las unidades cambiadas: no se recrea ninguna capa. */
  updateStatuses(codes: readonly string[], availability: AvailabilityFile | null): void {
    this.availability = availability;
    this.recomputePriceBands();
    for (const code of codes) {
      for (const id of this.codeToIds.get(code) ?? []) {
        const meta = this.meta.get(id);
        if (!meta) continue;
        const facts = unitFacts(
          { id, sceneId: '', unitCode: code, geometryKind: 'polygon_px', geometry: [] },
          this.tour,
          availability,
        );
        meta.facts = { ...meta.facts, ...facts };
        this.layers.get(id)?.setTooltipContent(tooltipHtml(meta.facts, this.tour));
        this.paintLayer(id);
      }
    }
    this.unitsPanel.refresh();
  }

  focusUnit(code: string): void {
    const prev = this.highlighted;
    this.highlighted = null;
    if (prev) this.paintLayer(prev);
    const id = this.codeToIds.get(code)?.[0];
    const layer = id ? this.layers.get(id) : undefined;
    if (!layer || !this.map) return;
    this.highlighted = id!;
    if ('getBounds' in layer) this.map.fitBounds((layer as L.Polygon).getBounds(), { maxZoom: 2 });
    this.paintLayer(id!);
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
    this.unitsPanel.destroy();
    this.priceToggleEl.remove();
    this.priceLegendEl.remove();
    this.closeDisambiguation();
    window.removeEventListener('resize', this.scheduleLegendSync);
    this.legendObserver.disconnect();
  }

  private destroyMap(): void {
    this.map?.off('click', this.handleMapClick);
    this.map?.remove();
    this.map = null;
    this.highlighted = null;
    this.layers.clear();
    this.meta.clear();
    this.codeToIds.clear();
    this.closeDisambiguation();
  }

  // ------------------------------------------------------------- pintura

  /**
   * Estilo efectivo de un hotspot, combinando en orden: filtro (gris si no
   * matchea) > capa de precio (si está activa) > estado comercial (por
   * defecto). Es la única función que decide color: así el mapa y la lista
   * de unidades no pueden divergir en qué es "disponible" o "matchea".
   */
  private paintLayer(id: string): void {
    const layer = this.layers.get(id);
    const meta = this.meta.get(id);
    if (!layer || !meta) return;
    const highlighted = this.highlighted === id;
    const facts = meta.facts;

    if (facts.informational) {
      layer.setStyle({
        color: INFO_TOKEN.base, fillColor: INFO_TOKEN.base, fillOpacity: INFO_TOKEN.fill,
        weight: highlighted ? 4 : 2, opacity: 1,
      });
      return;
    }

    const codes = unitCodesFor(meta.unitCode, this.tour);
    const matches = this.filterMatch == null || codes.some((c) => this.filterMatch!.has(c));
    if (!matches) {
      layer.setStyle({ color: DIM_COLOR, fillColor: DIM_COLOR, fillOpacity: 0.05, weight: 1.5, opacity: 0.3 });
      return;
    }

    if (this.priceMode) {
      const min = minAvailablePrice(codes, this.availability);
      const band = min != null ? bandForPrice(min, this.priceBands) : null;
      if (band) {
        layer.setStyle({ color: band.color, fillColor: band.color, fillOpacity: 0.45, weight: highlighted ? 4 : 2, opacity: 1 });
      } else {
        // No disponible (o sin precio) en modo precio: contorno gris tenue,
        // nunca arcoíris (plan §5) y nunca oculto (regla dura del visor).
        layer.setStyle({ color: DIM_COLOR, fillColor: DIM_COLOR, fillOpacity: 0.04, weight: 1.5, opacity: 0.35 });
      }
      return;
    }

    const { base, fill } = paintFor(facts, this.tour);
    layer.setStyle({ color: base, fillColor: base, fillOpacity: fill, weight: highlighted ? 4 : 2, opacity: 1 });
  }

  private repaintAll(): void {
    for (const id of this.layers.keys()) this.paintLayer(id);
  }

  // -------------------------------------------------------------- filtro

  private applyFilter(matched: Set<string> | null): void {
    this.filterMatch = matched;
    this.repaintAll();
  }

  // --------------------------------------------------------- capa de precio

  private recomputePriceBands(): void {
    // PUNTO DE CONEXIÓN (plan §5): cuando `TourManifest.theme.priceBands`
    // exista (campo opcional aditivo, agregado por otro agente en
    // `packages/core`), se lee de ahí en vez de derivar por cuantiles:
    //
    //   const configured = this.tour.theme?.priceBands;
    //   if (configured?.length) { this.priceBands = configured.map(...); return; }
    //
    // Mientras no exista, se deriva de los precios presentes en
    // `availability.json` — cero cambio de contrato.
    this.priceBands = deriveBands(availablePrices(this.availability), 3);
    this.renderPriceLegend();
  }

  private setPriceMode(on: boolean): void {
    if (this.priceMode === on) return;
    this.priceMode = on;
    for (const btn of this.priceToggleEl.querySelectorAll<HTMLButtonElement>('button[data-mode]')) {
      btn.classList.toggle('is-on', (btn.dataset.mode === 'precio') === on);
    }
    this.priceLegendEl.hidden = !on;
    this.repaintAll();
  }

  private renderPriceLegend(): void {
    if (this.priceBands.length === 0) {
      this.priceLegendEl.innerHTML = '<span>Sin precios publicados</span>';
      return;
    }
    this.priceLegendEl.innerHTML = this.priceBands
      .map((b, i) => `<span><i style="background:${b.color}"></i>${escapeHtml(bandLabel(b, i, this.priceBands.length))}</span>`)
      .join('');
  }

  // --------------------------------------------------- lista de unidades

  /** Selección desde la pestaña Unidades: puede o no tener polígono propio. */
  private selectUnitFromList(code: string): void {
    const ids = this.codeToIds.get(code);
    if (ids?.length) {
      this.focusUnit(code);
      const meta = this.meta.get(ids[0]!);
      if (meta) this.onUnitClick({ hotspotId: ids[0]!, unitCode: code, facts: meta.facts });
      return;
    }
    // Unidad "hoja" (B2-A) sin hotspot propio: el polígono en Baleia es el
    // bloque. Se resalta el bloque contenedor y se emite la ficha de la
    // unidad igual, mismo criterio que el deep link de `ui.ts`.
    const groupCode = this.tour.units[code]?.groupCode ?? null;
    if (groupCode) this.focusUnit(groupCode);
    const facts = unitFacts({ id: `unit:${code}`, sceneId: '', unitCode: code, geometryKind: 'point_px', geometry: [] }, this.tour, this.availability);
    this.onUnitClick({ hotspotId: `unit:${code}`, unitCode: code, facts });
  }

  // ------------------------------------------------------ toque tolerante

  private handleMapClick = (e: L.LeafletMouseEvent): void => {
    if (!this.map) return;
    const all: ScreenPolygon[] = [];
    const commercial: ScreenPolygon[] = [];
    for (const id of this.layers.keys()) {
      const ring = this.screenRingFor(id);
      if (!ring) continue;
      all.push({ id, ring });
      if (!this.meta.get(id)?.facts.informational) commercial.push({ id, ring });
    }
    // El tamaño promedio se mide sólo sobre lotes comerciales: el perímetro
    // del terreno (enorme) no puede tapar que los lotes son chicos.
    const avgSizePx = averagePolygonSize(commercial);
    const pt = { x: e.containerPoint.x, y: e.containerPoint.y };
    const result = resolveTouch(pt, all, { avgSizePx });

    if (result.kind === 'none') return;
    if (result.kind === 'zoom') {
      const next = Math.min(this.map.getMaxZoom(), this.map.getZoom() + Math.log2(GATE_ZOOM_FACTOR));
      this.map.setZoomAround(e.latlng, next);
      return;
    }
    if (result.kind === 'select') { this.selectHotspot(result.id); return; }
    this.showDisambiguation(result.ids);
  };

  private screenRingFor(id: string): { x: number; y: number }[] | null {
    const layer = this.layers.get(id);
    if (!layer || !this.map) return null;
    if (layer instanceof L.Polygon) {
      const rings = layer.getLatLngs() as L.LatLng[][];
      const ring = rings[0] ?? [];
      return ring.map((ll) => { const p = this.map!.latLngToContainerPoint(ll); return { x: p.x, y: p.y }; });
    }
    if (layer instanceof L.CircleMarker) {
      const c = this.map.latLngToContainerPoint(layer.getLatLng());
      const r = layer.getRadius();
      return [
        { x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y - r },
        { x: c.x + r, y: c.y + r }, { x: c.x - r, y: c.y + r },
      ];
    }
    return null;
  }

  private selectHotspot(id: string): void {
    const meta = this.meta.get(id);
    if (!meta) return;
    this.onUnitClick({ hotspotId: id, unitCode: meta.unitCode, facts: meta.facts });
  }

  /** Desambiguación honesta (plan §3): 2+ candidatos bajo el mismo dedo, se eligen a mano. */
  private showDisambiguation(ids: string[]): void {
    this.closeDisambiguation();
    const rows = ids
      .map((id) => {
        const meta = this.meta.get(id);
        if (!meta) return '';
        const { base } = paintFor(meta.facts, this.tour);
        return `<button type="button" class="r360-touch-pick__row" data-id="${escapeHtml(id)}">
            <i style="background:${base}"></i><b>${escapeHtml(meta.facts.label)}</b>
          </button>`;
      })
      .join('');
    const el = document.createElement('div');
    el.className = 'r360-touch-pick';
    el.innerHTML = `<div class="r360-touch-pick__sheet">
        <div class="r360-touch-pick__title">Hay más de un lote acá. Elegí uno:</div>
        ${rows}
      </div>`;
    el.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const row = target.closest<HTMLElement>('.r360-touch-pick__row');
      if (row?.dataset.id) { this.closeDisambiguation(); this.selectHotspot(row.dataset.id); return; }
      if (target === el) this.closeDisambiguation(); // tocar el fondo cierra
    });
    this.host.appendChild(el);
    this.touchPickEl = el;
  }

  private closeDisambiguation(): void {
    this.touchPickEl?.remove();
    this.touchPickEl = null;
  }
}
