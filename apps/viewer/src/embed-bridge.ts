/**
 * Lado del visor del protocolo de embed (`@r360/embed`, ver
 * `apps/embed/src/protocol.ts`, que es la fuente de verdad del contrato y el
 * módulo que este archivo importa directamente — como anticipa el README de
 * ese paquete).
 *
 * Este módulo es la ÚNICA puerta de entrada del recorrido al mundo del
 * `postMessage`: si el visor NO está corriendo dentro del iframe que arma el
 * loader (`v1.ts`), `initEmbedBridge` no hace absolutamente nada — ni un
 * listener, ni un mensaje, ni una lectura de `document.referrer` con efecto
 * visible. El build standalone (el que sirve el sitio completo) queda
 * bit a bit igual que antes de este archivo existir.
 *
 * ORIGEN DEL PADRE, el problema no obvio de este puente: el loader vive en
 * el sitio de CUALQUIER cliente (dacal.com.uy, el Wix de otro, etc.), así
 * que a diferencia del loader —que sí conoce `VIEWER_ORIGIN` de antemano
 * porque es una constante suya— el visor NO tiene forma de saber a qué
 * origen le tiene que hablar antes de que llegue el primer mensaje. Y como
 * el protocolo prohíbe `'*'` como target de `postMessage` (spoofing: cualquier
 * script de la página, o de un iframe hermano, podría hacerse pasar por el
 * padre), hace falta averiguar el origen ANTES de mandar el primer
 * `tour:hello`. La señal que da el navegador para esto es `document.referrer`:
 * cuando el loader crea el iframe con `iframe.src = ...` es una navegación
 * cross-origin de verdad, y con la política de referrer por defecto de los
 * navegadores modernos (`strict-origin-when-cross-origin`, y ninguna de las
 * plataformas del README —WordPress, Wix, Webflow, GTM— pide otra cosa) el
 * documento cargado adentro recibe el ORIGEN del padre (sin path) como
 * `document.referrer`. Es el mismo mecanismo, mirado desde el otro lado, que
 * usa `isTrustedOrigin` para todo lo demás: comparación exacta, nunca
 * substring. Si el referrer viniera vacío (política de referrer más estricta
 * del lado del cliente, modo privado, o un navegador que lo recorta) este
 * módulo se queda callado a propósito — es preferible un embed que nunca
 * conecta (y dispara el watchdog de 8s del loader, con su mensaje de consola
 * bien explícito) a uno que le habla a un origen que no verificó.
 */
import {
  isKnownProtocolVersion,
  isTourMessage,
  isTrustedOrigin,
  makeMessage,
  type FullscreenFallbackReason,
  type IframeToParentMessage,
  type ParentToIframeMessage,
  type TourInitConfig,
} from '@r360/embed';
import type { TourManifest } from '@r360/core';
import type { SceneController, UnitClickPayload } from './scenes.ts';
import type { CtaEventDetail } from './contact.ts';

// Informativo únicamente: viaja en `tour:hello` pero el protocolo no lo
// valida ni lo usa para nada (de eso se ocupa `v`, la versión del contrato,
// que sí se chequea). Nadie lo lee todavía del lado del loader; si el día de
// mañana importa, es un valor más para actualizar a mano.
const VIEWER_VERSION = '0.1.0';

/**
 * Réplica mínima de `parseHash` (`scenes.ts`): sólo lo que hace falta acá,
 * leer si el visitante ya trae puesto un `#/scene/x/unit/y` propio. No se
 * importa de `scenes.ts` a propósito — ese módulo arrastra Photo Sphere
 * Viewer y Leaflet, y sus clases usan "parameter properties" de TypeScript,
 * una sintaxis que el runner de tests de Node (`--experimental-strip-types`)
 * no soporta; importarlo rompería la ejecución de `embed-bridge.test.ts`.
 * Mismo criterio que ya usa `contact.ts::deepLink` (ver su comentario) para
 * no depender de `scenes.ts` en código que se testea con `node:test`. Si el
 * formato del hash cambiara, hay que actualizar los dos lugares.
 */
function parseTourHash(hash: string): { slug: string | null; unitCode: string | null } {
  const m = /^#\/scene\/([^/]+)(?:\/unit\/([^/?#]+))?/.exec(hash);
  if (!m) return { slug: null, unitCode: null };
  return { slug: decodeURIComponent(m[1]!), unitCode: m[2] ? decodeURIComponent(m[2]) : null };
}

// -----------------------------------------------------------------------
// Helpers puros — sin DOM, testeados con `node:test` como el resto del
// visor (ver comentario de cabecera de `contact.ts`).
// -----------------------------------------------------------------------

