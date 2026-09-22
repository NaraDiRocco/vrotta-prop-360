import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROTOCOL_CHANNEL, PROTOCOL_VERSION, makeMessage } from '@r360/embed';
import {
  applyInitIfNeeded,
  createEmbedBridge,
  fullscreenFallbackReason,
  isEmbedContext,
  parseIncomingParentMessage,
  resolveExpectedParentOrigin,
  type EmbedBridgeEnv,
  type EmbedEventTarget,
} from './embed-bridge.ts';

const PARENT_ORIGIN = 'https://dacal.com.uy';

// ------------------------------------------------------------- fakes de DOM

/** `EmbedEventTarget` de mentira: guarda los listeners y permite dispararlos
 *  a mano, sin necesitar un `HTMLElement` real (no hay `jsdom` en este
 *  paquete — mismo criterio que el resto del visor, ver cabecera de
 *  `contact.ts`: la lógica de DOM se prueba por sus partes puras). */
function fakeContainer(): EmbedEventTarget & { fire(type: string, detail: unknown): void } {
  const listeners = new Map<string, Array<(e: Event) => void>>();
  return {
    addEventListener(type, listener) {
      const list = listeners.get(type) ?? [];
      list.push(listener);
      listeners.set(type, list);
    },
    fire(type, detail) {
      for (const listener of listeners.get(type) ?? []) {
        listener({ detail } as unknown as Event);
      }
    },
  };
}

interface FakeEnv extends EmbedBridgeEnv {
  sent: Array<{ message: unknown; targetOrigin: string }>;
  warnings: string[];
  emitParentMessage: (data: unknown, origin: string) => void;
  emitFullscreenError: () => void;
}

function fakeEnv(overrides: Partial<EmbedBridgeEnv> = {}): FakeEnv {
  const sent: Array<{ message: unknown; targetOrigin: string }> = [];
  const warnings: string[] = [];
  let parentMessageHandler: ((data: unknown, origin: string) => void) | null = null;
  let fullscreenErrorHandler: (() => void) | null = null;

  const env: FakeEnv = {
    hasParentWindow: true,
    search: '?instance=tm1',
    referrer: `${PARENT_ORIGIN}/baleia`,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128',
    getHash: () => '',
    container: fakeContainer(),
    postToParent(message, targetOrigin) {
      sent.push({ message, targetOrigin });
    },
    onParentMessage(handler) {
      parentMessageHandler = handler;
    },
    onFullscreenError(handler) {
      fullscreenErrorHandler = handler;
    },
    warn(message) {
      warnings.push(message);
    },
    sent,
    warnings,
    emitParentMessage: (data, origin) => parentMessageHandler?.(data, origin),
    emitFullscreenError: () => fullscreenErrorHandler?.(),
    ...overrides,
  };
  return env;
}

// -------------------------------------------------------------- isEmbedContext

test('isEmbedContext: hace falta estar en un iframe Y traer ?instance=', () => {
  assert.equal(isEmbedContext(true, '?instance=tm1'), true);
  assert.equal(isEmbedContext(false, '?instance=tm1'), false); // no hay iframe
  assert.equal(isEmbedContext(true, ''), false); // no vino de buildIframeSrc
  assert.equal(isEmbedContext(true, '?tenant=dacal'), false); // instance ausente
});

// ------------------------------------------------------ resolveExpectedParentOrigin

test('resolveExpectedParentOrigin: se queda sólo con esquema+host+puerto', () => {
  assert.equal(resolveExpectedParentOrigin('https://dacal.com.uy/baleia?x=1'), 'https://dacal.com.uy');
  assert.equal(resolveExpectedParentOrigin('https://dacal.com.uy:8443/baleia'), 'https://dacal.com.uy:8443');
});

test('resolveExpectedParentOrigin: sin referrer no hay origen de confianza', () => {
  assert.equal(resolveExpectedParentOrigin(''), null);
  assert.equal(resolveExpectedParentOrigin('no-es-una-url'), null);
});

// --------------------------------------------------------- parseIncomingParentMessage

