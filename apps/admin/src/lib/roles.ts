/**
 * La tabla de permisos del producto, una función por fila.
 *
 * Sin dependencias de servidor: lo importan tanto los server components como
 * los componentes de cliente. (auth.ts arrastra next/headers y supabase-js,
 * que no pueden cruzar al bundle del navegador.)
 *
 * TODAS las funciones toman un `Actor`, nunca un `Role` suelto: un rol de
 * cliente ('owner') y uno de plataforma ('admin') no se comparan entre sí, y
 * pasar el string pelado era la forma de confundirlos. `Actor` obliga a decir
 * de qué lado del mostrador está quien pregunta.
 *
 * Esto es la capa de UI: decide qué botón se muestra. La autorización de
 * verdad vive en la RLS de Postgres (migración 0019 y siguientes). Si las dos
 * no coinciden, el usuario ve un botón que le devuelve un error: por eso hay
 * un test que codifica la tabla entera, celda por celda.
 */
import type { Actor, PlatformRole, Role } from './data/types.ts';

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Administrador',
  editor: 'Gestor',
  sales: 'Vendedor',
};

export const PLATFORM_ROLE_LABEL: Record<PlatformRole, string> = {
  admin: 'Vrotta Admin',
  operator: 'Vrotta Operador',
};

export function actorLabel(actor: Actor): string {
  return actor.kind === 'platform'
    ? PLATFORM_ROLE_LABEL[actor.role]
    : ROLE_LABEL[actor.role];
}

/* ── Constructores ────────────────────────────────────────────────────── */

export function platformActor(role: PlatformRole): Actor {
  return { kind: 'platform', role };
}

export function tenantActor(role: Role): Actor {
  return { kind: 'tenant', role };
}

/* ── Predicados base ──────────────────────────────────────────────────── */

export function isPlatform(actor: Actor): boolean {
  return actor.kind === 'platform';
}

/** Vrotta Admin: la dueña y quien ella designe. */
export function isPlatformAdmin(actor: Actor): boolean {
  return actor.kind === 'platform' && actor.role === 'admin';
}

function isTenantRole(actor: Actor, ...roles: Role[]): boolean {
  return actor.kind === 'tenant' && roles.includes(actor.role);
}

/* ── Clientes (inmobiliarias) ─────────────────────────────────────────── */

/** Dar de alta una inmobiliaria. */
export function canCreateTenant(actor: Actor): boolean {
  return isPlatformAdmin(actor);
}

/** Borrar una inmobiliaria y todo lo que cuelga de ella. */
export function canDeleteTenant(actor: Actor): boolean {
  return isPlatformAdmin(actor);
}

/** Ver la lista de TODAS las inmobiliarias (la pantalla /admin). */
export function canListAllTenants(actor: Actor): boolean {
  return isPlatform(actor);
}

/** Nombre, logo y WhatsApp de la inmobiliaria. */
export function canEditTenantSettings(actor: Actor): boolean {
  return isPlatformAdmin(actor) || isTenantRole(actor, 'owner');
}

/** Facturación. Todavía no existe en el producto; la fila ya está decidida. */
export function canViewBilling(actor: Actor): boolean {
  return isPlatformAdmin(actor) || isTenantRole(actor, 'owner');
}

/* ── Equipos ──────────────────────────────────────────────────────────── */

/** Invitar / quitar gente del equipo de Vrotta. */
export function canManagePlatformTeam(actor: Actor): boolean {
  return isPlatformAdmin(actor);
}

/** Invitar / quitar usuarios de la inmobiliaria. */
export function canInviteTenantUsers(actor: Actor): boolean {
  return isPlatformAdmin(actor) || isTenantRole(actor, 'owner');
}

/** Asignar proyectos puntuales a un vendedor (`membership_projects`). */
export function canAssignProjects(actor: Actor): boolean {
  return isPlatformAdmin(actor) || isTenantRole(actor, 'owner');
}

/* ── Proyectos y producción ───────────────────────────────────────────── */

export function canCreateProject(actor: Actor): boolean {
  return isPlatform(actor);
}

