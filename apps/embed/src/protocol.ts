/**
 * @r360/embed protocol contract.
 *
 * This is the typed, versioned contract for postMessage traffic between the
 * parent page (loader, v1.ts) and the tour iframe (the viewer app). The
 * viewer imports this file directly so both sides always agree on shapes.
 *
 * Channel: every message carries `channel: "tumarca-tour"` so the loader can
 * ignore any unrelated postMessage traffic on the page (browser extensions,
 * other embeds, analytics scripts, etc).
 *
 * Versioning: `v` is the protocol version (not the package version). Bump it
 * only for breaking wire-format changes. The loader and viewer should both
 * tolerate an unknown/future `v` by ignoring the message rather than
 * throwing.
 *
 * Every message also carries `instance`, the loader-assigned instance id for
 * the specific `.tm-tour` element it belongs to, so a page with multiple
 * tours can route messages to the right one.
 */

export const PROTOCOL_CHANNEL = "tumarca-tour" as const;
export const PROTOCOL_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export interface TourInitConfig {
  tenant: string;
  project: string;
  /** Unit code to focus on load, e.g. "B2-A". Omitted = default scene. */
  unit?: string;
  /** Scene/panorama id to focus on load. Omitted = default scene. */
  scene?: string;
  /** e.g. "16/9", "4/3", "1/1" */
  aspect?: string;
}

export type FullscreenFallbackReason = "ios-safari" | "unsupported-api" | "denied";

// ---------------------------------------------------------------------------
// iframe -> parent
// ---------------------------------------------------------------------------

export interface TourHelloMessage {
  channel: typeof PROTOCOL_CHANNEL;
  v: typeof PROTOCOL_VERSION;
  instance: string;
  type: "tour:hello";
  payload: { viewerVersion: string };
}

export interface TourReadyMessage {
  channel: typeof PROTOCOL_CHANNEL;
  v: typeof PROTOCOL_VERSION;
  instance: string;
  type: "tour:ready";
  payload: Record<string, never>;
}

export interface TourResizeMessage {
  channel: typeof PROTOCOL_CHANNEL;
  v: typeof PROTOCOL_VERSION;
  instance: string;
  type: "tour:resize";
  payload: { height: number };
}

export interface TourSceneViewMessage {
  channel: typeof PROTOCOL_CHANNEL;
  v: typeof PROTOCOL_VERSION;
  instance: string;
  type: "tour:sceneView";
  payload: { sceneId: string };
}

export interface TourUnitViewMessage {
  channel: typeof PROTOCOL_CHANNEL;
  v: typeof PROTOCOL_VERSION;
  instance: string;
  type: "tour:unitView";
  payload: { unitId: string };
}

export interface TourLotClickMessage {
  channel: typeof PROTOCOL_CHANNEL;
  v: typeof PROTOCOL_VERSION;
  instance: string;
  type: "tour:lotClick";
  payload: { unitId: string; status?: string };
}

export interface TourLeadIntentMessage {
  channel: typeof PROTOCOL_CHANNEL;
  v: typeof PROTOCOL_VERSION;
  instance: string;
  type: "tour:leadIntent";
  payload: { unitId?: string; source?: string };
}

export interface TourDeeplinkMessage {
  channel: typeof PROTOCOL_CHANNEL;
  v: typeof PROTOCOL_VERSION;
  instance: string;
  type: "tour:deeplink";
  payload: { unitId?: string; sceneId?: string };
}

export interface TourErrorMessage {
  channel: typeof PROTOCOL_CHANNEL;
  v: typeof PROTOCOL_VERSION;
  instance: string;
  type: "tour:error";
  payload: { message: string; code?: string };
}

export interface TourRequestFullscreenFallbackMessage {
  channel: typeof PROTOCOL_CHANNEL;
  v: typeof PROTOCOL_VERSION;
  instance: string;
  type: "tour:requestFullscreenFallback";
  payload: { reason: FullscreenFallbackReason };
}

export interface TourExitFullscreenFallbackMessage {
  channel: typeof PROTOCOL_CHANNEL;
  v: typeof PROTOCOL_VERSION;
  instance: string;
  type: "tour:exitFullscreenFallback";
  payload: Record<string, never>;
}

export type IframeToParentMessage =
  | TourHelloMessage
  | TourReadyMessage
  | TourResizeMessage
  | TourSceneViewMessage
  | TourUnitViewMessage
  | TourLotClickMessage
  | TourLeadIntentMessage
  | TourDeeplinkMessage
  | TourErrorMessage
  | TourRequestFullscreenFallbackMessage
  | TourExitFullscreenFallbackMessage;

// ---------------------------------------------------------------------------
// parent -> iframe
// ---------------------------------------------------------------------------

export interface TourInitMessage {
  channel: typeof PROTOCOL_CHANNEL;
  v: typeof PROTOCOL_VERSION;
  instance: string;
  type: "tour:init";
  payload: TourInitConfig;
}

export interface TourCommandGoToUnitMessage {
  channel: typeof PROTOCOL_CHANNEL;
  v: typeof PROTOCOL_VERSION;
  instance: string;
  type: "tour:command:goToUnit";
  payload: { unitId: string };
}

export interface TourCommandEnterFullscreenFallbackAckMessage {
  channel: typeof PROTOCOL_CHANNEL;
  v: typeof PROTOCOL_VERSION;
  instance: string;
  type: "tour:command:enterFullscreenFallback:ack";
  payload: Record<string, never>;
}

export type ParentToIframeMessage =
  | TourInitMessage
  | TourCommandGoToUnitMessage
  | TourCommandEnterFullscreenFallbackAckMessage;

export type TourMessage = IframeToParentMessage | ParentToIframeMessage;

// ---------------------------------------------------------------------------
// Guards / helpers (pure — safe to unit test without a DOM)
// ---------------------------------------------------------------------------

/** Narrow, defensive check that `data` is a well-formed message on our channel. */
export function isTourMessage(data: unknown): data is TourMessage {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    d.channel === PROTOCOL_CHANNEL &&
    typeof d.v === "number" &&
    typeof d.instance === "string" &&
    typeof d.type === "string" &&
    typeof d.payload === "object" &&
    d.payload !== null
  );
}

export function isKnownProtocolVersion(v: number): v is typeof PROTOCOL_VERSION {
  return v === PROTOCOL_VERSION;
}

/**
 * Compares a candidate origin against an expected origin. Use this instead
 * of substring/startsWith checks (those are spoofable, e.g.
 * "https://viewer.tumarca.com.evil.com"). Both sides must be exact-match
 * scheme+host+port origins, as delivered by `MessageEvent.origin`.
 */
export function isTrustedOrigin(candidate: string, expected: string): boolean {
  return candidate === expected;
}

export function makeMessage<T extends TourMessage>(
  type: T["type"],
  instance: string,
  payload: T["payload"],
): T {
  return {
    channel: PROTOCOL_CHANNEL,
    v: PROTOCOL_VERSION,
    instance,
    type,
    payload,
  } as T;
}
