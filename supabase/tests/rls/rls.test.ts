// rls.test.ts
// Harness de RLS contra Supabase LOCAL (nunca contra el VPS de producción,
// ver lib/env.ts). Cubre la matriz de supabase/tests/rls/README.md §"Qué
// cubre", que reproduce §7 del plan de roles.
//
// POR QUÉ vitest + supabase-js y no pgTAP: el bug de 0015 (INSERT ... RETURNING
// que choca contra la policy de SELECT por el snapshot de las funciones
// `stable`) sólo se manifiesta porque `supabase-js` hace `.insert().select()`
// por defecto. Un test en pgTAP que setea `request.jwt.claims` a mano con SQL
// crudo no pasa por PostgREST y no reproduce ese camino real. Este harness sí:
// cada "usuario" es un cliente de supabase-js logueado de verdad
// (`signInWithPassword`) contra el PostgREST local, igual que el panel.
//
// Si esta suite corre sin un `supabase start` local levantado, se salta
// entera (con un mensaje explícito) en vez de fallar: no hay forma de
// verificar RLS sin una base real, y no queremos que la ausencia de Docker
// tumbe `pnpm test` de nadie (este harness ni siquiera es parte del
// workspace de pnpm — ver README.md).

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { API_URL, ANON_KEY } from './lib/env.ts';
import {
  buildScenario,
  insertOrThrow,
  loginViaAdminMagicLink,
  svc,
  type Scenario,
} from './lib/fixtures.ts';

