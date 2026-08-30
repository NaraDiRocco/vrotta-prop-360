/**
 * Contrato de acceso a datos.
 *
 * Hay dos implementaciones: `MockRepo` (sirve el seed de Baleia desde memoria,
 * sin backend) y `SupabaseRepo`. La conmuta `NEXT_PUBLIC_R360_MOCK`. Todo lo
 * que consume el panel pasa por acá — ninguna pantalla habla con supabase-js
 * directamente, así el modo mock nunca queda a medias.
 */
import type { ProjectKind, UnitStatus } from '@r360/core';
import type { HotspotRow } from '../editor/records.ts';
import type { RpcFilter } from '../units/selection.ts';
import type {
  GroupRow,
  HealthRow,
  JobRow,
  LeadPatch,
  LeadRow,
  PreviewTokenRow,
  ProjectCard,
  ProjectRow,
  PublicationRow,
  PublishState,
  SceneRow,
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

export interface NewSceneInput {
  slug: string;
  kind: SceneRow['kind'];
  name: string;
  source: Record<string, unknown>;
}

/* ── Alta de tenant / proyecto / estructura / unidades ────────────────── */

export interface NewTenantInput {
  slug: string;
  name: string;
}

export interface NewProjectInput {
  slug: string;
  name: string;
  kind: ProjectKind;
  location: { address?: string; lat?: number; lng?: number };
}

/** Grupo a crear. El id lo genera el llamador para poder armar el árbol antes de escribir. */
export interface NewGroupInput {
  id: string;
  parentId: string | null;
  kind: string;
  code: string;
  name: string | null;
  sort: number;
}

export interface NewUnitTypeInput {
  code: string;
  name: string;
  attrSchema: Record<string, unknown>;
}

/**
 * Unidad a crear. Referencia grupo y tipo por CÓDIGO, no por id: tanto el
 * generador masivo como el CSV razonan en códigos, y los ids todavía no
 * existen cuando hay que crear los grupos que faltan.
 */
export interface NewUnitInput {
  code: string;
  groupCode: string | null;
  typeCode: string | null;
  typeName?: string | null;
  status: UnitStatus;
  areaTotalM2: number | null;
  attrs: Record<string, unknown>;
  sort: number;
  price?: { amount: number; currency: string; visibility: 'public' | 'on_request' } | null;
}

export interface CreateUnitsOptions {
  /** Crear los grupos referenciados que no existan. */
  createMissingGroups: boolean;
  /** `groups.kind` de los grupos creados al vuelo. */
  groupKind: string;
  /** Crear los tipos referenciados que no existan (con schema vacío). */
  createMissingTypes: boolean;
}

export interface CreateUnitsResult {
  created: number;
  /** Códigos que ya existían en el proyecto y no se tocaron. */
  skipped: string[];
  groupsCreated: number;
  typesCreated: number;
  pricesCreated: number;
}

export interface LeadListFilters {
  projectId?: string;
  status?: string;
  unitCode?: string;
  from?: string;
  to?: string;
  text?: string;
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

  /* ── Alta ──────────────────────────────────────────────────────────── */
  /** Crea el tenant y la membership `owner` del usuario de la sesión. */
  createTenant(input: NewTenantInput): Promise<{ id: string; slug: string; name: string }>;
  createProject(tenantSlug: string, input: NewProjectInput): Promise<ProjectRow>;
  /** Borra el proyecto y todo lo que cuelga de él (cascade). Sólo owner. */
  deleteProject(projectId: string): Promise<void>;
  createGroups(projectId: string, groups: NewGroupInput[]): Promise<GroupRow[]>;
  createUnitTypes(projectId: string, types: NewUnitTypeInput[]): Promise<UnitTypeRow[]>;
  /**
   * Alta masiva. Resuelve `groupCode`/`typeCode` contra la estructura ya
   * existente y, si se pide, crea lo que falte. Omite (no pisa) las unidades
   * cuyo código ya existe: un import repetido no tiene que borrar estados
   * comerciales que alguien cambió a mano.
   */
  createUnits(
    projectId: string,
    units: NewUnitInput[],
    options: CreateUnitsOptions,
  ): Promise<CreateUnitsResult>;

  /* ── Escenas y cola de procesamiento ──────────────────────────────── */
  listScenes(projectId: string): Promise<SceneRow[]>;
  createScene(projectId: string, input: NewSceneInput): Promise<SceneRow>;
  renameScene(projectId: string, sceneId: string, name: string): Promise<void>;
  deleteScene(projectId: string, sceneId: string): Promise<void>;
  setInitialScene(projectId: string, sceneId: string): Promise<void>;
  reorderScenes(projectId: string, orderedSceneIds: string[]): Promise<void>;
  listJobs(projectId: string): Promise<JobRow[]>;
  retryJob(projectId: string, jobId: string): Promise<void>;
  cancelJob(projectId: string, jobId: string): Promise<void>;

  /* ── Hotspots (editor) ─────────────────────────────────────────────── */
  /**
   * TODOS los hotspots del proyecto, de todas sus escenas. El editor los
   * necesita completos y no por escena: el indicador ◐ del panel izquierdo
   * ("esta unidad ya tiene polígono, pero en otra escena") no se puede calcular
   * mirando una sola escena, y pedir escena por escena serían N viajes para
   * pintar una lista.
   */
  listHotspots(projectId: string): Promise<HotspotRow[]>;
  /**
   * Reemplaza el conjunto COMPLETO de hotspots de una escena.
   *
   * Es un reemplazo y no un diff a propósito: el editor tiene el estado entero
   * en memoria y es su fuente de verdad mientras está abierto. Un diff
   * incremental abre la puerta a que un guardado perdido deje el servidor con
   * una mezcla de dos estados que nadie dibujó nunca.
   */
  saveSceneHotspots(projectId: string, sceneId: string, hotspots: HotspotRow[]): Promise<void>;

  /* ── Publicación ───────────────────────────────────────────────────── */
  getPublishState(projectId: string): Promise<PublishState>;
  listPublications(projectId: string): Promise<PublicationRow[]>;
  publish(projectId: string, note: string | null): Promise<PublicationRow>;
  revertPublication(projectId: string, version: number): Promise<void>;
  listPreviewTokens(projectId: string): Promise<PreviewTokenRow[]>;
  createPreviewToken(projectId: string, ttlMinutes: number, note: string | null): Promise<PreviewTokenRow>;
  revokePreviewToken(projectId: string, token: string): Promise<void>;

  /* ── Leads ─────────────────────────────────────────────────────────── */
  /** `tenantSlug` sin `filters.projectId` trae los leads de todos los proyectos del tenant. */
  listLeads(tenantSlug: string, filters?: LeadListFilters): Promise<LeadRow[]>;
  updateLead(leadId: string, patch: LeadPatch): Promise<LeadRow>;
  bulkUpdateLeads(leadIds: string[], patch: LeadPatch): Promise<number>;
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
