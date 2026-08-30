'use client';

/**
 * Lienzo de panorámica: EL EDITOR ES EL VISOR.
 *
 * Se monta el mismo Photo Sphere Viewer que usa `apps/viewer`, con el mismo
 * MarkersPlugin y los mismos estilos derivados de `STATUS_TOKENS`. Toda
 * conversión pantalla↔esfera pasa por `viewer.dataHelper`; acá no hay una sola
 * línea de proyección propia. Es la decisión de diseño que evita que el
 * polígono dibujado en el editor aparezca corrido en el recorrido publicado.
 *
 * Del spike de rendimiento se respetan los dos hallazgos:
 *  - repintado: `updateMarker(cfg, false)` para los que cambiaron y UN solo
 *    `renderMarkers()` al final. El default de la API repinta por llamada y a
 *    600 polígonos eso son 71 ms de bloqueo del hilo principal.
 *  - densificación a 2°: prácticamente gratis y necesaria para que la arista no
 *    se despegue del lote a FOV ancho.
 */
import { useEffect, useRef } from 'react';
import { Viewer, type events } from '@photo-sphere-viewer/core';
import { MarkersPlugin, type MarkerConfig } from '@photo-sphere-viewer/markers-plugin';
import '@photo-sphere-viewer/core/index.css';
import '@photo-sphere-viewer/markers-plugin/index.css';
import { densifyRing, normalizeYaw, sphericalCentroid, type Sph } from '@r360/core';
import type { Pt } from '@/lib/editor/records.ts';
import { svgStyleFor } from '@/lib/editor/style.ts';
import type { CanvasApi, CanvasProps, RenderPoly } from './canvas.ts';

const DENSIFY_DEG = 2;
const LABEL_SUFFIX = '::label';

export function PanoCanvas({
  url,
  polygons,
  showLabels,
  onReady,
  onViewChange,
  onPick,
  onCommit,
}: CanvasProps & { url: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const markersRef = useRef<MarkersPlugin | null>(null);
  const paintedRef = useRef<Map<string, RenderPoly>>(new Map());

  // Los callbacks viven en refs: el visor se monta UNA vez y sus listeners
  // durarían con el closure del primer render si se cerraran sobre las props.
  const cb = useRef({ onReady, onViewChange, onPick, onCommit });
  cb.current = { onReady, onViewChange, onPick, onCommit };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const viewer = new Viewer({
      container: host,
      panorama: url,
      plugins: [[MarkersPlugin, { markers: [] }]],
      navbar: false,
      // Sin inercia: al soltar, la vista tiene que quedar donde se la dejó. Un
      // deslizamiento de medio segundo mueve el punto donde se iba a clickear.
      moveInertia: false,
      defaultZoomLvl: 35,
      canvasBackground: '#05070a',
      // El teclado es del editor entero (n/p/v/d/a/…); si PSV también
      // escuchara, las flechas rotarían la vista mientras se edita un vértice.
      keyboard: false,
    });
    viewerRef.current = viewer;
    markersRef.current = viewer.getPlugin<MarkersPlugin>(MarkersPlugin);

    const api: CanvasApi = {
      fromClient(clientX, clientY) {
        const rect = host.getBoundingClientRect();
        try {
          const pos = viewer.dataHelper.viewerCoordsToSphericalCoords({
            x: clientX - rect.left,
            y: clientY - rect.top,
          });
          return [normalizeYaw(pos.yaw), pos.pitch];
        } catch {
          // Fuera de la esfera (puede pasar en fisheye o en los bordes).
          return null;
        }
      },
      toScreen(p) {
        const position = { yaw: p[0], pitch: p[1] };
        try {
          const visible = viewer.dataHelper.isPointVisible(position);
          const point = viewer.dataHelper.sphericalCoordsToViewerCoords(position);
          return { x: point.x, y: point.y, visible };
        } catch {
          return null;
        }
      },
      focus(ring) {
        if (ring.length === 0) return;
        const [yaw, pitch] = sphericalCentroid(ring as readonly Sph[]);
        viewer.animate({ yaw, pitch, speed: '3rpm' });
      },
      zoomLabel() {
        return `${Math.round(viewer.getZoomLevel())} %`;
      },
    };

    const notify = () => cb.current.onViewChange();
    viewer.addEventListener('position-updated', notify);
    viewer.addEventListener('zoom-updated', notify);
    viewer.addEventListener('size-updated', notify);

    const onClick = (e: events.ClickEvent) => {
      if (e.data.rightclick) return;
      const markerId = e.data.marker?.id ?? null;
      const hotspotId = markerId ? markerId.replace(LABEL_SUFFIX, '') : null;
      cb.current.onPick([normalizeYaw(e.data.yaw), e.data.pitch], hotspotId, {
        shiftKey: false,
        altKey: false,
      });
    };
    viewer.addEventListener('click', onClick);

    /**
     * El doble click se intercepta en FASE DE CAPTURA sobre el contenedor
     * anfitrión, antes de que llegue al de PSV: el comportamiento propio del
     * visor es acercar el zoom, y acá el doble click cierra el polígono. Los
     * dos a la vez sería cerrar el polígono y perder de vista dónde quedó.
     */
    const onDbl = (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const p = api.fromClient(e.clientX, e.clientY);
      if (p) cb.current.onCommit(p);
    };
    host.addEventListener('dblclick', onDbl, true);

    const ready = () => cb.current.onReady(api);
    viewer.addEventListener('ready', ready, { once: true });

    return () => {
      host.removeEventListener('dblclick', onDbl, true);
      viewer.destroy();
      viewerRef.current = null;
      markersRef.current = null;
      paintedRef.current = new Map();
    };
  }, [url]);

  /* ── repintado incremental ─────────────────────────────────────────── */

  useEffect(() => {
    const plugin = markersRef.current;
    if (!plugin) return;

    const prev = paintedRef.current;
    const next = new Map(polygons.map((p) => [p.id, p]));
    let touched = false;

    for (const id of prev.keys()) {
      if (next.has(id)) continue;
      plugin.removeMarker(id, false);
      if (prev.get(id)?.label) removeQuiet(plugin, id + LABEL_SUFFIX);
      touched = true;
    }

    for (const poly of polygons) {
      const before = prev.get(poly.id);
      if (before && same(before, poly)) {
        // Aun sin cambios propios, la etiqueta puede haberse apagado.
        if (syncLabel(plugin, poly, showLabels, before.label !== null)) touched = true;
        continue;
      }
      const config = polygonConfig(poly);
      // `render: false` en todo el bucle: un solo repintado al final.
      if (before) plugin.updateMarker(config, false);
      else plugin.addMarker(config, false);
      syncLabel(plugin, poly, showLabels, before !== undefined && before.label !== null);
      touched = true;
    }

    paintedRef.current = next;
    if (touched) plugin.renderMarkers();
  }, [polygons, showLabels]);

  return <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />;
}

