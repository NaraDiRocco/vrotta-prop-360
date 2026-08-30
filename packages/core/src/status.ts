/**
 * Contrato compartido de estados comerciales.
 * Lo consumen el panel, el editor y el visor. Es la ÚNICA fuente de estos
 * colores: si diverge, el usuario ve un lote naranja en el panel y amarillo
 * en el recorrido, y el producto pierde credibilidad.
 */
export const UNIT_STATUSES = [
  'disponible',
  'reservado',
  'vendido',
  'bloqueado',
  'no_disponible',
] as const;

export type UnitStatus = (typeof UNIT_STATUSES)[number];

export interface StatusToken {
  /** Color base, usado sólido en bordes y chips. */
  base: string;
  /** Alpha del relleno del polígono (0..1). */
  fill: number;
  label: string;
  /** Trama para accesibilidad no cromática e impresión. */
  pattern: 'solid' | 'diagonal' | 'cross' | 'dots';
  order: number;
}

export const STATUS_TOKENS: Record<UnitStatus, StatusToken> = {
  disponible:    { base: '#16A34A', fill: 0.28, label: 'Disponible',    pattern: 'solid',    order: 1 },
  reservado:     { base: '#D97706', fill: 0.30, label: 'Reservado',     pattern: 'diagonal', order: 2 },
  vendido:       { base: '#DC2626', fill: 0.26, label: 'Vendido',       pattern: 'solid',    order: 3 },
  bloqueado:     { base: '#7C3AED', fill: 0.24, label: 'Bloqueado',     pattern: 'cross',    order: 4 },
  no_disponible: { base: '#64748B', fill: 0.20, label: 'No disponible', pattern: 'dots',     order: 5 },
};

export function isUnitStatus(v: unknown): v is UnitStatus {
  return typeof v === 'string' && (UNIT_STATUSES as readonly string[]).includes(v);
}

/** Estado de fallback. Nunca desaparece un hotspot en silencio. */
export const FALLBACK_STATUS: UnitStatus = 'no_disponible';
