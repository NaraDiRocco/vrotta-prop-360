/**
 * Pure helpers used by the loader (v1.ts). Kept dependency-free and DOM-free
 * on purpose so they can run under plain `node:test` without a browser
 * environment.
 */

export interface ParsedTourElementConfig {
  tenant: string;
  project: string;
  poster: string | null;
  unit: string | null;
  scene: string | null;
  aspect: { w: number; h: number };
}

export interface TourDataset {
  tenant?: string;
  project?: string;
  poster?: string;
  unit?: string;
  scene?: string;
  aspect?: string;
}

const DEFAULT_ASPECT = { w: 16, h: 9 };

/** Parses "16/9" or "16:9" into a ratio. Falls back to 16/9 on anything malformed. */
export function parseAspect(raw: string | null | undefined): { w: number; h: number } {
  if (!raw) return DEFAULT_ASPECT;
  const match = /^(\d+(?:\.\d+)?)\s*[/:]\s*(\d+(?:\.\d+)?)$/.exec(raw.trim());
  if (!match) return DEFAULT_ASPECT;
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return DEFAULT_ASPECT;
  return { w, h };
}

/** padding-top percentage fallback for browsers without `aspect-ratio` support. */
export function aspectToPaddingTopPercent(aspect: { w: number; h: number }): number {
  return (aspect.h / aspect.w) * 100;
}

export class ConfigError extends Error {}

/**
 * Validates + normalizes a `.tm-tour` element's dataset. Throws ConfigError
 * with a human-readable message when required fields are missing, so the
 * caller can surface a `tour:error`-shaped diagnostic without ever reaching
 * the network.
 */
export function parseTourDataset(dataset: TourDataset): ParsedTourElementConfig {
  const tenant = (dataset.tenant ?? "").trim();
  const project = (dataset.project ?? "").trim();
  if (!tenant) throw new ConfigError("missing required data-tenant attribute");
  if (!project) throw new ConfigError("missing required data-project attribute");
  return {
    tenant,
    project,
    poster: dataset.poster?.trim() || null,
    unit: dataset.unit?.trim() || null,
    scene: dataset.scene?.trim() || null,
    aspect: parseAspect(dataset.aspect),
  };
}

/**
 * Builds the query-string prefix used for deep-link params when multiple
 * tours are present on one page, so instances don't clobber each other's
 * `tm_unit` / `tm_scene` params. Single-tour pages get no prefix, keeping
 * the common case's URL clean: `?tm_unit=B2-A`. Multi-tour pages get
 * `?t1_tm_unit=B2-A&t2_tm_unit=C4-B`.
 */
export function buildDeepLinkPrefix(index: number, total: number): string {
  return total > 1 ? `t${index + 1}_` : "";
}

export interface DeepLinkParams {
  unit: string | null;
  scene: string | null;
}

/** Reads `tm_unit` / `tm_scene` (optionally prefixed) from a location.search string. */
export function readDeepLinkParams(search: string, prefix: string): DeepLinkParams {
  const params = new URLSearchParams(search);
  return {
    unit: params.get(`${prefix}tm_unit`),
    scene: params.get(`${prefix}tm_scene`),
  };
}

/**
 * Returns a new search string with this instance's deep-link params set (or
 * removed, when null). Other instances' / unrelated params are preserved.
 * Caller is responsible for using history.replaceState (never pushState).
 */
export function writeDeepLinkParams(
  search: string,
  prefix: string,
  next: Partial<DeepLinkParams>,
): string {
  const params = new URLSearchParams(search);
  for (const key of ["unit", "scene"] as const) {
    if (!(key in next)) continue;
    const value = next[key];
    const paramName = key === "unit" ? `${prefix}tm_unit` : `${prefix}tm_scene`;
    if (value) params.set(paramName, value);
    else params.delete(paramName);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Builds the iframe `src` with initial config baked into the query string, avoiding a flash of the default scene. */
export function buildIframeSrc(
  viewerOrigin: string,
  config: ParsedTourElementConfig,
  deepLink: DeepLinkParams,
  instanceId: string,
  parentOrigin: string,
): string {
  const params = new URLSearchParams();
  // The iframe needs to know its own instance id BEFORE the postMessage
  // handshake completes, so it can stamp `instance` on its very first
  // tour:hello. Everything after that is negotiated over postMessage.
  params.set("instance", instanceId);
  params.set("tenant", config.tenant);
  params.set("project", config.project);
  const unit = deepLink.unit ?? config.unit;
  const scene = deepLink.scene ?? config.scene;
  if (unit) params.set("unit", unit);
  if (scene) params.set("scene", scene);
  // El visor necesita el origen del padre para su primer postMessage
  // (`tour:hello`) y no puede esperar a que el navegador se lo cuente por su
  // cuenta: `document.referrer` se vacía si el cliente pone
  // `referrerpolicy="no-referrer"` en su página, manda una cabecera
  // `Referrer-Policy` estricta, o el navegador está en un modo de privacidad
  // que lo recorta — nada de eso lo controlamos nosotros. Mandarlo explícito
  // en la querystring, tomado de `location.origin` del loader (que sí sabe
  // en qué página está corriendo), saca ese dato de la lista de cosas que
  // pueden fallar en silencio. Que este parámetro lo arme quien incrusta el
  // iframe no es un problema de seguridad: `resolveExpectedParentOrigin`
  // (en `apps/viewer/src/embed-bridge.ts`) lo valida y, aunque no lo hiciera,
  // el propio `postMessage(msg, targetOrigin)` del navegador jamás entrega
  // un mensaje a un origen que no sea el de la ventana real a la que se
  // apunta — un `parentOrigin` mentiroso solo logra que el mensaje no se
  // entregue, nunca que se entregue en otro lado (ver el razonamiento
  // completo en el comentario de cabecera de `embed-bridge.ts`).
  params.set("parentOrigin", parentOrigin);
  return `${viewerOrigin}/t?${params.toString()}`;
}

let counter = 0;

/** Generates a stable, unique per-page instance id. Not a global variable holding state — just an id generator. */
export function nextInstanceId(): string {
  counter += 1;
  return `tm${counter}`;
}

/** Exposed for tests that need a clean counter between cases. */
export function resetInstanceIdCounterForTests(): void {
  counter = 0;
}
