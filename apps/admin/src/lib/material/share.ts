/**
 * Link compartible de material — modelo de amenaza y decisiones de seguridad.
 *
 * CONTEXTO
 *   Este link se le manda al cliente por WhatsApp o por mail y se reenvía sin
 *   control: del gerente comercial al arquitecto, del arquitecto al renderista.
 *   Hay que asumir que va a terminar en manos de gente que no conocemos, y que
 *   tarde o temprano va a aparecer en el historial de algún chat grupal.
 *   Por eso el link es una CREDENCIAL DE UN SOLO PROYECTO, no una sesión.
 *
 * QUÉ PUEDE VER QUIEN TIENE EL LINK
 *   - El nombre del proyecto y su tipo, para saber que está en el lugar correcto.
 *   - El catálogo de material que le aplica a ese proyecto: qué es cada cosa,
 *     para qué la usamos, el formato exacto, si es obligatoria y el plan B.
 *   - El estado de cada ítem (pendiente/solicitado/recibido/aprobado/no_aplica)
 *     y la lista de archivos ya subidos PARA ESE PROYECTO, con su nombre y peso.
 *   Nada más. Nunca:
 *   - Otros proyectos del tenant, ni su listado, ni sus nombres. El token
 *     resuelve a un único project_id y todas las consultas se filtran por él.
 *   - Datos comerciales: precios, unidades, estados de venta, leads.
 *   - Datos internos de producción: `quienLoHace`, `comoSeHace`,
 *     `dondeContratarlo` y `precioReferencia` salen del documento interno de
 *     costos. `precioReferencia` y `dondeContratarlo` NO se envían al link
 *     público: son nuestros costos y nuestros proveedores. Ver `publicItem()`.
 *   - Usuarios, mails del equipo, ni quién cambió qué (`updated_by`,
 *     `uploaded_by` se omiten).
 *
 * QUÉ PUEDE HACER
 *   - Subir archivos para los ítems del catálogo que aceptan archivos.
 *   - Ver y descargar lo que se subió para ese proyecto.
 *   No puede: borrar archivos, cambiar el estado de un ítem, crear ni revocar
 *   links, ni escribir en ninguna otra tabla. El estado lo mueve el operador
 *   desde el panel; lo subido por el link entra como `recibido`, nunca como
 *   `aprobado`. Un link no puede escalar a otro link.
 *
 * CÓMO SE REVOCA
 *   `revoked_at` en `material_share_links`. La revocación es inmediata y no se
 *   deshace: se emite un link nuevo. El token no es adivinable (128 bits de
 *   `crypto.randomUUID()` sin guiones, prefijo `ml_`) así que no hace falta
 *   rate-limit para evitar fuerza bruta, pero igual se registra `created_by`
 *   para saber quién lo emitió. Un link vencido o revocado responde 404 con el
 *   MISMO cuerpo que un token inexistente: no confirmamos que el proyecto
 *   exista, para que un token filtrado no sirva ni para enumerar.
 *
 * TOKEN VENCIDO
 *   `expires_at` es opcional; cuando está, vencer es equivalente a revocar
 *   para todos los efectos (no lee, no sube). Lo ya subido queda: son archivos
 *   del proyecto, no del link. Por defecto los links se emiten con 30 días,
 *   que es el ciclo típico de "juntá el material y avisame".
 *
 * LÍMITES DE ARCHIVO
 *   Ver `uploads.ts`: 200 MB por archivo, extensión y MIME contra la lista del
 *   ítem, nombre saneado antes de tocar el storage, y ruta de storage derivada
 *   del project_id (nunca del nombre que manda el cliente), de forma que un
 *   `../` en el filename no pueda escribir fuera de la carpeta del proyecto.
 */
import { catalogFor, type MaterialItem } from './catalog.ts';
import type { MaterialShareLinkRow } from './types.ts';
import type { ProjectKind } from '@r360/core';

/** Días de vida por defecto de un link nuevo. */
export const DEFAULT_SHARE_TTL_DAYS = 30;
export const MIN_SHARE_TTL_DAYS = 1;
export const MAX_SHARE_TTL_DAYS = 365;

const TOKEN_PREFIX = 'ml_';

/** 128 bits de aleatoriedad criptográfica. No derivado de nada del proyecto. */
export function generateShareToken(): string {
  return TOKEN_PREFIX + crypto.randomUUID().replace(/-/g, '');
}

export function isShareTokenShaped(token: string): boolean {
  return new RegExp(`^${TOKEN_PREFIX}[0-9a-f]{32}$`).test(token);
}

export type ShareLinkState = 'activo' | 'revocado' | 'vencido';

export function shareLinkState(link: MaterialShareLinkRow, now: Date = new Date()): ShareLinkState {
  if (link.revokedAt !== null) return 'revocado';
  if (link.expiresAt !== null && Date.parse(link.expiresAt) <= now.getTime()) return 'vencido';
  return 'activo';
}

export function isShareLinkUsable(link: MaterialShareLinkRow, now: Date = new Date()): boolean {
  return shareLinkState(link, now) === 'activo';
}

export function expiresAtFromDays(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

/** Valida el TTL que llega por API. Devuelve el mensaje de error o null. */
export function validateTtlDays(days: unknown): string | null {
  if (typeof days !== 'number' || !Number.isFinite(days) || !Number.isInteger(days)) {
    return 'ttlDays tiene que ser un número entero de días';
  }
  if (days < MIN_SHARE_TTL_DAYS || days > MAX_SHARE_TTL_DAYS) {
    return `ttlDays tiene que estar entre ${MIN_SHARE_TTL_DAYS} y ${MAX_SHARE_TTL_DAYS}`;
  }
  return null;
}

/* ── Proyección pública ─────────────────────────────────────────────────── */

/**
 * El ítem tal como lo ve quien tiene el link: sin costos ni proveedores.
 * `quienLoHace` y `comoSeHace` sí se muestran —son justamente lo que hace que
 * el cliente entienda qué tiene que ir a buscar— pero `dondeContratarlo` y
 * `precioReferencia` son información comercial nuestra y se recortan acá.
 */
export interface PublicMaterialItem {
  id: string;
  categoria: string;
  nombre: string;
  queEs: string;
  paraQue: string;
  formato: string;
  requisito: MaterialItem['requisito'];
  obligatorioSi?: string;
  siNoLoTienen: string;
  quienLoHace?: string;
  comoSeHace?: string;
  aceptaArchivos: boolean;
  extensiones?: string[];
}

export function publicItem(item: MaterialItem): PublicMaterialItem {
  const out: PublicMaterialItem = {
    id: item.id,
    categoria: item.categoria,
    nombre: item.nombre,
    queEs: item.queEs,
    paraQue: item.paraQue,
    formato: item.formato,
    requisito: item.requisito,
    siNoLoTienen: item.siNoLoTienen,
    aceptaArchivos: item.aceptaArchivos,
  };
  if (item.obligatorioSi !== undefined) out.obligatorioSi = item.obligatorioSi;
  if (item.quienLoHace !== undefined) out.quienLoHace = item.quienLoHace;
  if (item.comoSeHace !== undefined) out.comoSeHace = item.comoSeHace;
  if (item.extensiones !== undefined) out.extensiones = item.extensiones;
  return out;
}

export function publicCatalogFor(kind: ProjectKind): PublicMaterialItem[] {
  return catalogFor(kind).map(publicItem);
}
