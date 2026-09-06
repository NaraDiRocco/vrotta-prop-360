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

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { API_URL, ANON_KEY } from './lib/env.ts';
import { buildScenario, svc, type Scenario } from './lib/fixtures.ts';

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
});
