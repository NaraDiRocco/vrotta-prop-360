import type { UnitPriceInput } from '../data/types.ts';

/**
 * Monedas que acepta el formulario de precio. Acotado a propósito: es más
 * fácil sumar una que explicarle a alguien por qué escribió "Dólares" y no
 * pasó la validación.
 */
export const PRICE_CURRENCIES: readonly string[] = ['USD', 'UYU', 'ARS'];

/**
 * Visibilidades que la inmobiliaria puede elegir al cargar un precio.
 * `private` no está: es para precios que ni el comprador ve (uso interno de
 * Vrotta), no algo que se ofrezca en este formulario — ver `UnitPriceInput`.
 */
export const PRICE_VISIBILITIES: readonly UnitPriceInput['visibility'][] = ['public', 'on_request'];

export type PriceValidation = { ok: true; value: UnitPriceInput } | { ok: false; field: string; message: string };

/**
 * Valida el cuerpo de `PUT /api/p/[project]/units/[unit]/price` antes de
 * tocar la base. Función pura para poder testear los casos borde (monto
 * negativo, moneda inventada, visibilidad `private` colada) sin levantar un
 * request de verdad.
 */
export function validatePriceInput(body: unknown): PriceValidation {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, field: 'body', message: 'Cuerpo inválido' };
  }
  const r = body as Record<string, unknown>;

  const amount = r['amount'];
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
    return { ok: false, field: 'amount', message: 'El monto tiene que ser un número positivo' };
  }

  const currency = r['currency'];
  if (typeof currency !== 'string' || !PRICE_CURRENCIES.includes(currency)) {
    return { ok: false, field: 'currency', message: `Moneda inválida: ${String(currency) || '(vacía)'}` };
  }

  const visibility = r['visibility'];
  if (typeof visibility !== 'string' || !PRICE_VISIBILITIES.includes(visibility as UnitPriceInput['visibility'])) {
    return { ok: false, field: 'visibility', message: 'Visibilidad inválida' };
  }

  return { ok: true, value: { amount, currency, visibility: visibility as UnitPriceInput['visibility'] } };
}
