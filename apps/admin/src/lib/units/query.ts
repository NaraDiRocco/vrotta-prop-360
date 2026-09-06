/**
 * Motor de consulta de unidades: filtra, ordena y pagina.
 *
 * Corre SIEMPRE del lado del servidor (route handler / server component); el
 * navegador recibe una página, nunca las 1.000 filas. Está separado del repo a
 * propósito: el repo sólo sabe traer el universo de unidades del proyecto, y
 * esta función pura es la que define qué significa cada filtro. Así el modo
 * mock y el modo Supabase filtran EXACTAMENTE igual.
 */
import { UNIT_STATUSES, type UnitStatus } from '@r360/core';
import type { StatusCounts, UnitRow } from '../data/types.ts';
import { parseUnitQuery, rangeMatches, type ParsedQuery } from './search.ts';

export type SortKey = 'code' | 'status' | 'group' | 'type' | 'area' | 'price' | 'updated';

export interface UnitsQueryParams {
  /** Texto crudo con la sintaxis de búsqueda. */
  q: string;
  /** Subárbol de grupos ya resuelto (ids). Vacío = sin filtro. */
  groupIds: string[];
  unitTypeIds: string[];
  /** Chips de estado. Se suman a `estado:` de la query. */
  statuses: UnitStatus[];
  m2Min: number | null;
  m2Max: number | null;
  sort: SortKey;
  dir: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

export const DEFAULT_PARAMS: UnitsQueryParams = {
  q: '',
  groupIds: [],
  unitTypeIds: [],
  statuses: [],
  m2Min: null,
  m2Max: null,
  sort: 'code',
  dir: 'asc',
  page: 1,
  pageSize: 100,
};

export function emptyCounts(): StatusCounts {
  return {
    disponible: 0,
    reservado: 0,
    vendido: 0,
    bloqueado: 0,
    no_disponible: 0,
    proximamente: 0,
  };
}

export function countByStatus(rows: readonly UnitRow[]): StatusCounts {
  const counts = emptyCounts();
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

function matchesText(row: UnitRow, terms: readonly string[]): boolean {
  if (terms.length === 0) return true;
  const haystack = [row.code, row.groupCode ?? '', row.typeCode ?? '', row.typeName ?? '']
    .join(' ')
    .toLowerCase();
  return terms.every((t) => haystack.includes(t.toLowerCase()));
}

export function matchesQuery(
  row: UnitRow,
  params: UnitsQueryParams,
  parsed: ParsedQuery,
): boolean {
  if (params.groupIds.length > 0 && (row.groupId === null || !params.groupIds.includes(row.groupId))) return false;
  if (params.unitTypeIds.length > 0 && (row.unitTypeId === null || !params.unitTypeIds.includes(row.unitTypeId))) {
    return false;
  }

  const statuses = new Set<UnitStatus>([...params.statuses, ...parsed.status]);
  if (statuses.size > 0 && !statuses.has(row.status)) return false;

  if (params.m2Min !== null && (row.areaTotalM2 === null || row.areaTotalM2 < params.m2Min)) return false;
  if (params.m2Max !== null && (row.areaTotalM2 === null || row.areaTotalM2 > params.m2Max)) return false;

  if (!rangeMatches(parsed.m2, row.areaTotalM2)) return false;
  if (!rangeMatches(parsed.price, row.price?.amount ?? null)) return false;

  if (parsed.groupCodes.length > 0 && !parsed.groupCodes.includes((row.groupCode ?? '').toUpperCase())) return false;
  if (parsed.typeCodes.length > 0 && !parsed.typeCodes.includes((row.typeCode ?? '').toLowerCase())) return false;

  for (const flag of parsed.missing) {
    if (flag === 'poligono' && row.hasPolygon) return false;
    if (flag === 'precio' && row.price !== null) return false;
  }
  for (const flag of parsed.has) {
    if (flag === 'poligono' && !row.hasPolygon) return false;
    if (flag === 'precio' && row.price === null) return false;
  }

  return matchesText(row, parsed.text);
}

const STATUS_ORDER = new Map<UnitStatus, number>(UNIT_STATUSES.map((s, i) => [s, i]));

function compare(a: UnitRow, b: UnitRow, key: SortKey): number {
  switch (key) {
    case 'status':
      return (STATUS_ORDER.get(a.status) ?? 0) - (STATUS_ORDER.get(b.status) ?? 0);
    case 'group':
      return (a.groupCode ?? '').localeCompare(b.groupCode ?? '');
    case 'type':
      return (a.typeCode ?? '').localeCompare(b.typeCode ?? '');
    case 'area':
      return (a.areaTotalM2 ?? -1) - (b.areaTotalM2 ?? -1);
    case 'price':
      return (a.price?.amount ?? -1) - (b.price?.amount ?? -1);
    case 'updated':
      return a.updatedAt.localeCompare(b.updatedAt);
    default:
      return a.code.localeCompare(b.code, undefined, { numeric: true });
  }
}

export interface UnitsPage {
  rows: UnitRow[];
  /** Total que matchea el filtro (no el de la página). */
  total: number;
  /** Conteo por estado sobre TODO lo que matchea: alimenta los chips. */
  counts: StatusCounts;
  /** Conteo por estado del proyecto entero, ignorando filtros. */
  countsAll: StatusCounts;
  page: number;
  pageSize: number;
  warnings: string[];
}

export function queryUnits(all: readonly UnitRow[], params: UnitsQueryParams): UnitsPage {
  const parsed = parseUnitQuery(params.q);
  const matched = all.filter((row) => matchesQuery(row, params, parsed));

  const sorted = [...matched].sort((a, b) => {
    const primary = compare(a, b, params.sort);
    const signed = params.dir === 'desc' ? -primary : primary;
    return signed !== 0 ? signed : a.code.localeCompare(b.code, undefined, { numeric: true });
  });

  const pageSize = Math.max(1, params.pageSize);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const page = Math.min(Math.max(1, params.page), pages);
  const start = (page - 1) * pageSize;

  return {
    rows: sorted.slice(start, start + pageSize),
    total: sorted.length,
    counts: countByStatus(matched),
    countsAll: countByStatus(all),
    page,
    pageSize,
    warnings: parsed.warnings,
  };
}

/** Códigos que matchean el filtro, sin paginar. Para materializar selecciones. */
export function matchingCodes(all: readonly UnitRow[], params: UnitsQueryParams): string[] {
  const parsed = parseUnitQuery(params.q);
  return all.filter((row) => matchesQuery(row, params, parsed)).map((row) => row.code);
}
