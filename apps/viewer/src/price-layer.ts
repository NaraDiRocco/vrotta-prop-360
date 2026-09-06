/**
 * Capa de precio conmutable (plan §5, "Comunicar el estado comercial —y el
 * precio— sin arcoíris").
 *
 * Estado ya usa color (`STATUS_TOKENS` de `@r360/core`, 5 tonos). El precio
 * es OTRA variable y no puede pintarse con más matices sobre la misma capa
 * (eso es el arcoíris de 8 colores que el plan descarta). Por eso esto vive
 * separado de `polygons.ts`/`STATUS_TOKENS`: una rampa secuencial de un solo
 * tono, y sólo para las unidades disponibles.
 *
 * Lógica pura — se verifica con tests, no mirando el mapa.
 */
import type { AvailabilityFile, TourManifest } from '@r360/core';

export interface PriceBand {
  /** Precio mínimo del tramo (inclusive). */
  min: number;
  /** Precio máximo del tramo (inclusive en el último tramo). */
  max: number;
  /** Color sólido de la rampa para este tramo. */
  color: string;
}

/** Rampa de un solo tono: barato -> claro, caro -> oscuro (verde-agua a azul petróleo). */
export const RAMP_FROM = '#a7f3d0';
export const RAMP_TO = '#0c4a6e';

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Interpola linealmente entre `from` y `to`. `t` se recorta a [0,1]. */
export function rampColor(t: number, from: string = RAMP_FROM, to: string = RAMP_TO): string {
  const clamped = Math.max(0, Math.min(1, t));
  const [r1, g1, b1] = hexToRgb(from);
  const [r2, g2, b2] = hexToRgb(to);
  return rgbToHex(r1 + (r2 - r1) * clamped, g1 + (g2 - g1) * clamped, b1 + (b2 - b1) * clamped);
}

/**
 * Tramos por cuantiles sobre los precios presentes. `bandCount` tramos con
 * (aprox.) la misma cantidad de unidades cada uno — no el mismo ancho de
 * precio, que con una cola larga dejaría tramos vacíos.
 *
 * PUNTO DE CONEXIÓN (plan §5): cuando `TourManifest.theme.priceBands` exista
 * (campo opcional que agrega otro agente en `packages/core`), esta función
 * deja de derivar y sólo mapea la config. Mientras no exista, se deriva acá:
 *
 *   // const configured = tour.theme?.priceBands;
 *   // if (configured?.length) return configured.map((b, i) => ({
 *   //   min: b.min, max: b.max, color: rampColor(i / (configured.length - 1)),
 *   // }));
 */
export function deriveBands(prices: readonly number[], bandCount = 3): PriceBand[] {
  const sorted = [...prices].filter((p) => Number.isFinite(p)).sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  // Con menos precios DISTINTOS que tramos pedidos, los cuantiles no
  // aportan nada: con dos precios (358.638 y 364.861, el caso real de
  // Baleia hoy) el reparto por cantidad de unidades igual arma 3 tramos y
  // dos de ellos comparten el mismo límite — "hasta USD 359 k · USD
  // 359 k–359 k · más de USD 359 k" (medido). Un tramo por precio distinto,
  // sin promediar ni inventar límites que no existen.
  const distinct = [...new Set(sorted)];
  if (distinct.length < bandCount) {
    return distinct.map((price, i) => ({
      min: price,
      max: price,
      color: rampColor(distinct.length === 1 ? 0 : i / (distinct.length - 1)),
    }));
  }

  const n = Math.max(1, Math.min(bandCount, sorted.length));
  const bands: PriceBand[] = [];
  for (let i = 0; i < n; i++) {
    const lo = Math.floor((i * sorted.length) / n);
    const hi = Math.floor(((i + 1) * sorted.length) / n) - 1;
    bands.push({
      min: sorted[lo]!,
      max: sorted[Math.max(lo, hi)]!,
      color: rampColor(n === 1 ? 0 : i / (n - 1)),
    });
  }
  // Los cuantiles dejan huecos entre tramos (ej. el tramo barato termina en
  // 200 y el siguiente arranca en 300: un precio de 250 no cae en ninguno).
  // Se cierran los tramos entre sí para que la cobertura sea continua; el
  // primer tramo que matchea gana el límite compartido.
  for (let i = 0; i < bands.length - 1; i++) bands[i]!.max = bands[i + 1]!.min;
  // Y se ensancha el `max` del último tramo al precio más alto real, así
  // ninguna unidad disponible queda sin tramo.
  bands[bands.length - 1]!.max = sorted[sorted.length - 1]!;
  return bands;
}

/** Tramo al que pertenece un precio, o `null` si no hay tramos o está fuera de rango. */
export function bandForPrice(price: number, bands: readonly PriceBand[]): PriceBand | null {
  for (const b of bands) {
    if (price >= b.min && price <= b.max) return b;
  }
  // Por encima del último tramo (dato nuevo llegó entre refrescos): se cae
  // en el tramo más caro en vez de quedar sin pintar.
  const last = bands[bands.length - 1];
  if (last && price > last.max) return last;
  const first = bands[0];
  if (first && price < first.min) return first;
  return null;
}

/** Precios de las unidades DISPONIBLES presentes en `availability.json`. */
export function availablePrices(availability: AvailabilityFile | null): number[] {
  if (!availability) return [];
  return Object.values(availability.units)
    .filter((u) => u.s === 'disponible' && u.p != null)
    .map((u) => u.p!.a);
}

/** Etiqueta legible de un tramo para la leyenda ("hasta USD 160 k", "160-220 k", "más de..."). */
export function bandLabel(band: PriceBand, index: number, total: number, currency = 'USD'): string {
  const fmt = (v: number) => `${Math.round(v / 1000)} k`;
  // Un solo tramo (un único precio publicado): ni "hasta" ni "más de" dicen
  // nada con un solo valor.
  if (total <= 1) return `${currency} ${fmt(band.min)}`;
  if (index === 0) return `hasta ${currency} ${fmt(band.max)}`;
  if (index === total - 1) return `más de ${currency} ${fmt(band.min)}`;
  // Tramo intermedio de un solo precio exacto (colapsado más arriba, o un
  // cuantil que cayó en un único valor): "USD 359 k–359 k" es ruido.
  if (band.min === band.max) return `${currency} ${fmt(band.min)}`;
  return `${currency} ${fmt(band.min)}–${fmt(band.max)}`;
}

/**
 * Bloque = tramo de su unidad disponible más barata ("desde"). Usado en
 * Baleia, donde el polígono es el bloque y no el lote individual (plan §5,
 * último párrafo).
 */
export function minAvailablePrice(codes: readonly string[], availability: AvailabilityFile | null): number | null {
  if (!availability) return null;
  let min: number | null = null;
  for (const code of codes) {
    const u = availability.units[code];
    if (u?.s === 'disponible' && u.p != null) min = min == null ? u.p.a : Math.min(min, u.p.a);
  }
  return min;
}

/** Códigos de unidad vendible que agrupa un hotspot de bloque (`attrs.unitCodes`), o el propio código si es una unidad hoja. */
export function unitCodesFor(hotspotUnitCode: string | null, tour: TourManifest): string[] {
  if (!hotspotUnitCode) return [];
  const entry = tour.units[hotspotUnitCode];
  const grouped = entry?.attrs?.unitCodes;
  return Array.isArray(grouped) ? (grouped as string[]) : [hotspotUnitCode];
}