/**
 * ¿Corresponde activar el puente? Las dos señales que deja el propio loader:
 * estar dentro de un iframe (`window.parent !== window`) y traer el
 * `?instance=...` que `buildIframeSrc` graba en la URL antes de que exista
 * ningún `postMessage` (ver el comentario de esa función en `config.ts`).
 * Cualquiera de las dos faltando y no hay nada que hacer acá.
 */
export function isEmbedContext(hasParentWindow: boolean, search: string): boolean {
  return hasParentWindow && new URLSearchParams(search).has('instance');
}

/**
 * El origen del padre, deducido de `document.referrer` (ver comentario de
 * cabecera). `null` cuando no se puede confiar en nada: referrer vacío, o
 * algo que ni siquiera es una URL parseable.
 */
export function resolveExpectedParentOrigin(referrer: string): string | null {
  if (!referrer) return null;
  try {
    const origin = new URL(referrer).origin;
    // Un origen "opaco" (documento sandboxeado, `data:`, etc.) parsea como
    // el string literal "null" — no es un origen contra el que se pueda
    // comparar con `isTrustedOrigin`.
    return origin && origin !== 'null' ? origin : null;
  } catch {
    return null;
  }
}

const PARENT_MESSAGE_TYPES: ReadonlySet<ParentToIframeMessage['type']> = new Set([
  'tour:init',
  'tour:command:goToUnit',
  'tour:command:enterFullscreenFallback:ack',
]);

/**
 * Valida un mensaje entrante contra TODO lo que el protocolo pide: origen
 * exacto (nunca substring, ver `isTrustedOrigin`), canal + versión conocida
 * (`isTourMessage`/`isKnownProtocolVersion`), y que sea de la dirección que
 * corresponde (padre → iframe) — un mensaje con forma válida pero de los
 * que el visor mismo manda (`tour:hello`, por ejemplo) se ignora igual: si
 * algún día rebota o alguien lo reenvía por error, no hay que tratarlo como
 * un comando real.
 */
export function parseIncomingParentMessage(
  data: unknown,
  eventOrigin: string,
  expectedOrigin: string,
): ParentToIframeMessage | null {
  if (!isTrustedOrigin(eventOrigin, expectedOrigin)) return null;
  if (!isTourMessage(data)) return null;
  if (!isKnownProtocolVersion(data.v)) return null;
  if (!PARENT_MESSAGE_TYPES.has(data.type as ParentToIframeMessage['type'])) return null;
  return data as ParentToIframeMessage;
}

/**
 * `reason` de `tour:requestFullscreenFallback`. No hay API estándar para
 * "¿esto es iOS Safari?" — el propio contrato (`FullscreenFallbackReason`)
 * asume que quien lo llena lo infiere del User-Agent, así que se infiere acá
 * con el mismo criterio de siempre (excluir los navegadores que en iOS son
 * Safari por dentro pero declaran su propio nombre: Chrome, Firefox, Edge).
 */
export function fullscreenFallbackReason(userAgent: string): FullscreenFallbackReason {
  const isIOS = /iP(hone|ad|od)/.test(userAgent);
  const isSafari = /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent);
  return isIOS && isSafari ? 'ios-safari' : 'unsupported-api';
}

/**
 * Aplica el `unit`/`scene` de `tour:init` — pero sólo cuando de verdad hace
 * falta y no pisa nada. Dos guardas, en este orden:
 *
 *  1. `controller.slug` nulo = la bienvenida o un tramo del recorrido guiado
 *     está en pantalla (`main.ts` no llamó `controller.start()` todavía, ver
 *     `abreEnElRecorrido`). Forzar un salto ahí sería la clase de cambio
 *     visual que esta tarea tiene prohibido tocar, así que se espera: si el
 *     visitante llega a una escena por su cuenta, ese `slug` deja de ser
 *     nulo y un `tour:init` posterior (o el que quedó pendiente) sí se
 *     aplica.
 *  2. El hash YA trae una ruta propia (`#/scene/x/unit/y`) — el deep link
 *     que el visitante trajo puesto manda sobre el que le sugiere el padre
 *     (mismo criterio de precedencia que ya usa `landOnDeepLink` en
 *     `main.ts`).
 */
export function applyInitIfNeeded(
  payload: TourInitConfig,
  controller: Pick<SceneController, 'slug' | 'goTo'>,
  currentHash: string,
): void {
  if (!payload.scene && !payload.unit) return;
  const slug = controller.slug;
  if (!slug) return;
  const route = parseTourHash(currentHash);
  if (route.slug || route.unitCode) return;
  controller.goTo(payload.scene ?? slug, payload.unit ?? null);
}

