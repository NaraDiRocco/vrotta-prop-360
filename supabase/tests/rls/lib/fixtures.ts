// lib/fixtures.ts
// Arma dos inmobiliarias (A y B) con un proyecto cada una y a los cinco
// usuarios de la matriz del plan (§7), y da de baja todo al final.
//
// Usa el service client para el alta: es lo único que tiene sentido acá,
// porque el objetivo NO es probar que el fixture respeta RLS, sino tener un
// escenario conocido contra el cual correr las policies con cada usuario.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { API_URL, ANON_KEY, SERVICE_KEY } from './env.ts';

export const svc: SupabaseClient = createClient(API_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Sufijo único por corrida: permite dejar el harness sin `db reset` entre
// corridas sin chocar con `unique(slug)` / `unique(email)` de una corrida
// anterior que no llegó a limpiar (p.ej. si se mató el proceso a mitad).
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export interface TestUser {
  email: string;
  password: string;
  userId: string;
  /** Cliente ya logueado como este usuario (clave anon + sesión). */
  client: SupabaseClient;
}

async function createUser(label: string): Promise<TestUser> {
  const email = `rls-${label}-${RUN_ID}@test.r360.local`;
  const password = 'Test-P4ssword!';

  const { data, error } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`No se pudo crear el usuario de prueba ${label}: ${error?.message}`);
  }

  const client = createClient(API_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) {
    throw new Error(`No se pudo loguear como ${label}: ${signInError.message}`);
  }

  return { email, password, userId: data.user.id, client };
}

async function deleteUser(user: TestUser) {
  await user.client.auth.signOut().catch(() => {});
  const { error } = await svc.auth.admin.deleteUser(user.userId);
  if (error) {
    // No se hace fallar el teardown por esto (ya corrieron los tests), pero
    // se avisa fuerte: un usuario de prueba que queda huérfano en la base
    // local ensucia corridas futuras (emails únicos, platform_members).
    // eslint-disable-next-line no-console
    console.error(
      `[fixtures] no se pudo borrar el usuario de prueba ${user.email}: ${error.message}`,
    );
  }
}

interface TenantFixture {
  tenantId: string;
  projectId: string;
  groupId: string;
  unitTypeId: string;
  /** Unidad con precio público: visible para "sales". */
  unitPublicId: string;
  /** Unidad con precio "on_request": NO visible para "sales". */
  unitPrivateId: string;
  sceneId: string;
  hotspotId: string;
  leadId: string;
  publicationId: string;
  materialItemId: string; // id del catálogo (texto libre), no uuid
  projectMaterialId: string;
  materialFileId: string;
}

async function buildTenant(label: 'a' | 'b'): Promise<TenantFixture> {
  const tenant = await insertOrThrow('tenants', {
    slug: `rls-${label}-${RUN_ID}`,
    name: `RLS Test Inmobiliaria ${label.toUpperCase()}`,
  });

  const project = await insertOrThrow('projects', {
    tenant_id: tenant.id,
    slug: `rls-${label}-${RUN_ID}`,
    name: `Proyecto RLS ${label.toUpperCase()}`,
    kind: 'edificio',
  });

  const group = await insertOrThrow('groups', {
    project_id: project.id,
    kind: 'torre',
    code: 'T1',
    name: 'Torre 1',
  });

  const unitType = await insertOrThrow('unit_types', {
    project_id: project.id,
    code: 'std',
    name: 'Estándar',
  });

  const unitPublic = await insertOrThrow('units', {
    project_id: project.id,
    group_id: group.id,
    unit_type_id: unitType.id,
    code: `${label.toUpperCase()}-101`,
    status: 'disponible',
    area_total_m2: 50,
  });
  await insertOrThrow('unit_prices', {
    unit_id: unitPublic.id,
    amount: 100000,
    visibility: 'public',
  });

  const unitPrivate = await insertOrThrow('units', {
    project_id: project.id,
    group_id: group.id,
    unit_type_id: unitType.id,
    code: `${label.toUpperCase()}-102`,
    status: 'disponible',
    area_total_m2: 60,
  });
  await insertOrThrow('unit_prices', {
    unit_id: unitPrivate.id,
    amount: 200000,
    visibility: 'on_request',
  });

  const scene = await insertOrThrow('scenes', {
    project_id: project.id,
    slug: 'escena-1',
    kind: 'panorama',
    name: 'Escena 1',
    source: {},
  });

  const hotspot = await insertOrThrow('hotspots', {
    scene_id: scene.id,
    target_kind: 'unit',
    unit_id: unitPublic.id,
    geometry_kind: 'point_sph',
    geometry: { yaw: 0, pitch: 0 },
  });

  const lead = await insertOrThrow('leads', {
    project_id: project.id,
    unit_id: unitPublic.id,
    channel: 'test',
    payload: { status: 'nuevo', name: `lead-${label}` },
  });

  const publication = await insertOrThrow('publications', {
    project_id: project.id,
    version: 1,
    manifest: {},
  });

  const materialItemId = 'plano-general';
  const projectMaterial = await insertOrThrow('project_material', {
    project_id: project.id,
    item_id: materialItemId,
    status: 'pendiente',
  });

  const materialFile = await insertOrThrow('material_files', {
    project_id: project.id,
    item_id: materialItemId,
    storage_path: `${project.id}/${materialItemId}/seed.txt`,
    filename: 'seed.txt',
    size_bytes: 10,
    mime: 'text/plain',
  });

  return {
    tenantId: tenant.id,
    projectId: project.id,
    groupId: group.id,
    unitTypeId: unitType.id,
    unitPublicId: unitPublic.id,
    unitPrivateId: unitPrivate.id,
    sceneId: scene.id,
    hotspotId: hotspot.id,
    leadId: lead.id,
    publicationId: publication.id,
    materialItemId,
    projectMaterialId: projectMaterial.id,
    materialFileId: materialFile.id,
  };
}

