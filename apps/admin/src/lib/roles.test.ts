import { describe, expect, it } from 'vitest';
import type { Actor } from './data/types.ts';
import {
  actorLabel,
  canApproveMaterial,
  canAssignProjects,
  canChangeUnitStatus,
  canConfigureDomains,
  canCreateProject,
  canCreateTenant,
  canDeleteLead,
  canDeleteProject,
  canDeleteTenant,
  canEditHotspots,
  canEditPrices,
  canEditStructure,
  canEditTenantSettings,
  canEditUnitAttributes,
  canInviteTenantUsers,
  canIssuePreviewTokens,
  canListAllTenants,
  canManageLeads,
  canManagePlatformTeam,
  canManageScenes,
  canPublish,
  canShareMaterialLink,
  canUploadMaterial,
  canUseSavedViews,
  canViewBilling,
  canViewLeads,
  canViewMaterial,
  canViewPrivatePrices,
  canViewProjects,
  canViewPublishedTour,
  isPlatform,
  isPlatformAdmin,
  platformActor,
  PLATFORM_ROLE_LABEL,
  ROLE_LABEL,
  tenantActor,
} from './roles.ts';

/**
 * La tabla de permisos del producto, codificada celda por celda.
 *
 * No es un test de implementación: es el documento. Si alguien mueve una
 * capacidad de un rol a otro, tiene que venir acá y cambiar la celda a mano,
 * y ahí se ve qué se está regalando. Las columnas son las mismas del plan:
 *
 *   VA = Vrotta Admin · VO = Vrotta Operador
 *   AD = Administrador (owner) · GE = Gestor (editor) · VE = Vendedor (sales)
 */
const ACTORS: Record<'VA' | 'VO' | 'AD' | 'GE' | 'VE', Actor> = {
  VA: platformActor('admin'),
  VO: platformActor('operator'),
  AD: tenantActor('owner'),
  GE: tenantActor('editor'),
  VE: tenantActor('sales'),
};

type Cell = boolean;
type Row = [accion: string, fn: (actor: Actor) => boolean, VA: Cell, VO: Cell, AD: Cell, GE: Cell, VE: Cell];

const S = true;
const N = false;

const TABLA: Row[] = [
  //  acción                                     función                 VA VO AD GE VE
  ['Dar de alta una inmobiliaria',               canCreateTenant,        S, N, N, N, N],
  ['Borrar una inmobiliaria',                    canDeleteTenant,        S, N, N, N, N],
  ['Invitar / quitar gente del equipo Vrotta',   canManagePlatformTeam,  S, N, N, N, N],
  ['Ver la lista de todas las inmobiliarias',    canListAllTenants,      S, S, N, N, N],
  ['Crear proyecto',                             canCreateProject,       S, S, N, N, N],
  ['Borrar proyecto',                            canDeleteProject,       S, N, N, N, N],
  ['Editar estructura (grupos, tipos, códigos)', canEditStructure,       S, S, N, N, N],
  // Decisión de la dueña: los m² y los atributos los corrige el cliente.
  ['Editar m² y atributos de la unidad',         canEditUnitAttributes,  S, S, S, S, N],
  ['Subir / borrar escenas, ver la cola',        canManageScenes,        S, S, N, N, N],
  ['Dibujar hotspots / armar el plano',          canEditHotspots,        S, S, N, N, N],
  ['Publicar / revertir una versión',            canPublish,             S, S, N, N, N],
  ['Emitir tokens de preview',                   canIssuePreviewTokens,  S, S, N, N, N],
  ['Configurar dominios autorizados',            canConfigureDomains,    S, S, N, N, N],
  ['Ver proyectos, resumen y salud',             canViewProjects,        S, S, S, S, S],
  ['Ver el recorrido publicado / preview',       canViewPublishedTour,   S, S, S, S, S],
  ['Cambiar estado de unidad',                   canChangeUnitStatus,    S, S, S, S, S],
  ['Editar precio y visibilidad del precio',     canEditPrices,          S, S, S, S, N],
  ['Ver precios no públicos',                    canViewPrivatePrices,   S, S, S, S, N],
  ['Ver leads',                                  canViewLeads,           S, S, S, S, S],
  // El Operador de Vrotta los ve para dar soporte, pero no los gestiona.
  ['Gestionar lead (estado, notas, leído)',      canManageLeads,         S, N, S, S, S],
  ['Borrar lead',                                canDeleteLead,          S, N, S, N, N],
  ['Ver qué material falta',                     canViewMaterial,        S, S, S, S, S],
  ['Subir material',                             canUploadMaterial,      S, S, S, S, N],
  ['Aprobar material / marcar "no aplica"',      canApproveMaterial,     S, S, N, N, N],
  ['Emitir / revocar link de material',          canShareMaterialLink,   S, S, S, N, N],
  ['Invitar / quitar usuarios de la inmobiliaria', canInviteTenantUsers, S, N, S, N, N],
  ['Asignar proyectos a un vendedor',            canAssignProjects,      S, N, S, N, N],
  ['Editar nombre, logo y WhatsApp',             canEditTenantSettings,  S, N, S, N, N],
  ['Ver facturación',                            canViewBilling,         S, N, S, N, N],
  ['Vistas guardadas de la tabla de unidades',   canUseSavedViews,       S, S, S, S, S],
];