// -----------------------------------------------------------------------
// Núcleo inyectable — misma lógica que usa `initEmbedBridge` en producción,
// pero recibiendo sus dependencias de DOM como funciones (`EmbedBridgeEnv`)
// en vez de leer `window`/`document` directamente. Así se puede testear con
// `node:test` sin `jsdom`: los tests le pasan un `env` de mentira y verifican
// qué mensajes salieron, sin necesitar un navegador real.
// -----------------------------------------------------------------------

/** Superficie mínima de `HTMLElement` que este módulo necesita: escuchar los
 *  `CustomEvent` `r360:*` que el visor ya emite. */
export interface EmbedEventTarget {
  addEventListener(type: string, listener: (e: Event) => void): void;
}

export interface EmbedBridgeEnv {
  /** `window.parent !== window`. */
  hasParentWindow: boolean;
  /** `location.search`, crudo. */
  search: string;
  /** `document.referrer`, crudo. */
  referrer: string;
  /** `navigator.userAgent`, sólo para `fullscreenFallbackReason`. */
  userAgent: string;
  /** Lee `location.hash` al momento de usarlo (no una foto vieja). */
  getHash: () => string;
  /** Manda un mensaje al padre. Producción: `window.parent.postMessage`. */
  postToParent: (message: IframeToParentMessage, targetOrigin: string) => void;
  /** Se suscribe a mensajes entrantes ya separados en `data`/`origin`. */
  onParentMessage: (handler: (data: unknown, origin: string) => void) => void;
  /** Se suscribe al evento estándar `fullscreenerror` del documento. */
  onFullscreenError: (handler: () => void) => void;
  /** El nodo del que cuelgan los `r360:scene` / `r360:unit-view` / etc. */
  container: EmbedEventTarget;
  /** Inyectable sólo para tests silenciosos; producción usa `console.warn`. */
  warn?: (message: string) => void;
}

export interface EmbedBridgeHandle {
  /** Llamar cuando `mountViewer` resuelve: manda `tour:ready`, aplica
   *  cualquier `tour:init`/`tour:command:goToUnit` que haya llegado antes.
   *  Tipos acotados a lo que este módulo realmente lee/llama (`tour.start`,
   *  `controller.slug`/`goTo`) — no a la clase entera, para poder testear
   *  con objetos livianos en vez de instanciar un `SceneController` real. */
  ready(tour: Pick<TourManifest, 'start'>, controller: Pick<SceneController, 'slug' | 'goTo'>): void;
  /** Llamar si `mountViewer` rechaza: el watchdog del loader igual va a
   *  disparar a los 8s, pero esto le da al padre el motivo real antes. */
  error(message: string, code?: string): void;
}

/** Payload de `tour:lotClick`, o `null` cuando el hotspot no tiene unidad
 *  (un punto de interés informativo, ver `PanoramaRenderer`/`onUnitClick`) —
 *  el protocolo pide `unitId` obligatorio, así que sin código no hay mensaje. */
function lotClickPayload(p: UnitClickPayload): { unitId: string; status?: string } | null {
  return p.unitCode ? { unitId: p.unitCode, status: p.facts?.status } : null;
}