async function insertOrThrow(table: string, row: Record<string, unknown>) {
  const { data, error } = await svc.from(table).insert(row).select().single();
  if (error) throw new Error(`fixture: insert en ${table} falló: ${error.message}`);
  return data as { id: string } & Record<string, unknown>;
}

export interface Scenario {
  tenantA: TenantFixture;
  tenantB: TenantFixture;
  /**
   * Segundo proyecto de la inmobiliaria A, a propósito NO asignado a
   * `inmoASales` vía `membership_projects`. Sirve para probar que el scoping
   * de "sales" es real (ve/opera SÓLO lo que le asignaron, no todo el tenant).
   */
  tenantAExtraProjectId: string;
  users: {
    vrottaAdmin: TestUser;
    vrottaOperator: TestUser;
    inmoAOwner: TestUser;
    inmoAEditor: TestUser;
    inmoASales: TestUser;
    inmoBOwner: TestUser;
  };
  /** Borra tenants (cascada) y usuarios de auth. Llamar en afterAll. */
  teardown: () => Promise<void>;
}

export async function buildScenario(): Promise<Scenario> {
  const tenantA = await buildTenant('a');
  const tenantB = await buildTenant('b');

  const extraProject = await insertOrThrow('projects', {
    tenant_id: tenantA.tenantId,
    slug: `rls-a-extra-${RUN_ID}`,
    name: 'Proyecto A no asignado a sales',
    kind: 'edificio',
  });

  const vrottaAdmin = await createUser('vrotta-admin');
  const vrottaOperator = await createUser('vrotta-operator');
  const inmoAOwner = await createUser('inmo-a-owner');
  const inmoAEditor = await createUser('inmo-a-editor');
  const inmoASales = await createUser('inmo-a-sales');
  const inmoBOwner = await createUser('inmo-b-owner');

  const { error: pmErr } = await svc.from('platform_members').insert([
    { user_id: vrottaAdmin.userId, role: 'admin' },
    { user_id: vrottaOperator.userId, role: 'operator' },
  ]);
  if (pmErr) throw new Error(`fixture: platform_members falló: ${pmErr.message}`);

  const { data: memberships, error: memErr } = await svc
    .from('memberships')
    .insert([
      { tenant_id: tenantA.tenantId, user_id: inmoAOwner.userId, role: 'owner' },
      { tenant_id: tenantA.tenantId, user_id: inmoAEditor.userId, role: 'editor' },
      { tenant_id: tenantA.tenantId, user_id: inmoASales.userId, role: 'sales' },
      { tenant_id: tenantB.tenantId, user_id: inmoBOwner.userId, role: 'owner' },
    ])
    .select();
  if (memErr || !memberships) throw new Error(`fixture: memberships falló: ${memErr?.message}`);

  // "sales" queda scopeado a UN proyecto (el suyo, en A) vía membership_projects:
  // así se puede probar que set_units_status funciona ahí y falla en otro lado.
  const salesMembership = memberships.find(
    (m) => m.user_id === inmoASales.userId && m.tenant_id === tenantA.tenantId,
  );
  if (!salesMembership) throw new Error('fixture: no se encontró la membership de sales');
  const { error: mpErr } = await svc
    .from('membership_projects')
    .insert({ membership_id: salesMembership.id, project_id: tenantA.projectId });
  if (mpErr) throw new Error(`fixture: membership_projects falló: ${mpErr.message}`);

  const users = { vrottaAdmin, vrottaOperator, inmoAOwner, inmoAEditor, inmoASales, inmoBOwner };

  const teardown = async () => {
    // ORDEN IMPORTA: `unit_status_log.changed_by` referencia auth.users SIN
    // cascada (0005 la deja en RESTRICT). Los tests de set_units_status
    // dejan filas ahí con changed_by = el usuario que cambió el estado. Si
    // se borra el usuario primero, el DELETE de auth.users falla por esa FK
    // (admin.deleteUser lo traga en un catch y el usuario queda huérfano en
    // la base local). Por eso: primero los tenants (cascada se lleva puesto
    // unit_status_log vía units), recién después los usuarios de auth.
    await svc.from('tenants').delete().in('id', [tenantA.tenantId, tenantB.tenantId]);
    for (const u of Object.values(users)) {
      await deleteUser(u);
    }
  };

  return { tenantA, tenantB, tenantAExtraProjectId: extraProject.id, users, teardown };
}
