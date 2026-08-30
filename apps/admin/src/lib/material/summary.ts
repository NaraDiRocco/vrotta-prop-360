/**
 * Derivaciones puras sobre el catálogo + el estado guardado. Sin I/O: lo mismo
 * corre en el server (para el resumen del checklist de salud) que en el
 * cliente (para pintar la lista sin volver a pedir).
 */
import type { ProjectKind } from '@r360/core';
import { catalogFor, type MaterialItem } from './catalog.ts';
import type { MaterialFileRow, MaterialStateRow, MaterialStatus, MaterialSummary } from './types.ts';

/** Un ítem del catálogo con su estado y sus archivos ya pegados. */
export interface MaterialEntry {
  item: MaterialItem;
  status: MaterialStatus;
  notes: string | null;
  updatedAt: string | null;
  updatedByEmail: string | null;
  files: MaterialFileRow[];
}

/**
 * "Resuelto" tiene DOS definiciones legítimas según a quién se le muestre.
 * Son distintas a propósito y conviene no unificarlas:
 *
 *  - Para NOSOTROS (el panel), un ítem `recibido` todavía no está cerrado:
 *    llegó un archivo pero falta revisarlo. Sólo `aprobado` o `no_aplica`
 *    cierran el ítem.
 *  - Para el CLIENTE (la vista pública), `recibido` SÍ está resuelto: él ya
 *    hizo su parte. Decirle "te falta" algo que acaba de subir es incorrecto
 *    y lo empuja a subirlo de nuevo.
 *
 * Usar la definición equivocada del lado equivocado es un bug de producto,
 * no de código: por eso están separadas y nombradas.
 */
export function isResolved(status: MaterialStatus): boolean {
  return status === 'aprobado' || status === 'no_aplica';
}

/** La definición que se le muestra al cliente: lo que él ya entregó. */
export function isResolvedForClient(status: MaterialStatus): boolean {
  return status === 'recibido' || isResolved(status);
}

export function buildEntries(
  kind: ProjectKind,
  states: readonly MaterialStateRow[],
  files: readonly MaterialFileRow[],
): MaterialEntry[] {
  const stateById = new Map(states.map((s) => [s.itemId, s]));
  const filesById = new Map<string, MaterialFileRow[]>();
  for (const file of files) {
    const list = filesById.get(file.itemId);
    if (list) list.push(file);
    else filesById.set(file.itemId, [file]);
  }

  return catalogFor(kind).map((item) => {
    const state = stateById.get(item.id);
    return {
      item,
      status: state?.status ?? 'pendiente',
      notes: state?.notes ?? null,
      updatedAt: state?.updatedAt ?? null,
      updatedByEmail: state?.updatedByEmail ?? null,
      files: filesById.get(item.id) ?? [],
    };
  });
}

export function summarize(entries: readonly MaterialEntry[]): MaterialSummary {
  const obligatorios = entries.filter((e) => e.item.requisito === 'obligatorio');
  const faltantes = obligatorios.filter((e) => !isResolved(e.status)).map((e) => e.item.id);
  const resueltos = entries.filter((e) => isResolved(e.status)).length;
  return {
    total: entries.length,
    obligatorios: obligatorios.length,
    obligatoriosFaltantes: faltantes.length,
    faltantes,
    recibidosSinAprobar: entries.filter((e) => e.status === 'recibido').length,
    archivos: entries.reduce((n, e) => n + e.files.length, 0),
    progreso: entries.length === 0 ? 1 : resueltos / entries.length,
  };
}

export function summaryFor(
  kind: ProjectKind,
  states: readonly MaterialStateRow[],
  files: readonly MaterialFileRow[],
): MaterialSummary {
  return summarize(buildEntries(kind, states, files));
}
