/**
 * Métricas puras para la pantalla "Clientes" de plataforma (`/admin`).
 *
 * Separadas del repo para poder testearlas sin levantar Supabase ni el mock:
 * reciben el catálogo ya resuelto (vía `catalogFor`) y las filas guardadas, y
 * sólo cuentan. `supabase-repo.ts` y `mock-repo.ts` las llaman igual, cada
 * uno con sus propios datos.
 */
import type { ProjectKind } from '@r360/core';
import { catalogFor } from '../material/catalog.ts';
import type { MaterialStateRow } from '../material/types.ts';

/**
 * Ítems del catálogo de este tipo de proyecto que todavía no están
 * `aprobado` ni `no_aplica` — el mismo criterio de "lo tenemos" que usa el
 * checklist de material del proyecto (ver `lib/material/catalog.ts`). Un
 * ítem sin fila cuenta como pendiente, igual que en `listMaterial`.
 */
export function pendingMaterialCount(kind: ProjectKind, states: readonly MaterialStateRow[]): number {
  const byId = new Map(states.map((s) => [s.itemId, s]));
  let pending = 0;
  for (const item of catalogFor(kind)) {
    const state = byId.get(item.id);
    if (!state || (state.status !== 'aprobado' && state.status !== 'no_aplica')) pending++;
  }
  return pending;
}

/** La fecha más reciente de una lista que puede traer `null` (proyecto que nunca publicó). */
export function latestPublishedAt(dates: readonly (string | null)[]): string | null {
  let latest: string | null = null;
  for (const d of dates) {
    if (d && (!latest || d > latest)) latest = d;
  }
  return latest;
}
