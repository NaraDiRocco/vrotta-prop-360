import { Hono } from 'hono';
import type { Env } from '../env.ts';
import type { AvailabilityFile } from '@r360/core';
import { createSupabaseClient } from '../lib/supabase.ts';
import { getActivePointer } from '../lib/pointer.ts';
import { r2Paths } from '../lib/r2paths.ts';
import { resolveProject } from '../lib/resolve.ts';

/**
 * POST /api/availability/:tenant/:project/regenerate
 *
 * Pensado para ser disparado por un webhook de Supabase (Database Webhooks)
 * cuando cambian `units` o `unit_prices`. Regenera availability.json vía la
 * función Postgres `generate_availability_json(project_id)`
 * (supabase/migrations/0013_availability_json.sql) — esa función ya arma el
 * jsonb con la forma exacta de `AvailabilityFile` y ya respeta
 * `visibility`: si el precio vigente no es `'public'` (o no hay precio
 * vigente), `p` va en `null`. El precio nunca sale del backend si el tenant
 * no quiere que se vea.
 *
 * La función RPC hardcodea `v: 1` (no conoce el puntero de versión del
 * Worker) — acá lo pisamos con la versión activa real desde KV antes de
 * escribir a R2.
 */
export const availability = new Hono<{ Bindings: Env }>();

availability.post('/api/availability/:tenant/:project/regenerate', async (c) => {
  const { tenant, project } = c.req.param();

  const pointer = await getActivePointer(c.env.TENANTS_KV, tenant, project);
  if (!pointer) {
    return c.json({ error: 'not_published', message: `No hay versión activa para ${tenant}/${project}` }, 404);
  }

  const db = createSupabaseClient({ url: c.env.SUPABASE_URL, serviceKey: c.env.SUPABASE_SERVICE_KEY });

  const resolved = await resolveProject(db, tenant, project).catch(() => null);
  if (!resolved) {
    return c.json({ error: 'unknown_project', message: `No existe ${tenant}/${project} en Supabase` }, 404);
  }

  let file: AvailabilityFile;
  try {
    const generated = await db.rpc<AvailabilityFile>('generate_availability_json', {
      p_project_id: resolved.projectId,
    });
    file = { ...generated, v: pointer.version };
  } catch (err) {
    // Aca el llamador es de confianza -pasa el secreto de publicacion- pero el
    // detalle igual va al log y no a la respuesta: el dia que alguien exponga
    // esta ruta, el habito ya esta tomado.
    console.error('availability: fallo al regenerar:', err);
    return c.json({ error: 'supabase_error', message: 'No se pudo regenerar la disponibilidad.' }, 502);
  }

  await c.env.R2.put(r2Paths.availabilityJson(tenant, project, pointer.version), JSON.stringify(file), {
    httpMetadata: {
      contentType: 'application/json',
      cacheControl: 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
    },
  });

  return c.json({ ok: true, tenant, project, version: pointer.version, unitCount: Object.keys(file.units).length });
});
