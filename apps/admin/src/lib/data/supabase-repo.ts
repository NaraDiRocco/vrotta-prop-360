import type { ProjectKind, UnitStatus } from '@r360/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '../supabase/server.ts';
import { countByStatus } from '../units/query.ts';
import type { HotspotRow } from '../editor/records.ts';
import type { Pt } from '../editor/records.ts';
import type { RpcFilter } from '../units/selection.ts';
import { computeDiff, computeWarnings, unitToSnapshot, type PublishSnapshot, type UnitSnapshot } from '../publish/diff.ts';
import { filterLeads, type LeadFilters } from '../leads/filters.ts';
import { createServiceClient } from '../onboarding/service-client.ts';
import { latestPublishedAt, pendingMaterialCount } from '../admin/summary.ts';
import type {
  MaterialFileRow,
  MaterialPatch,
  MaterialShareLinkRow,
  MaterialStateRow,
  MaterialStatus,
  MaterialUploadVia,
} from '../material/types.ts';
import { generateShareToken } from '../material/share.ts';
import {
  completenessOf,
  type AdminClientSummary,
  type CreateUnitsOptions,
  type CreateUnitsResult,
  type LeadListFilters,
  type MaterialShareContext,
  type NewGroupInput,
  type NewMaterialFileInput,
  type NewMaterialShareLinkInput,
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
  Membership,
  PlatformMemberRow,
  PlatformRole,
  PreviewTokenRow,
  ProjectCard,
  ProjectRow,
  PublicationRow,
  PublishState,
  Role,
  SceneRow,
  SessionUser,
  StatusLogEntry,
  TenantRef,
  UnitPatch,
  UnitPrice,
  UnitPriceInput,
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

/** Filas por INSERT. 500 entra holgado en el payload de PostgREST. */
const INSERT_CHUNK = 500;

function isString(v: string | null | undefined): v is string {
  return typeof v === 'string' && v.length > 0;
}

function distinct(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * Agrupa por profundidad en el árbol: primero los que no tienen padre dentro
 * del lote, después sus hijos, etc. Un INSERT de un hijo antes que su padre
 * viola la FK `groups.parent_id`.
 */
function orderedByDepth(groups: readonly NewGroupInput[]): NewGroupInput[][] {
  const pending = new Map(groups.map((g) => [g.id, g]));
  const placed = new Set<string>();
  const levels: NewGroupInput[][] = [];

  while (pending.size > 0) {
    const level = [...pending.values()].filter((g) => g.parentId === null || placed.has(g.parentId) || !pending.has(g.parentId));
    // Ciclo o padre inexistente: se emite el resto de una y que hable la FK.
    if (level.length === 0) {
      levels.push([...pending.values()]);
      break;
    }
    for (const g of level) {
      pending.delete(g.id);
      placed.add(g.id);
    }
    levels.push(level);
  }
  return levels;
}

/** El slug de tenant vive en `tenants`, no en `projects` — hace falta un viaje aparte. */
async function tenantSlugById(supabase: SupabaseClient, tenantId: string): Promise<string> {
  const { data } = await supabase.from('tenants').select('slug').eq('id', tenantId).maybeSingle();
  return data ? String(asRecord(data)['slug']) : '';
}

/**
 * Publicar y revertir de verdad (armar tour.json, escribirlo en R2, mover el
 * puntero de versión activa) lo hace apps/worker, con la service key de
 * Supabase — el panel no tiene esas credenciales ni debería tenerlas. Este
 * helper llama al Worker con el secreto compartido (ver
 * apps/worker/src/lib/publish-auth.ts) y traduce cualquier falla en un
 * mensaje legible para la UI en vez de dejar pasar un stack de fetch.
 */
async function callPublishWorker<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const workerUrl = process.env['WORKER_URL'];
  const secret = process.env['R360_PUBLISH_SECRET'];
  if (!workerUrl || !secret) {
    throw new Error(
      'Falta configurar WORKER_URL y/o R360_PUBLISH_SECRET en el entorno del panel (ver apps/admin/.env.example).',
    );
  }

  let res: Response;
  try {
    res = await fetch(`${workerUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    throw new Error(
      `No se pudo contactar al Worker en ${workerUrl}: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const record = json && typeof json === 'object' ? asRecord(json) : {};
    const message = isString(record['message'] as string | null) ? String(record['message']) : null;
    const error = isString(record['error'] as string | null) ? String(record['error']) : null;
    throw new Error(message ?? error ?? `El Worker respondió ${res.status}`);
  }

  return json as T;
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

    // El rol de plataforma vive en `platform_members`, no en el token: la
    // policy `platform_members_select_self` (0019) deja leer exactamente una
    // fila, la propia. Si no hay fila, es un usuario de inmobiliaria.
    const { data: platformRow } = await supabase
      .from('platform_members')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    const rawPlatformRole = platformRow ? asRecord(platformRow)['role'] : null;
    const platformRole: PlatformRole | null =
      rawPlatformRole === 'admin' || rawPlatformRole === 'operator' ? rawPlatformRole : null;

    return { id: user.id, email: user.email ?? '', memberships, platformRole };
  }

  async listTenants(): Promise<TenantRef[]> {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.from('tenants').select('id, slug, name').order('name');
    return (data ?? []).flatMap((row) => {
      const r = asRecord(row);
      if (typeof r['slug'] !== 'string') return [];
      return [{ id: String(r['id']), slug: r['slug'], name: String(r['name'] ?? r['slug']) }];
    });
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

  /**
   * No es atómico (dos viajes: cerrar el vigente, abrir el nuevo) porque
   * supabase-js no expone transacciones multi-sentencia sobre REST — el mismo
   * límite que ya acepta `createUnits` con sus altas en varios pasos. La
   * ventana entre ambas escrituras es de milisegundos y el peor caso (falla
   * el segundo paso) deja la unidad sin precio vigente, nunca con dos: se
   * nota y se reintenta, no corrompe datos.
   */
  async setUnitPrice(unitId: string, input: UnitPriceInput): Promise<UnitPrice> {
    const supabase = await createSupabaseServerClient();
    const now = new Date().toISOString();

    const { error: closeError } = await supabase
      .from('unit_prices')
      .update({ valid_to: now })
      .eq('unit_id', unitId)
      .is('valid_to', null);
    if (closeError) throw new Error(closeError.message);

    const { data, error: insertError } = await supabase
      .from('unit_prices')
      .insert({
        unit_id: unitId,
        amount: input.amount,
        currency: input.currency,
        visibility: input.visibility,
        valid_from: now,
        valid_to: null,
      })
      .select('id, amount, currency, visibility, valid_from, valid_to')
      .single();
    if (insertError) throw new Error(insertError.message);

    const r = asRecord(data);
    return {
      id: String(r['id']),
      amount: Number(r['amount']),
      currency: String(r['currency'] ?? 'USD'),
      visibility: (r['visibility'] as UnitPrice['visibility']) ?? 'public',
      validFrom: String(r['valid_from']),
      validTo: null,
    };
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

  /* ── Alta ──────────────────────────────────────────────────────────── */

  async createTenant(input: NewTenantInput): Promise<{ id: string; slug: string; name: string }> {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error('Sin sesión: no puedo saber quién da de alta el cliente.');

    // Con la sesión del usuario, no con la service key: la policy
    // `tenants_insert` (0019) sólo deja pasar a `auth_is_platform_admin()`,
    // así que quien no lo sea recibe acá abajo el error de Postgres. Ya no
    // hace falta romper ninguna circularidad de RLS ni crear membership:
    // Vrotta no es "owner" de sus clientes, los ve por `auth_is_platform()`
    // (cascada de lectura de 0019) — por eso el SELECT de abajo también
    // funciona con esta misma sesión.
    const { data: existing } = await supabase.from('tenants').select('id').eq('slug', input.slug).maybeSingle();
    if (existing) throw new Error(`Ya existe un cliente con el slug «${input.slug}».`);

    const { data, error } = await supabase
      .from('tenants')
      .insert({ slug: input.slug, name: input.name })
      .select('id, slug, name')
      .single();
    if (error) throw new Error(`No pude crear el cliente: ${error.message}`);

    const tenant = asRecord(data);
    return { id: String(tenant['id']), slug: String(tenant['slug']), name: String(tenant['name']) };
  }

  /* ── Plataforma (Vrotta) ──────────────────────────────────────────────── */

  async getAdminClientsSummary(): Promise<AdminClientSummary[]> {
    const tenants = await this.listTenants();
    const supabase = await createSupabaseServerClient();

    const summaries: AdminClientSummary[] = [];
    for (const tenant of tenants) {
      const { data: projectRows } = await supabase.from('projects').select('id, kind').eq('tenant_id', tenant.id);
      const projects = (projectRows ?? []).map((raw) => {
        const r = asRecord(raw);
        return { id: String(r['id']), kind: (r['kind'] as ProjectKind) ?? 'mixto' };
      });

      let pendingMaterial = 0;
      const publishedDates: (string | null)[] = [];
      for (const project of projects) {
        const [states, publications] = await Promise.all([
          this.listMaterial(project.id),
          this.listPublications(project.id),
        ]);
        pendingMaterial += pendingMaterialCount(project.kind, states);
        publishedDates.push(publications[0]?.publishedAt ?? null);
      }

      summaries.push({
        tenant,
        projectsCount: projects.length,
        pendingMaterialCount: pendingMaterial,
        lastPublishedAt: latestPublishedAt(publishedDates),
      });
    }
    return summaries;
  }

  async listPlatformMembers(): Promise<PlatformMemberRow[]> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('platform_members')
      .select('user_id, role, created_at')
      .order('created_at');
    if (error) throw new Error(error.message);

    // `platform_members` no guarda el email, sólo `user_id`: la única forma
    // de leer `auth.users` es la Admin API (service key). Es una lectura para
    // mostrar la lista, no crea cuentas ni manda nada — eso es P2c.
    const service = createServiceClient();
    return Promise.all(
      (data ?? []).map(async (raw) => {
        const r = asRecord(raw);
        const userId = String(r['user_id']);
        const { data: userRes } = await service.auth.admin.getUserById(userId);
        return {
          userId,
          email: userRes.user?.email ?? '(sin email)',
          role: ((r['role'] as PlatformRole) ?? 'operator'),
          createdAt: String(r['created_at'] ?? ''),
        };
      }),
    );
  }

  async addPlatformMember(email: string, role: PlatformRole): Promise<PlatformMemberRow> {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error('Sin sesión.');

    // Sólo suma a alguien que YA tiene cuenta: mandar una invitación a quien
    // no la tiene es el sistema de invitaciones (P2c), que todavía no existe.
    // Buscar por email necesita la Admin API: la sesión normal no puede leer
    // `auth.users` de otro usuario.
    const service = createServiceClient();
    const normalized = email.trim().toLowerCase();
    let userId: string | null = null;
    for (let page = 1; !userId; page++) {
      const { data: list, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      const found = list.users.find((u) => (u.email ?? '').toLowerCase() === normalized);
      if (found) userId = found.id;
      if (list.users.length < 200) break;
    }
    if (!userId) {
      throw new Error(
        `«${email}» todavía no tiene cuenta en Recorrido 360. Sumar gente sin cuenta es parte del sistema de ` +
          'invitaciones, que todavía no está: por ahora sólo se puede agregar a quien ya se registró.',
      );
    }

    const { data, error } = await supabase
      .from('platform_members')
      .insert({ user_id: userId, role, created_by: auth.user.id })
      .select('user_id, role, created_at')
      .single();
    if (error) throw new Error(error.message);
    const r = asRecord(data);
    return { userId: String(r['user_id']), email: normalized, role, createdAt: String(r['created_at'] ?? '') };
  }

  async updatePlatformMemberRole(userId: string, role: PlatformRole): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from('platform_members').update({ role }).eq('user_id', userId);
    if (error) throw new Error(error.message);
  }

  async removePlatformMember(userId: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from('platform_members').delete().eq('user_id', userId);
    if (error) throw new Error(error.message);
  }

  async createProject(tenantSlug: string, input: NewProjectInput): Promise<ProjectRow> {
    const { supabase, tenantId } = await this.projectQuery(tenantSlug);
    if (!tenantId) throw new Error(`No encontré el cliente «${tenantSlug}».`);

    const { data, error } = await supabase
      .from('projects')
      .insert({
        tenant_id: tenantId,
        slug: input.slug,
        name: input.name,
        kind: input.kind,
        location: input.location,
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') throw new Error(`Ya hay un proyecto con el slug «${input.slug}» en este cliente.`);
      throw new Error(`No pude crear el proyecto: ${error.message}`);
    }
    return this.toProject(data);
  }

  async deleteProject(projectId: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from('projects').delete().eq('id', projectId);
    if (error) throw new Error(`No pude borrar el proyecto: ${error.message}`);
  }

  async createGroups(projectId: string, groups: NewGroupInput[]): Promise<GroupRow[]> {
    if (groups.length === 0) return [];
    const supabase = await createSupabaseServerClient();
    // En orden: un hijo no puede entrar antes que su padre (FK a groups.id).
    for (const chunk of orderedByDepth(groups)) {
      const { error } = await supabase.from('groups').insert(
        chunk.map((g) => ({
          id: g.id,
          project_id: projectId,
          parent_id: g.parentId,
          kind: g.kind,
          code: g.code,
          name: g.name,
          sort: g.sort,
        })),
      );
      if (error) throw new Error(`No pude crear la estructura: ${error.message}`);
    }
    const structure = await this.getStructure(projectId);
    return structure.groups;
  }

  async createUnitTypes(projectId: string, types: NewUnitTypeInput[]): Promise<UnitTypeRow[]> {
    if (types.length === 0) return [];
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from('unit_types').upsert(
      types.map((t) => ({
        project_id: projectId,
        code: t.code,
        name: t.name,
        attr_schema: t.attrSchema,
      })),
      { onConflict: 'project_id,code', ignoreDuplicates: true },
    );
    if (error) throw new Error(`No pude crear los tipos de unidad: ${error.message}`);
    const structure = await this.getStructure(projectId);
    return structure.types;
  }

  async createUnits(
    projectId: string,
    units: NewUnitInput[],
    options: CreateUnitsOptions,
  ): Promise<CreateUnitsResult> {
    const supabase = await createSupabaseServerClient();
    const structure = await this.getStructure(projectId);

    const groupByCode = new Map(structure.groups.map((g) => [g.code, g.id]));
    const typeByCode = new Map(structure.types.map((t) => [t.code, t.id]));

    let groupsCreated = 0;
    if (options.createMissingGroups) {
      const missing = distinct(units.map((u) => u.groupCode).filter(isString)).filter((c) => !groupByCode.has(c));
      if (missing.length > 0) {
        const created = await this.createGroups(
          projectId,
          missing.map((code, i) => ({
            id: crypto.randomUUID(),
            parentId: null,
            kind: options.groupKind,
            code,
            name: code,
            sort: structure.groups.length + i + 1,
          })),
        );
        groupsCreated = missing.length;
        for (const g of created) groupByCode.set(g.code, g.id);
      }
    }

    let typesCreated = 0;
    if (options.createMissingTypes) {
      const wanted = new Map<string, string>();
      for (const unit of units) {
        if (unit.typeCode && !typeByCode.has(unit.typeCode) && !wanted.has(unit.typeCode)) {
          wanted.set(unit.typeCode, unit.typeName ?? unit.typeCode);
        }
      }
      if (wanted.size > 0) {
        const created = await this.createUnitTypes(
          projectId,
          [...wanted].map(([code, name]) => ({ code, name, attrSchema: {} })),
        );
        typesCreated = wanted.size;
        for (const t of created) typeByCode.set(t.code, t.id);
      }
    }

    const { data: existingRows } = await supabase
      .from('units')
      .select('code')
      .eq('project_id', projectId)
      .range(0, UNIT_HARD_LIMIT - 1);
    const existing = new Set((existingRows ?? []).map((row) => String(asRecord(row)['code'])));

    const skipped: string[] = [];
    const toInsert = units.filter((unit) => {
      if (existing.has(unit.code)) {
        skipped.push(unit.code);
        return false;
      }
      existing.add(unit.code);
      return true;
    });

    const insertedIds = new Map<string, string>();
    for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
      const chunk = toInsert.slice(i, i + INSERT_CHUNK);
      const { data, error } = await supabase
        .from('units')
        .insert(
          chunk.map((unit) => ({
            project_id: projectId,
            group_id: unit.groupCode ? groupByCode.get(unit.groupCode) ?? null : null,
            unit_type_id: unit.typeCode ? typeByCode.get(unit.typeCode) ?? null : null,
            code: unit.code,
            status: unit.status,
            area_total_m2: unit.areaTotalM2,
            attrs: unit.attrs,
            sort: unit.sort,
          })),
        )
        .select('id, code');
      if (error) throw new Error(`No pude crear las unidades: ${error.message}`);
      for (const row of data ?? []) {
        const r = asRecord(row);
        insertedIds.set(String(r['code']), String(r['id']));
      }
    }

    const priceRows = toInsert.flatMap((unit) => {
      const unitId = insertedIds.get(unit.code);
      if (!unitId || !unit.price) return [];
      return [{
        unit_id: unitId,
        amount: unit.price.amount,
        currency: unit.price.currency,
        visibility: unit.price.visibility,
      }];
    });
    let pricesCreated = 0;
    for (let i = 0; i < priceRows.length; i += INSERT_CHUNK) {
      const chunk = priceRows.slice(i, i + INSERT_CHUNK);
      const { error } = await supabase.from('unit_prices').insert(chunk);
      if (error) throw new Error(`Las unidades quedaron creadas pero los precios no: ${error.message}`);
      pricesCreated += chunk.length;
    }

    return { created: toInsert.length, skipped, groupsCreated, typesCreated, pricesCreated };
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

  async getProjectById(projectId: string): Promise<ProjectRow | null> {
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
   * lo hace `apps/worker` (`POST /api/publish`) — acá el panel arma
   * tenant/project (el Worker no conoce `projectId`, sólo slugs) y dispara
   * ese endpoint con el secreto compartido.
   */
  async publish(projectId: string, note: string | null): Promise<PublicationRow> {
    const project = await this.getProjectById(projectId);
    if (!project) throw new Error(`El proyecto ${projectId} no existe`);

    const supabase = await createSupabaseServerClient();
    const tenantSlug = await tenantSlugById(supabase, project.tenantId);
    if (!tenantSlug) throw new Error(`No se pudo resolver el tenant del proyecto ${projectId}`);

    const result = await callPublishWorker<{ ok: true; version: number }>('/api/publish', {
      tenant: tenantSlug,
      project: project.slug,
    });

    // El Worker ya dejó constancia en `publications` (sin nota: no la
    // conoce). La completamos acá — best effort, no aborta el publish si
    // falla: el contenido ya quedó publicado igual.
    if (note) {
      const { error: noteError } = await supabase
        .from('publications')
        .update({ note })
        .eq('project_id', projectId)
        .eq('version', result.version);
      if (noteError) console.error(`No se pudo guardar la nota de la publicación v${result.version}:`, noteError.message);
    }

    const { data: userData } = await supabase.auth.getUser();
    return {
      id: `${projectId}-v${result.version}`,
      projectId,
      version: result.version,
      note,
      publishedByEmail: userData.user?.email ?? null,
      publishedAt: new Date().toISOString(),
    };
  }

  async revertPublication(projectId: string, version: number): Promise<void> {
    const project = await this.getProjectById(projectId);
    if (!project) throw new Error(`El proyecto ${projectId} no existe`);

    const supabase = await createSupabaseServerClient();
    const tenantSlug = await tenantSlugById(supabase, project.tenantId);
    if (!tenantSlug) throw new Error(`No se pudo resolver el tenant del proyecto ${projectId}`);

    await callPublishWorker('/api/rollback', {
      tenant: tenantSlug,
      project: project.slug,
      toVersion: version,
    });
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

  async deleteLead(leadId: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from('leads').delete().eq('id', leadId);
    if (error) throw new Error(error.message);
  }

  /* ── Material requerido ─────────────────────────────────────────────── */

  private toMaterialState(raw: unknown): MaterialStateRow {
    const r = asRecord(raw);
    return {
      itemId: String(r['item_id']),
      status: r['status'] as MaterialStatus,
      notes: r['notes'] === null || r['notes'] === undefined ? null : String(r['notes']),
      updatedAt: String(r['updated_at']),
      // Igual que en el log de estados: el join a auth.users no es accesible
      // con la anon key. Se resolverá cuando exista una vista de perfiles.
      updatedByEmail: null,
    };
  }

  private toMaterialFile(raw: unknown): MaterialFileRow {
    const r = asRecord(raw);
    return {
      id: String(r['id']),
      itemId: String(r['item_id']),
      storagePath: String(r['storage_path']),
      filename: String(r['filename']),
      sizeBytes: Number(r['size_bytes'] ?? 0),
      mime: String(r['mime'] ?? 'application/octet-stream'),
      uploadedVia: (r['uploaded_via'] ?? 'panel') as MaterialUploadVia,
      uploadedByEmail: null,
      createdAt: String(r['created_at']),
    };
  }

  private toMaterialLink(raw: unknown): MaterialShareLinkRow {
    const r = asRecord(raw);
    return {
      id: String(r['id']),
      token: String(r['token']),
      label: r['label'] === null || r['label'] === undefined ? null : String(r['label']),
      createdAt: String(r['created_at']),
      expiresAt: r['expires_at'] === null || r['expires_at'] === undefined ? null : String(r['expires_at']),
      revokedAt: r['revoked_at'] === null || r['revoked_at'] === undefined ? null : String(r['revoked_at']),
    };
  }

  async listMaterial(projectId: string): Promise<MaterialStateRow[]> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from('project_material').select('*').eq('project_id', projectId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => this.toMaterialState(row));
  }

  async setMaterialState(projectId: string, itemId: string, patch: MaterialPatch): Promise<MaterialStateRow> {
    const supabase = await createSupabaseServerClient();
    const { data: user } = await supabase.auth.getUser();
    const row: Record<string, unknown> = {
      project_id: projectId,
      item_id: itemId,
      updated_at: new Date().toISOString(),
      updated_by: user.user?.id ?? null,
    };
    if (patch.status !== undefined) row['status'] = patch.status;
    if (patch.notes !== undefined) row['notes'] = patch.notes;
    const { data, error } = await supabase
      .from('project_material')
      .upsert(row, { onConflict: 'project_id,item_id' })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return this.toMaterialState(data);
  }

  async listMaterialFiles(projectId: string): Promise<MaterialFileRow[]> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('material_files')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => this.toMaterialFile(row));
  }

  async registerMaterialFile(projectId: string, input: NewMaterialFileInput): Promise<MaterialFileRow> {
    const supabase = await createSupabaseServerClient();
    const { data: user } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('material_files')
      .insert({
        project_id: projectId,
        item_id: input.itemId,
        storage_path: input.storagePath,
        filename: input.filename,
        size_bytes: input.sizeBytes,
        mime: input.mime,
        uploaded_via: input.uploadedVia,
        uploaded_by: user.user?.id ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Subir algo deja el ítem en `recibido`, salvo que ya estuviera cerrado:
    // una aprobación o un "no aplica" son decisiones del operador y no las
    // pisa un archivo nuevo.
    const current = (await this.listMaterial(projectId)).find((m) => m.itemId === input.itemId);
    if (!current || (current.status !== 'aprobado' && current.status !== 'no_aplica')) {
      await this.setMaterialState(projectId, input.itemId, { status: 'recibido' });
    }
    return this.toMaterialFile(data);
  }

  async deleteMaterialFile(projectId: string, fileId: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from('material_files').delete().eq('id', fileId).eq('project_id', projectId);
    if (error) throw new Error(error.message);
  }

  async listMaterialShareLinks(projectId: string): Promise<MaterialShareLinkRow[]> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('material_share_links')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => this.toMaterialLink(row));
  }

  async createMaterialShareLink(projectId: string, input: NewMaterialShareLinkInput): Promise<MaterialShareLinkRow> {
    const supabase = await createSupabaseServerClient();
    const { data: user } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('material_share_links')
      .insert({
        project_id: projectId,
        token: generateShareToken(),
        label: input.label,
        expires_at: input.expiresAt,
        created_by: user.user?.id ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return this.toMaterialLink(data);
  }

  async revokeMaterialShareLink(projectId: string, linkId: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('material_share_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', linkId)
      .eq('project_id', projectId)
      .is('revoked_at', null);
    if (error) throw new Error(error.message);
  }

  /**
   * Las cuatro operaciones del link público pasan por RPCs `security definer`
   * (ver 0016): revalidan el token en cada llamada y no exponen ninguna otra
   * tabla a `anon`. Acá se usa el cliente de la sesión igual que en el resto —
   * si no hay sesión, es la anon key, que es exactamente el caso del cliente
   * que abre el link desde WhatsApp.
   */
  async resolveMaterialShareToken(token: string): Promise<MaterialShareContext | null> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('material_link_project', { p_token: token });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? asRecord(data[0]) : asRecord(data);
    if (!row['project_id']) return null;
    return {
      projectId: String(row['project_id']),
      projectName: String(row['project_name']),
      projectKind: row['project_kind'] as MaterialShareContext['projectKind'],
    };
  }

  async readMaterialByToken(token: string): Promise<{ states: MaterialStateRow[]; files: MaterialFileRow[] } | null> {
    const ctx = await this.resolveMaterialShareToken(token);
    if (!ctx) return null;
    const supabase = await createSupabaseServerClient();
    const [states, files] = await Promise.all([
      supabase.rpc('material_link_states', { p_token: token }),
      supabase.rpc('material_link_files', { p_token: token }),
    ]);
    if (states.error) throw new Error(states.error.message);
    if (files.error) throw new Error(files.error.message);
    return {
      states: (Array.isArray(states.data) ? states.data : []).map((row) => ({
        ...this.toMaterialState(row),
        updatedAt: asRecord(row)['updated_at'] === undefined ? '' : String(asRecord(row)['updated_at']),
      })),
      files: (Array.isArray(files.data) ? files.data : []).map((row) => ({
        ...this.toMaterialFile(row),
        uploadedVia: 'link' as MaterialUploadVia,
      })),
    };
  }

  async registerMaterialFileByToken(
    token: string,
    input: Omit<NewMaterialFileInput, 'uploadedVia'>,
  ): Promise<MaterialFileRow | null> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('material_link_register_file', {
      p_token: token,
      p_item_id: input.itemId,
      p_storage_path: input.storagePath,
      p_filename: input.filename,
      p_size_bytes: input.sizeBytes,
      p_mime: input.mime,
    });
    if (error) throw new Error(error.message);
    if (data === null || data === undefined) return null;
    return {
      id: String(data),
      itemId: input.itemId,
      storagePath: input.storagePath,
      filename: input.filename,
      sizeBytes: input.sizeBytes,
      mime: input.mime,
      uploadedVia: 'link',
      uploadedByEmail: null,
      createdAt: new Date().toISOString(),
    };
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
