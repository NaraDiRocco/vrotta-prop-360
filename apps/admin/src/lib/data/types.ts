import type { UnitStatus } from '@r360/core';

export type Role = 'owner' | 'editor' | 'sales';

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
