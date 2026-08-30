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
import { useEffect, useRef, useState } from 'react';
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

interface Instance {
  viewer: Viewer;
  markers: MarkersPlugin;
  api: CanvasApi;
  url: string;
  teardown: () => void;
}

export function PanoCanvas({
  url,
  polygons,
  showLabels,
  drawing,
  onReady,
  onViewChange,
  onPick,
  onCommit,
}: CanvasProps & { url: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<MarkersPlugin | null>(null);
  const paintedRef = useRef<Map<string, RenderPoly>>(new Map());
  /**
   * Ids de etiqueta REALMENTE montadas.
   *
   * No alcanza con mirar si el polígono tenía etiqueta la vez anterior: las
   * etiquetas también se apagan con `l`, y el visor se puede haber reemplazado.
   * `updateMarker` sobre un marcador que no existe LANZA, y esa excepción corta
   * el bucle de repintado a la mitad: el síntoma es una panorámica sin ningún
   * polígono, muy lejos de la causa.
   */
  const labelIdsRef = useRef<Set<string>>(new Set());
  const instanceRef = useRef<Instance | null>(null);
  const teardownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Se incrementa cada vez que nace un visor nuevo.
   *
   * El repintado es incremental y compara contra lo que ya dibujó; si el visor
   * se reemplaza (montaje doble de StrictMode, cambio de escena), ese registro
   * habla de marcadores que ya no existen y el efecto no repinta nada: la
   * panorámica queda sin un solo polígono. El contador lo obliga a volver a
   * pintar desde cero contra el visor nuevo.
   */
  const [viewerGeneration, setViewerGeneration] = useState(0);

  // Los callbacks viven en refs: el visor se monta UNA vez y sus listeners
  // durarían con el closure del primer render si se cerraran sobre las props.
  const cb = useRef({ onReady, onViewChange, onPick, onCommit });
  cb.current = { onReady, onViewChange, onPick, onCommit };
  const drawingRef = useRef(drawing);
  drawingRef.current = drawing;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // Un desmontaje pendiente (ver más abajo) se cancela: el efecto volvió.
    if (teardownTimer.current) {
      clearTimeout(teardownTimer.current);
      teardownTimer.current = null;
    }

    const alive = instanceRef.current;
    if (alive && alive.url === url) {
      // Remontaje de StrictMode sobre el mismo DOM: se reutiliza el visor vivo.
      markersRef.current = alive.markers;
      if (alive.viewer.state.ready) cb.current.onReady(alive.api);
      return scheduleTeardown;
    }
    alive?.teardown();

    const viewer = new Viewer({
      container: host,
      panorama: url,
      plugins: [
        [
          MarkersPlugin,
          {
            /*
             * Sin esto, hacer click sobre un polígono NO dispara el `click` del
             * visor: el plugin se queda con el evento y emite `select-marker`
             * por su cuenta. El síntoma es que los polígonos simplemente no se
             * pueden seleccionar, sin ningún error. Con la bandera en true el
             * click llega igual que en el vacío, con su yaw/pitch, y el editor
             * tiene un solo camino de entrada en vez de dos.
             */
            clickEventOnMarker: true,
            markers: [],
          },
        ],
      ],
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
    const markers = viewer.getPlugin<MarkersPlugin>(MarkersPlugin);
    markersRef.current = markers;
    paintedRef.current = new Map();
    labelIdsRef.current = new Set();
    setViewerGeneration((g) => g + 1);

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
      // En dibujo los vértices los pone el listener nativo de abajo, sin espera.
      if (drawingRef.current) return;
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

    /*
     * Click inmediato en modo dibujo.
     *
     * PSV retrasa su evento `click` 300 ms para poder emitir `dblclick` en su
     * lugar si llega un segundo click. Marcando las cuatro esquinas de un lote
     * a ritmo normal, la mitad de los clicks se convierten en dobles y los
     * vértices se pierden sin ninguna señal. Acá se escucha el click nativo,
     * que llega enseguida, y se descarta el que en realidad fue un arrastre
     * para rotar la vista.
     */
    let downAt: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY };
    };
    const onNativeClick = (e: MouseEvent) => {
      if (!drawingRef.current || e.button !== 0) return;
      const moved = downAt ? Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) : 0;
      if (moved > 4) return; // fue una rotación, no una esquina
      const p = api.fromClient(e.clientX, e.clientY);
      if (p) cb.current.onPick(p, null, { shiftKey: e.shiftKey, altKey: e.altKey });
    };
    host.addEventListener('pointerdown', onDown, true);
    host.addEventListener('click', onNativeClick, true);

    viewer.addEventListener('ready', () => {
      cb.current.onReady(api);
      /*
       * Repintado COMPLETO al quedar listo, y no es opcional.
       *
       * El MarkersPlugin, en su propio manejador de `ready`, hace
       * `setMarkers(this.config.markers)` — o sea que BORRA todo lo que se le
       * haya agregado antes de que la panorámica terminara de cargar. Y React
       * monta los marcadores en cuanto tiene el estado, que es siempre antes.
       *
       * El síntoma es brutal y no se parece a la causa: el plugin reporta sus
       * 18 marcadores registrados, no hay ningún error, y la panorámica no
       * muestra un solo polígono. Se resuelve olvidando lo pintado y dejando
       * que el efecto vuelva a montarlo todo contra el plugin ya vacío.
       */
      paintedRef.current = new Map();
      labelIdsRef.current = new Set();
      setViewerGeneration((g) => g + 1);
    });

    // PSV sólo escucha el resize de la ventana. Acá el lienzo cambia de tamaño
    // sin que la ventana lo haga (al plegar un panel), y sin esto la esfera
    // queda dibujada sobre el tamaño viejo.
    const observer = new ResizeObserver(() => viewer.autoSize());
    observer.observe(host);

    instanceRef.current = {
      viewer,
      markers,
      api,
      url,
      teardown() {
        observer.disconnect();
        host.removeEventListener('dblclick', onDbl, true);
        host.removeEventListener('pointerdown', onDown, true);
        host.removeEventListener('click', onNativeClick, true);
        viewer.destroy();
      },
    };

    return scheduleTeardown;

    /**
     * El desmontaje se DIFIERE un tick.
     *
     * En desarrollo React monta, desmonta y vuelve a montar cada efecto
     * (StrictMode). Destruir el visor en el medio aborta la descarga de la
     * panorámica poniéndole `src = ''` a la imagen que three.js ya guardó en su
     * caché por URL: el segundo visor encuentra esa imagen muerta en la caché,
     * no vuelve a pedirla, y se queda para siempre en el cargador. Diferir el
     * destroy deja que el remontaje inmediato reutilice el visor vivo; en un
     * desmontaje real el timeout corre y se destruye igual.
     */
    function scheduleTeardown() {
      teardownTimer.current = setTimeout(() => {
        teardownTimer.current = null;
        instanceRef.current?.teardown();
        instanceRef.current = null;
        markersRef.current = null;
        paintedRef.current = new Map();
        labelIdsRef.current = new Set();
      }, 0);
    }
  }, [url]);

  /* ── repintado incremental ─────────────────────────────────────────── */

  useEffect(() => {
    const plugin = markersRef.current;
    if (!plugin) return;

    const prev = paintedRef.current;
    const labelIds = labelIdsRef.current;
    const next = new Map(polygons.map((p) => [p.id, p]));
    let touched = false;

    /*
     * PSV LANZA si se le pide actualizar o borrar un marcador que no tiene, y
     * su registro interno es privado: no hay forma de preguntarle qué tiene. El
     * conjunto que llevamos acá es una pista, y el propio plugin la invalida
     * cuando se le da la gana (ver el manejador de `ready`).
     *
     * Estas tres funciones hacen que la pista equivocada sea inofensiva. Sin
     * ellas, una excepción a mitad del bucle deja la panorámica sin NINGÚN
     * polígono — el resto de los marcadores nunca se llega a montar.
     */
    const put = (config: MarkerConfig, exists: boolean) => {
      try {
        if (exists) plugin.updateMarker(config, false);
        else plugin.addMarker(config, false);
      } catch {
        try {
          plugin.addMarker(config, false);
        } catch {
          plugin.updateMarker(config, false);
        }
      }
      touched = true;
    };

    const drop = (id: string) => {
      try {
        plugin.removeMarker(id, false);
        touched = true;
      } catch {
        /* ya no estaba: nada que borrar */
      }
    };

    const dropLabel = (id: string) => {
      if (!labelIds.has(id)) return;
      labelIds.delete(id);
      drop(id);
    };

    for (const id of prev.keys()) {
      if (next.has(id)) continue;
      drop(id);
      dropLabel(id + LABEL_SUFFIX);
    }

    for (const poly of polygons) {
      const before = prev.get(poly.id);
      // `render: false` en todo el bucle: un solo repintado al final.
      if (!before || !same(before, poly)) put(polygonConfig(poly), before !== undefined);

      const labelId = poly.id + LABEL_SUFFIX;
      if (showLabels && poly.label) {
        put(labelConfig(poly, labelId), labelIds.has(labelId));
        labelIds.add(labelId);
      } else {
        dropLabel(labelId);
      }
    }

    paintedRef.current = next;
    if (touched) plugin.renderMarkers();
  }, [polygons, showLabels, viewerGeneration]);

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

function labelConfig(poly: RenderPoly, id: string): MarkerConfig {
  const [yaw, pitch] = sphericalCentroid(poly.ring as readonly Sph[]);
  return {
    id,
    position: { yaw, pitch },
    html: `<span class="ed-vlabel">${escapeHtml(poly.label ?? '')}</span>`,
    anchor: 'center center',
    zIndex: 1000,
    style: { pointerEvents: 'none' },
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export type { Pt };
