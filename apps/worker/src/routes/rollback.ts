import { Hono } from 'hono';
import type { Env } from '../env.ts';
import { getActivePointer, rollbackPointer } from '../lib/pointer.ts';
import { r2Paths } from '../lib/r2paths.ts';

/**
 * POST /api/rollback
 * body: { tenant: string, project: string, toVersion: number }
 *
 * Revierte el puntero de KV a una versión previamente publicada. No borra ni
 * reescribe nada en R2 — las versiones son inmutables, sólo cambia a cuál
 * apunta el sitio en vivo.
 *
 * ADVERTENCIA que se devuelve siempre en la respuesta: los ESTADOS de unidad
 * (disponible/reservado/vendido/...) se leen en vivo desde availability.json,
 * que el visor pide aparte del tour.json versionado. Hacer rollback del
 * tour.json (geometría, escenas, hotspots) NO revierte availability.json —
 * eso sigue reflejando el estado comercial actual de Supabase, no el que
 * había cuando se publicó `toVersion`.
 */
export const rollback = new Hono<{ Bindings: Env }>();

rollback.post('/api/rollback', async (c) => {
  const body = await c.req
    .json<{ tenant?: string; project?: string; toVersion?: number }>()
    .catch(() => ({}) as { tenant?: string; project?: string; toVersion?: number });
  const { tenant, project, toVersion } = body;
  if (!tenant || !project || typeof toVersion !== 'number') {
    return c.json({ error: 'bad_request', message: 'Faltan tenant, project y/o toVersion' }, 400);
  }

  const current = await getActivePointer(c.env.TENANTS_KV, tenant, project);
  if (!current) {
    return c.json({ error: 'not_published', message: `No hay versión activa para ${tenant}/${project}` }, 404);
  }

  const key = r2Paths.tourJson(tenant, project, toVersion);
  const exists = await c.env.R2.head(key);
  if (!exists) {
    return c.json(
      { error: 'version_not_found', message: `No existe la versión ${toVersion} en R2 (${key})` },
      404,
    );
  }

  const pointer = await rollbackPointer(c.env.TENANTS_KV, tenant, project, toVersion);

  return c.json({
    ok: true,
    tenant,
    project,
    pointer,
    warning:
      'Los estados de unidad (disponible/reservado/vendido/...) NO se revierten con este rollback: ' +
      'se leen en vivo desde availability.json, que refleja el estado comercial actual en Supabase, ' +
      'independientemente de qué versión del tour esté activa.',
  });
});
