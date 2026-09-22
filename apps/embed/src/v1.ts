/**
 * @r360/embed — v1 loader.
 *
 * Embedded directly on client sites (WordPress, Wix, Webflow, GTM, plain
 * HTML). Must stay small, dependency-free, and ES2018-safe: it is loaded as
 * a raw <script> tag, not a module, so it cannot assume ESM support.
 *
 * ---------------------------------------------------------------------
 * DOMINIO BASE DE LA PLATAFORMA — configurable ACÁ, en un solo lugar.
 * ---------------------------------------------------------------------
 * La plataforma no sirve cada proyecto en una ruta compartida: cada uno
 * vive en su propio subdominio, `{subdominio}.VIEWER_BASE_DOMAIN`, y el
 * worker resuelve qué proyecto es por el header `Host` de la petición (ver
 * DESPLIEGUE-VPS.md). El subdominio de cada tour sale de `data-subdomain`
 * en el `.tm-tour` (o de `data-project` como respaldo — ver
 * `parseTourDataset` en `./config.ts`); esta constante es sólo la parte
 * común a TODOS los proyectos de esta build.
 *
 * Por qué una constante fija acá y no un atributo `data-*` del `<script>`
 * para poder apuntar a un entorno de pruebas sin tocar código: un build de
 * `v1.js` sirve a UN solo entorno — no hay un caso real de que una misma
 * página necesite mezclar producción y staging en el mismo script. Para
 * probar contra otro entorno: cambiar este valor y correr
 * `pnpm --filter @r360/embed build` (idealmente publicando el `dist/v1.js`
 * de pruebas en una URL de staging aparte, nunca pisando el de producción).
 */

import {
  PROTOCOL_VERSION,
  isTourMessage,
  isKnownProtocolVersion,
  isTrustedOrigin,
  makeMessage,
  type IframeToParentMessage,
  type ParentToIframeMessage,
} from "./protocol";
import {
  parseTourDataset,
  parseAspect,
  aspectToPaddingTopPercent,
  buildDeepLinkPrefix,
  readDeepLinkParams,
  writeDeepLinkParams,
  buildIframeSrc,
  resolveViewerOrigin,
  nextInstanceId,
  ConfigError,
  type ParsedTourElementConfig,
  type DeepLinkParams,
} from "./config";

const VIEWER_BASE_DOMAIN = "vrottaprop360.com";

/**
 * Origen donde se sirve este mismo script (v1.js) — hoy puramente
 * informativo (no se usa para validar nada), se deja configurable junto al
 * dominio base para no dejar un resto de dominio viejo dando vueltas.
 * `cdn` es el subdominio que la plataforma reserva explícitamente para
 * "servir estáticos/tiles" (ver `reserved_subdomains` en
 * `supabase/migrations/0022_project_domains.sql`) — no hay todavía una
 * decisión operativa firme de dónde se aloja `dist/v1.js` en producción,
 * así que este es el candidato más razonable, no un hecho confirmado.
 */
const EMBED_ORIGIN: string =
  (typeof window !== "undefined" && (window as unknown as Record<string, string>).__TM_DEV_EMBED_ORIGIN__) ||
  "https://cdn.vrottaprop360.com";

// El `__TM_DEV_VIEWER_ORIGIN__` existe SOLO para que demo/index.html pueda
// apuntar un build local a http://localhost:<puerto> sin un segundo config
// de build. A diferencia de VIEWER_BASE_DOMAIN (que compone un subdominio
// distinto por proyecto vía `resolveViewerOrigin`), este override reemplaza
// el origen COMPLETO para TODAS las instancias de la página por igual: el
// demo es intencionalmente same-origin (loader + "visores" mock, todo en
// `http://localhost:8090`, ver README de este paquete) y no intenta simular
// subdominios reales, que en `localhost` no existen sin tocar `/etc/hosts`.
// Los sitios de clientes nunca setean esto; producción siempre resuelve por
// subdominio real vía VIEWER_BASE_DOMAIN.
function devViewerOriginOverride(): string | null {
  return (
    (typeof window !== "undefined" &&
      (window as unknown as Record<string, string>).__TM_DEV_VIEWER_ORIGIN__) ||
    null
  );
}