function same(a: RenderPoly, b: RenderPoly): boolean {
  if (a.status !== b.status || a.selected !== b.selected || a.label !== b.label) return false;
  if (a.ring.length !== b.ring.length) return false;
  for (let i = 0; i < a.ring.length; i += 1) {
    if (a.ring[i]![0] !== b.ring[i]![0] || a.ring[i]![1] !== b.ring[i]![1]) return false;
  }
  return true;
}

function polygonConfig(poly: RenderPoly): MarkerConfig {
  const ring = densifyRing(poly.ring as readonly Sph[], DENSIFY_DEG);
  return {
    id: poly.id,
    polygon: ring.map(([yaw, pitch]) => [yaw, pitch] as [number, number]),
    svgStyle: svgStyleFor(poly.status, { selected: poly.selected }),
    zIndex: poly.selected ? 60 : 10,
  };
}

function syncLabel(plugin: MarkersPlugin, poly: RenderPoly, show: boolean, existed: boolean): boolean {
  const id = poly.id + LABEL_SUFFIX;
  if (!show || !poly.label) {
    if (existed) removeQuiet(plugin, id);
    return existed;
  }
  const [yaw, pitch] = sphericalCentroid(poly.ring as readonly Sph[]);
  const config: MarkerConfig = {
    id,
    position: { yaw, pitch },
    html: `<span class="ed-vlabel">${escapeHtml(poly.label)}</span>`,
    anchor: 'center center',
    zIndex: 1000,
    style: { pointerEvents: 'none' },
  };
  if (existed) plugin.updateMarker(config, false);
  else plugin.addMarker(config, false);
  return true;
}

/** Borrar un marcador inexistente lanza en PSV; acá siempre es benigno. */
function removeQuiet(plugin: MarkersPlugin, id: string): void {
  try {
    plugin.removeMarker(id, false);
  } catch {
    /* ya no estaba */
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export type { Pt };
