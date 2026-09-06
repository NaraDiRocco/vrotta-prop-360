import type { SceneKind, UnitStatus } from '@r360/core';

/** Rol DENTRO de una inmobiliaria (`memberships.role`). */
export type Role = 'owner' | 'editor' | 'sales';

/** Rol en Vrotta, la plataforma (`platform_members.role`). Cruza tenants. */
export type PlatformRole = 'admin' | 'operator';

export interface Membership {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  role: Role;
}

export interface SessionUser {
  id: string;
  email: string;
  memberships: Membership[];
  /**
   * Rol de plataforma, o null si es un usuario de inmobiliaria. Alguien de
   * Vrotta NO tiene memberships: opera todos los clientes por este campo.
   */
  platformRole: PlatformRole | null;
}

/**
 * Una fila de `platform_members`, con el email ya resuelto para mostrar en
 * `/admin/team`. La tabla sólo guarda `user_id`: el email sale de la Admin
 * API de Supabase (no hay otra forma de leer `auth.users`), una lectura, sin
 * mandar nada — invitar gente nueva es P2c.
 */
export interface PlatformMemberRow {
  userId: string;
  email: string;
  role: PlatformRole;
  createdAt: string;
}

/**
 * Quién está operando y desde dónde. Es lo único que se le pasa a las
 * funciones de `roles.ts`: nunca un `Role` suelto, porque un rol de cliente y
 * uno de plataforma no se comparan entre sí.
 */
export type Actor =
  | { kind: 'platform'; role: PlatformRole }
  | { kind: 'tenant'; role: Role };

/** Identidad mínima de una inmobiliaria, para el chrome del panel. */
export interface TenantRef {
  id: string;
  slug: string;
  name: string;
}

export type ProjectKind = 'loteo' | 'edificio' | 'complejo' | 'mixto';

export interface ProjectRow {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  kind: ProjectKind;
  location: { address?: string; lat?: number; lng?: number };
  publishedVersion: number;
  settings: Record<string, unknown>;
  updatedAt: string;
}

export interface GroupRow {
  id: string;
  parentId: string | null;
  kind: string;
  code: string;
  name: string | null;
  sort: number;
}

export interface UnitTypeRow {
  id: string;
  code: string;
  name: string;
  attrSchema: unknown;
}

export interface UnitPrice {
  id: string;
  amount: number;
  currency: string;
  visibility: 'public' | 'on_request' | 'private';
  validFrom: string;
  validTo: string | null;
}

export interface StatusLogEntry {
  id: string;
  fromStatus: UnitStatus | null;
  toStatus: UnitStatus;
  changedAt: string;
  changedByEmail: string | null;
  note: string | null;
}

export interface UnitRow {
  id: string;
  code: string;
  status: UnitStatus;
  groupId: string | null;
  groupCode: string | null;
  unitTypeId: string | null;
  typeCode: string | null;
  typeName: string | null;
  areaTotalM2: number | null;
  attrs: Record<string, unknown>;
  /** Precio vigente (valid_to null). null si no tiene. */
  price: { amount: number; currency: string; visibility: UnitPrice['visibility'] } | null;
  /** ¿Tiene al menos un hotspot con geometría? Alimenta `sin:poligono`. */
  hasPolygon: boolean;
  updatedAt: string;
  sort: number;
}

export type StatusCounts = Record<UnitStatus, number>;

export interface ProjectCard extends ProjectRow {
  unitsTotal: number;
  statusCounts: StatusCounts;
  /** 0..1 — cuánto del proyecto está listo (geometría + precio + escena). */
  completeness: number;
  health: HealthRow;
}

export interface HealthRow {
  projectId: string;
  unitsWithoutGeometry: number;
  scenesWithFailedJobs: number;
  publicUnitsWithoutCurrentPrice: number;
  hasInitialScene: boolean;
  hasAuthorizedDomains: boolean;
  unitsTotal: number;
  scenesTotal: number;
}

export interface UnitPatch {
  status?: UnitStatus;
  areaTotalM2?: number | null;
  groupId?: string | null;
  unitTypeId?: string | null;
  attrs?: Record<string, unknown>;
}

/* ── Escenas y procesamiento ─────────────────────────────────────────── */

export interface SceneRow {
  id: string;
  projectId: string;
  slug: string;
  kind: SceneKind;
  name: string;
  source: Record<string, unknown>;
  sort: number;
  isInitial: boolean;
  hotspotCount: number;
  createdAt: string;
}

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'canceled';

export interface JobRow {
  id: string;
  projectId: string;
  sceneId: string | null;
  sceneName: string | null;
  kind: string;
  status: JobStatus;
  progress: number;
  etaS: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Resultado de validar un archivo antes de subir un byte. */
export interface UploadValidationIssue {
  code:
    | 'formato'
    | 'aspecto'
    | 'resolucion'
    | 'tamano'
    | 'dimensiones';
  message: string;
}

export interface UploadValidationResult {
  ok: boolean;
  issues: UploadValidationIssue[];
}

/* ── Publicación ──────────────────────────────────────────────────────── */

export interface PublicationRow {
  id: string;
  projectId: string;
  version: number;
  note: string | null;
  publishedByEmail: string | null;
  publishedAt: string;
}

export type DiffSection = 'units' | 'hotspots' | 'scenes' | 'config';
export type DiffChangeKind = 'added' | 'removed' | 'modified';

export interface DiffEntry {
  id: string;
  section: DiffSection;
  kind: DiffChangeKind;
  label: string;
  detail: string;
  /** Deeplink a la pantalla que originó el cambio. */
  href: string;
}

export interface PublishWarning {
  id: string;
  message: string;
  href: string;
}

export interface PublishState {
  liveVersion: number | null;
  livePublishedAt: string | null;
  draftChanges: DiffEntry[];
  warnings: PublishWarning[];
}

export interface PreviewTokenRow {
  token: string;
  note: string | null;
  createdAt: string;
  expiresAt: string;
  revoked: boolean;
}

/* ── Leads ────────────────────────────────────────────────────────────── */

export type LeadStatus = 'nuevo' | 'contactado' | 'calificado' | 'descartado' | 'ganado';
export type LeadChannel = 'form' | 'crm_webhook' | 'whatsapp';

export interface LeadRow {
  id: string;
  projectId: string;
  projectSlug: string;
  projectName: string;
  unitId: string | null;
  unitCode: string | null;
  unitStatus: UnitStatus | null;
  channel: LeadChannel | string;
  name: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  status: LeadStatus;
  read: boolean;
  notes: string | null;
  source: { url?: string; referrer?: string; utm?: Record<string, string>; device?: string } | null;
  createdAt: string;
}

export interface LeadPatch {
  status?: LeadStatus;
  read?: boolean;
  notes?: string;
}