/**
 * Origen del visor para UNA instancia puntual. No es una constante global
 * como antes: dos `.tm-tour` en la misma página pueden ser proyectos
 * distintos (subdominios distintos), así que cada instancia resuelve el
 * suyo a partir de su propio `config.subdomain`.
 */
function resolveInstanceViewerOrigin(subdomain: string): string {
  const devOverride = devViewerOriginOverride();
  if (devOverride) return devOverride; // ver comentario de EMBED_ORIGIN/__TM_DEV_VIEWER_ORIGIN__ arriba
  return resolveViewerOrigin(subdomain, VIEWER_BASE_DOMAIN);
}

const SELECTOR = ".tm-tour";
const MOUNTED_ATTR = "data-tm-mounted";
const INSTANCE_ATTR = "data-tm-instance";
const ROOT_MARGIN = "400px";
const HELLO_WATCHDOG_MS = 8000;

interface TourInstance {
  id: string;
  el: HTMLElement;
  root: HTMLElement;
  frameWrap: HTMLElement;
  iframe: HTMLIFrameElement | null;
  posterBtn: HTMLButtonElement | null;
  config: ParsedTourElementConfig;
  /** Origen del visor de ESTA instancia (subdominio propio del proyecto) —
   *  ver `resolveInstanceViewerOrigin`. No hay una única constante global:
   *  dos tours en la misma página pueden ser proyectos distintos. */
  viewerOrigin: string;
  deepLinkPrefix: string;
  observer: IntersectionObserver | null;
  outgoingQueue: ParentToIframeMessage[];
  helloReceived: boolean;
  watchdogTimer: number | null;
  fullscreen: {
    active: boolean;
    overlay: HTMLElement | null;
    savedScrollY: number;
    savedBodyStyle: { position: string; top: string; width: string; overflow: string };
  };
}

const registry = new Map<string, TourInstance>();

// ---------------------------------------------------------------------------
// dataLayer / CustomEvent bridge
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    dataLayer?: unknown[];
    tumarcaEmbed?: {
      init: () => void;
      goToUnit: (el: Element, unitId: string) => void;
      VERSION: string;
      PROTOCOL_VERSION: number;
    };
  }
}

function emitClientEvent(instance: TourInstance, name: string, detail: Record<string, unknown>): void {
  const full = Object.assign({ instance: instance.id }, detail);
  try {
    instance.el.dispatchEvent(
      new CustomEvent(`tm:${name}`, { bubbles: true, detail: full }),
    );
  } catch {
    /* older browsers without CustomEvent constructor support: no-op */
  }
  if (Array.isArray(window.dataLayer)) {
    window.dataLayer.push(Object.assign({ event: `tm_${name}` }, full));
  }
}

// ---------------------------------------------------------------------------
// DOM construction
// ---------------------------------------------------------------------------

function supportsAspectRatio(): boolean {
  try {
    return typeof CSS !== "undefined" && CSS.supports && CSS.supports("aspect-ratio", "16 / 9");
  } catch {
    return false;
  }
}

const ASPECT_RATIO_SUPPORTED = supportsAspectRatio();

function buildSeoBlock(instance: TourInstance): HTMLElement {
  const config = instance.config;
  const wrap = document.createElement("div");
  wrap.className = "tm-tour-seo";
  // Visually hidden but real, crawlable content — an iframe alone has none.
  wrap.style.cssText =
    "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;";

  let seoData: { name?: string; canonicalUrl?: string; units?: { label: string; url: string }[] } = {};
  const raw = instance.el.getAttribute("data-seo-json");
  if (raw) {
    try {
      seoData = JSON.parse(raw);
    } catch {
      /* malformed data-seo-json: degrade gracefully, skip structured content */
    }
  }

  const heading = document.createElement("h3");
  heading.textContent = seoData.name || `${config.project} — ${config.tenant}`;
  wrap.appendChild(heading);

  if (seoData.units && seoData.units.length) {
    const ul = document.createElement("ul");
    for (const unit of seoData.units) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = unit.url;
      a.textContent = unit.label;
      li.appendChild(a);
      ul.appendChild(li);
    }
    wrap.appendChild(ul);
  }

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: seoData.name || `${config.project} — ${config.tenant}`,
  };
  if (seoData.canonicalUrl) jsonLd.url = seoData.canonicalUrl;
  if (seoData.units && seoData.units.length) {
    jsonLd.itemListElement = seoData.units.map((u, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: u.label,
      url: u.url,
    }));
  }
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.textContent = JSON.stringify(jsonLd);
  wrap.appendChild(script);

  return wrap;
}

