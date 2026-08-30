import type { UnitStatus } from '@r360/core';
import { createSupabaseServerClient } from '../supabase/server.ts';
import { countByStatus } from '../units/query.ts';
import type { RpcFilter } from '../units/selection.ts';
import { completenessOf, type Repo, type Structure } from './repo.ts';
import type {
  GroupRow,
  HealthRow,
  Membership,
  ProjectCard,
  ProjectRow,
  Role,
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
}
