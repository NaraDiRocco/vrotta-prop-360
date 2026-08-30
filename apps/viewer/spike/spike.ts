/**
 * SPIKE — ¿aguanta Photo Sphere Viewer cientos de polígonos SVG?
 *
 * Riesgo técnico #1 del proyecto. Un loteo real tiene 300-800 lotes en una
 * sola panorámica; si PSV no llega, hay que cambiar el diseño del visor
 * (culling, drill-down por manzana, o canvas/WebGL propio) ANTES de construirlo.
 *
 * Uso:  /spike/?n=600&densify=1&step=2&stress=1&cull=0
 */
import '@photo-sphere-viewer/core/index.css';
import '@photo-sphere-viewer/markers-plugin/index.css';
import { Viewer } from '@photo-sphere-viewer/core';
import { MarkersPlugin, type MarkerConfig } from '@photo-sphere-viewer/markers-plugin';
import {
  densifyRing,
  sphericalCentroid,
  STATUS_TOKENS,
  UNIT_STATUSES,
  angleBetween,
  type Sph,
  type UnitStatus,
} from '@r360/core';
import { makeSyntheticPanorama } from './panorama.ts';

// ---------------------------------------------------------------- parámetros

const qs = new URLSearchParams(location.search);
const num = (k: string, d: number) => {
  const v = Number(qs.get(k));
  return Number.isFinite(v) && qs.has(k) ? v : d;
};
const bool = (k: string, d: boolean) => (qs.has(k) ? qs.get(k) === '1' : d);

const cfg = {
  n: num('n', 300),
  densify: bool('densify', true),
  stepDeg: num('step', 2),
  stress: bool('stress', true),
  cull: bool('cull', false),
  /**
   * 'sphere' = repartidos por toda la esfera (sólo ~1/8 en pantalla a la vez).
   * 'patch'  = todos dentro de un sector de 140°x55° por debajo del horizonte,
   *            que es cómo se ve un loteo real desde el drone: el peor caso,
   *            porque casi todos los polígonos están visibles al mismo tiempo.
   */
  layout: (qs.get('layout') === 'sphere' ? 'sphere' : 'patch') as 'sphere' | 'patch',
};

// ------------------------------------------------------- polígonos sintéticos

interface SynthPoly {
  id: string;
  code: string;
  ring: Sph[];       // vértices "crudos" (6-10)
  center: Sph;
  status: UnitStatus;
  areaM2: number;
}

/**
 * Distribución de Fibonacci sobre la esfera: reparte N centros de forma
 * casi-uniforme sin acumular en los polos, que es lo que pasaría con un
 * muestreo naive de yaw/pitch aleatorios.
 */
function fibonacciSphere(n: number): Sph[] {
  const out: Sph[] = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / Math.max(1, n - 1)) * 2; // 1 → -1
    const pitch = Math.asin(y) * 0.78;          // comprimido: evita los polos
    const yaw = ((ga * i) % (Math.PI * 2)) - Math.PI;
    out.push([yaw, pitch]);
  }
  return out;
}

/** Anillo convexo irregular de `k` vértices alrededor de un centro esférico. */
function ringAround(center: Sph, radius: number, k: number, seed: number): Sph[] {
  const rnd = mulberry32(seed);
  const [cy, cp] = center;
  const ring: Sph[] = [];
  for (let i = 0; i < k; i++) {
    const a = (i / k) * Math.PI * 2 + rnd() * 0.25;
    const r = radius * (0.65 + rnd() * 0.5);
    const dp = Math.sin(a) * r;
    // La compresión por cos(pitch) evita que el polígono se estire cerca del cenit.
    const dy = (Math.cos(a) * r) / Math.max(0.25, Math.cos(cp));
    ring.push([cy + dy, Math.max(-1.45, Math.min(1.45, cp + dp))]);
  }
  return ring;
}

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Grilla de lotes dentro de un sector: el layout de un loteo visto de frente. */
function patchGrid(n: number): { centers: Sph[]; radius: number } {
  const yawSpan = 140 * (Math.PI / 180);
  const pitchSpan = 55 * (Math.PI / 180);
  const cols = Math.max(1, Math.round(Math.sqrt((n * yawSpan) / pitchSpan)));
  const rows = Math.ceil(n / cols);
  const dy = yawSpan / cols;
  const dp = pitchSpan / rows;
  const centers: Sph[] = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    centers.push([-yawSpan / 2 + (c + 0.5) * dy, -0.62 + (r + 0.5) * dp]);
  }
  return { centers, radius: Math.min(dy, dp) * 0.45 };
}

