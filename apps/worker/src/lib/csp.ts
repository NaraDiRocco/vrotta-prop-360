/**
 * Content-Security-Policy: frame-ancestors, calculado por tenant.
 *
 * Por qué `frame-ancestors` y no `X-Frame-Options`: X-Frame-Options sólo admite
 * un único origen (o DENY/SAMEORIGIN) — no sirve para un producto que se
 * embebe vía iframe en el dominio de cada cliente. `frame-ancestors` sí admite
 * una lista de orígenes, así que es la única cabecera viable acá. No emitir
 * X-Frame-Options en ningún response de /t/*.
 *
 * La lista de orígenes permitidos vive en KV, por tenant, bajo la clave
 * `tenant:{tenant}`. Si el tenant no existe o está inactivo, se deniega todo
 * embedding (`frame-ancestors 'none'`) — fail closed.
 */

export interface TenantConfig {
  active: boolean;
  /** Orígenes desde los que se permite embeber el visor (dominios del cliente). */
  allowedAncestors: string[];
  /** Hosts adicionales permitidos para fetch de tiles (ver hotlink.ts). */
  allowedTileHosts?: string[];
  /** URL de webhook al CRM del cliente, para /api/leads. */
  crmWebhookUrl?: string;
}

export interface KvLike {
  get(key: string, opts?: { type?: 'json' | 'text' }): Promise<unknown>;
}

const TENANT_KEY = (tenant: string) => `tenant:${tenant}`;

export async function getTenantConfig(kv: KvLike, tenant: string): Promise<TenantConfig | null> {
  const raw = await kv.get(TENANT_KEY(tenant), { type: 'json' });
  if (!raw || typeof raw !== 'object') return null;
  const cfg = raw as Partial<TenantConfig>;
  if (typeof cfg.active !== 'boolean' || !Array.isArray(cfg.allowedAncestors)) return null;
  return {
    active: cfg.active,
    allowedAncestors: cfg.allowedAncestors,
    allowedTileHosts: cfg.allowedTileHosts,
    crmWebhookUrl: cfg.crmWebhookUrl,
  };
}

/**
 * Arma el valor de la cabecera Content-Security-Policy para un tenant dado.
 * Tenant inexistente, inactivo, o sin ancestros configurados → 'none'.
 */
export function buildFrameAncestorsCsp(config: TenantConfig | null): string {
  if (!config || !config.active || config.allowedAncestors.length === 0) {
    return "frame-ancestors 'none'";
  }
  const origins = config.allowedAncestors.map((o) => o.trim()).filter(Boolean);
  if (origins.length === 0) return "frame-ancestors 'none'";
  return `frame-ancestors ${origins.join(' ')}`;
}

/** Resuelve la config del tenant en KV y arma la cabecera CSP lista para setear. */
export async function cspHeaderForTenant(kv: KvLike, tenant: string): Promise<string> {
  const config = await getTenantConfig(kv, tenant);
  return buildFrameAncestorsCsp(config);
}