/** Destructivo y en cascada: sólo Vrotta Admin. */
export function canDeleteProject(actor: Actor): boolean {
  return isPlatformAdmin(actor);
}

/**
 * Torres, pisos, manzanas, tipos y alta/baja de unidades: lo arma Vrotta a
 * partir del material. NO incluye m² ni atributos, que el cliente sí edita
 * (ver `canEditUnitAttributes`).
 */
export function canEditStructure(actor: Actor): boolean {
  return isPlatform(actor);
}

/**
 * m² y atributos de la unidad. Decisión de la dueña: son datos comerciales
 * que la inmobiliaria conoce mejor y corrige sobre la marcha, así que el
 * Administrador y el Gestor los editan. El Vendedor no.
 * En la base lo garantiza el trigger `units_tenant_update_guard` (0019).
 */
export function canEditUnitAttributes(actor: Actor): boolean {
  return isPlatform(actor) || isTenantRole(actor, 'owner', 'editor');
}

/** Subir / borrar escenas y mirar la cola de procesamiento. */
export function canManageScenes(actor: Actor): boolean {
  return isPlatform(actor);
}

/** Dibujar hotspots y armar el plano. */
export function canEditHotspots(actor: Actor): boolean {
  return isPlatform(actor);
}

export function canPublish(actor: Actor): boolean {
  return isPlatform(actor);
}

export function canIssuePreviewTokens(actor: Actor): boolean {
  return isPlatform(actor);
}

export function canConfigureDomains(actor: Actor): boolean {
  return isPlatform(actor);
}

/* ── Lo que ve y opera todo el mundo ──────────────────────────────────── */

/**
 * Ver proyectos, resumen y salud. El Vendedor sólo los que le asignaron: eso
 * lo filtra la base (`membership_projects`), no esta función.
 */
export function canViewProjects(_actor: Actor): boolean {
  return true;
}

/** Ver el recorrido publicado o un preview. */
export function canViewPublishedTour(_actor: Actor): boolean {
  return true;
}

/** Disponible, reservado, vendido… El Vendedor, sólo en sus proyectos. */
export function canChangeUnitStatus(_actor: Actor): boolean {
  return true;
}

/** Vistas guardadas de la tabla de unidades (cada uno las suyas). */
export function canUseSavedViews(_actor: Actor): boolean {
  return true;
}

/* ── Precios ──────────────────────────────────────────────────────────── */

export function canEditPrices(actor: Actor): boolean {
  return isPlatform(actor) || isTenantRole(actor, 'owner', 'editor');
}

/** Ver precios que no son públicos (`on_request` / `private`). */
export function canViewPrivatePrices(actor: Actor): boolean {
  return isPlatform(actor) || isTenantRole(actor, 'owner', 'editor');
}

/* ── Leads ────────────────────────────────────────────────────────────── */

export function canViewLeads(_actor: Actor): boolean {
  return true;
}

/**
 * Marcar estado, notas y leído. Vrotta Operador los VE (para dar soporte)
 * pero no los gestiona: el seguimiento comercial es del cliente. La exclusión
 * también está en la base, en la policy `leads_update` de 0019.
 */
export function canManageLeads(actor: Actor): boolean {
  return isPlatformAdmin(actor) || actor.kind === 'tenant';
}

export function canDeleteLead(actor: Actor): boolean {
  return isPlatformAdmin(actor) || isTenantRole(actor, 'owner');
}

/* ── Material ─────────────────────────────────────────────────────────── */

/** Ver qué material falta. */
export function canViewMaterial(_actor: Actor): boolean {
  return true;
}

export function canUploadMaterial(actor: Actor): boolean {
  return isPlatform(actor) || isTenantRole(actor, 'owner', 'editor');
}

/** Aprobar un archivo o marcar un ítem como "no aplica": es criterio de Vrotta. */
export function canApproveMaterial(actor: Actor): boolean {
  return isPlatform(actor);
}

/** Emitir o revocar el link que se manda por WhatsApp para subir material. */
export function canShareMaterialLink(actor: Actor): boolean {
  return isPlatform(actor) || isTenantRole(actor, 'owner');
}
