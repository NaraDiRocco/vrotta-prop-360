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
  'proximamente',
] as const;

export type UnitStatus = (typeof UNIT_STATUSES)[number];

export interface StatusToken {
  /** Color base, usado sólido en bordes y chips. */
  base: string;
  /** Alpha del relleno del polígono (0..1). */
  fill: number;
  label: string;
  /** Trama para accesibilidad no cromática e impresión. */
  pattern: 'solid' | 'diagonal' | 'cross' | 'dots' | 'outline';
  order: number;
}

export const STATUS_TOKENS: Record<UnitStatus, StatusToken> = {
  disponible:    { base: '#16A34A', fill: 0.28, label: 'Disponible',    pattern: 'solid',    order: 1 },
  reservado:     { base: '#D97706', fill: 0.30, label: 'Reservado',     pattern: 'diagonal', order: 2 },
  vendido:       { base: '#DC2626', fill: 0.26, label: 'Vendido',       pattern: 'solid',    order: 3 },
  bloqueado:     { base: '#7C3AED', fill: 0.24, label: 'Bloqueado',     pattern: 'cross',    order: 4 },
  no_disponible: { base: '#64748B', fill: 0.20, label: 'No disponible', pattern: 'dots',     order: 5 },
  // Estado de primera clase (plan de experiencia, docs/06-BENCHMARK/5-EXPERIENCIA-BALEIA.md
  // §5.3): un bloque que todavía no está a la venta pero SÍ tiene fecha
  // pública de "próximamente" (a diferencia de B4/B5, que no tienen ni eso y
  // quedan directamente fuera de `availability.json`, sin token). No es
  // "no_disponible" (eso implica una unidad que existe y no se puede
  // comprar hoy) ni un fallback (el dato no falló: se sabe con certeza que
  // es "próximamente", lo dice el brochure). `fill: 0` + `pattern: 'outline'`
  // es la contraparte exacta de INFO_TOKEN para el caso "no es ni disponible
  // ni vendido, pero SÍ es una unidad/bloque vendible en el futuro": el
  // polígono se dibuja sólo con el trazo (chip de contorno), nunca relleno,
  // para no confundirlo visualmente con "disponible" ni con "vendido".
  proximamente:  { base: '#0D9488', fill: 0,    label: 'Próximamente',  pattern: 'outline',  order: 6 },
};

export function isUnitStatus(v: unknown): v is UnitStatus {
  return typeof v === 'string' && (UNIT_STATUSES as readonly string[]).includes(v);
}

/** Estado de fallback. Nunca desaparece un hotspot en silencio. */
export const FALLBACK_STATUS: UnitStatus = 'no_disponible';

/**
 * Estilo de los hotspots INFORMATIVOS: amenities, perímetros, puntos de
 * interés. No son unidades vendibles, así que no tienen estado comercial y
 * no deben resolverse contra availability.json.
 *
 * Sin esto un amenity caía en FALLBACK_STATUS y se dibujaba gris con un
 * "(sin dato)" en el tooltip, como si le faltara información. No le falta:
 * una laguna no está ni disponible ni vendida.
 */
export const INFO_TOKEN: Omit<StatusToken, 'order'> = {
  base: '#0EA5E9',
  fill: 0.18,
  label: 'Punto de interés',
  pattern: 'solid',
};

/**
 * Un hotspot es informativo cuando no apunta a ninguna unidad vendible.
 * Se decide por la ausencia de `unitCode`, no por una bandera aparte: así no
 * pueden quedar en desacuerdo.
 */
export function isInformationalHotspot(h: { unitCode: string | null }): boolean {
  return h.unitCode === null || h.unitCode === undefined || h.unitCode === '';
}
