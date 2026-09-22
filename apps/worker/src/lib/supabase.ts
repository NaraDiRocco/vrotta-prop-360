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
  // PostgREST con `Prefer: return=minimal` -que es lo que usan `insert` sin
  // `returning` y TODOS los `update`- contesta 201 con el cuerpo VACIO, no
  // 204. `res.json()` sobre un cuerpo vacio tira SyntaxError, y el llamador
  // lo interpreta como que la escritura fallo cuando en realidad se escribio.
  // Asi se reportaba `record_publication` como fallida con la fila ya
  // guardada: peor que un fallo real, porque invita a reintentar algo hecho.
  // Por eso la decision se toma mirando el cuerpo y no el codigo de estado.
  if (res.status === 204) return undefined as T;
  const cuerpo = await res.text();
  if (cuerpo === '') return undefined as T;
  return JSON.parse(cuerpo) as T;
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
    update: <T>(table: string, query: string, patch: unknown) =>
      restRequest<T>(cfg, `${table}?${query}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
        headers: { Prefer: 'return=minimal' },
      }),
    /** Llama a una función Postgres expuesta vía PostgREST (`/rest/v1/rpc/{fn}`). */
    rpc: <T>(fn: string, args: Record<string, unknown>) =>
      restRequest<T>(cfg, `rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) }),
  };
}

export type SupabaseClient = ReturnType<typeof createSupabaseClient>;
