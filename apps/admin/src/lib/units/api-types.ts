import type { UnitStatus } from '@r360/core';
import type { StatusLogEntry, UnitPatch, UnitPrice, UnitRow } from '../data/types.ts';
import type { UnitsPage } from './query.ts';
import type { Selection } from './selection.ts';

export interface UnitsResponse extends UnitsPage {
  /** Conteo por grupo, para el árbol de la izquierda. */
  groupCounts: Record<string, { total: number; counts: Record<UnitStatus, number> }>;
}

export interface BulkStatusRequest {
  selection: Selection;
  status: UnitStatus;
  note: string | null;
  /** Estado de la tabla, para poder materializar cuando el filtro no es predicado. */
  params: import('./query.ts').UnitsQueryParams;
}

export interface BulkStatusResponse {
  changed: number;
  strategy: 'predicate' | 'materialize';
  reason?: string;
}

export interface UnitDetailResponse {
  prices: UnitPrice[];
  log: StatusLogEntry[];
}

export type { UnitPatch, UnitRow, UnitPrice, StatusLogEntry };
