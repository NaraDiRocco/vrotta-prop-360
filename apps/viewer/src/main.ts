/**
 * Punto de entrada del visor.
 *
 * Los dos archivos se piden EN PARALELO: `tour.json` es pesado (geometría de
 * todos los lotes) y `availability.json` es chico pero está en otra ruta con
 * otro cache. Encadenarlos sumaría un round-trip completo al tiempo hasta el
 * primer pixel, que en 4G rural es medio segundo largo.
 */
import '@photo-sphere-viewer/core/index.css';
import 'leaflet/dist/leaflet.css';
import './styles.css';

import { STATUS_TOKENS, UNIT_STATUSES, type AvailabilityFile, type TourManifest } from '@r360/core';
import { AvailabilityPoller } from './availability.ts';
import { SceneController, type UnitClickPayload } from './scenes.ts';

export interface ViewerOptions {
  container: HTMLElement;
  tourUrl?: string;
  /** Si no viene, se toma `tour.availabilityUrl` resuelto contra `tourUrl`. */
  availabilityUrl?: string;
  refreshMs?: number;
}

export interface ViewerHandle {
  tour: TourManifest;
  controller: SceneController;
  poller: AvailabilityPoller;
  destroy(): void;
}

export async function mountViewer(opts: ViewerOptions): Promise<ViewerHandle> {
  const tourUrl = opts.tourUrl ?? './tour.json';
  const container = opts.container;
  container.classList.add('r360-root');
  const status = showLoading(container);

  const tourRes = await fetch(tourUrl, { cache: 'default' });
  if (!tourRes.ok) throw new Error(`tour.json ${tourRes.status}`);
  const tourPeek = (await tourRes.json()) as TourManifest;
  const availabilityUrl =
    opts.availabilityUrl ?? new URL(tourPeek.availabilityUrl, new URL(tourUrl, location.href)).href;

  // El manifiesto ya está resuelto; se mantiene el Promise.all porque en
  // producción `tour.json` viene precargado por <link rel=preload> y el
  // await de arriba resuelve al instante.
  const [tour, availability] = await Promise.all([
    Promise.resolve(tourPeek),
    fetch(availabilityUrl, { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<AvailabilityFile>) : Promise.reject(new Error(String(r.status)))))
      // Sin disponibilidad el recorrido igual se muestra: todos los lotes en
      // fallback y avisados por consola. Nunca una pantalla en blanco.
      .catch((err): AvailabilityFile | null => {
        console.warn('[r360] availability.json no disponible en el arranque:', err);
        return null;
      }),
  ]);

  if (tour.schema !== 1) console.warn(`[r360] schema ${tour.schema} desconocido; se intenta igual.`);
  status.remove();

  const controller = new SceneController(container, tour, availability);
  controller.start();

  const poller = new AvailabilityPoller({
    url: availabilityUrl,
    initial: availability,
    intervalMs: opts.refreshMs ?? 60_000,
    onUpdate: (next, changes) => {
      controller.applyAvailability(next, changes.map((c) => c.unitCode));
      container.dispatchEvent(
        new CustomEvent('r360:availability', { detail: { version: next.v, changes }, bubbles: true }),
      );
    },
  });
  poller.start();

  return {
    tour,
    controller,
    poller,
    destroy() { poller.stop(); controller.destroy(); },
  };
}

/**
 * La leyenda se genera desde STATUS_TOKENS, nunca a mano: si el color de la
 * leyenda y el del polígono divergen, el visitante deja de confiar en el mapa.
 */
function renderLegend(el: HTMLElement, tour: TourManifest): void {
  el.innerHTML = UNIT_STATUSES.map((s) => {
    const base = tour.theme?.states?.[s]?.base ?? STATUS_TOKENS[s].base;
    return `<span><i style="background:${base}"></i>${STATUS_TOKENS[s].label}</span>`;
  }).join('');
  el.hidden = false;
}

function showLoading(container: HTMLElement): HTMLElement {
  const el = document.createElement('div');
  el.className = 'r360-boot';
  el.textContent = 'Cargando recorrido…';
  container.appendChild(el);
  return el;
}

// Auto-arranque cuando la página trae #app (build standalone del visor).
const root = document.getElementById('app');
if (root) {
  const legend = document.getElementById('legend');
  mountViewer({ container: root }).then((handle) => {
    (window as unknown as Record<string, unknown>).r360 = handle;
    if (legend) renderLegend(legend, handle.tour);
    root.addEventListener('r360:unit-click', (e) => {
      const d = (e as CustomEvent<UnitClickPayload>).detail;
      console.info('[r360] unidad seleccionada', d.unitCode, d.facts);
    });
  }, (err) => {
    root.innerHTML = `<div class="r360-boot r360-boot--error">No se pudo cargar el recorrido.</div>`;
    console.error(err);
  });
}
