/**
 * Selección de unidades y traducción a las llamadas de `set_units_status`.
 *
 * La clave del diseño: cuando el usuario elige "todas las que coinciden con el
 * filtro", NO materializamos una lista de ids. La selección queda como
 * predicado (`{mode:'filter', filter, excluded}`) y la operación masiva viaja
 * al RPC como predicado. Es lo que permite cambiar 800 lotes con un request de
 * 200 bytes en vez de reventar la petición con 800 uuids.
 *
 * El RPC `set_units_status(p_filter jsonb, p_status text, p_note text)` sólo
 * entiende estas claves:
 *   project_id (obligatorio) · group_id · unit_type_id · status_in ·
 *   code_in · code_prefix
 * Cualquier filtro fuera de ese vocabulario (m², precio, texto libre, "sin
 * polígono") NO es expresable como predicado y hay que materializar los
 * códigos. `planBulkStatusChange` decide cuál de los dos caminos toma y lo
 * dice explícitamente, para que la UI pueda avisar cuando va a materializar.
 */
import type { UnitStatus } from '@r360/core';
import { isEmptyRange, type ParsedQuery } from './search.ts';

/** Filtro efectivo de la tabla: lo que se ve es lo que se opera. */
export interface UnitFilter {
  projectId: string;
  /** Subárbol de grupos ya resuelto a ids. Vacío = sin filtro por grupo. */
  groupIds: string[];
  unitTypeIds: string[];
  query: ParsedQuery;
}

export type Selection =
  /** Marcado a mano. Las claves son CÓDIGOS de unidad (únicos por proyecto). */
  | { mode: 'codes'; codes: string[] }
  /** "Todas las que coinciden": predicado + exclusiones puntuales. */
  | { mode: 'filter'; filter: UnitFilter; excluded: string[] };

export const EMPTY_SELECTION: Selection = { mode: 'codes', codes: [] };

export function selectionIsEmpty(sel: Selection): boolean {
  return sel.mode === 'codes' && sel.codes.length === 0;
}

/**
 * Cantidad de unidades seleccionadas. `matchedTotal` es el total que devolvió
 * el server para el filtro vigente (necesario en modo predicado).
 */
export function selectionCount(sel: Selection, matchedTotal: number): number {
  if (sel.mode === 'codes') return sel.codes.length;
  return Math.max(0, matchedTotal - sel.excluded.length);
}

export function isSelected(sel: Selection, code: string): boolean {
  if (sel.mode === 'codes') return sel.codes.includes(code);
  return !sel.excluded.includes(code);
}

export function toggle(sel: Selection, code: string): Selection {
  if (sel.mode === 'codes') {
    return sel.codes.includes(code)
      ? { mode: 'codes', codes: sel.codes.filter((c) => c !== code) }
      : { mode: 'codes', codes: [...sel.codes, code] };
  }
  return sel.excluded.includes(code)
    ? { mode: 'filter', filter: sel.filter, excluded: sel.excluded.filter((c) => c !== code) }
    : { mode: 'filter', filter: sel.filter, excluded: [...sel.excluded, code] };
}

/** ⌘⇧A — pasa a modo predicado sobre el filtro vigente. */
export function selectAllMatching(filter: UnitFilter): Selection {
  return { mode: 'filter', filter, excluded: [] };
}

/** Claves jsonb que acepta `set_units_status`. */
export interface RpcFilter {
  project_id: string;
  group_id?: string;
  unit_type_id?: string;
  status_in?: UnitStatus[];
  code_in?: string[];
  code_prefix?: string;
}

export type BulkPlan =
  /**
   * Camino barato: N llamadas al RPC, cada una con un predicado. N > 1 sólo
   * cuando el subárbol de grupos tiene más de un grupo (el RPC acepta un
   * group_id por llamada).
   */
  | { kind: 'predicate'; calls: RpcFilter[] }
  /**
   * Camino caro: el filtro no es expresable. Hay que resolver los códigos que
   * matchean y mandarlos en tandas de `code_in`.
   */
  | { kind: 'materialize'; reason: string; chunkSize: number; base: RpcFilter };

export const MATERIALIZE_CHUNK = 500;

/** ¿El filtro entra entero en el vocabulario del RPC? */
export function unexpressibleReasons(filter: UnitFilter): string[] {
  const q = filter.query;
  const reasons: string[] = [];
  if (!isEmptyRange(q.m2)) reasons.push('rango de m²');
  if (!isEmptyRange(q.price)) reasons.push('rango de precio');
  if (q.missing.length > 0) reasons.push('"sin:" (polígono/precio)');
  if (q.has.length > 0) reasons.push('"con:" (polígono/precio)');
  if (q.groupCodes.length > 0 && filter.groupIds.length === 0) reasons.push('grupo por código sin resolver');
  if (q.typeCodes.length > 0 && filter.unitTypeIds.length === 0) reasons.push('tipo por código sin resolver');
  if (filter.unitTypeIds.length > 1) reasons.push('más de un tipo de unidad');
  // El texto libre se resuelve como prefijo de código sólo si es un único
  // término alfanumérico; cualquier otra cosa exige búsqueda real.
  if (q.text.length > 1) reasons.push('varios términos de texto');
  if (q.text.length === 1 && !/^[\w-]+$/.test(q.text[0] ?? '')) reasons.push('texto libre no alfanumérico');
  return reasons;
}

export function planBulkStatusChange(sel: Selection, projectId: string): BulkPlan {
  if (sel.mode === 'codes') {
    return {
      kind: 'predicate',
      calls: chunk(sel.codes, MATERIALIZE_CHUNK).map((codes) => ({
        project_id: projectId,
        code_in: codes,
      })),
    };
  }

  const { filter, excluded } = sel;
  const reasons = unexpressibleReasons(filter);
  const base: RpcFilter = { project_id: projectId };
  const q = filter.query;
  if (q.status.length > 0) base.status_in = q.status;
  if (filter.unitTypeIds.length === 1 && filter.unitTypeIds[0]) base.unit_type_id = filter.unitTypeIds[0];
  if (q.text.length === 1 && /^[\w-]+$/.test(q.text[0] ?? '')) base.code_prefix = (q.text[0] ?? '').toUpperCase();

  // Excluir a mano no es expresable como predicado negativo en el RPC.
  if (excluded.length > 0) reasons.push('exclusiones manuales');

  if (reasons.length > 0) {
    return { kind: 'materialize', reason: reasons.join(', '), chunkSize: MATERIALIZE_CHUNK, base };
  }

  if (filter.groupIds.length === 0) return { kind: 'predicate', calls: [base] };
  return {
    kind: 'predicate',
    calls: filter.groupIds.map((groupId) => ({ ...base, group_id: groupId })),
  };
}

export function chunk<T>(arr: readonly T[], size: number): T[][] {
  if (size <= 0) return [Array.from(arr)];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
