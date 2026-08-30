/**
 * Punto de entrada del visor.
 *
 * Los dos archivos se piden EN PARALELO: `tour.json` es pesado (geometría de
 * todos los lotes) y `availability.json` es chico pero está en otra ruta con
 * otro cache. Encadenarlos sumaría un round-trip completo al tiempo hasta el
 * primer pixel, que en 4G rural es medio segundo largo.
 *
 * ARRANQUE SIN PUERTAS (§1 y §7 del plan de experiencia). Orden fijo, cada
 * cosa aparece apenas puede:
 *
 *   shell con marca  →  masterplan borroso  →  barra que mide de verdad la
 *   descarga del master  →  plano nítido con polígonos  →  chip de orientación
 *
 * Nada de modal de bienvenida, ni "hacé click para comenzar", ni pedido de
 * datos. El competidor pone dos puertas antes de dejar tocar nada y no da
 * ninguna señal de progreso pese a disparar ~492 peticiones; nuestra intro es
 * el producto cargando, y se puede medir.
 */
import '@photo-sphere-viewer/core/index.css';
import '@photo-sphere-viewer/markers-plugin/index.css';
import './styles.css';
import './boot.css';

import { STATUS_TOKENS, UNIT_STATUSES, type AvailabilityFile, type Scene, type TourManifest } from '@r360/core';
import { AvailabilityPoller } from './availability.ts';
import { SceneController, buildHash, parseHash, type UnitClickPayload } from './scenes.ts';
import { shouldRotate } from './plan-orientation.ts';
import { formatPrice } from './polygons.ts';

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
  const boot = showBoot(container);

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
  resolveManifestUrls(tour, new URL(tourUrl, location.href));

  // Ya sabemos de qué proyecto se trata: nombre y miniatura borrosa entran
  // ahora, no cuando termine de bajar el master.
  boot.setName(tour.project);
  const startScene = tour.scenes.find((s) => s.slug === tour.start) ?? tour.scenes[0];
  const planUrl = startScene && 'url' in startScene.source ? startScene.source.url : null;
  if (planUrl && startScene && 'width' in startScene.source) {
    boot.setThumb(
      thumbUrl(planUrl),
      shouldRotate(startScene.source.width, startScene.source.height, container.clientWidth, container.clientHeight),
    );
    // Progreso REAL: se lee el stream del master del masterplan, que es lo que
    // domina el arranque (1 imagen contra 2 JSON chicos). Sin `Content-Length`
    // la barra se anima hasta el 90% y cierra al terminar, en vez de mentir un
    // porcentaje. La imagen queda en el cache HTTP, así que el `<img>` que
    // crea Leaflet un instante después no la vuelve a bajar.
    await fetchWithProgress(planUrl, (v) => boot.setProgress(v));
  } else {
    boot.indeterminate();
  }

  const controller = new SceneController(container, tour, availability);
  controller.start();

  // Deep link a una unidad: aterrizar EN esa unidad, con zoom puesto. Es el
  // caso de oro (el vendedor manda el link de B2-A por WhatsApp) y hasta ahora
  // el hash existía pero no encuadraba nada.
  await landOnDeepLink(container, tour, controller);

  boot.done();

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
 * Las URLs del manifiesto (`./masterplan.webp`, `./media/...`) son relativas
 * AL `tour.json`, no al documento que lo carga. Mientras el recorrido se
 * sirve desde la raíz del sitio da igual, pero en cuanto vive en un
 * subdirectorio (`/baleia/tour.json`, un embed, un preview del panel) el
 * navegador las resuelve contra la página y la imagen de la escena da 404.
 * Se absolutizan una sola vez, acá, para que ningún consumidor (Leaflet, PSV,
 * la ficha) tenga que acordarse de hacerlo.
 */
function resolveManifestUrls(tour: TourManifest, base: URL): void {
  const abs = (u: string) => new URL(u, base).href;
  for (const scene of tour.scenes) {
    if ('url' in scene.source) scene.source.url = abs(scene.source.url);
    else scene.source.base = abs(scene.source.base);
  }
  for (const unit of Object.values(tour.units)) {
    if (unit.media) unit.media = unit.media.map(abs);
  }
}

/** Misma convención de miniaturas que la galería y el builder: `X.thumb.webp`. */
const thumbUrl = (url: string) => url.replace(/\.webp$/i, '.thumb.webp');

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

// ------------------------------------------------------------------ arranque

interface BootHandle {
  setName(name: string): void;
  setThumb(url: string, rotated: boolean): void;
  setProgress(v: number): void;
  indeterminate(): void;
  done(): void;
}