function buildDom(el: HTMLElement, config: ParsedTourElementConfig): {
  root: HTMLElement;
  frameWrap: HTMLElement;
  posterBtn: HTMLButtonElement;
} {
  el.setAttribute(MOUNTED_ATTR, "true");
  el.innerHTML = "";

  const root = document.createElement("div");
  root.className = "tm-tour-root";
  root.style.cssText = "position:relative;width:100%;overflow:hidden;background:#0b0b0b;";

  const frameWrap = document.createElement("div");
  frameWrap.className = "tm-tour-frame-wrap";
  if (ASPECT_RATIO_SUPPORTED) {
    frameWrap.style.cssText = `position:relative;width:100%;aspect-ratio:${config.aspect.w}/${config.aspect.h};`;
  } else {
    const pct = aspectToPaddingTopPercent(config.aspect);
    frameWrap.style.cssText = `position:relative;width:100%;height:0;padding-top:${pct}%;`;
  }
  root.appendChild(frameWrap);

  if (config.poster) {
    const poster = document.createElement("img");
    poster.className = "tm-tour-poster";
    poster.src = config.poster;
    poster.loading = "lazy";
    poster.alt = `${config.project} — ${config.tenant}`;
    poster.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;";
    frameWrap.appendChild(poster);
  }

  const posterBtn = document.createElement("button");
  posterBtn.type = "button";
  posterBtn.className = "tm-tour-play";
  posterBtn.setAttribute("aria-label", `Reproducir recorrido virtual: ${config.project}`);
  posterBtn.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;border:0;padding:0;margin:0;cursor:pointer;background:rgba(0,0,0,0.15);display:flex;align-items:center;justify-content:center;";
  posterBtn.innerHTML =
    '<span style="width:72px;height:72px;border-radius:50%;background:rgba(255,255,255,0.9);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 12px rgba(0,0,0,0.35);"><span style="width:0;height:0;border-style:solid;border-width:14px 0 14px 22px;border-color:transparent transparent transparent #111;margin-left:4px;"></span></span>';
  frameWrap.appendChild(posterBtn);

  el.appendChild(root);

  return { root, frameWrap, posterBtn };
}

// ---------------------------------------------------------------------------
// iframe lifecycle
// ---------------------------------------------------------------------------

function startWatchdog(instance: TourInstance): void {
  clearWatchdog(instance);
  instance.watchdogTimer = window.setTimeout(() => {
    if (!instance.helloReceived) {
      emitClientEvent(instance, "loadError", {
        message: "no tour:hello received within timeout — check the client CSP allows " + instance.viewerOrigin,
      });
    }
  }, HELLO_WATCHDOG_MS);
}

function clearWatchdog(instance: TourInstance): void {
  if (instance.watchdogTimer !== null) {
    window.clearTimeout(instance.watchdogTimer);
    instance.watchdogTimer = null;
  }
}

function loadIframe(instance: TourInstance): void {
  if (instance.iframe) return; // already loading/loaded
  const deepLink = readDeepLinkParams(location.search, instance.deepLinkPrefix);
  const src = buildIframeSrc(instance.viewerOrigin, instance.config, deepLink, instance.id, location.origin);

  const iframe = document.createElement("iframe");
  iframe.className = "tm-tour-iframe";
  iframe.src = src;
  iframe.title = `${instance.config.project} — ${instance.config.tenant}`;
  iframe.loading = "eager";
  iframe.setAttribute(
    "allow",
    "accelerometer; gyroscope; fullscreen; xr-spatial-tracking",
  );
  iframe.setAttribute("allowfullscreen", "true");
  // Red de seguridad para el camino del referrer: el visor ya recibe el
  // origen del padre explícito por `?parentOrigin=` (ver `buildIframeSrc` en
  // `./config.ts`), pero además dejamos `document.referrer` en el mejor
  // estado posible por si algún loader viejo en producción todavía no manda
  // ese parámetro. `strict-origin-when-cross-origin` es el default de los
  // navegadores modernos, pero fijarlo acá evita que una página del cliente
  // con una política MÁS estricta a nivel documento (una cabecera
  // `Referrer-Policy: no-referrer`, por ejemplo) se lo pise: el atributo del
  // propio iframe manda sobre la política heredada del documento que lo
  // contiene. Sigue sin mandar el path ni la query del cliente, sólo
  // esquema+host+puerto — nada sensible.
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border:0;";
  instance.frameWrap.appendChild(iframe);
  instance.iframe = iframe;

  if (instance.posterBtn) {
    instance.posterBtn.style.display = "none";
  }

  startWatchdog(instance);
}

