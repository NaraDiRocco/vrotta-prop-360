/**
 * Cliente Supabase minimalista: sólo REST (PostgREST) por fetch, sin el SDK
 * de @supabase/supabase-js (evita arrastrar su bundle al Worker). Alcanza
 * para lo que necesita este servicio: leer para armar el manifest/availability
 * e insertar leads.
 *
 * TODO: el esquema real de tablas (units, unit_prices, groups, unit_types,
 * scenes, hotspots, leads, tenant_config) todavía no existe en
 * supabase/migrations — ese paquete lo arma otro agente en paralelo. Las
 * queries de acá asumen nombres de tabla/columna "razonables" derivados de
 * packages/core/src/types.ts; hay que revisarlas contra el schema real antes
 * de ir a producción.
 */

export interface SupabaseConfig {
  url: string;
  serviceKey: string;
}

export class SupabaseError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
    this.name = 'SupabaseError';
  }
}

async function restRequest<T>(
  cfg: SupabaseConfig,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${cfg.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: cfg.serviceKey,
      Authorization: `Bearer ${cfg.serviceKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => undefined);
    throw new SupabaseError(`Supabase REST error ${res.status} on ${path}`, res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function createSupabaseClient(cfg: SupabaseConfig) {
  return {
    select: <T>(table: string, query = '') => restRequest<T>(cfg, `${table}?${query}`),
    insert: <T>(table: string, rows: unknown[], opts: { returning?: boolean } = {}) =>
      restRequest<T>(cfg, table, {
        method: 'POST',
        body: JSON.stringify(rows),
        headers: { Prefer: opts.returning ? 'return=representation' : 'return=minimal' },
      }),
  };
}

export type SupabaseClient = ReturnType<typeof createSupabaseClient>;
