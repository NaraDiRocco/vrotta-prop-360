'use client';

/**
 * Lienzo de plano 2D (escenas `floorplan` y `map`).
 *
 * Mismo principio que la panorámica: el editor monta EL MISMO Leaflet con
 * `L.CRS.Simple` que `apps/viewer/src/floorplan.ts`, y usa exactamente su
 * misma fórmula de normalizado → latlng. Si acá se invirtiera el eje de otra
 * manera, el plano del editor y el del visor mostrarían el mismo polígono en
 * lugares distintos.
 *
 * No se usa Leaflet-Geoman: el dibujo lo hace el mismo reducer que la
 * panorámica, sobre la superposición de tiradores compartida. Una segunda
 * máquina de edición, con su propio historial y su propio snap, sería otro
 * editor a mantener — y el ⌘Z de uno no desharía lo del otro.
 */
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Pt } from '@/lib/editor/records.ts';
import { polyStyle } from '@/lib/editor/style.ts';
import type { CanvasApi, CanvasProps, RenderPoly } from './canvas.ts';

export function PlanCanvas({
  url,
  width,
  height,
  polygons,
  showLabels,
  onReady,
  onViewChange,
  onPick,
  onCommit,
}: CanvasProps & { url: string; width: number; height: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<Map<string, L.Polygon>>(new Map());
  const labelsRef = useRef<Map<string, L.Marker>>(new Map());
  const paintedRef = useRef<Map<string, RenderPoly>>(new Map());

  const cb = useRef({ onReady, onViewChange, onPick, onCommit });
  cb.current = { onReady, onViewChange, onPick, onCommit };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const bounds = L.latLngBounds([0, 0], [height, width]);
    const map = L.map(host, {
      crs: L.CRS.Simple,
      minZoom: -5,
      maxZoom: 6,
      zoomControl: false,
      attributionControl: false,
      maxBounds: bounds.pad(0.4),
      // El doble click cierra el polígono; el zoom por doble click competiría.
      doubleClickZoom: false,
      zoomSnap: 0,
    });
    mapRef.current = map;
    L.imageOverlay(url, bounds).addTo(map);

    /** Idéntica a la del visor: y invertido, x directo. */
    const toLatLng = (p: Pt): L.LatLng => L.latLng((1 - p[1]) * height, p[0] * width);
    const toNorm = (ll: L.LatLng): Pt => [ll.lng / width, 1 - ll.lat / height];

    const api: CanvasApi = {
      fromClient(clientX, clientY) {
        const rect = host.getBoundingClientRect();
        return toNorm(map.containerPointToLatLng(L.point(clientX - rect.left, clientY - rect.top)));
      },
      toScreen(p) {
        const point = map.latLngToContainerPoint(toLatLng(p));
        return { x: point.x, y: point.y, visible: true };
      },
      focus(ring) {
        if (ring.length === 0) return;
        map.fitBounds(L.latLngBounds(ring.map(toLatLng)).pad(0.6), { maxZoom: 3 });
      },
      zoomLabel() {
        return `×${(2 ** map.getZoom()).toFixed(2)}`;
      },
    };

    const notify = () => cb.current.onViewChange();
    map.on('move zoom resize viewreset zoomanim', notify);

    map.on('click', (e: L.LeafletMouseEvent) => {
      cb.current.onPick(toNorm(e.latlng), null, {
        shiftKey: e.originalEvent.shiftKey,
        altKey: e.originalEvent.altKey,
      });
    });
    map.on('dblclick', (e: L.LeafletMouseEvent) => {
      cb.current.onCommit(toNorm(e.latlng));
    });

    // El contenedor puede nacer con tamaño 0 dentro del grid: primero se le
    // informa el tamaño real y recién después se encuadra, o el fitBounds sale
    // calculado sobre 0x0 y el plano aparece del tamaño de una estampilla.
    requestAnimationFrame(() => {
      map.invalidateSize({ animate: false });
      map.fitBounds(bounds);
      cb.current.onReady(api);
      notify();
    });

    const observer = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
      notify();
    });
    observer.observe(host);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      layersRef.current.clear();
      labelsRef.current.clear();
      paintedRef.current = new Map();
    };
  }, [url, width, height]);

  /* ── repintado incremental ─────────────────────────────────────────── */

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layers = layersRef.current;
    const labels = labelsRef.current;
    const prev = paintedRef.current;
    const next = new Map(polygons.map((p) => [p.id, p]));
    const toLatLng = (p: Pt): L.LatLng => L.latLng((1 - p[1]) * height, p[0] * width);

    for (const id of prev.keys()) {
      if (next.has(id)) continue;
      layers.get(id)?.remove();
      layers.delete(id);
      labels.get(id)?.remove();
      labels.delete(id);
    }

    for (const poly of polygons) {
      const style = polyStyle(poly.status, { selected: poly.selected });
      const latlngs = poly.ring.map(toLatLng);
      let layer = layers.get(poly.id);
      if (!layer) {
        layer = L.polygon(latlngs).addTo(map);
        layer.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          cb.current.onPick([e.latlng.lng / width, 1 - e.latlng.lat / height], poly.id, {
            shiftKey: e.originalEvent.shiftKey,
            altKey: e.originalEvent.altKey,
          });
        });
        layer.on('dblclick', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          cb.current.onCommit([e.latlng.lng / width, 1 - e.latlng.lat / height]);
        });
        layers.set(poly.id, layer);
      } else {
        layer.setLatLngs(latlngs);
      }
      layer.setStyle({
        color: style.stroke,
        weight: style.strokeWidth,
        fillColor: style.stroke,
        fillOpacity: 0,
        fill: true,
      });
      // El relleno se pinta con el rgba ya calculado (mismo que el visor) en
      // vez de con fillOpacity, para que coincida el color exacto.
      layer.setStyle({ fillColor: style.stroke, fillOpacity: opacityOf(style.fill) });

      const existing = labels.get(poly.id);
      if (showLabels && poly.label) {
        const center = layer.getBounds().getCenter();
        if (existing) existing.setLatLng(center);
        else {
          labels.set(
            poly.id,
            L.marker(center, {
              interactive: false,
              icon: L.divIcon({ className: '', html: `<span class="ed-vlabel">${escapeHtml(poly.label)}</span>` }),
            }).addTo(map),
          );
        }
      } else if (existing) {
        existing.remove();
        labels.delete(poly.id);
      }
    }

    paintedRef.current = next;
  }, [polygons, showLabels, width, height]);

  return <div ref={hostRef} style={{ position: 'absolute', inset: 0, background: '#05070a' }} />;
}

/** `rgba(r,g,b,a)` → `a`. Leaflet quiere el alfa por separado del color. */
function opacityOf(rgba: string): number {
  const m = /rgba?\([^)]*,\s*([\d.]+)\s*\)/.exec(rgba);
  return m ? Number(m[1]) : 0.25;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