export function createEmbedBridge(env: EmbedBridgeEnv): EmbedBridgeHandle | null {
  if (!isEmbedContext(env.hasParentWindow, env.search)) return null;
  const instance = new URLSearchParams(env.search).get('instance');
  if (!instance) return null; // cubierto arriba por isEmbedContext; guarda explícita para TS

  const expectedOrigin = resolveExpectedParentOrigin(env.referrer);
  if (!expectedOrigin) {
    (env.warn ?? console.warn)(
      '[r360] embed: no se pudo determinar el origen del padre (document.referrer vacío o no ' +
        'parseable); no se establece el puente de postMessage. El watchdog del loader va a ' +
        'disparar tm:loadError a los 8s.',
    );
    return null;
  }

  let ready = false;
  let liveTour: Pick<TourManifest, 'start'> | null = null;
  let liveController: Pick<SceneController, 'slug' | 'goTo'> | null = null;
  let pendingInit: TourInitConfig | null = null;
  let pendingGoToUnit: string | null = null;

  // El primer mensaje del protocolo, apenas este módulo corre — antes de
  // pedir tour.json, antes de montar nada. Es la carrera contra el watchdog
  // de 8s del loader (`HELLO_WATCHDOG_MS`), y el arranque del visor puede
  // tardar (4G rural, ver comentario de cabecera de `main.ts`): cuanto antes
  // salga este mensaje, más margen queda.
  env.postToParent(makeMessage('tour:hello', instance, { viewerVersion: VIEWER_VERSION }), expectedOrigin);

  env.onParentMessage((data, origin) => {
    const message = parseIncomingParentMessage(data, origin, expectedOrigin);
    if (!message) return; // canal/versión/origen distinto, o dirección equivocada: se ignora en silencio

    switch (message.type) {
      case 'tour:init':
        if (liveController) applyInitIfNeeded(message.payload, liveController, env.getHash());
        else pendingInit = message.payload;
        break;
      case 'tour:command:goToUnit':
        if (liveController && liveTour) {
          liveController.goTo(liveController.slug ?? liveTour.start, message.payload.unitId);
        } else {
          pendingGoToUnit = message.payload.unitId;
        }
        break;
      case 'tour:command:enterFullscreenFallback:ack':
        // El padre ya movió NUESTRO iframe (el mismo nodo, no uno nuevo) a
        // su overlay de pantalla completa simulada. El botón para salir
        // vive a propósito en el DOM del padre —no acá— precisamente para
        // que siga respondiendo aunque el visor se cuelgue (ver el
        // comentario de `enterFullscreenFallback` en `v1.ts`), así que del
        // lado del visor no hay nada que este ack tenga que disparar.
        break;
      default:
        break;
    }
  });

  env.onFullscreenError(() => {
    env.postToParent(
      makeMessage('tour:requestFullscreenFallback', instance, { reason: fullscreenFallbackReason(env.userAgent) }),
      expectedOrigin,
    );
  });

  env.container.addEventListener('r360:scene', (e) => {
    const d = (e as CustomEvent<{ slug: string | null; unitCode: string | null }>).detail;
    if (d.slug) env.postToParent(makeMessage('tour:sceneView', instance, { sceneId: d.slug }), expectedOrigin);
  });

  env.container.addEventListener('r360:unit-view', (e) => {
    const d = (e as CustomEvent<{ unitCode: string }>).detail;
    if (d.unitCode) env.postToParent(makeMessage('tour:unitView', instance, { unitId: d.unitCode }), expectedOrigin);
  });

  env.container.addEventListener('r360:unit-click', (e) => {
    const d = (e as CustomEvent<UnitClickPayload>).detail;
    const payload = lotClickPayload(d);
    if (payload) env.postToParent(makeMessage('tour:lotClick', instance, payload), expectedOrigin);
  });

  env.container.addEventListener('r360:cta', (e) => {
    const d = (e as CustomEvent<CtaEventDetail>).detail;
    env.postToParent(
      makeMessage('tour:leadIntent', instance, { unitId: d.unitCode ?? undefined, source: d.kind ?? undefined }),
      expectedOrigin,
    );
  });

  return {
    ready(tour, controller) {
      if (ready) return; // por si `mountViewer` resolviera dos veces; no debería pasar
      ready = true;
      liveTour = tour;
      liveController = controller;
      env.postToParent(makeMessage('tour:ready', instance, {}), expectedOrigin);
      if (pendingGoToUnit) {
        controller.goTo(controller.slug ?? tour.start, pendingGoToUnit);
        pendingGoToUnit = null;
      }
      if (pendingInit) {
        applyInitIfNeeded(pendingInit, controller, env.getHash());
        pendingInit = null;
      }
    },
    error(message, code) {
      env.postToParent(makeMessage('tour:error', instance, { message, code }), expectedOrigin);
    },
  };
}

/**
 * Punto de entrada real, el que usa `main.ts`. Arma el `EmbedBridgeEnv` con
 * las APIs de navegador de verdad y delega en `createEmbedBridge`. `null`
 * cuando no corresponde activar nada (ver `isEmbedContext` y la nota de
 * `document.referrer` en la cabecera del archivo) — el llamador debe tratar
 * ese `null` como "no hacer nada", nunca como un error.
 */
export function initEmbedBridge(container: HTMLElement): EmbedBridgeHandle | null {
  return createEmbedBridge({
    hasParentWindow: window.parent !== window,
    search: location.search,
    referrer: document.referrer,
    userAgent: navigator.userAgent,
    getHash: () => location.hash,
    postToParent(message, targetOrigin) {
      try {
        window.parent.postMessage(message, targetOrigin);
      } catch {
        // No debería tirar contra un origen válido, pero un `postMessage`
        // fallido no puede romperle nada al visitante (mismo criterio que
        // `registerLead` en `contact.ts`).
      }
    },
    onParentMessage(handler) {
      window.addEventListener('message', (e) => handler(e.data, e.origin));
    },
    onFullscreenError(handler) {
      document.addEventListener('fullscreenerror', handler);
    },
    container,
  });
}
