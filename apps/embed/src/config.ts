/**
 * Pure helpers used by the loader (v1.ts). Kept dependency-free and DOM-free
 * on purpose so they can run under plain `node:test` without a browser
 * environment.
 */

export interface ParsedTourElementConfig {
  tenant: string;
  project: string;
  /**
   * Subdominio público del proyecto en la plataforma (`{subdomain}.<dominio
   * base>`) — la identidad que de verdad enruta el iframe, ver
   * `resolveViewerOrigin` más abajo. Normalizado en minúsculas: los
   * hostnames son case-insensitive y la propia plataforma compara
   * subdominios así (`unique index ... on projects (lower(subdomain))` en
   * `supabase/migrations/0022_project_domains.sql`).
   */
  subdomain: string;
  /**
   * `true` cuando `data-subdomain` no vino y se usó `data-project` como
   * respaldo (ver `parseTourDataset`). El loader (`v1.ts`) usa esta señal
   * para avisar por consola — nunca para fallar en silencio — porque
   * `project` (el slug interno, único sólo por tenant) puede no coincidir
   * con el subdominio real (único a nivel global) si algún día divergen.
   */
  subdomainFromProjectFallback: boolean;
  poster: string | null;
  unit: string | null;
  scene: string | null;
  aspect: { w: number; h: number };
}

export interface TourDataset {
  tenant?: string;
  project?: string;
  subdomain?: string;
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

  // `data-subdomain` es la identidad pública del proyecto en la plataforma
  // (única a nivel global: `projects.subdomain`, ver
  // supabase/migrations/0022_project_domains.sql). `data-project` es el
  // slug interno del proyecto (único sólo por tenant: `unique(tenant_id,
  // slug)` en 0003_projects.sql) — hoy coinciden en los proyectos que
  // existen (p.ej. Baleia: project="baleia", subdomain="baleia"), pero son
  // columnas distintas y podrían divergir. Por eso, si falta
  // `data-subdomain` (snippets viejos, pegados antes de que este atributo
  // existiera), el loader sigue funcionando usando `project` como mejor
  // estimación — no rompe el embed en silencio — pero `v1.ts` avisa por
  // consola con `subdomainFromProjectFallback` para que se corrija.
  const explicitSubdomain = (dataset.subdomain ?? "").trim().toLowerCase();
  const subdomain = explicitSubdomain || project.toLowerCase();

  return {
    tenant,
    project,
    subdomain,
    subdomainFromProjectFallback: !explicitSubdomain,
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

/**
 * Arma el origen del visor para UN proyecto puntual. La plataforma no sirve
 * los recorridos por una ruta compartida: cada proyecto vive en su propio
 * subdominio, `{subdomain}.{baseDomain}`, y el worker resuelve cuál es por
 * el header `Host` de la petición (ver DESPLIEGUE-VPS.md, sección "Cómo se
 * publica"/"Subdominio automático"). La ruta `/t/tenant/proyecto/` existe
 * en el worker pero NO sirve el shell del visor —sus assets son absolutos
 * desde la raíz del subdominio, no desde esa ruta—, así que el iframe
 * siempre tiene que apuntar acá, nunca a `{baseDomain}/t/...`.
 *
 * Pura y testeable a propósito (nada de `window`/`location` acá): quien
 * decide CUÁL es el `baseDomain` de esta build es `v1.ts` (una sola
 * constante visible, ver el comentario de cabecera de ese archivo), esta
 * función sólo compone el resultado.
 */
export function resolveViewerOrigin(subdomain: string, baseDomain: string): string {
  return `https://${subdomain}.${baseDomain}`;
}

/**
 * Builds the iframe `src` with initial config baked into the query string, avoiding a flash of the default scene.
 *
 * `viewerOrigin` ya viene resuelto (ver `resolveViewerOrigin`) — esta
 * función no sabe nada de subdominios, sólo arma la querystring. Importante:
 * `tenant`/`project` NO viajan acá. El visor no los lee de la URL (el
 * subdominio ya identifica el proyecto ante el worker); los recibe recién
 * en el primer `tour:init` por `postMessage`, después del handshake
 * (`tour:hello`) — ver `apps/viewer/src/embed-bridge.ts`. Meterlos también
 * en la query string sólo duplicaría datos que nadie consume por ese canal.
 */
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
  // Raíz del subdominio (`/`), no `/t`: ver el comentario de
  // `resolveViewerOrigin` sobre por qué la ruta compartida no sirve acá.
  return `${viewerOrigin}/?${params.toString()}`;
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