/**
 * Mismo algoritmo que `hashInvitationToken` en
 * apps/admin/src/lib/invitations/token.ts (y que la RPC `accept_invitation`,
 * vía `extensions.digest(p_token, 'sha256')`): sha256 en hex. Este harness
 * no puede importar el código del panel (paquete/workspace separado, ver
 * README.md), así que lo repite acá — si alguno de los tres diverge, estos
 * tests lo detectan (el hash no matchearía y `accept_invitation` fallaría
 * con "no existe").
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

async function localSupabaseReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/auth/v1/health`);
    return res.ok;
  } catch {
    return false;
  }
}

const reachable = await localSupabaseReachable();
if (!reachable) {
  // eslint-disable-next-line no-console
  console.warn(
    `\n[supabase/tests/rls] Saltando la suite completa: no hay un Supabase local en ${API_URL}.\n` +
      '  Este harness requiere `supabase start` (Docker corriendo). Ver supabase/tests/rls/README.md\n' +
      '  para el comando exacto. NO se corre nunca contra producción.\n',
  );
}

// `describe.skipIf` evita correr el `beforeAll` (que crea los fixtures) si no
// hay base: así el resultado es "skipped", no "failed", cuando falta Docker.
describe.skipIf(!reachable)('RLS: roles de plataforma y de inmobiliaria (0009–0019)', () => {
  let scenario: Scenario;

  beforeAll(async () => {
    scenario = await buildScenario();
  });

  afterAll(async () => {
    await scenario?.teardown();
  });

  async function idSet(client: SupabaseClient, table: string, column = 'id') {
    const { data, error } = await client.from(table).select(column);
    if (error) throw new Error(`select ${table} falló: ${error.message}`);
    return new Set((data ?? []).map((r: Record<string, unknown>) => r[column]));
  }

  // ── 1. Aislamiento entre inmobiliarias, tabla por tabla ──────────────────
  // Es el test que protege lo que se cerró en 0018: cada tabla listada acá
  // colgó alguna vez (directa o indirectamente) de una policy que confiaba en
  // el owner de la vista/función en vez de en RLS invocada por el usuario.
  describe('aislamiento: inmo_a_owner nunca ve filas del tenant B', () => {
    test('tenants', async () => {
      const ids = await idSet(scenario.users.inmoAOwner.client, 'tenants');
      expect(ids.has(scenario.tenantA.tenantId)).toBe(true);
      expect(ids.has(scenario.tenantB.tenantId)).toBe(false);
    });

    test('projects', async () => {
      const ids = await idSet(scenario.users.inmoAOwner.client, 'projects');
      expect(ids.has(scenario.tenantA.projectId)).toBe(true);
      expect(ids.has(scenario.tenantB.projectId)).toBe(false);
    });

    test('groups', async () => {
      const ids = await idSet(scenario.users.inmoAOwner.client, 'groups');
      expect(ids.has(scenario.tenantB.groupId)).toBe(false);
    });

    test('unit_types', async () => {
      const ids = await idSet(scenario.users.inmoAOwner.client, 'unit_types');
      expect(ids.has(scenario.tenantB.unitTypeId)).toBe(false);
    });

    test('units', async () => {
      const ids = await idSet(scenario.users.inmoAOwner.client, 'units');
      expect(ids.has(scenario.tenantB.unitPublicId)).toBe(false);
      expect(ids.has(scenario.tenantB.unitPrivateId)).toBe(false);
    });

    test('scenes', async () => {
      const ids = await idSet(scenario.users.inmoAOwner.client, 'scenes');
      expect(ids.has(scenario.tenantB.sceneId)).toBe(false);
    });

    test('hotspots', async () => {
      const ids = await idSet(scenario.users.inmoAOwner.client, 'hotspots');
      expect(ids.has(scenario.tenantB.hotspotId)).toBe(false);
    });

    test('leads', async () => {
      const ids = await idSet(scenario.users.inmoAOwner.client, 'leads');
      expect(ids.has(scenario.tenantB.leadId)).toBe(false);
    });

    test('publications', async () => {
      const ids = await idSet(scenario.users.inmoAOwner.client, 'publications');
      expect(ids.has(scenario.tenantB.publicationId)).toBe(false);
    });

    test('project_material', async () => {
      const ids = await idSet(scenario.users.inmoAOwner.client, 'project_material');
      expect(ids.has(scenario.tenantB.projectMaterialId)).toBe(false);
    });

    test('material_files', async () => {
      const ids = await idSet(scenario.users.inmoAOwner.client, 'material_files');
      expect(ids.has(scenario.tenantB.materialFileId)).toBe(false);
    });

    test('platform_members: no ve ninguna fila (no tiene una propia y no es admin)', async () => {
      const { data, error } = await scenario.users.inmoAOwner.client
        .from('platform_members')
        .select('user_id');
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  // ── 2. platform_members / tenants: sólo se abren por el camino correcto ──
  describe('platform_members y tenants están cerrados a un owner de inmobiliaria', () => {
    test('inmo_a_owner no puede insertarse en platform_members', async () => {
      const { error } = await scenario.users.inmoAOwner.client
        .from('platform_members')
        .insert({ user_id: scenario.users.inmoAOwner.userId, role: 'admin' });
      expect(error).not.toBeNull();
    });

    test('inmo_a_owner no puede crear un tenant', async () => {
      const { error } = await scenario.users.inmoAOwner.client
        .from('tenants')
        .insert({ slug: `hack-${crypto.randomUUID()}`, name: 'Tenant no autorizado' });
      expect(error).not.toBeNull();
    });
  });

  // ── 3. Vrotta Operador: opera cualquier cliente, no crea/borra tenants ───
  describe('vrotta_operator: producción en cualquier cliente, sin alta/baja de inmobiliarias', () => {
    test('ve proyectos de A y de B', async () => {
      const ids = await idSet(scenario.users.vrottaOperator.client, 'projects');
      expect(ids.has(scenario.tenantA.projectId)).toBe(true);
      expect(ids.has(scenario.tenantB.projectId)).toBe(true);
    });

    // La trampa del snapshot (0015): `.insert().select()` es lo que hace
    // supabase-js por defecto en TODA alta desde el panel. Si a alguna
    // policy de SELECT le faltara `or auth_is_platform()`, esto falla con
    // el mismo error críptico que el proyecto ya sufrió una vez.
    test('INSERT...RETURNING: crea grupo, tipo, unidad, escena y hotspot en el proyecto B', async () => {
      const client = scenario.users.vrottaOperator.client;
      const projectId = scenario.tenantB.projectId;

      const { data: group, error: gErr } = await client
        .from('groups')
        .insert({ project_id: projectId, kind: 'torre', code: `OP-${crypto.randomUUID().slice(0, 8)}` })
        .select()
        .single();
      expect(gErr, gErr?.message).toBeNull();
      expect(group?.id).toBeTruthy();

      const { data: unitType, error: utErr } = await client
        .from('unit_types')
        .insert({ project_id: projectId, code: `op-${crypto.randomUUID().slice(0, 8)}`, name: 'Operator type' })
        .select()
        .single();
      expect(utErr, utErr?.message).toBeNull();

      const { data: unit, error: uErr } = await client
        .from('units')
        .insert({
          project_id: projectId,
          group_id: group!.id,
          unit_type_id: unitType!.id,
          code: `OP-U-${crypto.randomUUID().slice(0, 8)}`,
          area_total_m2: 40,
        })
        .select()
        .single();
      expect(uErr, uErr?.message).toBeNull();
      expect(unit?.id).toBeTruthy();

      const { data: scene, error: sErr } = await client
        .from('scenes')
        .insert({ project_id: projectId, slug: `op-${crypto.randomUUID().slice(0, 8)}`, kind: 'panorama', name: 'op', source: {} })
        .select()
        .single();
      expect(sErr, sErr?.message).toBeNull();

      const { data: hotspot, error: hErr } = await client
        .from('hotspots')
        .insert({
          scene_id: scene!.id,
          target_kind: 'unit',
          unit_id: unit!.id,
          geometry_kind: 'point_sph',
          geometry: { yaw: 0, pitch: 0 },
        })
        .select()
        .single();
      expect(hErr, hErr?.message).toBeNull();
      expect(hotspot?.id).toBeTruthy();
    });

    test('puede crear un proyecto nuevo en el tenant B (INSERT...RETURNING sobre tenants ajenos)', async () => {
      const { data, error } = await scenario.users.vrottaOperator.client
        .from('projects')
        .insert({
          tenant_id: scenario.tenantB.tenantId,
          slug: `op-proj-${crypto.randomUUID().slice(0, 8)}`,
          name: 'Proyecto creado por Operador',
          kind: 'edificio',
        })
        .select()
        .single();
      expect(error, error?.message).toBeNull();
      expect(data?.id).toBeTruthy();
    });

    test('puede mover estados en masa (set_units_status) en el proyecto B', async () => {
      const { data, error } = await scenario.users.vrottaOperator.client.rpc('set_units_status', {
        p_filter: { project_id: scenario.tenantB.projectId },
        p_status: 'reservado',
      });
      expect(error, error?.message).toBeNull();
      expect(typeof data).toBe('number');
      expect((data as number) > 0).toBe(true);
    });

    test('puede subir a storage.objects bajo material/<project_b>/...', async () => {
      const path = `${scenario.tenantB.projectId}/${scenario.tenantB.materialItemId}/operator-upload.txt`;
      const { error } = await scenario.users.vrottaOperator.client.storage
        .from('material')
        .upload(path, Buffer.from('subido por vrotta_operator'), { contentType: 'text/plain' });
      expect(error, error?.message).toBeNull();
    });

    test('NO puede crear un tenant', async () => {
      const { error } = await scenario.users.vrottaOperator.client
        .from('tenants')
        .insert({ slug: `op-tenant-${crypto.randomUUID().slice(0, 8)}`, name: 'x' });
      expect(error).not.toBeNull();
    });

    test('NO puede borrar un proyecto (la fila sigue existiendo)', async () => {
      const { data: created } = await scenario.users.vrottaOperator.client
        .from('projects')
        .insert({
          tenant_id: scenario.tenantB.tenantId,
          slug: `op-delete-me-${crypto.randomUUID().slice(0, 8)}`,
          name: 'a borrar',
          kind: 'edificio',
        })
        .select()
        .single();
      expect(created?.id).toBeTruthy();

      const { data: delData, error: delErr } = await scenario.users.vrottaOperator.client
        .from('projects')
        .delete()
        .eq('id', created!.id)
        .select();
      expect(delErr).toBeNull();
      expect(delData).toEqual([]); // RLS filtró la fila: 0 borradas, sin error.

      const { data: stillThere } = await svc.from('projects').select('id').eq('id', created!.id).maybeSingle();
      expect(stillThere?.id).toBe(created!.id);
    });

    test('NO puede gestionar un lead (leads_update lo excluye a propósito)', async () => {
      const { data: before } = await svc.from('leads').select('payload').eq('id', scenario.tenantA.leadId).single();

      const { data, error } = await scenario.users.vrottaOperator.client
        .from('leads')
        .update({ payload: { marker: 'operator-tried-to-edit' } })
        .eq('id', scenario.tenantA.leadId)
        .select();
      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: after } = await svc.from('leads').select('payload').eq('id', scenario.tenantA.leadId).single();
      expect(after?.payload).toEqual(before?.payload);
    });
  });

  // ── 4. Vrotta Admin: todo, incluido lo destructivo ───────────────────────
  describe('vrotta_admin: alta/baja de inmobiliarias y equipo de plataforma', () => {
    test('crea un tenant con RETURNING, un proyecto adentro, lo borra, y borra el tenant', async () => {
      const client = scenario.users.vrottaAdmin.client;

      const { data: tenant, error: tErr } = await client
        .from('tenants')
        .insert({ slug: `admin-${crypto.randomUUID().slice(0, 8)}`, name: 'Tenant de Admin' })
        .select()
        .single();
      expect(tErr, tErr?.message).toBeNull();
      expect(tenant?.id).toBeTruthy();

      const { data: project, error: pErr } = await client
        .from('projects')
        .insert({ tenant_id: tenant!.id, slug: 'p', name: 'p', kind: 'edificio' })
        .select()
        .single();
      expect(pErr, pErr?.message).toBeNull();

      const { data: delProj, error: delProjErr } = await client
        .from('projects')
        .delete()
        .eq('id', project!.id)
        .select();
      expect(delProjErr).toBeNull();
      expect(delProj?.length).toBe(1);

      const { data: delTenant, error: delTenantErr } = await client
        .from('tenants')
        .delete()
        .eq('id', tenant!.id)
        .select();
      expect(delTenantErr).toBeNull();
      expect(delTenant?.length).toBe(1);
    });

    test('puede insertar en platform_members', async () => {
      // Usuario descartable propio de este test: si esto rompiera algo, no
      // contamina el resto del escenario (se le da de baja al final).
      const { data: throwaway, error: createErr } = await svc.auth.admin.createUser({
        email: `rls-throwaway-${crypto.randomUUID()}@test.r360.local`,
        password: 'Test-P4ssword!',
        email_confirm: true,
      });
      expect(createErr).toBeNull();

      const { error } = await scenario.users.vrottaAdmin.client
        .from('platform_members')
        .insert({ user_id: throwaway!.user!.id, role: 'operator' });
      expect(error, error?.message).toBeNull();

      await svc.auth.admin.deleteUser(throwaway!.user!.id);
    });

    test('gestiona un lead (a diferencia del operador)', async () => {
      const { data, error } = await scenario.users.vrottaAdmin.client
        .from('leads')
        .update({ payload: { marker: 'admin-edito' } })
        .eq('id', scenario.tenantB.leadId)
        .select();
      expect(error).toBeNull();
      expect(data?.length).toBe(1);
    });
  });

  // ── 5. Vendedor (sales): sólo sus proyectos asignados, sin precios privados ─
  describe('inmo_a_sales: acceso scopeado a lo que le asignaron', () => {
    test('ve el proyecto asignado pero no el segundo proyecto del mismo tenant', async () => {
      const ids = await idSet(scenario.users.inmoASales.client, 'projects');
      expect(ids.has(scenario.tenantA.projectId)).toBe(true);
      expect(ids.has(scenario.tenantAExtraProjectId)).toBe(false);
    });

    test('no ve el precio "on_request" (sólo el público)', async () => {
      const { data, error } = await scenario.users.inmoASales.client
        .from('unit_prices')
        .select('unit_id, visibility')
        .in('unit_id', [scenario.tenantA.unitPublicId, scenario.tenantA.unitPrivateId]);
      expect(error).toBeNull();
      const unitIds = new Set((data ?? []).map((r) => r.unit_id));
      expect(unitIds.has(scenario.tenantA.unitPublicId)).toBe(true);
      expect(unitIds.has(scenario.tenantA.unitPrivateId)).toBe(false);
    });

    test('set_units_status funciona en su proyecto asignado', async () => {
      const { data, error } = await scenario.users.inmoASales.client.rpc('set_units_status', {
        p_filter: { project_id: scenario.tenantA.projectId },
        p_status: 'reservado',
      });
      expect(error, error?.message).toBeNull();
      expect((data as number) > 0).toBe(true);
    });

    test('set_units_status falla en un proyecto del mismo tenant que NO le asignaron', async () => {
      const { error } = await scenario.users.inmoASales.client.rpc('set_units_status', {
        p_filter: { project_id: scenario.tenantAExtraProjectId },
        p_status: 'reservado',
      });
      expect(error).not.toBeNull();
    });

    test('set_units_status falla directamente en el proyecto del tenant B', async () => {
      const { error } = await scenario.users.inmoASales.client.rpc('set_units_status', {
        p_filter: { project_id: scenario.tenantB.projectId },
        p_status: 'reservado',
      });
      expect(error).not.toBeNull();
    });

    test('no puede hacer UPDATE directo sobre units (sólo vía set_units_status)', async () => {
      const { data: before } = await svc.from('units').select('status').eq('id', scenario.tenantA.unitPublicId).single();
      const nextStatus = before?.status === 'vendido' ? 'disponible' : 'vendido';

      const { data, error } = await scenario.users.inmoASales.client
        .from('units')
        .update({ status: nextStatus })
        .eq('id', scenario.tenantA.unitPublicId)
        .select();
      expect(error).toBeNull();
      expect(data).toEqual([]); // filtrado por RLS (units_update no incluye "sales"), no error.

      const { data: after } = await svc.from('units').select('status').eq('id', scenario.tenantA.unitPublicId).single();
      expect(after?.status).toBe(before?.status);
    });
  });

  // ── 6. project_health (0018): cascada de plataforma + cierre a anon ─────
  describe('vista project_health', () => {
    test('inmo_a_owner ve sólo su proyecto', async () => {
      const { data, error } = await scenario.users.inmoAOwner.client.from('project_health').select('project_id');
      expect(error).toBeNull();
      const ids = new Set((data ?? []).map((r) => r.project_id));
      expect(ids.has(scenario.tenantA.projectId)).toBe(true);
      expect(ids.has(scenario.tenantB.projectId)).toBe(false);
    });

    test('vrotta_operator ve el proyecto de A y el de B', async () => {
      const { data, error } = await scenario.users.vrottaOperator.client.from('project_health').select('project_id');
      expect(error).toBeNull();
      const ids = new Set((data ?? []).map((r) => r.project_id));
      expect(ids.has(scenario.tenantA.projectId)).toBe(true);
      expect(ids.has(scenario.tenantB.projectId)).toBe(true);
    });

    test('anon no ve ninguna fila', async () => {
      const anon = createClient(API_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
      const { data, error } = await anon.from('project_health').select('project_id');
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  // ── 7. leads_update: el arreglo del bug de 0019, con los roles de tenant ──
  describe('leads_update (arregla el CRM de leads que no persistía)', () => {
    test('inmo_a_owner puede actualizar un lead propio', async () => {
      const { data, error } = await scenario.users.inmoAOwner.client
        .from('leads')
        .update({ payload: { status: 'contactado', by: 'owner' } })
        .eq('id', scenario.tenantA.leadId)
        .select();
      expect(error).toBeNull();
      expect(data?.length).toBe(1);
    });

    test('inmo_a_editor puede actualizar un lead propio', async () => {
      const { data, error } = await scenario.users.inmoAEditor.client
        .from('leads')
        .update({ payload: { status: 'contactado', by: 'editor' } })
        .eq('id', scenario.tenantA.leadId)
        .select();
      expect(error).toBeNull();
      expect(data?.length).toBe(1);
    });

    test('nadie puede actualizar un lead de otro tenant', async () => {
      const { data, error } = await scenario.users.inmoAOwner.client
        .from('leads')
        .update({ payload: { status: 'contactado' } })
        .eq('id', scenario.tenantB.leadId)
        .select();
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  // ── 8. Trigger units_tenant_update_guard: quién toca qué columna ─────────
  describe('trigger units_tenant_update_guard (columna por columna, no fila por fila)', () => {
    test('owner puede editar status y area_total_m2', async () => {
      const { data, error } = await scenario.users.inmoAOwner.client
        .from('units')
        .update({ status: 'reservado', area_total_m2: 55 })
        .eq('id', scenario.tenantA.unitPublicId)
        .select();
      expect(error, error?.message).toBeNull();
      expect(data?.length).toBe(1);
      expect(data?.[0]?.area_total_m2).toBe(55);
    });

    test('editor puede editar area_total_m2 y attrs', async () => {
      const { data, error } = await scenario.users.inmoAEditor.client
        .from('units')
        .update({ area_total_m2: 58, attrs: { orientacion: 'norte' } })
        .eq('id', scenario.tenantA.unitPublicId)
        .select();
      expect(error, error?.message).toBeNull();
      expect(data?.length).toBe(1);
      expect(data?.[0]?.attrs).toEqual({ orientacion: 'norte' });
    });

    test('owner NO puede editar el código de la unidad (estructura: la administra Vrotta)', async () => {
      const { error } = await scenario.users.inmoAOwner.client
        .from('units')
        .update({ code: 'CODIGO-CAMBIADO' })
        .eq('id', scenario.tenantA.unitPublicId)
        .select();
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/estructura/i);
    });

    test('editor NO puede reasignar group_id ni unit_type_id', async () => {
      const { error } = await scenario.users.inmoAEditor.client
        .from('units')
        .update({ group_id: null })
        .eq('id', scenario.tenantA.unitPublicId)
        .select();
      expect(error).not.toBeNull();
    });

    test('vrotta_operator SÍ puede editar el código (plataforma no tiene restricción de columna)', async () => {
      const newCode = `B-101-OP-${crypto.randomUUID().slice(0, 6)}`;
      const { data, error } = await scenario.users.vrottaOperator.client
        .from('units')
        .update({ code: newCode })
        .eq('id', scenario.tenantB.unitPublicId)
        .select();
      expect(error, error?.message).toBeNull();
      expect(data?.[0]?.code).toBe(newCode);
    });
  });

  // ── 9. Storage del bucket "material": aislamiento entre tenants ─────────
  describe('storage.objects (bucket material)', () => {
    const fileForB = () => `${scenario.tenantB.projectId}/${scenario.tenantB.materialItemId}/isolation-check.txt`;

    beforeAll(async () => {
      // Sembrado con el service client: no depende de RLS, sólo necesitamos
      // que exista un objeto real bajo la carpeta del proyecto B.
      const { error } = await svc.storage
        .from('material')
        .upload(fileForB(), Buffer.from('archivo del tenant B'), {
          contentType: 'text/plain',
          upsert: true,
        });
      if (error) throw new Error(`fixture storage: ${error.message}`);
    });

    test('inmo_a_owner no ve archivos del proyecto B', async () => {
      const { data, error } = await scenario.users.inmoAOwner.client.storage
        .from('material')
        .list(`${scenario.tenantB.projectId}/${scenario.tenantB.materialItemId}`);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    test('inmo_b_owner sí ve sus propios archivos', async () => {
      const { data, error } = await scenario.users.inmoBOwner.client.storage
        .from('material')
        .list(`${scenario.tenantB.projectId}/${scenario.tenantB.materialItemId}`);
      expect(error).toBeNull();
      expect((data ?? []).length).toBeGreaterThan(0);
    });

    test('inmo_a_owner no puede subir dentro de la carpeta del proyecto B', async () => {
      const { error } = await scenario.users.inmoAOwner.client.storage
        .from('material')
        .upload(
          `${scenario.tenantB.projectId}/${scenario.tenantB.materialItemId}/intruso.txt`,
          Buffer.from('no debería poder'),
          { contentType: 'text/plain' },
        );
      expect(error).not.toBeNull();
    });
  });

  // ── 10. Invitaciones (migración 0020) ────────────────────────────────────
  // Los cinco casos del plan (§7): no transferible (email distinto), no
  // vencida, no revocada, idempotente (aceptar dos veces no duplica
  // membership) y el token en claro nunca aparece en un select. El alta de
  // cada invitación se hace con el service client directamente sobre la
  // tabla (svc bypassa RLS): no es lo que se está probando acá — lo que se
  // prueba es la RPC `accept_invitation` y que `invitations` nunca devuelve
  // el token.
  describe('invitations (0020): accept_invitation y no-transferibilidad', () => {
    let invitee: { userId: string; email: string; client: SupabaseClient };

    beforeAll(async () => {
      const email = `rls-invitee-${crypto.randomUUID()}@test.r360.local`;
      const password = 'Test-P4ssword!';
      const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) throw new Error(`no pude crear la usuaria invitada: ${error?.message}`);
      // No usar signInWithPassword acá: con `[auth.email] enable_signup = false`
      // (R360 hallazgo B7) gotrue rechaza CUALQUIER login por email, incluido
      // el de un usuario ya creado y confirmado — ver el comentario largo en
      // `loginViaAdminMagicLink` (lib/fixtures.ts) con la verificación contra
      // gotrue de por qué y la alternativa que sí funciona.
      const client = await loginViaAdminMagicLink(email);
      invitee = { userId: data.user.id, email, client };
    });

    afterAll(async () => {
      await invitee.client.auth.signOut().catch(() => {});
      await svc.auth.admin.deleteUser(invitee.userId).catch(() => {});
    });

    async function insertInvitation(overrides: {
      email: string;
      expiresAt?: string;
      revokedAt?: string | null;
    }) {
      const token = `inv_test_${crypto.randomUUID()}`;
      const row = await insertOrThrow('invitations', {
        scope: 'tenant',
        tenant_id: scenario.tenantA.tenantId,
        role: 'editor',
        project_ids: [],
        email: overrides.email.toLowerCase(),
        token_hash: hashToken(token),
        expires_at: overrides.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        revoked_at: overrides.revokedAt ?? null,
      });
      return { token, row };
    }

    test('aceptar con un email distinto al de la invitación falla', async () => {
      // La invitación es para `invitee.email`, pero quien la acepta es
      // inmo_b_owner: sesiones distintas, emails distintos. No es
      // transferible: reenviar el link a otra persona no le sirve.
      const { token } = await insertInvitation({ email: invitee.email });
      const { error } = await scenario.users.inmoBOwner.client.rpc('accept_invitation', { p_token: token });
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/otra dirección de email/i);

      const { count } = await svc
        .from('memberships')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', scenario.tenantA.tenantId)
        .eq('user_id', scenario.users.inmoBOwner.userId);
      expect(count).toBe(0);
    });

    test('aceptar una invitación vencida falla', async () => {
      const { token } = await insertInvitation({
        email: invitee.email,
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
      const { error } = await invitee.client.rpc('accept_invitation', { p_token: token });
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/venci/i);
    });

    test('aceptar una invitación revocada falla', async () => {
      const { token } = await insertInvitation({
        email: invitee.email,
        revokedAt: new Date().toISOString(),
      });
      const { error } = await invitee.client.rpc('accept_invitation', { p_token: token });
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/revocada/i);
    });

    test('aceptar dos veces no duplica el membership (idempotente)', async () => {
      const { token } = await insertInvitation({ email: invitee.email });

      const { data: first, error: firstError } = await invitee.client.rpc('accept_invitation', { p_token: token });
      expect(firstError, firstError?.message).toBeNull();
      expect(first).toMatchObject({ scope: 'tenant' });

      const { count: countAfterFirst } = await svc
        .from('memberships')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', scenario.tenantA.tenantId)
        .eq('user_id', invitee.userId);
      expect(countAfterFirst).toBe(1);

      // Reintentar con el MISMO token: la invitación ya tiene accepted_at,
      // así que la RPC rechaza en vez de insertar una segunda membership.
      const { error: secondError } = await invitee.client.rpc('accept_invitation', { p_token: token });
      expect(secondError).not.toBeNull();
      expect(secondError?.message).toMatch(/ya fue aceptada/i);

      const { count: countAfterSecond } = await svc
        .from('memberships')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', scenario.tenantA.tenantId)
        .eq('user_id', invitee.userId);
      expect(countAfterSecond).toBe(1);

      // Limpieza: sacar a la invitada del tenant A para no interferir con
      // otros tests de esta misma suite que cuentan miembros del tenant.
      await svc.from('memberships').delete().eq('tenant_id', scenario.tenantA.tenantId).eq('user_id', invitee.userId);
    });

    test('el token en claro no aparece en ningún select de invitations', async () => {
      const { token } = await insertInvitation({ email: `rls-plaintext-check-${crypto.randomUUID()}@test.r360.local` });

      // inmo_a_owner SÍ puede leer invitaciones de su propio tenant (RLS
      // `invitations_select`): es la lectura real que usa `/t/[tenant]/team`.
      const { data, error } = await scenario.users.inmoAOwner.client.from('invitations').select('*');
      expect(error, error?.message).toBeNull();
      for (const row of data ?? []) {
        expect(Object.keys(row)).not.toContain('token');
        expect(Object.values(row)).not.toContain(token);
      }

      // Ni siquiera con la service key (que sí bypassa RLS) hay una columna
      // `token`: la tabla, tal como la define la migración 0020, sólo tiene
      // `token_hash`. Esto documenta que no es sólo la RLS la que oculta el
      // token — es que nunca se escribió en ningún lado.
      const { data: svcRow, error: svcError } = await svc
        .from('invitations')
        .select('*')
        .eq('token_hash', hashToken(token))
        .single();
      expect(svcError, svcError?.message).toBeNull();
      expect(svcRow).not.toHaveProperty('token');
      expect(svcRow?.token_hash).toBe(hashToken(token));
      expect(svcRow?.token_hash).not.toBe(token);
    });
  });

  // ── 12. project_domains y projects.subdomain (0022) ───────────────────────
  describe('project_domains y projects.subdomain (0022)', () => {
    afterEach(async () => {
      // No dejar subdominio puesto en los proyectos fixture entre tests: son
      // compartidos por toda la suite y una unique key pisada rompería otros
      // tests que corran después.
      await svc.from('projects').update({ subdomain: null }).eq('id', scenario.tenantA.projectId);
      await svc.from('projects').update({ subdomain: null }).eq('id', scenario.tenantB.projectId);
    });

    test('inmo_a_owner no ve los project_domains del tenant B', async () => {
      const domainA = `rls-a-${crypto.randomUUID().slice(0, 8)}.test-domain.local`;
      const domainB = `rls-b-${crypto.randomUUID().slice(0, 8)}.test-domain.local`;
      await insertOrThrow('project_domains', { project_id: scenario.tenantA.projectId, domain: domainA });
      await insertOrThrow('project_domains', { project_id: scenario.tenantB.projectId, domain: domainB });

      const { data, error } = await scenario.users.inmoAOwner.client.from('project_domains').select('domain');
      expect(error, error?.message).toBeNull();
      const domains = (data ?? []).map((r: { domain: string }) => r.domain);
      expect(domains).toContain(domainA);
      expect(domains).not.toContain(domainB);
    });

    // Reproduce la trampa del snapshot de 0015: supabase-js hace
    // `.insert().select()` por defecto, así que si a `project_domains_select`
    // le faltara la condición evaluada sobre la fila, esto fallaría con
    // "new row violates row-level security policy" aunque el INSERT en sí
    // estuviera autorizado.
    test('inmo_a_owner agrega un dominio a su propio proyecto (INSERT...RETURNING) y el trigger completa tenant_id', async () => {
      const domain = `rls-owner-add-${crypto.randomUUID().slice(0, 8)}.test-domain.local`;
      const { data, error } = await scenario.users.inmoAOwner.client
        .from('project_domains')
        .insert({ project_id: scenario.tenantA.projectId, domain })
        .select()
        .single();
      expect(error, error?.message).toBeNull();
      expect(data?.domain).toBe(domain);
      expect(data?.status).toBe('pending');
      expect(data?.verification_token).toBeTruthy(); // lo genera el default de la columna, no el cliente
      expect(data?.tenant_id).toBe(scenario.tenantA.tenantId); // lo completa el trigger, no lo manda el cliente
    });

    test('inmo_a_sales no puede agregar un dominio (la escritura es sólo owner/editor/plataforma)', async () => {
      const domain = `rls-sales-${crypto.randomUUID().slice(0, 8)}.test-domain.local`;
      const { error } = await scenario.users.inmoASales.client
        .from('project_domains')
        .insert({ project_id: scenario.tenantA.projectId, domain });
      expect(error).not.toBeNull();
    });

    test('inmo_b_owner no puede agregar un dominio al proyecto del tenant A', async () => {
      const domain = `rls-cross-tenant-${crypto.randomUUID().slice(0, 8)}.test-domain.local`;
      const { error } = await scenario.users.inmoBOwner.client
        .from('project_domains')
        .insert({ project_id: scenario.tenantA.projectId, domain });
      expect(error).not.toBeNull();
    });

    // 0022 no expone policy de UPDATE a usuarios a propósito: el estado de
    // verificación lo escribe el backend con service_role después de
    // consultar el DNS real. Sin policy, el UPDATE no da error -- RLS
    // simplemente no encuentra ninguna fila que matchee y actualiza cero.
    test('un owner no puede auto-marcar su dominio como verified (sin policy de UPDATE)', async () => {
      const domain = `rls-noupdate-${crypto.randomUUID().slice(0, 8)}.test-domain.local`;
      const row = await insertOrThrow('project_domains', { project_id: scenario.tenantA.projectId, domain });

      const { data, error } = await scenario.users.inmoAOwner.client
        .from('project_domains')
        .update({ status: 'verified', verified_at: new Date().toISOString() })
        .eq('id', row.id)
        .select();
      expect(error, error?.message).toBeNull();
      expect(data).toEqual([]);

      const { data: stillPending } = await svc.from('project_domains').select('status').eq('id', row.id).single();
      expect(stillPending?.status).toBe('pending');
    });

    test('dos proyectos no pueden tomar el mismo dominio, ni entre tenants distintos', async () => {
      const domain = `rls-domain-collision-${crypto.randomUUID().slice(0, 8)}.test-domain.local`;
      await insertOrThrow('project_domains', { project_id: scenario.tenantA.projectId, domain });
      await expect(
        insertOrThrow('project_domains', { project_id: scenario.tenantB.projectId, domain }),
      ).rejects.toThrow();
    });

    test('dos proyectos no pueden tomar el mismo subdominio', async () => {
      const subdomain = `rls-sub-${crypto.randomUUID().slice(0, 8)}`;
      const { error: firstErr } = await svc
        .from('projects')
        .update({ subdomain })
        .eq('id', scenario.tenantA.projectId);
      expect(firstErr, firstErr?.message).toBeNull();

      const { error } = await svc.from('projects').update({ subdomain }).eq('id', scenario.tenantB.projectId);
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/projects_subdomain_lower_key|duplicate key/i);
    });

    test('el formato inválido de subdominio (guion bajo) es rechazado por el constraint', async () => {
      const { error } = await svc
        .from('projects')
        .update({ subdomain: 'invalido_con_guion_bajo' })
        .eq('id', scenario.tenantA.projectId);
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/projects_subdomain_format/);
    });

    test('un subdominio demasiado corto también es rechazado por el constraint', async () => {
      const { error } = await svc.from('projects').update({ subdomain: 'ab' }).eq('id', scenario.tenantA.projectId);
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/projects_subdomain_format/);
    });

    test('un subdominio reservado (de la semilla de reserved_subdomains) no puede asignarse a un proyecto', async () => {
      const { error } = await svc.from('projects').update({ subdomain: 'admin' }).eq('id', scenario.tenantA.projectId);
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/reservado/i);
    });

    test('reserved_subdomains se puede leer autenticado pero no escribir', async () => {
      const { data, error } = await scenario.users.inmoAOwner.client.from('reserved_subdomains').select('subdomain');
      expect(error, error?.message).toBeNull();
      expect((data ?? []).map((r: { subdomain: string }) => r.subdomain)).toContain('admin');

      const { error: writeError } = await scenario.users.inmoAOwner.client
        .from('reserved_subdomains')
        .insert({ subdomain: 'lo-que-sea' });
      expect(writeError).not.toBeNull();
    });
  });
});
