/**
 * Contrato de acceso a datos.
 *
 * Hay dos implementaciones: `MockRepo` (sirve el seed de Baleia desde memoria,
 * sin backend) y `SupabaseRepo`. La conmuta `NEXT_PUBLIC_R360_MOCK`. Todo lo
 * que consume el panel pasa por acá — ninguna pantalla habla con supabase-js
 * directamente, así el modo mock nunca queda a medias.
 */
import type { UnitStatus } from '@r360/core';
import type { RpcFilter } from '../units/selection.ts';
import type {
  GroupRow,
  HealthRow,
  ProjectCard,
  ProjectRow,
  SessionUser,
  StatusLogEntry,
  UnitPatch,
  UnitPrice,
  UnitRow,
  UnitTypeRow,
} from './types.ts';

export interface Structure {
  groups: GroupRow[];
  types: UnitTypeRow[];
}

export interface Repo {
  getSession(): Promise<SessionUser | null>;
  listProjects(tenantSlug: string): Promise<ProjectCard[]>;
  getProject(tenantSlug: string, projectSlug: string): Promise<ProjectRow | null>;
  getHealth(projectId: string): Promise<HealthRow>;
  getStructure(projectId: string): Promise<Structure>;
  /** Universo de unidades del proyecto. El filtrado/paginado lo hace queryUnits. */
  getAllUnits(projectId: string): Promise<UnitRow[]>;
  updateUnit(projectId: string, unitId: string, patch: UnitPatch): Promise<UnitRow>;
  /** Devuelve cuántas unidades cambió. Una llamada al RPC por cada RpcFilter. */
  setUnitsStatus(calls: RpcFilter[], status: UnitStatus, note: string | null): Promise<number>;
  getUnitPrices(unitId: string): Promise<UnitPrice[]>;
  getUnitLog(unitId: string): Promise<StatusLogEntry[]>;
  saveGroups(projectId: string, groups: GroupRow[]): Promise<void>;
  saveUnitType(projectId: string, type: UnitTypeRow): Promise<void>;
}

export function isMockMode(): boolean {
  return process.env['NEXT_PUBLIC_R360_MOCK'] !== '0';
}

export function completenessOf(units: readonly UnitRow[], health: HealthRow): number {
  if (units.length === 0) return 0;
  const withGeometry = units.length - health.unitsWithoutGeometry;
  const withPrice = units.filter((u) => u.price !== null).length;
  const scene = health.hasInitialScene ? 1 : 0;
  return Math.max(0, Math.min(1, (withGeometry / units.length) * 0.5 + (withPrice / units.length) * 0.3 + scene * 0.2));
}

export type { ProjectCard, ProjectRow, SessionUser };
