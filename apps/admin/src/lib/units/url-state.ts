/**
 * TODO el estado de la tabla vive en la URL.
 *
 * No es purismo: si el fundador filtra "sin polígono en la manzana 4" y
 * recarga, tiene que seguir viendo eso; y tiene que poder mandarle ese link al
 * cliente. Estado en React = link inservible y F5 destructivo.
 *
 * Claves cortas a propósito, la URL se lee y se pega a mano:
 *   q sort dir page ps  ·  g (grupos) t (tipos) s (estados) u (unidad abierta)
 */
import { isUnitStatus, type UnitStatus } from '@r360/core';
import { DEFAULT_PARAMS, type SortKey, type UnitsQueryParams } from './query.ts';

const SORT_KEYS: SortKey[] = ['code', 'status', 'group', 'type', 'area', 'price', 'updated'];

export interface TableState extends UnitsQueryParams {
  /** Código de la unidad abierta en el panel lateral. */
  openUnit: string | null;
}

function csv(value: string | null): string[] {
  return (value ?? '').split(',').map((v) => v.trim()).filter(Boolean);
}

function num(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseTableState(search: URLSearchParams): TableState {
  const sortRaw = search.get('sort');
  const sort = SORT_KEYS.find((k) => k === sortRaw) ?? DEFAULT_PARAMS.sort;
  return {
    q: search.get('q') ?? '',
    groupIds: csv(search.get('g')),
    unitTypeIds: csv(search.get('t')),
    statuses: csv(search.get('s')).filter((s): s is UnitStatus => isUnitStatus(s)),
    m2Min: num(search.get('m2min')),
    m2Max: num(search.get('m2max')),
    sort,
    dir: search.get('dir') === 'desc' ? 'desc' : 'asc',
    page: Math.max(1, num(search.get('page')) ?? 1),
    pageSize: Math.min(1000, Math.max(20, num(search.get('ps')) ?? DEFAULT_PARAMS.pageSize)),
    openUnit: search.get('u'),
  };
}

/** Sólo escribe lo que difiere del default: la URL queda corta y legible. */
export function serializeTableState(state: TableState): string {
  const out = new URLSearchParams();
  if (state.q) out.set('q', state.q);
  if (state.groupIds.length) out.set('g', state.groupIds.join(','));
  if (state.unitTypeIds.length) out.set('t', state.unitTypeIds.join(','));
  if (state.statuses.length) out.set('s', state.statuses.join(','));
  if (state.m2Min !== null) out.set('m2min', String(state.m2Min));
  if (state.m2Max !== null) out.set('m2max', String(state.m2Max));
  if (state.sort !== DEFAULT_PARAMS.sort) out.set('sort', state.sort);
  if (state.dir !== DEFAULT_PARAMS.dir) out.set('dir', state.dir);
  if (state.page > 1) out.set('page', String(state.page));
  if (state.pageSize !== DEFAULT_PARAMS.pageSize) out.set('ps', String(state.pageSize));
  if (state.openUnit) out.set('u', state.openUnit);
  return out.toString();
}

export function defaultTableState(): TableState {
  return { ...DEFAULT_PARAMS, openUnit: null };
}

/** Params que van al servidor (el panel lateral no cambia la consulta). */
export function toQueryParams(state: TableState): UnitsQueryParams {
  const { openUnit: _openUnit, ...params } = state;
  return params;
}
