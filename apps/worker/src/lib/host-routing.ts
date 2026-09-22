import type { SupabaseClient } from './supabase.ts';

/**
 * Resolución de un `Host:` entrante a `(tenant_slug, project_slug)`, para
 * poder servir un proyecto por su propio hostname además de por ruta
 * (`/t/:tenant/:project/*`, ver routes/serve.ts).
 *
 * Dos formas de hostname propio, ver supabase/migrations/0022_project_domains.sql:
 *   - Subdominio de plataforma: `{label}.{R360_PAGES_DOMAIN}` → busca
 *     `projects.subdomain = label`.
 *   - Dominio propio del cliente: cualquier otro host → busca
 *     `project_domains.domain = host` con `status = 'verified'` (un dominio
 *     `pending` o `failed` todavía no prueba que el cliente controle ese
 *     dominio, así que no se sirve nada ahí).
 *
 * El host de la plataforma (`R360_PLATFORM_HOST`) es un tercer caso, pero
 * NO se resuelve acá: `classifyHost` lo devuelve aparte (`kind: 'platform'`)
 * y quien llama decide qué hacer (seguir sirviendo /api/*, /t/... como
 * siempre) — este módulo no sabe nada de esas rutas.
 */

// ───────────────────────────────────────────────────────────────────────
// Normalización y validación
// ───────────────────────────────────────────────────────────────────────

/**
 * Un hostname válido: labels separados por un único punto, cada uno de
 * 1 a 63 caracteres alfanuméricos con guiones en el medio (nunca al
 * principio/final del label — eso ya descarta dos puntos seguidos, porque
 * generarían un label vacío). Nada de mayúsculas ni de cualquier otro
 * carácter: `normalizeHost` ya bajó todo a minúsculas antes de probar este
 * patrón, así que si algo más se cuela acá es porque el cliente lo mandó
 * así en el header `Host`.
 */
const HOST_LABEL = '[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?';
const HOST_PATTERN = new RegExp(`^${HOST_LABEL}(\\.${HOST_LABEL})*$`);
/** Límite de un hostname válido por spec (RFC 1035); nada de negocio acá. */
const MAX_HOST_LENGTH = 253;

/**
 * Baja a minúsculas, saca el puerto (si vino, `Host: ejemplo.com:8443`) y
 * valida contra un patrón estricto. Devuelve `null` ante CUALQUIER duda —
 * nunca un host "medio limpiado" — porque el resultado va derecho a una
 * query contra Supabase (ver `resolveProjectForHost`): mejor rechazar de
 * más acá, antes de tocar la base, que arriesgar que algo raro llegue a esa
 * query.
 *
 * No soportamos hosts IPv6 (`[::1]`): el patrón de abajo no admite `[`/`]`
 * ni `:`, así que un `Host: [::1]:8787` se rechaza de una — no hay ningún
 * caso de negocio real (proyecto publicado en una IP literal) que lo
 * necesite.
 */
export function normalizeHost(rawHost: string | undefined | null): string | null {
  if (!rawHost) return null;
  const withoutPort = rawHost.split(':')[0] ?? '';
  const host = withoutPort.trim().toLowerCase();
  if (host.length === 0 || host.length > MAX_HOST_LENGTH) return null;
  if (!HOST_PATTERN.test(host)) return null;
  return host;
}

// ───────────────────────────────────────────────────────────────────────
// Clasificación
// ───────────────────────────────────────────────────────────────────────

export interface HostRoutingConfig {
  /** Host fijo del panel/API de la plataforma (`R360_PLATFORM_HOST`). */
  platformHost: string;
  /** Dominio base de los subdominios de proyecto (`R360_PAGES_DOMAIN`). */
  pagesDomain: string;
}

export type HostClassification =
  | { kind: 'platform' }
  | { kind: 'subdomain'; label: string }
  | { kind: 'custom'; host: string };

/**
 * Clasifica un host YA NORMALIZADO (pasado por `normalizeHost`). No pega a
 * Supabase — sólo decide POR DÓNDE hay que buscar, no si existe.
 */
