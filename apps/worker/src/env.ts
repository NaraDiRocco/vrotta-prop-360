/**
 * Bindings del Worker.
 *
 * Hasta la migración a Node (ver src/server.ts) `TENANTS_KV` y `R2` venían
 * tipados como `KVNamespace`/`R2Bucket` de `@cloudflare/workers-types`,
 * porque el Worker corría (o iba a correr) en Cloudflare. Ahora corre en un
 * VPS propio: `server.ts` arma este `Env` con dos adaptadores propios sobre
 * el filesystem (`lib/kv-fs.ts` y `lib/storage-fs.ts`) en vez de bindings
 * reales de Cloudflare.
 *
 * Por eso acá se declara la forma MÍNIMA que el resto del código realmente
 * usa (get/put/head - ver src/routes/publish.ts, availability.ts,
 * rollback.ts y serve.ts para R2; lib/pointer.ts, lib/csp.ts,
 * lib/embed-token.ts y lib/rate-limit.ts para KV), no las interfaces
 * completas de Cloudflare. Así el Worker deja de depender de
 * `@cloudflare/workers-types` en su superficie pública, y cualquier backend
 * que cumpla esta forma mínima sirve - incluido el R2/KV real de Cloudflare,
 * si algún día se vuelve a usar detrás de este mismo `Env`.
 */

/**
 * Forma mínima que el código consume de un bucket de objetos (R2 en
 * Cloudflare, disco vía lib/storage-fs.ts en el VPS).
 */
export interface ObjectStorage {
  get(key: string): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null>;
  put(
    key: string,
    value: string | Uint8Array,
    opts?: { httpMetadata?: { contentType?: string; cacheControl?: string } },
  ): Promise<void>;
  /** Sólo se usa para chequear existencia (ver rollback.ts) - alcanza con que sea truthy/null. */
  head(key: string): Promise<{ key: string; size?: number } | null>;
}

/**
 * Forma mínima que el código consume de un KV (namespace de Cloudflare o
 * disco vía lib/kv-fs.ts en el VPS). `get` queda declarado con dos firmas
 * (igual que el `KVNamespace` real de Cloudflare) porque las interfaces que
 * ya existían en lib/pointer.ts, lib/csp.ts y lib/embed-token.ts piden
 * `{ type: 'json' }` y esperan `unknown` de vuelta, mientras que
 * lib/rate-limit.ts llama a `get` sin opciones y espera `string | null` - sin
 * la sobrecarga, una sola firma no puede darle a cada uno el tipo de retorno
 * que ya asume.
 */
export interface KeyValueStore {
  get(key: string, opts?: { type?: 'text' }): Promise<string | null>;
  get(key: string, opts: { type: 'json' }): Promise<unknown>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

export interface Env {
  /** Config por tenant, punteros de versión activa, revocación de tokens, etc. */
  TENANTS_KV: KeyValueStore;
  /** tour.json / availability.json publicados, por versión. Los tiles también
   * viven acá pero se sirven directo desde el dominio público de R2 (ver serve.ts). */
  R2: ObjectStorage;
  /** Secreto HMAC-SHA256 para firmar/verificar tokens de embed. */
  EMBED_HMAC_SECRET: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  /** Secreto compartido con apps/admin para autorizar publish/rollback/regenerate. */
  PUBLISH_SECRET: string;
  /**
   * Host fijo del panel/API de la plataforma (ej. `app.r360.io`). Ver
   * lib/host-routing.ts: cuando el `Host:` entrante es EXACTAMENTE este
   * valor, el request no es un proyecto — sigue sirviendo las rutas de
   * siempre (`/api/*`, `/t/...`). Cualquier otro host se intenta resolver a
   * un proyecto por subdominio o dominio propio.
   */
  R360_PLATFORM_HOST: string;
  /**
   * Dominio base de los subdominios de proyecto (ej. `pages.r360.io`, para
   * que un proyecto con `projects.subdomain = 'torres-del-lago'` responda en
   * `torres-del-lago.pages.r360.io`). Ver lib/host-routing.ts.
   */
  R360_PAGES_DOMAIN: string;
}