function sendToIframe(instance: TourInstance, message: ParentToIframeMessage): void {
  if (!instance.iframe || !instance.helloReceived) {
    instance.outgoingQueue.push(message);
    return;
  }
  instance.iframe.contentWindow?.postMessage(message, instance.viewerOrigin);
}

function flushQueue(instance: TourInstance): void {
  const queue = instance.outgoingQueue;
  instance.outgoingQueue = [];
  for (const message of queue) sendToIframe(instance, message);
}

// ---------------------------------------------------------------------------
// fullscreen fallback (iOS Safari doesn't reliably bubble iframe fullscreen)
// ---------------------------------------------------------------------------

function enterFullscreenFallback(instance: TourInstance): void {
  if (instance.fullscreen.active || !instance.iframe) return;
  const fs = instance.fullscreen;
  fs.active = true;
  fs.savedScrollY = window.scrollY;

  const body = document.body;
  fs.savedBodyStyle = {
    position: body.style.position,
    top: body.style.top,
    width: body.style.width,
    overflow: body.style.overflow,
  };
  body.style.position = "fixed";
  body.style.top = `-${fs.savedScrollY}px`;
  body.style.width = "100%";
  body.style.overflow = "hidden";

  const overlay = document.createElement("div");
  overlay.className = "tm-tour-fullscreen-overlay";
  const supportsDvh = typeof CSS !== "undefined" && CSS.supports && CSS.supports("height", "100dvh");
  overlay.style.cssText = `position:fixed;inset:0;z-index:2147483000;background:#000;height:${
    supportsDvh ? "100dvh" : "100vh"
  };width:100vw;`;

  // Move the existing iframe into the overlay rather than recreating it, so
  // the tour's in-memory state (scene, camera) is preserved.
  overlay.appendChild(instance.iframe);
  instance.iframe.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border:0;";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Cerrar pantalla completa");
  closeBtn.className = "tm-tour-fullscreen-close";
  // Lives in the PARENT DOM (not the iframe) so it stays tappable even if
  // the viewer inside the iframe becomes unresponsive.
  closeBtn.style.cssText =
    "position:fixed;top:12px;right:12px;z-index:2147483001;width:44px;height:44px;border-radius:50%;border:0;background:rgba(0,0,0,0.6);color:#fff;font-size:20px;line-height:1;cursor:pointer;";
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", () => exitFullscreenFallback(instance));
  overlay.appendChild(closeBtn);

  document.body.appendChild(overlay);
  fs.overlay = overlay;

  sendToIframe(
    instance,
    makeMessage("tour:command:enterFullscreenFallback:ack", instance.id, {}),
  );
}

function exitFullscreenFallback(instance: TourInstance): void {
  const fs = instance.fullscreen;
  if (!fs.active || !fs.overlay || !instance.iframe) return;

  instance.frameWrap.appendChild(instance.iframe);
  instance.iframe.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border:0;";

  fs.overlay.parentNode?.removeChild(fs.overlay);
  fs.overlay = null;
  fs.active = false;

  const body = document.body;
  body.style.position = fs.savedBodyStyle.position;
  body.style.top = fs.savedBodyStyle.top;
  body.style.width = fs.savedBodyStyle.width;
  body.style.overflow = fs.savedBodyStyle.overflow;
  window.scrollTo(0, fs.savedScrollY);
}

