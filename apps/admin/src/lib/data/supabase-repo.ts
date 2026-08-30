import type { UnitStatus } from '@r360/core';
import { createSupabaseServerClient } from '../supabase/server.ts';
import { countByStatus } from '../units/query.ts';
import type { HotspotRow } from '../editor/records.ts';
import type { Pt } from '../editor/records.ts';
import type { RpcFilter } from '../units/selection.ts';
import { computeDiff, computeWarnings, unitToSnapshot, type PublishSnapshot, type UnitSnapshot } from '../publish/diff.ts';
import { filterLeads, type LeadFilters } from '../leads/filters.ts';
import { completenessOf, type LeadListFilters, type NewSceneInput, type Repo, type Structure } from './repo.ts';
import type {
  GroupRow,
  HealthRow,
  JobRow,
  LeadPatch,
  LeadRow,
  Membership,
  PreviewTokenRow,
  ProjectCard,
  ProjectRow,
  PublicationRow,
  PublishState,
  Role,
  SceneRow,
  SessionUser,
  StatusLogEntry,
  UnitPatch,
  UnitPrice,
  UnitRow,
  UnitTypeRow,
} from './types.ts';

/** Tope de filas por proyecto. Ver nota de paginación en el README. */
const UNIT_HARD_LIMIT = 20000;

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function first<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export class SupabaseRepo implements Repo {
  async getSession(): Promise<SessionUser | null> {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return null;

    const { data: rows } = await supabase
      .from('memberships')
      .select('role, tenants(id, slug, name)')
      .eq('user_id', user.id);

    const memberships: Membership[] = (rows ?? []).flatMap((row) => {
      const record = asRecord(row);
      const tenant = asRecord(first(record['tenants'] as Record<string, unknown> | Record<string, unknown>[]));
      if (typeof tenant['slug'] !== 'string') return [];
      return [{
        tenantId: String(tenant['id']),
        tenantSlug: tenant['slug'],
        tenantName: String(tenant['name'] ?? tenant['slug']),
        role: (record['role'] as Role | undefined) ?? 'sales',
      }];
    });

    return { id: user.id, email: user.email ?? '', memberships };
  }

  private async projectQuery(tenantSlug: string) {
    const supabase = await createSupabaseServerClient();
    const { data: tenant } = await supabase.from('tenants').select('id').eq('slug', tenantSlug).maybeSingle();
    const tenantId = tenant ? String(asRecord(tenant)['id']) : null;
    return { supabase, tenantId };
  }

  private toProject(raw: unknown): ProjectRow {
    const r = asRecord(raw);
    return {
      id: String(r['id']),
      tenantId: String(r['tenant_id']),
      slug: String(r['slug']),
      name: String(r['name']),
      kind: (r['kind'] as ProjectRow['kind']) ?? 'mixto',
      location: asRecord(r['location']) as ProjectRow['location'],
      publishedVersion: Number(r['published_version'] ?? 0),
      settings: asRecord(r['settings']),
      updatedAt: String(r['updated_at'] ?? ''),
    };
  }

  async listProjects(tenantSlug: string): Promise<ProjectCard[]> {
    const { supabase, tenantId } = await this.projectQuery(tenantSlug);
    if (!tenantId) return [];
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name');

    const cards: ProjectCard[] = [];
    for (const raw of data ?? []) {
      const project = this.toProject(raw);
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
    const { supabase, tenantId } = await this.projectQuery(tenantSlug);
    if (!tenantId) return null;
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('slug', projectSlug)
      .maybeSingle();
    return data ? this.toProject(data) : null;
  }

  async getHealth(projectId: string): Promise<HealthRow> {
    const supabase = await createSupabaseServerClient();
    const [{ data }, { count: unitsTotal }, { count: scenesTotal }] = await Promise.all([
      supabase.from('project_health').select('*').eq('project_id', projectId).maybeSingle(),
      supabase.from('units').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
      supabase.from('scenes').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
    ]);
    const r = asRecord(data);
    return {
      projectId,
      unitsWithoutGeometry: Number(r['units_without_geometry'] ?? 0),
      scenesWithFailedJobs: Number(r['scenes_with_failed_jobs'] ?? 0),
      publicUnitsWithoutCurrentPrice: Number(r['public_units_without_current_price'] ?? 0),
      hasInitialScene: r['has_initial_scene'] === true,
      hasAuthorizedDomains: r['has_authorized_domains'] === true,
      unitsTotal: unitsTotal ?? 0,
      scenesTotal: scenesTotal ?? 0,
    };
  }

  async getStructure(projectId: string): Promise<Structure> {
    const supabase = await createSupabaseServerClient();
    const [groups, types] = await Promise.all([
      supabase.from('groups').select('id, parent_id, kind, code, name, sort').eq('project_id', projectId).order('sort'),
      supabase.from('unit_types').select('id, code, name, attr_schema').eq('project_id', projectId).order('code'),
    ]);
    return {
      groups: (groups.data ?? []).map<GroupRow>((raw) => {
        const r = asRecord(raw);
        return {
          id: String(r['id']),
          parentId: r['parent_id'] === null ? null : String(r['parent_id']),
          kind: String(r['kind'] ?? 'grupo'),
          code: String(r['code']),
          name: r['name'] === null ? null : String(r['name']),
          sort: Number(r['sort'] ?? 0),
        };
      }),
      types: (types.data ?? []).map<UnitTypeRow>((raw) => {
        const r = asRecord(raw);
        return {
          id: String(r['id']),
          code: String(r['code']),
          name: String(r['name']),
          attrSchema: r['attr_schema'] ?? {},
        };
      }),
    };
  }

  async getAllUnits(projectId: string): Promise<UnitRow[]> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('units')
      .select(
        'id, code, status, group_id, unit_type_id, area_total_m2, attrs, sort, updated_at, ' +
          'groups(code), unit_types(code, name), ' +
          'unit_prices(amount, currency, visibility, valid_from, valid_to), ' +
          'hotspots(id)',
      )
      .eq('project_id', projectId)
      .order('code')
      .range(0, UNIT_HARD_LIMIT - 1);
    if (error) throw new Error(`No pude leer las unidades: ${error.message}`);

    return (data ?? []).map<UnitRow>((raw) => {
      const r = asRecord(raw);
      const group = asRecord(first(r['groups'] as Record<string, unknown> | Record<string, unknown>[]));
      const type = asRecord(first(r['unit_types'] as Record<string, unknown> | Record<string, unknown>[]));
      const prices = Array.isArray(r['unit_prices']) ? (r['unit_prices'] as unknown[]) : [];
      const current = prices.map(asRecord).find((p) => p['valid_to'] === null) ?? null;
      const hotspots = Array.isArray(r['hotspots']) ? (r['hotspots'] as unknown[]) : [];
      const area = r['area_total_m2'];

      return {
        id: String(r['id']),
        code: String(r['code']),
        status: r['status'] as UnitStatus,
        groupId: r['group_id'] === null ? null : String(r['group_id']),
        groupCode: typeof group['code'] === 'string' ? group['code'] : null,
        unitTypeId: r['unit_type_id'] === null ? null : String(r['unit_type_id']),
        typeCode: typeof type['code'] === 'string' ? type['code'] : null,
        typeName: typeof type['name'] === 'string' ? type['name'] : null,
        areaTotalM2: area === null || area === undefined ? null : Number(area),
        attrs: asRecord(r['attrs']),
        price: current
          ? {
              amount: Number(current['amount']),
              currency: String(current['currency'] ?? 'USD'),
              visibility: (current['visibility'] as UnitPrice['visibility']) ?? 'public',
            }
          : null,
        hasPolygon: hotspots.length > 0,
        updatedAt: String(r['updated_at'] ?? ''),
        sort: Number(r['sort'] ?? 0),
      };
    });
  }

  async updateUnit(projectId: string, unitId: string, patch: UnitPatch): Promise<UnitRow> {
    const supabase = await createSupabaseServerClient();
    const payload: Record<string, unknown> = {};
    if (patch.status !== undefined) payload['status'] = patch.status;
    if (patch.areaTotalM2 !== undefined) payload['area_total_m2'] = patch.areaTotalM2;
    if (patch.groupId !== undefined) payload['group_id'] = patch.groupId;
    if (patch.unitTypeId !== undefined) payload['unit_type_id'] = patch.unitTypeId;
    if (patch.attrs !== undefined) payload['attrs'] = patch.attrs;

    const { error } = await supabase.from('units').update(payload).eq('id', unitId).eq('project_id', projectId);
    if (error) throw new Error(error.message);

    const units = await this.getAllUnits(projectId);
    const updated = units.find((u) => u.id === unitId);
    if (!updated) throw new Error('La unidad ya no está visible después de guardar.');
    return updated;
  }

  async setUnitsStatus(calls: RpcFilter[], status: UnitStatus, note: string | null): Promise<number> {
    const supabase = await createSupabaseServerClient();
    let total = 0;
    for (const filter of calls) {
      const { data, error } = await supabase.rpc('set_units_status', {
        p_filter: filter,
        p_status: status,
        p_note: note,
      });
      if (error) throw new Error(error.message);
      total += Number(data ?? 0);
    }
    return total;
  }

  async getUnitPrices(unitId: string): Promise<UnitPrice[]> {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from('unit_prices')
      .select('id, amount, currency, visibility, valid_from, valid_to')
      .eq('unit_id', unitId)
      .order('valid_from', { ascending: false });
    return (data ?? []).map((raw) => {
      const r = asRecord(raw);
      return {
        id: String(r['id']),
        amount: Number(r['amount']),
        currency: String(r['currency'] ?? 'USD'),
        visibility: (r['visibility'] as UnitPrice['visibility']) ?? 'public',
        validFrom: String(r['valid_from']),
        validTo: r['valid_to'] === null ? null : String(r['valid_to']),
      };
    });
  }

  async getUnitLog(unitId: string): Promise<StatusLogEntry[]> {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from('unit_status_log')
      .select('id, from_status, to_status, changed_at, note')
      .eq('unit_id', unitId)
      .order('changed_at', { ascending: false })
      .limit(100);
    return (data ?? []).map((raw) => {
      const r = asRecord(raw);
      return {
        id: String(r['id']),
        fromStatus: r['from_status'] === null ? null : (r['from_status'] as UnitStatus),
        toStatus: r['to_status'] as UnitStatus,
        changedAt: String(r['changed_at']),
        // El join a auth.users no es accesible con la anon key; se resuelve
        // cuando exista una vista pública de perfiles.
        changedByEmail: null,
        note: r['note'] === null ? null : String(r['note']),
      };
    });
  }

  async saveGroups(projectId: string, groups: GroupRow[]): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from('groups').upsert(
      groups.map((g) => ({
        id: g.id,
        project_id: projectId,
        parent_id: g.parentId,
        kind: g.kind,
        code: g.code,
        name: g.name,
        sort: g.sort,
      })),
    );
    if (error) throw new Error(error.message);
  }

  async saveUnitType(projectId: string, type: UnitTypeRow): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from('unit_types').upsert({
      id: type.id,
      project_id: projectId,
      code: type.code,
      name: type.name,
      attr_schema: type.attrSchema,
    });
    if (error) throw new Error(error.message);
  }
  /* ── Hotspots (editor) ─────────────────────────────────────────────── */

  async listHotspots(projectId: string): Promise<HotspotRow[]> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('hotspots')
      .select('id, scene_id, unit_code, geometry_kind, geometry, anchor, label, z_index, scenes!inner(project_id)')
      .eq('scenes.project_id', projectId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: String(row.id),
      sceneId: String(row.scene_id),
      unitCode: row.unit_code === null ? null : String(row.unit_code),
      geometryKind: row.geometry_kind as HotspotRow['geometryKind'],
      geometry: toRing(row.geometry),
      anchor: toPoint(row.anchor),
      label: row.label === null ? null : String(row.label),
      zIndex: typeof row.z_index === 'number' ? row.z_index : 1,
    }));
  }

  async saveSceneHotspots(projectId: string, sceneId: string, hotspots: HotspotRow[]): Promise<void> {
    const supabase = await createSupabaseServerClient();
    // Reemplazo completo de la escena, en dos pasos y en este orden: primero
    // entra lo nuevo y después se borra lo que ya no está. Al revés, un fallo
    // entre los dos pasos dejaría la escena sin ningun poligono.
    if (hotspots.length > 0) {
      const { error } = await supabase.from('hotspots').upsert(
        hotspots.map((h) => ({
          id: h.id,
          scene_id: sceneId,
          unit_code: h.unitCode,
          geometry_kind: h.geometryKind,
          geometry: h.geometry.map(([a, b]) => [a, b]),
          anchor: h.anchor ? [h.anchor[0], h.anchor[1]] : null,
          label: h.label,
          z_index: h.zIndex,
        })),
      );
      if (error) throw new Error(error.message);
    }
    const keep = hotspots.map((h) => h.id);
    const query = supabase.from('hotspots').delete().eq('scene_id', sceneId);
    const { error: delError } = keep.length > 0 ? await query.not('id', 'in', `(${keep.join(',')})`) : await query;
    if (delError) throw new Error(delError.message);
    void projectId;
  }

  /* ── Escenas y cola de procesamiento ──────────────────────────────── */

  private async getProjectById(projectId: string): Promise<ProjectRow | null> {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.from('projects').select('*').eq('id', projectId).maybeSingle();
    return data ? this.toProject(data) : null;
  }

  private toScene(raw: unknown, initialSceneId: string | null, hotspotCounts: Map<string, number>): SceneRow {
    const r = asRecord(raw);
    const id = String(r['id']);
    return {
      id,
      projectId: String(r['project_id']),
      slug: String(r['slug']),
      kind: r['kind'] as SceneRow['kind'],
      name: String(r['name']),
      source: asRecord(r['source']),
      sort: Number(r['sort'] ?? 0),
      isInitial: id === initialSceneId,
      hotspotCount: hotspotCounts.get(id) ?? 0,
      createdAt: String(r['created_at'] ?? ''),
    };
  }

  async listScenes(projectId: string): Promise<SceneRow[]> {
    const supabase = await createSupabaseServerClient();
    const project = await this.getProjectById(projectId);
    const initialSceneId =
      typeof project?.settings['initial_scene_id'] === 'string' ? (project.settings['initial_scene_id'] as string) : null;

    const { data: idRows } = await supabase.from('scenes').select('id').eq('project_id', projectId);
    const sceneIds = (idRows ?? []).map((s) => asRecord(s)['id']);
    const [{ data: sceneRows }, { data: hotspotRows }] = await Promise.all([
      supabase.from('scenes').select('*').eq('project_id', projectId).order('sort'),
      sceneIds.length > 0
        ? supabase.from('hotspots').select('scene_id').in('scene_id', sceneIds)
        : Promise.resolve({ data: [] as unknown[] }),
    ]);
    const counts = new Map<string, number>();
    for (const raw of hotspotRows ?? []) {
      const sceneId = String(asRecord(raw)['scene_id']);
      counts.set(sceneId, (counts.get(sceneId) ?? 0) + 1);
    }
    return (sceneRows ?? []).map((raw) => this.toScene(raw, initialSceneId, counts));
  }

  async createScene(projectId: string, input: NewSceneInput): Promise<SceneRow> {
    const supabase = await createSupabaseServerClient();
    const project = await this.getProjectById(projectId);
    const { data, error } = await supabase
      .from('scenes')
      .insert({
        project_id: projectId,
        tenant_id: project?.tenantId,
        slug: input.slug,
        kind: input.kind,
        name: input.name,
        source: input.source,
        sort: 9999,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    const { error: jobError } = await supabase.from('jobs').insert({
      project_id: projectId,
      scene_id: asRecord(data)['id'],
      kind: 'tiling',
      status: 'queued',
      progress: 0,
    });
    if (jobError) throw new Error(jobError.message);

    const initialSceneId =
      typeof project?.settings['initial_scene_id'] === 'string' ? (project.settings['initial_scene_id'] as string) : null;
    return this.toScene(data, initialSceneId, new Map());
  }

  async renameScene(projectId: string, sceneId: string, name: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from('scenes').update({ name }).eq('id', sceneId).eq('project_id', projectId);
    if (error) throw new Error(error.message);
  }

  async deleteScene(projectId: string, sceneId: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from('scenes').delete().eq('id', sceneId).eq('project_id', projectId);
    if (error) throw new Error(error.message);
    const project = await this.getProjectById(projectId);
    if (project?.settings['initial_scene_id'] === sceneId) {
      const { initial_scene_id: _drop, ...rest } = project.settings;
      await supabase.from('projects').update({ settings: rest }).eq('id', projectId);
    }
  }

  async setInitialScene(projectId: string, sceneId: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const project = await this.getProjectById(projectId);
    const settings = { ...(project?.settings ?? {}), initial_scene_id: sceneId };
    const { error } = await supabase.from('projects').update({ settings }).eq('id', projectId);
    if (error) throw new Error(error.message);
  }

  async reorderScenes(projectId: string, orderedSceneIds: string[]): Promise<void> {
    const supabase = await createSupabaseServerClient();
    for (let i = 0; i < orderedSceneIds.length; i += 1) {
      const id = orderedSceneIds[i];
      if (!id) continue;
      const { error } = await supabase.from('scenes').update({ sort: i + 1 }).eq('id', id).eq('project_id', projectId);
      if (error) throw new Error(error.message);
    }
  }

  private toJob(raw: unknown, sceneNameById: Map<string, string>): JobRow {
    const r = asRecord(raw);
    const sceneId = r['scene_id'] === null || r['scene_id'] === undefined ? null : String(r['scene_id']);
    return {
      id: String(r['id']),
      projectId: String(r['project_id']),
      sceneId,
      sceneName: sceneId ? (sceneNameById.get(sceneId) ?? null) : null,
      kind: String(r['kind'] ?? 'tiling'),
      status: r['status'] as JobRow['status'],
      progress: Number(r['progress'] ?? 0),
      etaS: r['eta_s'] === null || r['eta_s'] === undefined ? null : Number(r['eta_s']),
      error: r['error'] === null || r['error'] === undefined ? null : String(r['error']),
      createdAt: String(r['created_at'] ?? ''),
      updatedAt: String(r['updated_at'] ?? ''),
    };
  }

  async listJobs(projectId: string): Promise<JobRow[]> {
    const supabase = await createSupabaseServerClient();
    const [{ data: jobRows }, { data: sceneRows }] = await Promise.all([
      supabase.from('jobs').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('scenes').select('id, name').eq('project_id', projectId),
    ]);
    const sceneNameById = new Map((sceneRows ?? []).map((s) => [String(asRecord(s)['id']), String(asRecord(s)['name'])]));
    return (jobRows ?? []).map((raw) => this.toJob(raw, sceneNameById));
  }

  async retryJob(projectId: string, jobId: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('jobs')
      .update({ status: 'queued', progress: 0, error: null })
      .eq('id', jobId)
      .eq('project_id', projectId);
    if (error) throw new Error(error.message);
  }

  async cancelJob(projectId: string, jobId: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from('jobs').update({ status: 'canceled' }).eq('id', jobId).eq('project_id', projectId);
    if (error) throw new Error(error.message);
  }

  /* ── Publicación ───────────────────────────────────────────────────── */

  /**
   * Snapshot del borrador actual, para comparar contra la última publicación.
   * `tour.json` no guarda estado/precio (se leen en vivo de availability.json,
   * ver worker/routes/publish.ts) — así que al construir el snapshot "live"
   * desde `publications.manifest` no hay estado/precio históricos reales;
   * usamos el valor actual del draft para esos dos campos y así el diff no
   * inventa cambios de estado/precio que no existieron. Es consistente con
   * que esos dos campos son puramente informativos acá (no fuerzan publicar).
   */
  private async draftSnapshot(projectId: string): Promise<PublishSnapshot> {
    const units = await this.getAllUnits(projectId);
    const scenes = await this.listScenes(projectId);
    const project = await this.getProjectById(projectId);
    const initialSceneId =
      typeof project?.settings['initial_scene_id'] === 'string' ? (project.settings['initial_scene_id'] as string) : null;
    const allowedDomains = Array.isArray(project?.settings['allowed_domains'])
      ? (project.settings['allowed_domains'] as string[])
      : [];
    return {
      units: units.map(unitToSnapshot),
      scenes: scenes.map((s) => ({ id: s.id, name: s.name, kind: s.kind, hotspotCount: s.hotspotCount })),
      config: { initialSceneId, allowedDomains },
    };
  }

  private async liveSnapshot(
    projectId: string,
    draft: PublishSnapshot,
  ): Promise<{ snapshot: PublishSnapshot; version: number; publishedAt: string } | null> {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from('publications')
      .select('version, manifest, published_at')
      .eq('project_id', projectId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const r = asRecord(data);
    const manifest = asRecord(r['manifest']);
    const draftByCode = new Map(draft.units.map((u) => [u.code, u]));
    const manifestUnits = asRecord(manifest['units']);
    const manifestHotspots = Array.isArray(manifest['hotspots']) ? (manifest['hotspots'] as unknown[]) : [];
    const units: UnitSnapshot[] = Object.entries(manifestUnits).map(([code, raw]) => {
      const u = asRecord(raw);
      const current = draftByCode.get(code);
      const hasPolygon = manifestHotspots.some((h) => asRecord(h)['unitCode'] === code);
      return {
        code,
        status: current?.status ?? 'disponible',
        price: current?.price ?? null,
        groupCode: (u['groupCode'] as string | null) ?? null,
        typeCode: (u['typeCode'] as string | null) ?? null,
        areaTotalM2: (u['areaTotalM2'] as number | null) ?? null,
        attrsSignature: JSON.stringify(u['attrs'] ?? {}),
        hasPolygon,
      };
    });
    const manifestScenes = Array.isArray(manifest['scenes']) ? (manifest['scenes'] as unknown[]) : [];
    const hotspotsBySceneCount = new Map<string, number>();
    for (const h of manifestHotspots) {
      const sceneId = String(asRecord(h)['sceneId']);
      hotspotsBySceneCount.set(sceneId, (hotspotsBySceneCount.get(sceneId) ?? 0) + 1);
    }
    const scenes = manifestScenes.map((raw) => {
      const s = asRecord(raw);
      const id = String(s['id']);
      return { id, name: String(s['name']), kind: String(s['kind']), hotspotCount: hotspotsBySceneCount.get(id) ?? 0 };
    });
    return {
      snapshot: { units, scenes, config: { initialSceneId: null, allowedDomains: [] } },
      version: Number(r['version'] ?? 0),
      publishedAt: String(r['published_at'] ?? ''),
    };
  }

  async getPublishState(projectId: string): Promise<PublishState> {
    const draft = await this.draftSnapshot(projectId);
    const live = await this.liveSnapshot(projectId, draft);
    const project = await this.getProjectById(projectId);
    const supabase = await createSupabaseServerClient();
    const { data: tenant } = await supabase.from('tenants').select('slug').eq('id', project?.tenantId).maybeSingle();
    const tenantSlug = tenant ? String(asRecord(tenant)['slug']) : '';
    return {
      liveVersion: live?.version ?? null,
      livePublishedAt: live?.publishedAt ?? null,
      draftChanges: computeDiff(live?.snapshot ?? null, draft, tenantSlug, project?.slug ?? ''),
      warnings: computeWarnings(draft, tenantSlug, project?.slug ?? ''),
    };
  }

  async listPublications(projectId: string): Promise<PublicationRow[]> {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from('publications')
      .select('id, version, note, published_at, published_by')
      .eq('project_id', projectId)
      .order('version', { ascending: false });
    return (data ?? []).map((raw) => {
      const r = asRecord(raw);
      return {
        id: String(r['id']),
        projectId,
        version: Number(r['version']),
        note: r['note'] === undefined || r['note'] === null ? null : String(r['note']),
        publishedByEmail: null,
        publishedAt: String(r['published_at'] ?? ''),
      };
    });
  }

  /**
   * Publicar de verdad (armar tour.json, escribirlo en R2, mover el puntero)
   * lo hace `apps/worker` (`POST /api/publish`) — acá el panel sólo dispara
   * ese endpoint. La URL del Worker no está en el alcance de este repo de
   * datos (no hay `WORKER_URL` en las env vars actuales de apps/admin), así
   * que dejamos la interfaz lista y documentado el enganche pendiente.
   */
  async publish(_projectId: string, _note: string | null): Promise<PublicationRow> {
    throw new Error(
      'Publicar contra Supabase requiere invocar POST /api/publish en apps/worker (no implementado desde apps/admin todavía: falta configurar WORKER_URL).',
    );
  }

  async revertPublication(_projectId: string, _version: number): Promise<void> {
    throw new Error(
      'Revertir contra Supabase requiere invocar POST /api/rollback en apps/worker (no implementado desde apps/admin todavía: falta configurar WORKER_URL).',
    );
  }

  async listPreviewTokens(projectId: string): Promise<PreviewTokenRow[]> {
    const project = await this.getProjectById(projectId);
    const raw = project?.settings['preview_tokens'];
    return Array.isArray(raw) ? (raw as PreviewTokenRow[]) : [];
  }

  async createPreviewToken(projectId: string, ttlMinutes: number, note: string | null): Promise<PreviewTokenRow> {
    const supabase = await createSupabaseServerClient();
    const project = await this.getProjectById(projectId);
    const token: PreviewTokenRow = {
      token: `pv_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
      note,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttlMinutes * 60_000).toISOString(),
      revoked: false,
    };
    const existing = await this.listPreviewTokens(projectId);
    const settings = { ...(project?.settings ?? {}), preview_tokens: [token, ...existing] };
    const { error } = await supabase.from('projects').update({ settings }).eq('id', projectId);
    if (error) throw new Error(error.message);
    return token;
  }

  async revokePreviewToken(projectId: string, token: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const project = await this.getProjectById(projectId);
    const existing = await this.listPreviewTokens(projectId);
    const next = existing.map((t) => (t.token === token ? { ...t, revoked: true } : t));
    const settings = { ...(project?.settings ?? {}), preview_tokens: next };
    const { error } = await supabase.from('projects').update({ settings }).eq('id', projectId);
    if (error) throw new Error(error.message);
  }

  /* ── Leads ─────────────────────────────────────────────────────────── */

  private toLead(raw: unknown, project: { id: string; slug: string; name: string }, unitByCode: Map<string, UnitRow>): LeadRow {
    const r = asRecord(raw);
    const payload = asRecord(r['payload']);
    const unit = r['unit_id'] ? [...unitByCode.values()].find((u) => u.id === String(r['unit_id'])) : undefined;
    const notes = payload['_notes'];
    const status = payload['_status'];
    return {
      id: String(r['id']),
      projectId: project.id,
      projectSlug: project.slug,
      projectName: project.name,
      unitId: r['unit_id'] === null || r['unit_id'] === undefined ? null : String(r['unit_id']),
      unitCode: unit?.code ?? (typeof payload['unitCode'] === 'string' ? payload['unitCode'] : null),
      unitStatus: unit?.status ?? null,
      channel: String(r['channel'] ?? 'form'),
      name: String(payload['name'] ?? ''),
      email: payload['email'] === undefined || payload['email'] === null ? null : String(payload['email']),
      phone: payload['phone'] === undefined || payload['phone'] === null ? null : String(payload['phone']),
      message: payload['message'] === undefined || payload['message'] === null ? null : String(payload['message']),
      status: (typeof status === 'string' ? status : 'nuevo') as LeadRow['status'],
      read: payload['_read'] === true,
      notes: typeof notes === 'string' ? notes : null,
      source: {
        url: typeof payload['url'] === 'string' ? payload['url'] : undefined,
        referrer: typeof payload['referrer'] === 'string' ? payload['referrer'] : undefined,
        utm: typeof payload['utm'] === 'object' && payload['utm'] !== null ? (payload['utm'] as Record<string, string>) : undefined,
        device: typeof payload['device'] === 'string' ? payload['device'] : undefined,
      },
      createdAt: String(r['created_at'] ?? ''),
    };
  }

  /**
   * `leads.payload` (jsonb, ver 0007_publications_leads_jobs_saved_views.sql)
   * no tiene columnas propias para estado/lectura/notas del panel — se
   * guardan como `_status`/`_read`/`_notes` dentro del mismo jsonb para no
   * tocar el esquema desde acá. Si más adelante se agregan columnas reales
   * (`status`, `read_at`, `notes`) conviene migrar esto.
   */
  async listLeads(tenantSlug: string, filters: LeadListFilters = {}): Promise<LeadRow[]> {
    const supabase = await createSupabaseServerClient();
    const { tenantId } = await this.projectQuery(tenantSlug);
    if (!tenantId) return [];
    const { data: projectRows } = await supabase.from('projects').select('id, slug, name').eq('tenant_id', tenantId);
    const projects = (projectRows ?? []).map((raw) => {
      const r = asRecord(raw);
      return { id: String(r['id']), slug: String(r['slug']), name: String(r['name']) };
    });
    if (projects.length === 0) return [];

    const projectIds = filters.projectId ? [filters.projectId] : projects.map((p) => p.id);
    const { data: leadRows } = await supabase
      .from('leads')
      .select('*')
      .in('project_id', projectIds)
      .order('created_at', { ascending: false });

    const all: LeadRow[] = [];
    for (const project of projects) {
      if (!projectIds.includes(project.id)) continue;
      const units = await this.getAllUnits(project.id);
      const unitByCode = new Map(units.map((u) => [u.code, u]));
      const rows = (leadRows ?? []).filter((raw) => String(asRecord(raw)['project_id']) === project.id);
      all.push(...rows.map((raw) => this.toLead(raw, project, unitByCode)));
    }

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

  private async patchLeadPayload(leadId: string, patch: LeadPatch): Promise<LeadRow> {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.from('leads').select('*').eq('id', leadId).maybeSingle();
    if (!data) throw new Error(`Lead ${leadId} no existe`);
    const r = asRecord(data);
    const payload = asRecord(r['payload']);
    const nextPayload: Record<string, unknown> = { ...payload };
    if (patch.status !== undefined) nextPayload['_status'] = patch.status;
    if (patch.read !== undefined) nextPayload['_read'] = patch.read;
    if (patch.notes !== undefined) nextPayload['_notes'] = patch.notes;

    const { error } = await supabase.from('leads').update({ payload: nextPayload }).eq('id', leadId);
    if (error) throw new Error(error.message);

    const projectId = String(r['project_id']);
    const project = await this.getProjectById(projectId);
    const units = await this.getAllUnits(projectId);
    const unitByCode = new Map(units.map((u) => [u.code, u]));
    return this.toLead(
      { ...r, payload: nextPayload },
      { id: projectId, slug: project?.slug ?? '', name: project?.name ?? '' },
      unitByCode,
    );
  }

  async updateLead(leadId: string, patch: LeadPatch): Promise<LeadRow> {
    return this.patchLeadPayload(leadId, patch);
  }

  async bulkUpdateLeads(leadIds: string[], patch: LeadPatch): Promise<number> {
    let changed = 0;
    for (const id of leadIds) {
      try {
        await this.updateLead(id, patch);
        changed += 1;
      } catch {
        // sigue con el resto.
      }
    }
    return changed;
  }
}

function toRing(value: unknown): Pt[] {
  if (!Array.isArray(value)) return [];
  const out: Pt[] = [];
  for (const p of value) {
    if (Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number') out.push([p[0], p[1]]);
  }
  return out;
}

function toPoint(value: unknown): Pt | null {
  if (Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number') return [value[0], value[1]];
  return null;
}