test('parseIncomingParentMessage: acepta tour:init de la dirección y origen correctos', () => {
  const msg = makeMessage('tour:init', 'tm1', { tenant: 'dacal', project: 'baleia' });
  const parsed = parseIncomingParentMessage(msg, PARENT_ORIGIN, PARENT_ORIGIN);
  assert.deepEqual(parsed, msg);
});

test('parseIncomingParentMessage: rechaza origen distinto (nunca substring)', () => {
  const msg = makeMessage('tour:init', 'tm1', { tenant: 'dacal', project: 'baleia' });
  assert.equal(parseIncomingParentMessage(msg, 'https://dacal.com.uy.evil.com', PARENT_ORIGIN), null);
});

test('parseIncomingParentMessage: ignora otro canal', () => {
  const ajeno = { channel: 'otro-widget', v: PROTOCOL_VERSION, instance: 'tm1', type: 'tour:init', payload: {} };
  assert.equal(parseIncomingParentMessage(ajeno, PARENT_ORIGIN, PARENT_ORIGIN), null);
});

test('parseIncomingParentMessage: ignora otra versión de protocolo', () => {
  const otraVersion = {
    channel: PROTOCOL_CHANNEL,
    v: 999,
    instance: 'tm1',
    type: 'tour:init',
    payload: { tenant: 'dacal', project: 'baleia' },
  };
  assert.equal(parseIncomingParentMessage(otraVersion, PARENT_ORIGIN, PARENT_ORIGIN), null);
});

test('parseIncomingParentMessage: ignora mensajes de la dirección contraria (iframe→padre)', () => {
  // Forma válida (mismo canal/versión/origen) pero es un mensaje que el
  // VISOR manda, no uno que tenga que recibir.
  const hello = makeMessage('tour:hello', 'tm1', { viewerVersion: '1.0.0' });
  assert.equal(parseIncomingParentMessage(hello, PARENT_ORIGIN, PARENT_ORIGIN), null);
});

test('parseIncomingParentMessage: acepta los tres tipos padre→iframe', () => {
  const goToUnit = makeMessage('tour:command:goToUnit', 'tm1', { unitId: 'B2-A' });
  const ack = makeMessage('tour:command:enterFullscreenFallback:ack', 'tm1', {});
  assert.notEqual(parseIncomingParentMessage(goToUnit, PARENT_ORIGIN, PARENT_ORIGIN), null);
  assert.notEqual(parseIncomingParentMessage(ack, PARENT_ORIGIN, PARENT_ORIGIN), null);
});

// -------------------------------------------------------------- fullscreenFallbackReason

test('fullscreenFallbackReason: iPhone/Safari es el caso "ios-safari"', () => {
  const ua =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/604.1';
  assert.equal(fullscreenFallbackReason(ua), 'ios-safari');
});

test('fullscreenFallbackReason: Chrome en iOS lleva "Safari" en el UA pero no es Safari de verdad', () => {
  const ua =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1';
  assert.equal(fullscreenFallbackReason(ua), 'unsupported-api');
});

test('fullscreenFallbackReason: Android/desktop caen al genérico', () => {
  assert.equal(fullscreenFallbackReason('Mozilla/5.0 (Linux; Android 14) Chrome/128 Mobile'), 'unsupported-api');
  assert.equal(fullscreenFallbackReason('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128'), 'unsupported-api');
});

// ------------------------------------------------------------------ applyInitIfNeeded

function fakeController(slug: string | null) {
  const calls: Array<{ slug: string; unitCode: string | null }> = [];
  return {
    get slug() {
      return slug;
    },
    goTo(s: string, unitCode: string | null = null) {
      calls.push({ slug: s, unitCode });
    },
    calls,
  };
}

test('applyInitIfNeeded: sin scene ni unit en el payload, no hace nada', () => {
  const controller = fakeController('llegada');
  applyInitIfNeeded({ tenant: 'dacal', project: 'baleia' }, controller, '');
  assert.deepEqual(controller.calls, []);
});

