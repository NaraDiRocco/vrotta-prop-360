/**
 * Bindings del Worker, declarados en wrangler.toml.
 *
 * TODO: una vez creados los recursos reales en Cloudflare (ver README.md),
 * confirmar que los nombres acá coinciden 1:1 con los `binding =` de wrangler.toml.
 */
export interface Env {
  /** Config por tenant, punteros de versión activa, revocación de tokens, etc. */
  TENANTS_KV: KVNamespace;
  /** tour.json / availability.json publicados, por versión. Los tiles también
   * viven acá pero se sirven directo desde el dominio público de R2 (ver serve.ts). */
  R2: R2Bucket;
  /** Secreto HMAC-SHA256 para firmar/verificar tokens de embed. */
  EMBED_HMAC_SECRET: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  /** Secreto compartido con apps/admin para autorizar publish/rollback/regenerate. */
  PUBLISH_SECRET: string;
}
