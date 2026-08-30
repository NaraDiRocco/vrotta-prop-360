/**
 * Stand-in for the real tour viewer app, used only by the local demo page
 * (demo/index.html) so the loader's full protocol can be exercised without
 * any backend. Imports the SAME protocol.ts the loader uses, so this is a
 * faithful (if visually bare) implementation of "the other side of the
 * wire" — not a mock of the protocol itself.
 */
import {
  PROTOCOL_VERSION,
  isTourMessage,
  isKnownProtocolVersion,
  isTrustedOrigin,
  makeMessage,
  type TourInitConfig,
  type ParentToIframeMessage,
} from "../src/protocol";

// In the real deployment the viewer would validate against EMBED_ORIGIN /
// whatever origin the loader is served from. For the demo, everything runs
// on the same localhost origin the static server serves, so we trust our
// own parent's origin (window.location.origin as seen from inside the
// iframe equals the top page's origin here because both are same-origin
// under the demo server).
const PARENT_ORIGIN = window.location.origin;

// The loader bakes its assigned instance id into the iframe's own query
// string (see buildIframeSrc in src/config.ts) precisely so the viewer can
// stamp it on the very first tour:hello, before any postMessage handshake
// has happened.
let instanceId = new URLSearchParams(window.location.search).get("instance") || "unknown";
let config: TourInitConfig | null = null;

function log(line: string): void {
  const el = document.getElementById("log");
  if (!el) return;
  const row = document.createElement("div");
  row.textContent = `[${new Date().toLocaleTimeString()}] ${line}`;
  el.appendChild(row);
  el.scrollTop = el.scrollHeight;
}

function send(message: ReturnType<typeof makeMessage>): void {
  window.parent.postMessage(message, PARENT_ORIGIN);
  log(`-> ${message.type} ${JSON.stringify(message.payload)}`);
}

function handleParentMessage(event: MessageEvent): void {
  if (!isTrustedOrigin(event.origin, PARENT_ORIGIN)) return;
  if (!isTourMessage(event.data)) return;
  const message = event.data as ParentToIframeMessage;
  if (!isKnownProtocolVersion(message.v)) return;

  log(`<- ${message.type} ${JSON.stringify(message.payload)}`);

  if (message.type === "tour:init") {
    instanceId = message.instance;
    config = message.payload;
    const title = document.getElementById("title");
    if (title) title.textContent = `${config.project} (${config.tenant})`;
    // Simulate the viewer finishing its own bootstrap.
    setTimeout(() => {
      send(makeMessage("tour:ready", instanceId, {}));
      // Report a height once "content" is ready — the loader should stop
      // relying on the aspect-ratio box and adopt this height instead.
      send(makeMessage("tour:resize", instanceId, { height: 420 }));
      if (message.payload.unit) {
        send(makeMessage("tour:unitView", instanceId, { unitId: message.payload.unit }));
      } else if (message.payload.scene) {
        send(makeMessage("tour:sceneView", instanceId, { sceneId: message.payload.scene }));
      }
    }, 300);
  } else if (message.type === "tour:command:goToUnit") {
    send(makeMessage("tour:unitView", instanceId, { unitId: message.payload.unitId }));
  } else if (message.type === "tour:command:enterFullscreenFallback:ack") {
    log("(parent acknowledged fullscreen fallback)");
  }
}

window.addEventListener("message", handleParentMessage);

function wireButtons(): void {
  const bind = (id: string, fn: () => void) => {
    const btn = document.getElementById(id);
    btn?.addEventListener("click", fn);
  };
  bind("btn-hello", () => send(makeMessage("tour:hello", instanceId, { viewerVersion: "mock-1.0.0" })));
  bind("btn-lot-click", () => send(makeMessage("tour:lotClick", instanceId, { unitId: "C4-B", status: "available" })));
  bind("btn-lead-intent", () => send(makeMessage("tour:leadIntent", instanceId, { unitId: "C4-B", source: "cta-button" })));
  bind("btn-deeplink", () => send(makeMessage("tour:deeplink", instanceId, { unitId: "A1-C" })));
  bind("btn-error", () => send(makeMessage("tour:error", instanceId, { message: "simulated viewer error", code: "MOCK_ERR" })));
  bind("btn-fullscreen", () => send(makeMessage("tour:requestFullscreenFallback", instanceId, { reason: "ios-safari" })));
  bind("btn-exit-fullscreen", () => send(makeMessage("tour:exitFullscreenFallback", instanceId, {})));
  bind("btn-resize-tall", () => send(makeMessage("tour:resize", instanceId, { height: 720 })));
}

document.addEventListener("DOMContentLoaded", () => {
  wireButtons();
  const title = document.getElementById("title");
  if (title) title.textContent = `(waiting for tour:init — instance ${instanceId})`;
  // Handshake: announce ourselves immediately, as the real viewer would on
  // first paint. If nothing answers within the loader's watchdog window,
  // the loader emits tour:loadError.
  send(makeMessage("tour:hello", instanceId, { viewerVersion: "mock-1.0.0" }));
});

void PROTOCOL_VERSION;