test('applyInitIfNeeded: con la bienvenida en pantalla (slug nulo) no fuerza un salto', () => {
  const controller = fakeController(null);
  applyInitIfNeeded({ tenant: 'dacal', project: 'baleia', unit: 'B2-A' }, controller, '');
  assert.deepEqual(controller.calls, []);
});

test('applyInitIfNeeded: un hash propio (el visitante ya trae deep link) manda sobre el del padre', () => {
  const controller = fakeController('llegada');
  applyInitIfNeeded(
    { tenant: 'dacal', project: 'baleia', unit: 'B2-A' },
    controller,
    '#/scene/masterplan/unit/C4-B',
  );
  assert.deepEqual(controller.calls, []);
});

test('applyInitIfNeeded: sin hash propio, navega a la escena/unidad del padre', () => {
  const controller = fakeController('llegada');
  applyInitIfNeeded({ tenant: 'dacal', project: 'baleia', scene: 'masterplan', unit: 'B2-A' }, controller, '');
  assert.deepEqual(controller.calls, [{ slug: 'masterplan', unitCode: 'B2-A' }]);
});

// -------------------------------------------------------------------- createEmbedBridge

test('createEmbedBridge: fuera de un iframe, no hace absolutamente nada', () => {
  const env = fakeEnv({ hasParentWindow: false });
  const bridge = createEmbedBridge(env);
  assert.equal(bridge, null);
  assert.deepEqual(env.sent, []);
});

test('createEmbedBridge: sin ?instance= en la URL, tampoco', () => {
  const env = fakeEnv({ search: '' });
  const bridge = createEmbedBridge(env);
  assert.equal(bridge, null);
  assert.deepEqual(env.sent, []);
});

test('createEmbedBridge: sin referrer no manda nada y avisa por qué', () => {
  const env = fakeEnv({ referrer: '' });
  const bridge = createEmbedBridge(env);
  assert.equal(bridge, null);
  assert.deepEqual(env.sent, []);
  assert.equal(env.warnings.length, 1);
});

test('createEmbedBridge: embebido de verdad, anuncia tour:hello de inmediato', () => {
  const env = fakeEnv();
  const bridge = createEmbedBridge(env);
  assert.notEqual(bridge, null);
  assert.equal(env.sent.length, 1);
  assert.equal(env.sent[0]!.targetOrigin, PARENT_ORIGIN);
  const msg = env.sent[0]!.message as ReturnType<typeof makeMessage>;
  assert.equal(msg.channel, PROTOCOL_CHANNEL);
  assert.equal(msg.v, PROTOCOL_VERSION);
  assert.equal(msg.instance, 'tm1');
  assert.equal(msg.type, 'tour:hello');
});

test('createEmbedBridge: ready() manda tour:ready', () => {
  const env = fakeEnv();
  const bridge = createEmbedBridge(env)!;
  const controller = fakeController('llegada');
  bridge.ready({ start: 'llegada' }, controller);
  const readyMsg = env.sent.find((s) => (s.message as { type: string }).type === 'tour:ready');
  assert.notEqual(readyMsg, undefined);
});

test('createEmbedBridge: error() manda tour:error con el motivo', () => {
  const env = fakeEnv();
  const bridge = createEmbedBridge(env)!;
  bridge.error('tour.json 500', 'FETCH_FAILED');
  const errMsg = env.sent.find((s) => (s.message as { type: string }).type === 'tour:error');
  assert.deepEqual((errMsg?.message as { payload: unknown }).payload, { message: 'tour.json 500', code: 'FETCH_FAILED' });
});

test('createEmbedBridge: ignora un mensaje entrante de otro origen', () => {
  const env = fakeEnv();
  const bridge = createEmbedBridge(env)!;
  const controller = fakeController('llegada');
  bridge.ready({ start: 'llegada' }, controller);
  const goToUnit = makeMessage('tour:command:goToUnit', 'tm1', { unitId: 'B2-A' });
  env.emitParentMessage(goToUnit, 'https://un-sitio-cualquiera.com');
  assert.deepEqual(controller.calls, []);
});

