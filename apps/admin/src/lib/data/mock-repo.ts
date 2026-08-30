import type { UnitStatus } from '@r360/core';
import { validateAttrs } from '../units/attrs.ts';
import type { RpcFilter } from '../units/selection.ts';
import { countByStatus } from '../units/query.ts';
import { mockDb } from './mock.ts';
import { completenessOf, type Repo, type Structure } from './repo.ts';
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

/**
 * Repo en memoria. Escribe de verdad sobre el singleton: cambiar un estado y
 * recargar la página muestra el cambio, igual que contra Supabase. Se pierde
 * al reiniciar el proceso, que es exactamente lo que uno quiere de un mock.
 */
export class MockRepo implements Repo {
  async getSession(): Promise<SessionUser | null> {
    return mockDb().user;
  }

  private projectsOf(tenantSlug: string): ProjectRow[] {
    const db = mockDb();
    const membership = db.user.memberships.find((m) => m.tenantSlug === tenantSlug);
    if (!membership) return [];
    return db.projects.filter((p) => p.tenantId === membership.tenantId);
  }

  async listProjects(tenantSlug: string): Promise<ProjectCard[]> {
    const cards: ProjectCard[] = [];
    for (const project of this.projectsOf(tenantSlug)) {
      const units = await this.getAllUnits(project.id);
      const health = await this.getHealth(project.id);
      cards.push({
        ...project,
        unitsTotal: units.length,
        statusCounts: countByStatus(units),
        completeness: completenessOf(units, health),
        health,
      });
    }
    return cards;
  }

  async getProject(tenantSlug: string, projectSlug: string): Promise<ProjectRow | null> {
    return this.projectsOf(tenantSlug).find((p) => p.slug === projectSlug) ?? null;
  }

  async getHealth(projectId: string): Promise<HealthRow> {
    const db = mockDb();
    const units = db.units[projectId] ?? [];
    const project = db.projects.find((p) => p.id === projectId);
    const settings = project?.settings ?? {};
    const domains = settings['allowed_domains'];
    return {
      projectId,
      unitsTotal: units.length,
      unitsWithoutGeometry: units.filter((u) => !u.hasPolygon).length,
      scenesWithFailedJobs: 0,
      publicUnitsWithoutCurrentPrice: units.filter((u) => u.price === null || u.price.visibility !== 'public').length,
      hasInitialScene: typeof settings['initial_scene_id'] === 'string',
      hasAuthorizedDomains: Array.isArray(domains) && domains.length > 0,
      scenesTotal: db.scenesTotal[projectId] ?? 0,
    };
  }

  async getStructure(projectId: string): Promise<Structure> {
    const db = mockDb();
    return { groups: db.groups[projectId] ?? [], types: db.types[projectId] ?? [] };
  }

  async getAllUnits(projectId: string): Promise<UnitRow[]> {
    return mockDb().units[projectId] ?? [];
  }

  async updateUnit(projectId: string, unitId: string, patch: UnitPatch): Promise<UnitRow> {
    const db = mockDb();
    const units = db.units[projectId];
    const index = units?.findIndex((u) => u.id === unitId) ?? -1;
    const current = index >= 0 ? units?.[index] : undefined;
    if (!units || !current) throw new Error(`Unidad ${unitId} no existe en ${projectId}`);

    const next: UnitRow = { ...current, updatedAt: new Date().toISOString() };
    if (patch.status !== undefined) {
      this.pushLog(unitId, current.status, patch.status, null);
      next.status = patch.status;
    }
    if (patch.areaTotalM2 !== undefined) next.areaTotalM2 = patch.areaTotalM2;
    if (patch.groupId !== undefined) {
      next.groupId = patch.groupId;
      next.groupCode = (db.groups[projectId] ?? []).find((g) => g.id === patch.groupId)?.code ?? null;
    }
    if (patch.unitTypeId !== undefined) {
      const type = (db.types[projectId] ?? []).find((t) => t.id === patch.unitTypeId);
      next.unitTypeId = patch.unitTypeId;
      next.typeCode = type?.code ?? null;
      next.typeName = type?.name ?? null;
    }
    if (patch.attrs !== undefined) {
      const type = (db.types[projectId] ?? []).find((t) => t.id === next.unitTypeId);
      const check = validateAttrs(type?.attrSchema ?? {}, patch.attrs);
      if (!check.ok) {
        const first = check.issues[0];
        throw new Error(`${first?.key ?? 'attrs'}: ${first?.message ?? 'inválido'}`);
      }
      next.attrs = patch.attrs;
    }

    units[index] = next;
    return next;
  }

  private pushLog(unitId: string, from: UnitStatus, to: UnitStatus, note: string | null): void {
    const db = mockDb();
    const entries = db.log[unitId] ?? [];
    entries.unshift({
      id: `log-${unitId}-${entries.length}`,
      fromStatus: from,
      toStatus: to,
      changedAt: new Date().toISOString(),
      changedByEmail: db.user.email,
      note,
    });
    db.log[unitId] = entries;
  }

  /** Réplica del predicado de `set_units_status` (0011), clave por clave. */
  async setUnitsStatus(calls: RpcFilter[], status: UnitStatus, note: string | null): Promise<number> {
    const db = mockDb();
    let changed = 0;
    for (const call of calls) {
      const units = db.units[call.project_id] ?? [];
      for (let i = 0; i < units.length; i += 1) {
        const unit = units[i];
        if (!unit) continue;
        if (call.group_id && unit.groupId !== call.group_id) continue;
        if (call.unit_type_id && unit.unitTypeId !== call.unit_type_id) continue;
        if (call.status_in && !call.status_in.includes(unit.status)) continue;
        if (call.code_in && !call.code_in.includes(unit.code)) continue;
        if (call.code_prefix && !unit.code.startsWith(call.code_prefix)) continue;
        if (unit.status === status) continue;
        this.pushLog(unit.id, unit.status, status, note);
        units[i] = { ...unit, status, updatedAt: new Date().toISOString() };
        changed += 1;
      }
    }
    return changed;
  }

  async getUnitPrices(unitId: string): Promise<UnitPrice[]> {
    return mockDb().prices[unitId] ?? [];
  }

  async getUnitLog(unitId: string): Promise<StatusLogEntry[]> {
    return mockDb().log[unitId] ?? [];
  }

  async saveGroups(projectId: string, groups: GroupRow[]): Promise<void> {
    mockDb().groups[projectId] = groups;
    const units = mockDb().units[projectId] ?? [];
    const byId = new Map(groups.map((g) => [g.id, g]));
    for (let i = 0; i < units.length; i += 1) {
      const unit = units[i];
      if (!unit) continue;
      units[i] = { ...unit, groupCode: unit.groupId ? byId.get(unit.groupId)?.code ?? null : null };
    }
  }

  async saveUnitType(projectId: string, type: UnitTypeRow): Promise<void> {
    const types = mockDb().types[projectId] ?? [];
    const index = types.findIndex((t) => t.id === type.id);
    if (index >= 0) types[index] = type;
    else types.push(type);
    mockDb().types[projectId] = types;
  }
}
