/**
 * Vocabulario visual de estados de LEAD.
 *
 * Deliberadamente NO vive en `@r360/core`: ese paquete es el contrato de
 * estados de UNIDAD compartido entre panel, editor y visor (`STATUS_TOKENS`,
 * `UNIT_STATUSES`) — un contrato que existe justamente para que los tres no
 * diverjan. Un lead no es una unidad y no existe fuera del panel; mezclar
 * los dos vocabularios en el mismo archivo es exactamente lo que ese
 * contrato está para evitar. Por eso el vocabulario de lead se define acá,
 * cerca de quien lo consume.
 *
 * Hoy (`components/leads/*`) todo estado de lead se pinta con el mismo pill
 * gris: "ganado" y "descartado" se ven iguales. Este archivo es la fuente
 * única de verdad para que dejen de verse iguales.
 */
export const LEAD_STATUSES = ['nuevo', 'contactado', 'calificado', 'ganado', 'descartado'] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Mismo vocabulario de tono que `Pill` (`ui/pill.tsx`), no uno propio. */
export type LeadStatusTone = 'accent' | 'neutral' | 'warn' | 'ok' | 'faint';

export interface LeadStatusToken {
  label: string;
  tone: LeadStatusTone;
  /** Orden de exhibición en filtros y leyendas — no alfabético, sigue el ciclo de vida del lead. */
  order: number;
}

export const LEAD_STATUS_TOKENS: Record<LeadStatus, LeadStatusToken> = {
  nuevo: { label: 'Nuevo', tone: 'accent', order: 1 },
  // "muted" del plan == el tono `neutral` que ya usan MOCK/requisito: no
  // hace falta un cuarto gris distinto para decir lo mismo.
  contactado: { label: 'Contactado', tone: 'neutral', order: 2 },
  calificado: { label: 'Calificado', tone: 'warn', order: 3 },
  ganado: { label: 'Ganado', tone: 'ok', order: 4 },
  descartado: { label: 'Descartado', tone: 'faint', order: 5 },
};

export function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}

export function leadStatusLabel(status: LeadStatus): string {
  return LEAD_STATUS_TOKENS[status].label;
}