function buildPolys(n: number): SynthPoly[] {
  const patch = cfg.layout === 'patch' ? patchGrid(n) : null;
  const centers = patch ? patch.centers : fibonacciSphere(n);
  // Radio ≈ mitad del espaciamiento medio, para que se toquen sin superponerse.
  const radius = patch ? patch.radius : Math.sqrt((4 * Math.PI) / n) * 0.42;
  const rnd = mulberry32(1337);
  return centers.map((center, i) => {
    const k = 6 + Math.floor(rnd() * 5); // 6..10 vértices
    const ring = ringAround(center, radius, k, i * 7919 + 13);
    return {
      id: `p${i}`,
      code: `M${String(Math.floor(i / 20) + 1).padStart(2, '0')}-L${String((i % 20) + 1).padStart(2, '0')}`,
      ring,
      center: sphericalCentroid(ring),
      status: UNIT_STATUSES[i % UNIT_STATUSES.length]!,
      areaM2: 240 + Math.round(rnd() * 700),
    };
  });
}

// ------------------------------------------------------------- a marcadores

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function styleFor(status: UnitStatus): Record<string, string> {
  const t = STATUS_TOKENS[status];
  return {
    fill: hexToRgba(t.base, t.fill),
    stroke: t.base,
    'stroke-width': '2',
    'stroke-linejoin': 'round',
  };
}

interface BuiltMarkers {
  markers: MarkerConfig[];
  totalVertices: number;
  densifyMs: number;
}

function toMarkers(polys: SynthPoly[], densify: boolean, stepDeg: number): BuiltMarkers {
  const t0 = performance.now();
  // `stepDeg <= 0` haría que densifyEdge calcule Infinity pasos y cuelgue la
  // pestaña. Es un pie de bala fácil de pisar desde la query string.
  const step = Math.max(0.05, stepDeg);
  const rings = polys.map((p) => (densify ? densifyRing(p.ring, step) : p.ring));
  const densifyMs = performance.now() - t0;

  let totalVertices = 0;
  const markers: MarkerConfig[] = [];
  for (let i = 0; i < polys.length; i++) {
    const p = polys[i]!;
    const ring = rings[i]!;
    totalVertices += ring.length;
    markers.push({
      id: p.id,
      polygon: ring.map(([y, pi]) => [y, pi] as [number, number]),
      svgStyle: styleFor(p.status),
      tooltip: `${p.code} · ${p.areaM2} m² · ${STATUS_TOKENS[p.status].label}`,
      data: { code: p.code, status: p.status },
    });
  }
  return { markers, totalVertices, densifyMs };
}

// ------------------------------------------------------------------ métricas

interface Metrics {
  n: number;
  vertices: number;
  densifyMs: number;
  mountMs: number;
  lastBulkUpdateMs: number;
  lastBulkUpdateNoRenderMs: number;
  fps: number;
  fpsMin: number;
  frameP95: number;
  visible: number;
  onScreen: number;
  heapMB: number | null;
}

const m: Metrics = {
  n: 0, vertices: 0, densifyMs: 0, mountMs: 0,
  lastBulkUpdateMs: 0, lastBulkUpdateNoRenderMs: 0,
  fps: 0, fpsMin: Infinity, frameP95: 0, visible: 0, onScreen: 0, heapMB: null,
};

// ------------------------------------------------------------------- montaje

const hud = document.getElementById('hud')!;
const panorama = makeSyntheticPanorama(4096);

const viewer = new Viewer({
  container: document.getElementById('psv')!,
  panorama,
  defaultZoomLvl: 40,
  navbar: false,
  loadingTxt: 'generando panorámica…',
  plugins: [[MarkersPlugin, { defaultHoverScale: false }]],
});
const markersPlugin = viewer.getPlugin<MarkersPlugin>(MarkersPlugin);

let polys: SynthPoly[] = [];
/** Ids realmente montados en PSV. Con culling activo es un subconjunto. */
let mountedIds = new Set<string>();
let built: BuiltMarkers = { markers: [], totalVertices: 0, densifyMs: 0 };

function mount(): void {
  polys = buildPolys(cfg.n);
  built = toMarkers(polys, cfg.densify, cfg.stepDeg);

  markersPlugin.clearMarkers();
  const t0 = performance.now();
  const initial = cfg.cull ? cullToView(built.markers) : built.markers;
  mountedIds = new Set(initial.map((mk) => String(mk.id)));
  markersPlugin.setMarkers(initial);
  viewer.needsUpdate();
  const mountMs = performance.now() - t0;

  m.n = cfg.n;
  m.vertices = built.totalVertices;
  m.densifyMs = built.densifyMs;
  m.mountMs = mountMs;
  m.fpsMin = Infinity;
  frameTimes.length = 0;
  render();
}