function showBoot(container: HTMLElement): BootHandle {
  const el = document.createElement('div');
  el.className = 'r360-boot';
  el.innerHTML =
    `<div class="r360-boot__bar"><i></i></div>` +
    `<img class="r360-boot__thumb" alt="" />` +
    `<div class="r360-boot__brand">` +
    `<span class="r360-boot__name">Recorrido</span>` +
    `<span class="r360-boot__sub">Cargando el plano…</span>` +
    `</div>`;
  container.appendChild(el);

  const fill = el.querySelector<HTMLElement>('.r360-boot__bar i')!;
  const img = el.querySelector<HTMLImageElement>('.r360-boot__thumb')!;
  const name = el.querySelector<HTMLElement>('.r360-boot__name')!;
  let creep: ReturnType<typeof setInterval> | null = null;
  let value = 0;

  const set = (v: number) => {
    // Monótona: una barra que retrocede se lee como "algo falló".
    value = Math.max(value, Math.min(1, v));
    fill.style.width = `${(value * 100).toFixed(1)}%`;
  };
  set(0.06); // El shell ya está: la barra nunca arranca en cero absoluto.

  return {
    setName(n) { name.textContent = n; },
    setThumb(url, rotated) {
      img.classList.toggle('is-rotated', rotated);
      img.addEventListener('load', () => img.classList.add('is-on'), { once: true });
      // Sin miniatura no pasa nada: queda el fondo de marca. La convención de
      // nombre se puede romper sin romper el arranque.
      img.addEventListener('error', () => img.remove(), { once: true });
      img.src = url;
    },
    setProgress(v) { if (creep) { clearInterval(creep); creep = null; } set(v); },
    indeterminate() {
      // Sin dato de tamaño no se inventa un porcentaje: se avanza hacia el 90%
      // con pasos cada vez más chicos y se cierra al terminar de verdad.
      creep ??= setInterval(() => set(value + (0.9 - value) * 0.12), 220);
    },
    done() {
      if (creep) clearInterval(creep);
      set(1);
      el.classList.add('is-done');
      setTimeout(() => el.remove(), 500);
    },
  };
}

/**
 * Descarga midiendo. Devuelve cuando el archivo entero llegó; si el servidor
 * no manda `Content-Length` (o el navegador no da stream), se cae a la barra
 * indeterminada en vez de fabricar un número.
 */
async function fetchWithProgress(url: string, onProgress: (v: number) => void): Promise<void> {
  try {
    const res = await fetch(url, { cache: 'default' });
    const total = Number(res.headers.get('content-length') ?? 0);
    if (!res.ok || !res.body || !Number.isFinite(total) || total <= 0) {
      await res.blob().catch(() => undefined);
      return;
    }
    const reader = res.body.getReader();
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.byteLength;
      onProgress(got / total);
    }
    onProgress(1);
  } catch (err) {
    // Que falle la medición no puede impedir que arranque el recorrido: la
    // imagen la vuelve a pedir Leaflet por su cuenta.
    console.warn('[r360] No se pudo medir la descarga del plano:', err);
  }
}

// ----------------------------------------------------------------- deep link

/** Espera a que Leaflet haya dibujado los polígonos, para poder encuadrarlos. */
function whenPlanReady(container: HTMLElement, timeoutMs = 4000): Promise<boolean> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      if (container.querySelector('.r360-plan .leaflet-overlay-pane path')) return resolve(true);
      if (performance.now() - t0 > timeoutMs) return resolve(false);
      requestAnimationFrame(tick);
    };
    tick();
  });
}

/**
 * `…#/scene/masterplan/unit/B2-A` tiene que aterrizar EN B2-A: plano encuadrado
 * en su polígono y ficha abierta (la abre `ui.ts` leyendo el mismo hash).
 *
 * En Baleia los polígonos del masterplan son BLOQUES, no unidades: B2-A no
 * tiene geometría propia. En vez de no hacer nada — que es lo que pasaba — se
 * encuadra el bloque que la contiene (`groupCode`), que es lo más cerca que se
 * puede llevar al visitante. El hash se restaura a la unidad después del
 * encuadre: el link compartido tiene que seguir apuntando a la unidad, no al
 * bloque.
 */
async function landOnDeepLink(
  container: HTMLElement,
  tour: TourManifest,
  controller: SceneController,
): Promise<void> {
  const { slug, unitCode } = parseHash(location.hash);
  if (!unitCode) return;
  const scene = tour.scenes.find((s) => s.slug === (slug ?? tour.start));
  if (!scene || !isPlanScene(scene)) return;

  const hasOwnGeometry = tour.hotspots.some((h) => h.sceneId === scene.id && h.unitCode === unitCode);
  const focusCode = hasOwnGeometry ? unitCode : (tour.units[unitCode]?.groupCode ?? null);
  if (!focusCode) return;

  if (!(await whenPlanReady(container))) return;
  controller.goTo(scene.slug, focusCode, { replaceHash: true });
  history.replaceState(null, '', buildHash(scene.slug, unitCode));
}