export function classifyHost(host: string, cfg: HostRoutingConfig): HostClassification {
  if (host === cfg.platformHost) return { kind: 'platform' };

  const suffix = `.${cfg.pagesDomain}`;
  if (cfg.pagesDomain && host.endsWith(suffix)) {
    const label = host.slice(0, -suffix.length);
    // "UN SOLO label válido": si lo que queda antes del sufijo todavía
    // tiene un punto (ej. `a.b.{pagesDomain}`), no es la forma
    // `{label}.{pagesDomain}` que describe la tarea — lo tratamos como
    // dominio propio en vez de cómo subdominio de plataforma (en la
    // práctica no va a matchear nada ahí tampoco, y termina en 404, que es
    // el comportamiento correcto para un host que no es ninguna de las dos
    // formas soportadas).
    if (label.length > 0 && !label.includes('.')) {
      return { kind: 'subdomain', label };
    }
  }

  return { kind: 'custom', host };
}

// ───────────────────────────────────────────────────────────────────────
// Caché en memoria (TTL + tope de entradas)
// ───────────────────────────────────────────────────────────────────────

export interface ResolvedHostProject {
  tenantSlug: string;
  projectSlug: string;
}

interface CacheEntry {
  /** `null` = "no encontrado" (negativo cacheado, ver más abajo). */
  value: ResolvedHostProject | null;
  expiresAt: number;
}

/**
 * Caché en memoria de `host → proyecto resuelto`, con TTL y tope de
 * entradas.
 *
 * Por qué hace falta un TTL: resolver un host pega a Supabase (una o dos
 * queries encadenadas — ver `resolveProjectForHost`), y a diferencia de
 * `/t/:tenant/:project/*` (donde el puntero de versión vive en KV local),
 * acá cada request nuevo con un Host no visto antes implicaría ida y vuelta
 * a la base. 60s (ver `DEFAULT_TTL_MS`) es corto a propósito: si un cliente
 * acaba de verificar un dominio propio o de asignarse un subdominio, no
 * queda pegado más de un minuto a un resultado viejo.
 *
 * Por qué el tope de entradas NO es optativo: la clave de esta caché es el
 * host, y el host lo elige quien hace el request (`Host:` es un header
 * común, no autenticado). Sin límite, alguien puede mandar un `Host`
 * distinto en cada pedido (aleatorio, o simplemente incremental) y hacer
 * crecer este `Map` sin fin hasta agotar la memoria del proceso — un vector
 * de denial-of-service trivial y barato. Con tope + desalojo, en el peor
 * caso la caché ocupa un tamaño acotado sin importar cuántos hosts
 * distintos haya mandado un atacante.
 *
 * También cachea los "no encontrado" (`value: null`): sin esto, alguien
 * podía usar hosts inventados (que siempre dan `null`) para no pegarle
 * nunca a la caché y martillar Supabase en cada request — el punto entero
 * de tener caché. Mismo TTL para positivos y negativos: ya es corto (60s),
 * no hace falta un segundo número para "corto todavía más".
 */
export class HostResolutionCache {
  private readonly store = new Map<string, CacheEntry>();

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
  ) {}

  get(key: string, now: number = Date.now()): { hit: true; value: ResolvedHostProject | null } | { hit: false } {
    const entry = this.store.get(key);
    if (!entry) return { hit: false };
    if (entry.expiresAt <= now) {
      this.store.delete(key);
      return { hit: false };
    }
    return { hit: true, value: entry.value };
  }

  set(key: string, value: ResolvedHostProject | null, now: number = Date.now()): void {
    // Si la key ya existía, la sacamos antes de volver a insertarla: un
    // `Map` de JS conserva orden de INSERCIÓN, así que este `delete` +
    // `set` es lo que convierte el desalojo de abajo en un LRU de verdad
    // (la entrada recién usada pasa al final) y no un FIFO ciego que
    // desalojaría entradas todavía calientes.
    this.store.delete(key);
    this.store.set(key, { value, expiresAt: now + this.ttlMs });

    if (this.store.size > this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }
  }

  /** Sólo para tests: cuántas entradas tiene la caché ahora mismo. */
  get size(): number {
    return this.store.size;
  }
}

