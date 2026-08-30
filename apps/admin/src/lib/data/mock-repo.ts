import type { UnitStatus } from '@r360/core';
import { computeDiff, computeWarnings, sceneToSnapshot, unitToSnapshot, type PublishSnapshot } from '../publish/diff.ts';
import { validateAttrs } from '../units/attrs.ts';
import type { RpcFilter } from '../units/selection.ts';
import { countByStatus } from '../units/query.ts';
import { filterLeads, type LeadFilters } from '../leads/filters.ts';
import { ensureSeeded, readProject, readScene, writeScene } from '../editor/hotspot-store.ts';
import type { HotspotRow } from '../editor/records.ts';
import { mockDb, type MockPublication } from './mock.ts';
import {
  completenessOf,
  type CreateUnitsOptions,
  type CreateUnitsResult,
  type LeadListFilters,
  type NewGroupInput,
  type NewProjectInput,
  type NewSceneInput,
  type NewTenantInput,
  type NewUnitInput,
  type NewUnitTypeInput,
  type Repo,
  type Structure,
} from './repo.ts';
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

  /* ── Alta ──────────────────────────────────────────────────────────── */

  async createTenant(input: NewTenantInput): Promise<{ id: string; slug: string; name: string }> {
    const db = mockDb();
    if (db.user.memberships.some((m) => m.tenantSlug === input.slug)) {
      throw new Error(`Ya existe un cliente con el slug «${input.slug}».`);
    }
    const tenantId = crypto.randomUUID();
    db.user.memberships.push({
      tenantId,
      tenantSlug: input.slug,
      tenantName: input.name,
      role: 'owner',
    });
    return { id: tenantId, slug: input.slug, name: input.name };
  }

  async createProject(tenantSlug: string, input: NewProjectInput): Promise<ProjectRow> {
    const db = mockDb();
    const membership = db.user.memberships.find((m) => m.tenantSlug === tenantSlug);
    if (!membership) throw new Error(`No encontré el cliente «${tenantSlug}».`);
    if (db.projects.some((p) => p.tenantId === membership.tenantId && p.slug === input.slug)) {
      throw new Error(`Ya hay un proyecto con el slug «${input.slug}» en este cliente.`);
    }

    const project: ProjectRow = {
      id: crypto.randomUUID(),
      tenantId: membership.tenantId,
      slug: input.slug,
      name: input.name,
      kind: input.kind,
      location: input.location,
      publishedVersion: 0,
      settings: {},
      updatedAt: new Date().toISOString(),
    };
    db.projects.push(project);
    db.groups[project.id] = [];
    db.types[project.id] = [];
    db.units[project.id] = [];
    db.scenes[project.id] = [];
    db.jobs[project.id] = [];
    db.scenesTotal[project.id] = 0;
    db.publications[project.id] = [];
    db.leads[project.id] = [];
    db.previewTokens[project.id] = [];
    return project;
  }

  async deleteProject(projectId: string): Promise<void> {
    const db = mockDb();
    db.projects = db.projects.filter((p) => p.id !== projectId);
    delete db.groups[projectId];
    delete db.types[projectId];
    delete db.units[projectId];
    delete db.scenes[projectId];
    delete db.jobs[projectId];
    delete db.scenesTotal[projectId];
    delete db.publications[projectId];
    delete db.leads[projectId];
    delete db.previewTokens[projectId];
  }

  async createGroups(projectId: string, groups: NewGroupInput[]): Promise<GroupRow[]> {
    const db = mockDb();
    const existing = db.groups[projectId] ?? [];
    for (const g of groups) {
      existing.push({ id: g.id, parentId: g.parentId, kind: g.kind, code: g.code, name: g.name, sort: g.sort });
    }
    db.groups[projectId] = existing;
    return existing;
  }

  async createUnitTypes(projectId: string, types: NewUnitTypeInput[]): Promise<UnitTypeRow[]> {
    const db = mockDb();
    const existing = db.types[projectId] ?? [];
    for (const t of types) {
      if (existing.some((e) => e.code === t.code)) continue;
      existing.push({ id: crypto.randomUUID(), code: t.code, name: t.name, attrSchema: t.attrSchema });
    }
    db.types[projectId] = existing;
    return existing;
  }

  async createUnits(
    projectId: string,
    units: NewUnitInput[],
    options: CreateUnitsOptions,
  ): Promise<CreateUnitsResult> {
    const db = mockDb();
    const groups = db.groups[projectId] ?? [];
    const types = db.types[projectId] ?? [];
    const existingUnits = db.units[projectId] ?? [];

    let groupsCreated = 0;
    if (options.createMissingGroups) {
      for (const code of new Set(units.map((u) => u.groupCode).filter((c): c is string => !!c))) {
        if (groups.some((g) => g.code === code)) continue;
        groups.push({
          id: crypto.randomUUID(),
          parentId: null,
          kind: options.groupKind,
          code,
          name: code,
          sort: groups.length + 1,
        });
        groupsCreated += 1;
      }
      db.groups[projectId] = groups;
    }

    let typesCreated = 0;
    if (options.createMissingTypes) {
      for (const unit of units) {
        if (!unit.typeCode || types.some((t) => t.code === unit.typeCode)) continue;
        types.push({
          id: crypto.randomUUID(),
          code: unit.typeCode,
          name: unit.typeName ?? unit.typeCode,
          attrSchema: {},
        });
        typesCreated += 1;
      }
      db.types[projectId] = types;
    }

    const seen = new Set(existingUnits.map((u) => u.code));
    const skipped: string[] = [];
    let pricesCreated = 0;
    let created = 0;

    for (const unit of units) {
      if (seen.has(unit.code)) {
        skipped.push(unit.code);
        continue;
      }
      seen.add(unit.code);
      const group = unit.groupCode ? groups.find((g) => g.code === unit.groupCode) ?? null : null;
      const type = unit.typeCode ? types.find((t) => t.code === unit.typeCode) ?? null : null;
      const id = crypto.randomUUID();
      existingUnits.push({
        id,
        code: unit.code,
        status: unit.status,
        groupId: group?.id ?? null,
        groupCode: group?.code ?? null,
        unitTypeId: type?.id ?? null,
        typeCode: type?.code ?? null,
        typeName: type?.name ?? null,
        areaTotalM2: unit.areaTotalM2,
        attrs: unit.attrs,
        price: unit.price ? { ...unit.price } : null,
        hasPolygon: false,
        updatedAt: new Date().toISOString(),
        sort: unit.sort,
      });
      if (unit.price) {
        db.prices[id] = [{
          id: crypto.randomUUID(),
          amount: unit.price.amount,
          currency: unit.price.currency,
          visibility: unit.price.visibility,
          validFrom: new Date().toISOString(),
          validTo: null,
        }];
        pricesCreated += 1;
      }
      created += 1;
    }

    db.units[projectId] = existingUnits;
    return { created, skipped, groupsCreated, typesCreated, pricesCreated };
  }

  /* ── Escenas y cola de procesamiento ──────────────────────────────── */

  async listScenes(projectId: string): Promise<SceneRow[]> {
    return [...(mockDb().scenes[projectId] ?? [])].sort((a, b) => a.sort - b.sort);
  }

  async createScene(projectId: string, input: NewSceneInput): Promise<SceneRow> {
    const db = mockDb();
    const existing = db.scenes[projectId] ?? [];
    const scene: SceneRow = {
      id: `mock-scene-${projectId}-${existing.length + 1}-${Date.now()}`,
      projectId,
      slug: input.slug,
      kind: input.kind,
      name: input.name,
      source: input.source,
      sort: existing.length + 1,
      isInitial: existing.length === 0,
      hotspotCount: 0,
      createdAt: new Date().toISOString(),
    };
    db.scenes[projectId] = [...existing, scene];
    db.scenesTotal[projectId] = db.scenes[projectId]?.length ?? 0;

    const job: JobRow = {
      id: `mock-job-${projectId}-${(db.jobs[projectId]?.length ?? 0) + 1}-${Date.now()}`,
      projectId,
      sceneId: scene.id,
      sceneName: scene.name,
      kind: 'tiling',
      status: 'queued',
      progress: 0,
      etaS: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.jobs[projectId] = [job, ...(db.jobs[projectId] ?? [])];

    if (input.kind === 'panorama' && db.scenes[projectId]) {
      // Simula el arranque del procesamiento: pasa a running enseguida.
      const jobIndex = db.jobs[projectId]?.findIndex((j) => j.id === job.id) ?? -1;
      const jobs = db.jobs[projectId];
      if (jobs && jobIndex >= 0) {
        jobs[jobIndex] = { ...job, status: 'running', progress: 5, etaS: 180, updatedAt: new Date().toISOString() };
      }
    }

    return scene;
  }

  async renameScene(projectId: string, sceneId: string, name: string): Promise<void> {
    const scenes = mockDb().scenes[projectId] ?? [];
    const index = scenes.findIndex((s) => s.id === sceneId);
    if (index < 0) throw new Error(`Escena ${sceneId} no existe`);
    scenes[index] = { ...scenes[index], name } as SceneRow;
  }

  async deleteScene(projectId: string, sceneId: string): Promise<void> {
    const db = mockDb();
    const scenes = db.scenes[projectId] ?? [];
    const target = scenes.find((s) => s.id === sceneId);
    db.scenes[projectId] = scenes.filter((s) => s.id !== sceneId);
    db.scenesTotal[projectId] = db.scenes[projectId]?.length ?? 0;
    db.jobs[projectId] = (db.jobs[projectId] ?? []).filter((j) => j.sceneId !== sceneId);
    if (target?.isInitial) {
      const project = db.projects.find((p) => p.id === projectId);
      if (project) {
        const { initial_scene_id: _drop, ...rest } = project.settings;
        project.settings = rest;
      }
    }
  }

  async setInitialScene(projectId: string, sceneId: string): Promise<void> {
    const db = mockDb();
    const scenes = db.scenes[projectId] ?? [];
    db.scenes[projectId] = scenes.map((s) => ({ ...s, isInitial: s.id === sceneId }));
    const project = db.projects.find((p) => p.id === projectId);
    if (project) project.settings = { ...project.settings, initial_scene_id: sceneId };
  }

  async reorderScenes(projectId: string, orderedSceneIds: string[]): Promise<void> {
    const db = mockDb();
    const scenes = db.scenes[projectId] ?? [];
    const byId = new Map(scenes.map((s) => [s.id, s]));
    const reordered: SceneRow[] = [];
    orderedSceneIds.forEach((id, i) => {
      const scene = byId.get(id);
      if (scene) reordered.push({ ...scene, sort: i + 1 });
    });
    // Cualquier escena no listada (no debería pasar) va al final, sin perderla.
    for (const scene of scenes) {
      if (!orderedSceneIds.includes(scene.id)) reordered.push(scene);
    }
    db.scenes[projectId] = reordered;
  }

  async listJobs(projectId: string): Promise<JobRow[]> {
    return [...(mockDb().jobs[projectId] ?? [])].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async retryJob(projectId: string, jobId: string): Promise<void> {
    const jobs = mockDb().jobs[projectId] ?? [];
    const index = jobs.findIndex((j) => j.id === jobId);
    if (index < 0) throw new Error(`Job ${jobId} no existe`);
    const current = jobs[index];
    if (!current) return;
    jobs[index] = { ...current, status: 'queued', progress: 0, error: null, updatedAt: new Date().toISOString() };
  }

  async cancelJob(projectId: string, jobId: string): Promise<void> {
    const jobs = mockDb().jobs[projectId] ?? [];
    const index = jobs.findIndex((j) => j.id === jobId);
    if (index < 0) throw new Error(`Job ${jobId} no existe`);
    const current = jobs[index];
    if (!current) return;
    jobs[index] = { ...current, status: 'canceled', updatedAt: new Date().toISOString() };
  }

  /* ── Publicación ───────────────────────────────────────────────────── */

  private async draftSnapshot(projectId: string): Promise<PublishSnapshot> {
    const db = mockDb();
    const units = (db.units[projectId] ?? []).map(unitToSnapshot);
    const scenes = (db.scenes[projectId] ?? []).map(sceneToSnapshot);
    const project = db.projects.find((p) => p.id === projectId);
    const settings = project?.settings ?? {};
    const initialSceneId = typeof settings['initial_scene_id'] === 'string' ? (settings['initial_scene_id'] as string) : null;
    const allowedDomains = Array.isArray(settings['allowed_domains']) ? (settings['allowed_domains'] as string[]) : [];
    return { units, scenes, config: { initialSceneId, allowedDomains } };
  }

  private lastPublication(projectId: string): MockPublication | null {
    const pubs = mockDb().publications[projectId] ?? [];
    return pubs.length > 0 ? (pubs[pubs.length - 1] ?? null) : null;
  }

  async getPublishState(projectId: string): Promise<PublishState> {
    const db = mockDb();
    const project = db.projects.find((p) => p.id === projectId);
    const last = this.lastPublication(projectId);
    const draft = await this.draftSnapshot(projectId);
    const tenant = db.user.memberships.find((m) => m.tenantId === project?.tenantId)?.tenantSlug ?? '';
    const projectSlug = project?.slug ?? '';
    return {
      liveVersion: last?.version ?? null,
      livePublishedAt: last?.publishedAt ?? null,
      draftChanges: computeDiff(last?.snapshot ?? null, draft, tenant, projectSlug),
      warnings: computeWarnings(draft, tenant, projectSlug),
    };
  }

  async listPublications(projectId: string): Promise<PublicationRow[]> {
    const pubs = mockDb().publications[projectId] ?? [];
    return [...pubs]
      .sort((a, b) => b.version - a.version)
      .map((p) => ({
        id: `${projectId}-v${p.version}`,
        projectId,
        version: p.version,
        note: p.note,
        publishedByEmail: p.publishedByEmail,
        publishedAt: p.publishedAt,
      }));
  }

  async publish(projectId: string, note: string | null): Promise<PublicationRow> {
    const db = mockDb();
    const project = db.projects.find((p) => p.id === projectId);
    if (!project) throw new Error(`Proyecto ${projectId} no existe`);
    const last = this.lastPublication(projectId);
    const nextVersion = (last?.version ?? 0) + 1;
    const snapshot = await this.draftSnapshot(projectId);
    const publishedAt = new Date().toISOString();
    const pub: MockPublication = { version: nextVersion, note, publishedByEmail: db.user.email, publishedAt, snapshot };
    db.publications[projectId] = [...(db.publications[projectId] ?? []), pub];
    project.publishedVersion = nextVersion;
    return { id: `${projectId}-v${nextVersion}`, projectId, version: nextVersion, note, publishedByEmail: db.user.email, publishedAt };
  }

  async revertPublication(projectId: string, version: number): Promise<void> {
    const db = mockDb();
    const pubs = db.publications[projectId] ?? [];
    const target = pubs.find((p) => p.version === version);
    if (!target) throw new Error(`No existe la versión ${version}`);
    const nextVersion = (this.lastPublication(projectId)?.version ?? 0) + 1;
    const reverted: MockPublication = {
      version: nextVersion,
      note: `Revertido a v${version}${target.note ? ` — "${target.note}"` : ''}`,
      publishedByEmail: db.user.email,
      publishedAt: new Date().toISOString(),
      snapshot: target.snapshot,
    };
    db.publications[projectId] = [...pubs, reverted];
    const project = db.projects.find((p) => p.id === projectId);
    if (project) project.publishedVersion = nextVersion;
  }

  async listPreviewTokens(projectId: string): Promise<PreviewTokenRow[]> {
    return mockDb().previewTokens[projectId] ?? [];
  }

  async createPreviewToken(projectId: string, ttlMinutes: number, note: string | null): Promise<PreviewTokenRow> {
    const db = mockDb();
    const token: PreviewTokenRow = {
      token: `pv_${Math.random().toString(36).slice(2, 10)}`,
      note,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttlMinutes * 60_000).toISOString(),
      revoked: false,
    };
    db.previewTokens[projectId] = [token, ...(db.previewTokens[projectId] ?? [])];
    return token;
  }

  async revokePreviewToken(projectId: string, token: string): Promise<void> {
    const tokens = mockDb().previewTokens[projectId] ?? [];
    const index = tokens.findIndex((t) => t.token === token);
    if (index < 0) return;
    const current = tokens[index];
    if (current) tokens[index] = { ...current, revoked: true };
  }

  /* ── Leads ─────────────────────────────────────────────────────────── */

  async listLeads(tenantSlug: string, filters: LeadListFilters = {}): Promise<LeadRow[]> {
    const projectIds = new Set(this.projectsOf(tenantSlug).map((p) => p.id));
    const db = mockDb();
    const all = Object.entries(db.leads)
      .filter(([projectId]) => projectIds.has(projectId))
      .flatMap(([, leads]) => leads);

    const asFilters: LeadFilters = {
      projectId: filters.projectId ?? null,
      status: (filters.status as LeadRow['status'] | undefined) ?? null,
      unitCode: filters.unitCode ?? null,
      from: filters.from ?? null,
      to: filters.to ?? null,
      text: filters.text ?? '',
    };
    return filterLeads(all, asFilters);
  }

  private findLead(leadId: string): { projectId: string; index: number } | null {
    const db = mockDb();
    for (const [projectId, leads] of Object.entries(db.leads)) {
      const index = leads.findIndex((l) => l.id === leadId);
      if (index >= 0) return { projectId, index };
    }
    return null;
  }

  async updateLead(leadId: string, patch: LeadPatch): Promise<LeadRow> {
    const db = mockDb();
    const loc = this.findLead(leadId);
    if (!loc) throw new Error(`Lead ${leadId} no existe`);
    const leads = db.leads[loc.projectId];
    const current = leads?.[loc.index];
    if (!leads || !current) throw new Error(`Lead ${leadId} no existe`);
    const next: LeadRow = { ...current, ...patch };
    leads[loc.index] = next;
    return next;
  }

  /* ── Hotspots (editor) ─────────────────────────────────────────────── */

  async listHotspots(projectId: string): Promise<HotspotRow[]> {
    const scenes = await this.listScenes(projectId);
    ensureSeeded(projectId, scenes);
    return readProject(scenes);
  }

  async saveSceneHotspots(projectId: string, sceneId: string, hotspots: HotspotRow[]): Promise<void> {
    const scenes = await this.listScenes(projectId);
    ensureSeeded(projectId, scenes);
    writeScene(sceneId, hotspots);

    // El mock no es una maqueta: escribe de verdad, así que el contador de la
    // pantalla de escenas y el `hasPolygon` de la tabla de unidades tienen que
    // quedar coherentes con lo que se acaba de dibujar. Si no, el editor dice
    // "listo" y la tabla sigue mostrando la unidad como pendiente.
    const db = mockDb();
    const list = db.scenes[projectId];
    const index = list?.findIndex((s) => s.id === sceneId) ?? -1;
    const scene = index >= 0 ? list?.[index] : undefined;
    if (list && scene) list[index] = { ...scene, hotspotCount: hotspots.length };

    const withPolygon = new Set<string>();
    for (const sc of scenes) {
      for (const h of sc.id === sceneId ? hotspots : readScene(sc.id)) {
        if (h.unitCode) withPolygon.add(h.unitCode);
      }
    }
    const units = db.units[projectId] ?? [];
    for (let i = 0; i < units.length; i += 1) {
      const unit = units[i];
      if (!unit) continue;
      const has = withPolygon.has(unit.code);
      if (unit.hasPolygon !== has) units[i] = { ...unit, hasPolygon: has };
    }
  }

  async bulkUpdateLeads(leadIds: string[], patch: LeadPatch): Promise<number> {
    let changed = 0;
    for (const id of leadIds) {
      try {
        await this.updateLead(id, patch);
        changed += 1;
      } catch {
        // sigue con el resto — un id inválido no aborta el resto del lote.
      }
    }
    return changed;
  }
}