describe('tabla de permisos', () => {
  for (const [accion, fn, VA, VO, AD, GE, VE] of TABLA) {
    describe(accion, () => {
      it(`Vrotta Admin: ${VA ? 'sí' : 'no'}`, () => expect(fn(ACTORS.VA)).toBe(VA));
      it(`Vrotta Operador: ${VO ? 'sí' : 'no'}`, () => expect(fn(ACTORS.VO)).toBe(VO));
      it(`Administrador: ${AD ? 'sí' : 'no'}`, () => expect(fn(ACTORS.AD)).toBe(AD));
      it(`Gestor: ${GE ? 'sí' : 'no'}`, () => expect(fn(ACTORS.GE)).toBe(GE));
      it(`Vendedor: ${VE ? 'sí' : 'no'}`, () => expect(fn(ACTORS.VE)).toBe(VE));
    });
  }
});

describe('predicados base', () => {
  it('sólo los actores de plataforma son plataforma', () => {
    expect(isPlatform(ACTORS.VA)).toBe(true);
    expect(isPlatform(ACTORS.VO)).toBe(true);
    expect(isPlatform(ACTORS.AD)).toBe(false);
    expect(isPlatform(ACTORS.GE)).toBe(false);
    expect(isPlatform(ACTORS.VE)).toBe(false);
  });

  it('el Administrador de una inmobiliaria no es admin de plataforma', () => {
    expect(isPlatformAdmin(ACTORS.VA)).toBe(true);
    expect(isPlatformAdmin(ACTORS.VO)).toBe(false);
    expect(isPlatformAdmin(ACTORS.AD)).toBe(false);
  });
});

describe('etiquetas', () => {
  it('los roles de cliente se llaman por lo que hacen', () => {
    expect(ROLE_LABEL.owner).toBe('Administrador');
    expect(ROLE_LABEL.editor).toBe('Gestor');
    expect(ROLE_LABEL.sales).toBe('Vendedor');
  });

  it('los de plataforma dicen Vrotta', () => {
    expect(PLATFORM_ROLE_LABEL.admin).toBe('Vrotta Admin');
    expect(PLATFORM_ROLE_LABEL.operator).toBe('Vrotta Operador');
  });

  it('actorLabel elige la tabla que corresponde', () => {
    expect(actorLabel(ACTORS.VO)).toBe('Vrotta Operador');
    expect(actorLabel(ACTORS.AD)).toBe('Administrador');
  });
});
