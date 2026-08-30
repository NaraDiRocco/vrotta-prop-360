import { Hono } from 'hono';
import type { Env } from '../env.ts';
import type { AvailabilityFile, PriceVisibility, UnitStatus } from '@r360/core';
import { isUnitStatus, FALLBACK_STATUS } from '@r360/core';
import { createSupabaseClient } from '../lib/supabase.ts';
import { getActivePointer } from '../lib/pointer.ts';
import { r2Paths } from '../lib/r2paths.ts';

/**
 * POST /api/availability/:tenant/:project/regenerate
 *
 * Pensado para ser disparado por un webhook de Supabase (Database Webhooks)
 * cuando cambian `units` o `unit_prices`. Regenera availability.json desde
 * Supabase y lo pisa en R2 con TTL corto — es lo único que el visor
 * consulta para saber estado/precio "ahora".
 *
 * Respeta `visibility`: si el precio no es público (`on_request` o
 * `private`), `p` va en `null`. El precio nunca sale del backend si el
 * tenant no quiere que se vea — no se manda ofuscado ni redondeado, se
 * omite directamente.
 *
 * TODO: mismo disclaimer que publish.ts — las tablas `units` / `unit_prices`
 * son un supuesto razonable a partir de packages/core/src/types.ts, falta
 * confirmarlas contra supabase/migrations cuando exista.
 */
export const availability = new Hono<{ Bindings: Env }>();

interface UnitRow {
  code: string;
  status: string;
}

interface UnitPriceRow {
  unit_code: string;
  amount: number;
  currency: string;
  visibility: PriceVisibility;
}

function priceVisibleToPublic(v: PriceVisibility): boolean {
  return v === 'public';
}

async function buildAvailabilityFromSupabase(
  db: ReturnType<typeof createSupabaseClient>,
  project: string,
  version: number,
): Promise<AvailabilityFile> {
  // TODO: ajustar nombres de tabla/columna al schema real.
  const unitRows = await db
    .select<UnitRow[]>('units', `project_id=eq.${project}&select=code,status`)
    .catch(() => [] as UnitRow[]);
  const priceRows = await db
    .select<UnitPriceRow[]>(
      'unit_prices',
      `project_id=eq.${project}&select=unit_code,amount,currency,visibility`,
    )
    .catch(() => [] as UnitPriceRow[]);

  const priceByUnit = new Map(priceRows.map((p) => [p.unit_code, p]));

  const units: AvailabilityFile['units'] = {};
  for (const row of unitRows) {
    const status: UnitStatus = isUnitStatus(row.status) ? row.status : FALLBACK_STATUS;
    const price = priceByUnit.get(row.code);
    const p =
      price && priceVisibleToPublic(price.visibility)
        ? { a: price.amount, c: price.currency }
        : null;
    units[row.code] = { s: status, p };
  }

  return { v: version, generated_at: new Date().toISOString(), units };
}

availability.post('/api/availability/:tenant/:project/regenerate', async (c) => {
  const { tenant, project } = c.req.param();

  const pointer = await getActivePointer(c.env.TENANTS_KV, tenant, project);
  if (!pointer) {
    return c.json({ error: 'not_published', message: `No hay versión activa para ${tenant}/${project}` }, 404);
  }

  const db = createSupabaseClient({ url: c.env.SUPABASE_URL, serviceKey: c.env.SUPABASE_SERVICE_KEY });

  let file: AvailabilityFile;
  try {
    file = await buildAvailabilityFromSupabase(db, project, pointer.version);
  } catch (err) {
    return c.json(
      { error: 'supabase_error', message: err instanceof Error ? err.message : String(err) },
      502,
    );
  }

  await c.env.R2.put(r2Paths.availabilityJson(tenant, project, pointer.version), JSON.stringify(file), {
    httpMetadata: {
      contentType: 'application/json',
      cacheControl: 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
    },
  });

  return c.json({ ok: true, tenant, project, version: pointer.version, unitCount: Object.keys(file.units).length });
});