// ---------------------------------------------------------------------------
// deep links (mother page URL sync — replaceState only, never pushState)
// ---------------------------------------------------------------------------

function syncDeepLink(instance: TourInstance, next: Partial<DeepLinkParams>): void {
  const newSearch = writeDeepLinkParams(location.search, instance.deepLinkPrefix, next);
  const url = `${location.pathname}${newSearch}${location.hash}`;
  history.replaceState(history.state, "", url);
}

// ---------------------------------------------------------------------------
// inbound postMessage router
// ---------------------------------------------------------------------------

function handleIncoming(event: MessageEvent): void {
  // El origen esperado ya NO es una única constante global: cada instancia
  // puede apuntar a un subdominio distinto (dos `.tm-tour` en la misma
  // página pueden ser proyectos distintos), así que hace falta saber DE QUÉ
  // instancia es el mensaje antes de poder validar su origen. Por eso el
  // orden cambia respecto de antes: primero se mira la forma del mensaje
  // (barato, sin efecto — sólo lectura de `event.data`) para poder buscar
  // la instancia en el registro, y recién ahí se exige el chequeo estricto
  // de origen (`isTrustedOrigin`, nunca substring) contra el
  // `viewerOrigin` de ESA instancia puntual — antes de tocar nada del
  // `switch` de abajo, que es lo único que de verdad actúa sobre el
  // mensaje.
  if (!isTourMessage(event.data)) return;
  const message = event.data as IframeToParentMessage;
  if (!isKnownProtocolVersion(message.v)) return;

  const instance = registry.get(message.instance);
  if (!instance) return;

  if (!isTrustedOrigin(event.origin, instance.viewerOrigin)) return;

  switch (message.type) {
    case "tour:hello": {
      instance.helloReceived = true;
      clearWatchdog(instance);
      sendToIframe(
        instance,
        makeMessage("tour:init", instance.id, {
          tenant: instance.config.tenant,
          project: instance.config.project,
          unit: instance.config.unit ?? undefined,
          scene: instance.config.scene ?? undefined,
          aspect: `${instance.config.aspect.w}/${instance.config.aspect.h}`,
        }),
      );
      flushQueue(instance);
      break;
    }
    case "tour:ready": {
      emitClientEvent(instance, "ready", {});
      break;
    }
    case "tour:resize": {
      const height = message.payload.height;
      if (typeof height === "number" && height > 0) {
        instance.frameWrap.style.height = `${height}px`;
        instance.frameWrap.style.paddingTop = "0";
      }
      break;
    }
    case "tour:sceneView": {
      syncDeepLink(instance, { scene: message.payload.sceneId, unit: null });
      emitClientEvent(instance, "sceneView", { sceneId: message.payload.sceneId });
      break;
    }
    case "tour:unitView": {
      syncDeepLink(instance, { unit: message.payload.unitId });
      emitClientEvent(instance, "unitView", { unitId: message.payload.unitId });
      break;
    }
    case "tour:lotClick": {
      emitClientEvent(instance, "lotClick", {
        unitId: message.payload.unitId,
        status: message.payload.status,
      });
      break;
    }
    case "tour:leadIntent": {
      emitClientEvent(instance, "leadIntent", {
        unitId: message.payload.unitId,
        source: message.payload.source,
      });
      break;
    }
    case "tour:deeplink": {
      syncDeepLink(instance, {
        unit: message.payload.unitId ?? null,
        scene: message.payload.sceneId ?? null,
      });
      emitClientEvent(instance, "deeplink", message.payload as unknown as Record<string, unknown>);
      break;
    }
    case "tour:error": {
      emitClientEvent(instance, "error", {
        message: message.payload.message,
        code: message.payload.code,
      });
      break;
    }
    case "tour:requestFullscreenFallback": {
      enterFullscreenFallback(instance);
      break;
    }
    case "tour:exitFullscreenFallback": {
      exitFullscreenFallback(instance);
      break;
    }
    default:
      break;
  }
}

let listenerInstalled = false;
function ensureMessageListener(): void {
  if (listenerInstalled) return;
  listenerInstalled = true;
  window.addEventListener("message", handleIncoming);
}