const DEFAULT_TTL_MS = 60_000; // 60s, ver el porqué en el docstring de la clase.
const DEFAULT_MAX_ENTRIES = 500; // Tope de entradas, ídem.

export function createHostResolutionCache(
  maxEntries: number = DEFAULT_MAX_ENTRIES,
  ttlMs: number = DEFAULT_TTL_MS,
): HostResolutionCache {
  return new HostResolutionCache(maxEntries, ttlMs);
}

// ───────────────────────────────────────────────────────────────────────
// Resolución contra Supabase
// ───────────────────────────────────────────────────────────────────────

/**
 * El host (o el label de subdominio) ya pasó `normalizeHost`/`classifyHost`
 * y sólo puede contener `[a-z0-9.-]` — no podría inyectar un operador de
 * PostgREST aunque quisiera. Igual lo pasamos por `encodeURIComponent`
 * antes de interpolarlo en la query string, como hace `leads.ts` con
 * `unitCode`: no cambia nada hoy (el charset ya es seguro), pero es la
 * misma defensa en profundidad — si el patrón de `normalizeHost` se afloja
 * el día de mañana, esta capa sigue estando.
 */
async function tenantSlugFor(db: SupabaseClient, tenantId: string): Promise<string | null> {
  const tenants = await db.select<{ slug: string }[]>(
    'tenants',
    `id=eq.${encodeURIComponent(tenantId)}&select=slug`,
  );
  return tenants[0]?.slug ?? null;
}

async function resolveBySubdomain(db: SupabaseClient, label: string): Promise<ResolvedHostProject | null> {
  const projects = await db.select<{ slug: string; tenant_id: string }[]>(
    'projects',
    `subdomain=eq.${encodeURIComponent(label)}&select=slug,tenant_id`,
  );
  const project = projects[0];
  if (!project) return null;

  const tenantSlug = await tenantSlugFor(db, project.tenant_id);
  if (!tenantSlug) return null;

  return { tenantSlug, projectSlug: project.slug };
}

async function resolveByCustomDomain(db: SupabaseClient, host: string): Promise<ResolvedHostProject | null> {
  // `status=eq.verified`: un dominio `pending` (TXT todavía no confirmado)
  // o `failed` no prueba que el cliente controle ese hostname — servir un
  // proyecto ahí sería dejar que cualquiera con acceso a DNS ajeno (o ni
  // eso, si el dominio ni siquiera es suyo) reclame el recorrido de otro
  // con sólo apuntar un CNAME/A y mandar el Host correcto.
  const domains = await db.select<{ project_id: string; tenant_id: string }[]>(
    'project_domains',
    `domain=eq.${encodeURIComponent(host)}&status=eq.verified&select=project_id,tenant_id`,
  );
  const domain = domains[0];
  if (!domain) return null;

  // `project_domains.tenant_id` ya viene denormalizado en la fila (trigger
  // `set_tenant_id_from_project`, 0022), así que alcanza con una consulta
  // más a `projects` por el slug — no hace falta ir dos veces por tenant_id.
  const [projects, tenantSlug] = await Promise.all([
    db.select<{ slug: string }[]>('projects', `id=eq.${encodeURIComponent(domain.project_id)}&select=slug`),
    tenantSlugFor(db, domain.tenant_id),
  ]);
  const projectSlug = projects[0]?.slug;
  if (!projectSlug || !tenantSlug) return null;

  return { tenantSlug, projectSlug };
}

/**
 * Resuelve un host (ya normalizado y clasificado como `subdomain` o
 * `custom` — nunca `platform`, eso lo filtra quien llama) a
 * `(tenant_slug, project_slug)`, con la caché de arriba delante.
 */
export async function resolveProjectForHost(
  db: SupabaseClient,
  host: string,
  classification: Extract<HostClassification, { kind: 'subdomain' | 'custom' }>,
  cache: HostResolutionCache,
): Promise<ResolvedHostProject | null> {
  const cached = cache.get(host);
  if (cached.hit) return cached.value;

  const resolved =
    classification.kind === 'subdomain'
      ? await resolveBySubdomain(db, classification.label)
      : await resolveByCustomDomain(db, classification.host);

  cache.set(host, resolved);
  return resolved;
}