/**
 * Mitigación candidata: no entregarle a PSV los polígonos que caen fuera del
 * campo de visión. PSV igual descarta los invisibles al pintar, pero antes
 * ya pagó el costo de mantener su nodo SVG en el DOM.
 */
function cullToView(all: MarkerConfig[], marginRad = 0.35): MarkerConfig[] {
  const pos = viewer.getPosition();
  const center: Sph = [pos.yaw, pos.pitch];
  const limit = (viewer.state.hFov * Math.PI) / 180 / 2 + marginRad;
  const out: MarkerConfig[] = [];
  for (let i = 0; i < all.length; i++) {
    if (angleBetween(center, polys[i]!.center) <= limit) out.push(all[i]!);
  }
  return out;
}

// ------------------------------------------------- simulación de disponibilidad

let flip = 0;

/** Refresco masivo: es exactamente lo que hace `availability.ts` cada 60 s. */
function bulkUpdate(): void {
  flip++;
  // (a) sin render intermedio — un solo repintado al final
  const t0 = performance.now();
  for (let i = 0; i < polys.length; i++) {
    const p = polys[i]!;
    const s = UNIT_STATUSES[(i + flip) % UNIT_STATUSES.length]!;
    p.status = s;
    // Con culling, el que no está montado toma su color al entrar en vista.
    if (mountedIds.has(p.id)) markersPlugin.updateMarker({ id: p.id, svgStyle: styleFor(s) }, false);
  }
  viewer.needsUpdate();
  m.lastBulkUpdateNoRenderMs = performance.now() - t0;

  // (b) con render por marcador — el camino ingenuo, para tener el contraste
  const t1 = performance.now();
  for (let i = 0; i < polys.length; i++) {
    if (mountedIds.has(polys[i]!.id)) {
      markersPlugin.updateMarker({ id: polys[i]!.id, svgStyle: styleFor(polys[i]!.status) }, true);
    }
  }
  m.lastBulkUpdateMs = performance.now() - t1;
  render();
}

// -------------------------------------------------------------- FPS + stress

const frameTimes: number[] = [];
let last = performance.now();
let stressYaw = 0;