// ---------------------------------------------------------------------------
// mounting
// ---------------------------------------------------------------------------

function mountOne(el: HTMLElement, index: number, total: number): void {
  if (el.hasAttribute(MOUNTED_ATTR)) return;

  let config: ParsedTourElementConfig;
  try {
    config = parseTourDataset(el.dataset);
  } catch (err) {
    el.setAttribute(MOUNTED_ATTR, "true");
    const message = err instanceof ConfigError ? err.message : "invalid tour configuration";
    // eslint-disable-next-line no-console
    console.error(`[tumarca-embed] ${message}`, el);
    return;
  }

  // Compatibilidad con snippets viejos: si falta `data-subdomain`,
  // `parseTourDataset` ya resolvió el subdominio usando `data-project` como
  // respaldo (ver el comentario de esa función en `config.ts`) — el embed
  // NO se rompe en silencio, sigue funcionando, pero avisamos bien claro
  // por qué conviene corregirlo (el respaldo puede ser incorrecto si el
  // slug del proyecto y el subdominio real llegaran a divergir).
  if (config.subdomainFromProjectFallback) {
    // eslint-disable-next-line no-console
    console.warn(
      `[tumarca-embed] falta data-subdomain en este .tm-tour — usando data-project ("${config.project}") ` +
        `como subdominio de la plataforma. Si el subdominio real es distinto, agregá ` +
        `data-subdomain="tu-subdominio" al contenedor.`,
      el,
    );
  }

  const id = nextInstanceId();
  el.setAttribute(INSTANCE_ATTR, id);
  const { root, frameWrap, posterBtn } = buildDom(el, config);
  root.appendChild(buildSeoBlock({ id, el, config } as TourInstance));

  const instance: TourInstance = {
    id,
    el,
    root,
    frameWrap,
    iframe: null,
    posterBtn,
    config,
    viewerOrigin: resolveInstanceViewerOrigin(config.subdomain),
    deepLinkPrefix: buildDeepLinkPrefix(index, total),
    observer: null,
    outgoingQueue: [],
    helloReceived: false,
    watchdogTimer: null,
    fullscreen: {
      active: false,
      overlay: null,
      savedScrollY: 0,
      savedBodyStyle: { position: "", top: "", width: "", overflow: "" },
    },
  };
  registry.set(id, instance);

  posterBtn.addEventListener("click", () => loadIframe(instance));

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            loadIframe(instance);
            observer.disconnect();
          }
        }
      },
      { rootMargin: ROOT_MARGIN },
    );
    observer.observe(root);
    instance.observer = observer;
  } else {
    // No IntersectionObserver support: fall back to loading immediately
    // rather than never loading at all.
    loadIframe(instance);
  }
}

function scan(): void {
  ensureMessageListener();
  const nodeList = document.querySelectorAll<HTMLElement>(`${SELECTOR}:not([${MOUNTED_ATTR}])`);
  const els = Array.prototype.slice.call(nodeList) as HTMLElement[];
  const total = document.querySelectorAll(SELECTOR).length;
  const alreadyMounted = total - els.length;
  els.forEach((el, i) => mountOne(el, alreadyMounted + i, total));
}

function init(): void {
  scan();
}

/**
 * Public API for client sites to command a mounted tour, e.g. a "View this
 * unit" link elsewhere on the page:
 *   window.tumarcaEmbed.goToUnit(document.querySelector('.tm-tour'), 'B2-A')
 */
function goToUnit(el: Element, unitId: string): void {
  const id = el.getAttribute(INSTANCE_ATTR);
  const instance = id ? registry.get(id) : undefined;
  if (!instance) return;
  sendToIframe(instance, makeMessage("tour:command:goToUnit", instance.id, { unitId }));
}

window.tumarcaEmbed = {
  init,
  goToUnit,
  VERSION: "1.0.0",
  PROTOCOL_VERSION,
};

// Support both "script tag runs after DOM is parsed" (typical for `async`)
// and "script tag runs before DOMContentLoaded" (rare, but cheap to cover).
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Re-exported so these constants are discoverable/testable from outside; not
// used by any consumer today.
export { VIEWER_BASE_DOMAIN, EMBED_ORIGIN };