const isPlanScene = (s: Scene) => s.kind === 'floorplan' || s.kind === 'map';

// ------------------------------------------------------ chip de orientación

/**
 * "5 bloques · 20 unidades · Tocá un bloque". El único onboarding del
 * recorrido: dice el tamaño de lo que hay y el gesto que lo abre, y se va solo.
 *
 * No aparece cuando el visitante llegó por un deep link de unidad: el destino
 * ya está decidido y explicarle el mapa sería ruido sobre la ficha que acaba
 * de abrirse.
 */
function showOrientationChip(container: HTMLElement, tour: TourManifest, availability: AvailabilityFile | null): void {
  if (parseHash(location.hash).unitCode) return;

  const start = tour.scenes.find((s) => s.slug === tour.start);
  const blocks = new Set(
    tour.hotspots.filter((h) => h.sceneId === start?.id && h.unitCode).map((h) => h.unitCode!),
  );
  // Las entradas de `units` que agrupan a otras (un bloque) no son unidades
  // vendibles: contarlas dos veces inflaría el número que le mostramos.
  const units = Object.values(tour.units).filter((u) => !Array.isArray(u.attrs?.unitCodes)).length;
  const parts: string[] = [];
  if (blocks.size) parts.push(`<b>${blocks.size}</b> bloques`);
  if (units) parts.push(`<b>${units}</b> unidades`);
  if (!parts.length) return;

  // "desde USD …" con el mínimo de los precios públicos disponibles: es lo
  // primero que un comprador quiere saber, y mostrarlo de entrada filtra a
  // favor. Si ningún precio es público, no se inventa nada y no va la línea.
  const from = cheapestAvailable(availability);
  if (from) parts.push(`desde <b>${formatPrice(from)}</b>`);
  parts.push('Tocá un bloque para ver sus unidades');

  const chip = document.createElement('div');
  chip.className = 'r360-hint';
  chip.setAttribute('role', 'status');
  chip.innerHTML = parts.join(' · ');
  container.appendChild(chip);
  requestAnimationFrame(() => chip.classList.add('is-on'));

  const dismiss = () => {
    chip.classList.remove('is-on');
    clearTimeout(timer);
    container.removeEventListener('pointerdown', dismiss);
    setTimeout(() => chip.remove(), 350);
  };
  const timer = setTimeout(dismiss, 5000);
  container.addEventListener('pointerdown', dismiss, { once: true });
}

function cheapestAvailable(availability: AvailabilityFile | null): { a: number; c: string } | null {
  let best: { a: number; c: string } | null = null;
  for (const entry of Object.values(availability?.units ?? {})) {
    if (entry.s !== 'disponible' || !entry.p) continue;
    if (!best || entry.p.a < best.a) best = entry.p;
  }
  return best;
}

// Auto-arranque cuando la página trae #app (build standalone del visor).
const root = document.getElementById('app');
if (root) {
  const legend = document.getElementById('legend');
  // `?tour=` para poder abrir un recorrido publicado en otra ruta sin tocar
  // el HTML (ej. `?tour=/baleia/tour.json`). Sin el parámetro, `./tour.json`.
  const tourUrl = new URLSearchParams(location.search).get('tour') ?? './tour.json';
  mountViewer({ container: root, tourUrl }).then((handle) => {
    (window as unknown as Record<string, unknown>).r360 = handle;
    if (legend) renderLegend(legend, handle.tour);
    // La interfaz (galería, ficha de unidad, lightbox) se monta sólo en el
    // build standalone: un embed puede querer el recorrido pelado y poner su
    // propia UI escuchando `r360:unit-click`.
    void import('./ui.ts').then(({ mountUi }) =>
      mountUi({
        container: root,
        tour: handle.tour,
        controller: handle.controller,
        availability: () => handle.poller.value,
        tourUrl,
      }),
    );
    showOrientationChip(root, handle.tour, handle.poller.value);
    root.addEventListener('r360:unit-click', (e) => {
      const d = (e as CustomEvent<UnitClickPayload>).detail;
      console.info('[r360] unidad seleccionada', d.unitCode, d.facts);
    });
    root.addEventListener('r360:cta', (e) => {
      console.info('[r360] contacto', (e as CustomEvent<{ unitCode: string; kind: string }>).detail);
    });
  }, (err) => {
    root.innerHTML = `<div class="r360-boot r360-boot--error">No se pudo cargar el recorrido.</div>`;
    console.error(err);
  });
}