function loop(now: number): void {
  const dt = now - last;
  last = now;
  if (dt > 0 && dt < 1000) {
    frameTimes.push(dt);
    if (frameTimes.length > 120) frameTimes.shift();
  }
  if (cfg.stress) {
    stressYaw += 0.0035;
    viewer.rotate({ yaw: stressYaw, pitch: Math.sin(stressYaw * 0.7) * 0.25 });
    if (cfg.cull) recull();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

let cullTimer = 0;
function recull(): void {
  if (performance.now() - cullTimer < 250) return;
  cullTimer = performance.now();
  const next = cullToView(built.markers);
  mountedIds = new Set(next.map((mk) => String(mk.id)));
  markersPlugin.setMarkers(next);
}

function stats(): void {
  if (frameTimes.length < 5) return;
  const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
  m.fps = 1000 / avg;
  if (frameTimes.length >= 60) m.fpsMin = Math.min(m.fpsMin, m.fps);
  const sorted = [...frameTimes].sort((a, b) => a - b);
  m.frameP95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  m.heapMB = mem ? mem.usedJSHeapSize / 1048576 : null;
  m.visible = document.querySelectorAll('.psv-marker').length;
  m.onScreen = document.querySelectorAll('.psv-marker--visible').length;
  render();
}
setInterval(stats, 500);

// ------------------------------------------------------------------- HUD

function cls(fps: number): string {
  return fps >= 50 ? 'ok' : fps >= 28 ? 'warn' : 'bad';
}
const f = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');

function render(): void {
  hud.innerHTML = `
    <h1>Spike PSV · polígonos</h1>
    <table>
      <tr><td>N polígonos</td><td>${m.n}</td></tr>
      <tr><td>Vértices totales</td><td>${m.vertices}</td></tr>
      <tr><td>Vértices / polígono</td><td>${m.n ? (m.vertices / m.n).toFixed(1) : '—'}</td></tr>
      <tr><td>Densificación</td><td>${cfg.densify ? `sí (${cfg.stepDeg}°)` : 'no'}</td></tr>
      <tr><td>Culling por FOV</td><td>${cfg.cull ? 'sí' : 'no'}</td></tr>
      <tr><td>Distribución</td><td>${cfg.layout === 'patch' ? 'sector 140°x55°' : 'esfera completa'}</td></tr>
      <tr><td>Marcadores en pantalla</td><td>${m.onScreen}</td></tr>
      <tr><td>Nodos .psv-marker en DOM</td><td>${m.visible}</td></tr>
    </table>
    <hr />
    <table>
      <tr><td><b>FPS</b> (media 120f)</td><td class="${cls(m.fps)}"><b>${f(m.fps)}</b></td></tr>
      <tr><td>FPS mínimo</td><td class="${cls(m.fpsMin)}">${f(m.fpsMin)}</td></tr>
      <tr><td>Frame p95</td><td>${f(m.frameP95)} ms</td></tr>
      <tr><td>densifyRing()</td><td>${f(m.densifyMs)} ms</td></tr>
      <tr><td>Montaje setMarkers()</td><td>${f(m.mountMs)} ms</td></tr>
      <tr><td>Refresco (1 render)</td><td>${f(m.lastBulkUpdateNoRenderMs)} ms</td></tr>
      <tr><td>Refresco (render x N)</td><td>${f(m.lastBulkUpdateMs)} ms</td></tr>
      <tr><td>Heap JS</td><td>${m.heapMB === null ? 'n/d' : f(m.heapMB) + ' MB'}</td></tr>
    </table>
    <div class="row-controls">
      <button class="primary" id="btn-bulk">simular cambio de estado</button>
      <button id="btn-stress">rotación: ${cfg.stress ? 'ON' : 'OFF'}</button>
      <button id="btn-dens">densificar: ${cfg.densify ? 'ON' : 'OFF'}</button>
      <button id="btn-cull">culling: ${cfg.cull ? 'ON' : 'OFF'}</button>
    </div>
    <div class="row-controls">
      ${[100, 300, 600, 1000].map((k) => `<button data-n="${k}">N=${k}</button>`).join('')}
    </div>
    <p class="muted" style="margin:8px 0 0">
      Vértices/polígono con densificación depende del tamaño angular del lote:
      a más N, lotes más chicos y menos subdivisión.
    </p>`;

  hud.querySelector('#btn-bulk')!.addEventListener('click', bulkUpdate);
  hud.querySelector('#btn-stress')!.addEventListener('click', () => { cfg.stress = !cfg.stress; render(); });
  hud.querySelector('#btn-dens')!.addEventListener('click', () => { cfg.densify = !cfg.densify; mount(); });
  hud.querySelector('#btn-cull')!.addEventListener('click', () => { cfg.cull = !cfg.cull; mount(); });
  hud.querySelectorAll<HTMLButtonElement>('[data-n]').forEach((b) =>
    b.addEventListener('click', () => { cfg.n = Number(b.dataset.n); mount(); }),
  );
}

viewer.addEventListener('ready', () => mount(), { once: true });

/**
 * Medición sincrónica del camino caliente.
 *
 * El FPS por rAF depende del vsync y se degrada a 0 si la pestaña no está
 * componiendo (headless, pestaña en segundo plano). `renderMarkers()` es
 * exactamente lo que PSV corre en cada frame por cada marcador: visibilidad +
 * proyección esfera→pantalla + reescritura del `d` del path. Medirlo en un
 * bucle cerrado da el costo de CPU por frame atribuible a los polígonos, que
 * es el número que decide si el diseño se sostiene.
 */
function syncBench(frames = 120): { msPerFrame: number; p95: number; frames: number } {
  const samples: number[] = [];
  let onScreen = 0;
  for (let i = 0; i < frames; i++) {
    // Barrido dentro del sector, como un visitante paneando el loteo: si el
    // barrido saliera del sector, el culling mediría una escena vacía y el
    // número quedaría inflado a favor de la mitigación.
    viewer.rotate({ yaw: Math.sin(i * 0.031) * 0.9, pitch: -0.3 + Math.sin(i * 0.017) * 0.18 });
    const t = performance.now();
    // El re-culling es trabajo real por frame: entra en la medición.
    if (cfg.cull) recull();
    markersPlugin.renderMarkers();
    samples.push(performance.now() - t);
    onScreen += document.querySelectorAll('.psv-marker--visible').length;
  }
  m.onScreen = Math.round(onScreen / frames);
  m.visible = document.querySelectorAll('.psv-marker').length;
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  m.heapMB = mem ? mem.usedJSHeapSize / 1048576 : null;
  samples.sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  return { msPerFrame: mean, p95: samples[Math.floor(samples.length * 0.95)] ?? 0, frames };
}

// Puente para automatizar la medición desde un navegador headless.
(window as unknown as Record<string, unknown>).__spike = {
  metrics: () => ({ ...m }),
  setN: (n: number) => { cfg.n = n; mount(); },
  setDensify: (v: boolean) => { cfg.densify = v; mount(); },
  setLayout: (v: 'patch' | 'sphere') => { cfg.layout = v; mount(); },
  setStep: (deg: number) => { cfg.stepDeg = deg; mount(); },
  setCull: (v: boolean) => { cfg.cull = v; mount(); },
  bulkUpdate,
  syncBench,
  resetFps: () => { frameTimes.length = 0; m.fpsMin = Infinity; },
};