test('createEmbedBridge: tour:command:goToUnit llegado antes de ready() queda pendiente y se aplica después', () => {
  const env = fakeEnv();
  const bridge = createEmbedBridge(env)!;
  env.emitParentMessage(makeMessage('tour:command:goToUnit', 'tm1', { unitId: 'B2-A' }), PARENT_ORIGIN);
  const controller = fakeController('llegada');
  bridge.ready({ start: 'llegada' }, controller);
  assert.deepEqual(controller.calls, [{ slug: 'llegada', unitCode: 'B2-A' }]);
});

test('createEmbedBridge: r360:scene se traduce a tour:sceneView', () => {
  const env = fakeEnv();
  const bridge = createEmbedBridge(env)!;
  bridge.ready({ start: 'llegada' }, fakeController('llegada'));
  (env.container as ReturnType<typeof fakeContainer>).fire('r360:scene', { slug: 'masterplan', unitCode: null });
  const msg = env.sent.find((s) => (s.message as { type: string }).type === 'tour:sceneView');
  assert.deepEqual((msg?.message as { payload: unknown }).payload, { sceneId: 'masterplan' });
});

test('createEmbedBridge: r360:unit-view se traduce a tour:unitView', () => {
  const env = fakeEnv();
  const bridge = createEmbedBridge(env)!;
  bridge.ready({ start: 'llegada' }, fakeController('llegada'));
  (env.container as ReturnType<typeof fakeContainer>).fire('r360:unit-view', { unitCode: 'B2-A' });
  const msg = env.sent.find((s) => (s.message as { type: string }).type === 'tour:unitView');
  assert.deepEqual((msg?.message as { payload: unknown }).payload, { unitId: 'B2-A' });
});

test('createEmbedBridge: r360:unit-click con unidad se traduce a tour:lotClick', () => {
  const env = fakeEnv();
  const bridge = createEmbedBridge(env)!;
  bridge.ready({ start: 'llegada' }, fakeController('llegada'));
  (env.container as ReturnType<typeof fakeContainer>).fire('r360:unit-click', {
    hotspotId: 'h1',
    unitCode: 'B2-A',
    facts: { status: 'disponible' },
  });
  const msg = env.sent.find((s) => (s.message as { type: string }).type === 'tour:lotClick');
  assert.deepEqual((msg?.message as { payload: unknown }).payload, { unitId: 'B2-A', status: 'disponible' });
});

test('createEmbedBridge: r360:unit-click sin unidad (punto informativo) no manda tour:lotClick', () => {
  const env = fakeEnv();
  const bridge = createEmbedBridge(env)!;
  bridge.ready({ start: 'llegada' }, fakeController('llegada'));
  (env.container as ReturnType<typeof fakeContainer>).fire('r360:unit-click', {
    hotspotId: 'h1',
    unitCode: null,
    facts: { status: 'disponible' },
  });
  assert.equal(env.sent.some((s) => (s.message as { type: string }).type === 'tour:lotClick'), false);
});

test('createEmbedBridge: r360:cta se traduce a tour:leadIntent', () => {
  const env = fakeEnv();
  const bridge = createEmbedBridge(env)!;
  bridge.ready({ start: 'llegada' }, fakeController('llegada'));
  (env.container as ReturnType<typeof fakeContainer>).fire('r360:cta', { unitCode: 'B2-A', kind: 'unit', message: 'Hola!' });
  const msg = env.sent.find((s) => (s.message as { type: string }).type === 'tour:leadIntent');
  assert.deepEqual((msg?.message as { payload: unknown }).payload, { unitId: 'B2-A', source: 'unit' });
});

test('createEmbedBridge: fullscreenerror dispara tour:requestFullscreenFallback', () => {
  const env = fakeEnv({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128' });
  createEmbedBridge(env);
  env.emitFullscreenError();
  const msg = env.sent.find((s) => (s.message as { type: string }).type === 'tour:requestFullscreenFallback');
  assert.deepEqual((msg?.message as { payload: unknown }).payload, { reason: 'unsupported-api' });
});
