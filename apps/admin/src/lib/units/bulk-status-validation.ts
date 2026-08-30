/**
 * Validación de entrada de `POST /api/p/[project]/bulk-status`, separada de
 * la ruta para poder testearla sin pasar por Next. Devuelve el primer campo
 * inválido para que la respuesta 400 pueda decir exactamente qué falta, en
 * vez de tirar una excepción no atrapada (eso era el bug: un body incompleto
 * hacía explotar `body.selection.mode` y volvía un 500 con cuerpo vacío).
 */
import { isUnitStatus } from '@r360/core';
import type { BulkStatusRequest } from './api-types.ts';

export interface BulkStatusValidationError {
  ok: false;
  error: string;
  field: string;
}

export interface BulkStatusValidationOk {
  ok: true;
  body: BulkStatusRequest;
}

export function validateBulkStatusBody(raw: unknown): BulkStatusValidationOk | BulkStatusValidationError {
  if (raw === null || typeof raw !== 'object') {
    return { ok: false, error: 'Cuerpo inválido', field: 'body' };
  }
  const body = raw as Partial<BulkStatusRequest>;

  if (!isUnitStatus(body.status)) {
    return { ok: false, error: 'Estado inválido', field: 'status' };
  }
  if (!body.selection || typeof body.selection !== 'object') {
    return { ok: false, error: 'Falta la selección', field: 'selection' };
  }
  if (body.selection.mode !== 'codes' && body.selection.mode !== 'filter') {
    return { ok: false, error: 'Modo de selección inválido', field: 'selection.mode' };
  }
  if (body.selection.mode === 'codes' && !Array.isArray(body.selection.codes)) {
    return { ok: false, error: 'Falta la lista de códigos', field: 'selection.codes' };
  }
  if (body.selection.mode === 'filter') {
    if (!body.selection.filter || typeof body.selection.filter !== 'object') {
      return { ok: false, error: 'Falta el filtro', field: 'selection.filter' };
    }
    if (!Array.isArray(body.selection.excluded)) {
      return { ok: false, error: 'Falta la lista de exclusiones', field: 'selection.excluded' };
    }
    if (!body.params || typeof body.params !== 'object') {
      return { ok: false, error: 'Falta params para materializar el filtro', field: 'params' };
    }
  }
  if (body.note !== null && body.note !== undefined && typeof body.note !== 'string') {
    return { ok: false, error: 'Nota inválida', field: 'note' };
  }

  return { ok: true, body: { ...body, note: body.note ?? null } as BulkStatusRequest };
}
