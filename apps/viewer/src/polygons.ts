/**
 * Hotspot[] + availability.json  →  marcadores.
 *
 * REGLA DURA: un estado ausente, nulo o desconocido NO hace desaparecer el
 * polígono. Cae a FALLBACK_STATUS y avisa por consola. Ese es exactamente el
 * bug que le encontramos al competidor: si el CRM manda un estado que el visor
 * no conoce, el lote deja de dibujarse y el visitante ve un hueco en el mapa
 * sin ninguna señal de que algo falló.
 */
import type { MarkerConfig } from '@photo-sphere-viewer/markers-plugin';
import {
  densifyRing,
  sphericalCentroid,
  isUnitStatus,
  FALLBACK_STATUS,
  STATUS_TOKENS,
  type AvailabilityFile,
  type Hotspot,
  type Px,
  type Sph,
  type TourManifest,
  type UnitStatus,
} from '@r360/core';

export interface ResolvedStatus {
  status: UnitStatus;
  /** true si hubo que recurrir al fallback (el dato no vino o no se entiende). */
  fellBack: boolean;
  reason?: 'sin-codigo' | 'unidad-ausente' | 'estado-desconocido';
}

export interface UnitFacts {
  code: string | null;
  label: string;
  areaTotalM2: number | null;
  price: { a: number; c: string } | null;
  status: UnitStatus;
  fellBack: boolean;
}

/** Datos que el visor guarda por marcador, para tooltip, eventos y refresco. */
export interface MarkerMeta {
  hotspotId: string;
  unitCode: string | null;
  facts: UnitFacts;
}

/** Se avisa una sola vez por código: si no, 600 lotes rotos = 600 líneas iguales. */
const warned = new Set<string>();

export function resolveStatus(
  unitCode: string | null,
  availability: AvailabilityFile | null,
): ResolvedStatus {
  if (!unitCode) return { status: FALLBACK_STATUS, fellBack: true, reason: 'sin-codigo' };

  const entry = availability?.units[unitCode];
  if (!entry) {
    warnOnce(
      `[r360] La unidad "${unitCode}" no figura en availability.json. ` +
        `Se dibuja como "${FALLBACK_STATUS}" en vez de ocultarla.`,
      `missing:${unitCode}`,
    );
    return { status: FALLBACK_STATUS, fellBack: true, reason: 'unidad-ausente' };
  }

  if (!isUnitStatus(entry.s)) {
    warnOnce(
      `[r360] Estado desconocido "${String(entry.s)}" para la unidad "${unitCode}". ` +
        `Se dibuja como "${FALLBACK_STATUS}".`,
      `unknown:${unitCode}:${String(entry.s)}`,
    );
    return { status: FALLBACK_STATUS, fellBack: true, reason: 'estado-desconocido' };
  }

  return { status: entry.s, fellBack: false };
}

function warnOnce(msg: string, key: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(msg);
}

export function unitFacts(
  hotspot: Hotspot,
  tour: TourManifest,
  availability: AvailabilityFile | null,
): UnitFacts {
  const code = hotspot.unitCode;
  const info = code ? tour.units[code] : undefined;
  const { status, fellBack } = resolveStatus(code, availability);
  return {
    code,
    label: hotspot.label ?? info?.label ?? code ?? hotspot.id,
    areaTotalM2: info?.areaTotalM2 ?? null,
    price: (code && availability?.units[code]?.p) || null,
    status,
    fellBack,
  };
}

// --------------------------------------------------------------------- estilo

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return `rgba(100,116,139,${alpha})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Token efectivo: el del contrato, salvo que el tour lo sobreescriba por tema. */
export function tokenFor(status: UnitStatus, tour: TourManifest): { base: string; fill: number } {
  const t = STATUS_TOKENS[status];
  const o = tour.theme?.states?.[status];
  return { base: o?.base ?? t.base, fill: o?.fill ?? t.fill };
}

export function svgStyleFor(
  status: UnitStatus,
  tour: TourManifest,
  opts: { highlighted?: boolean } = {},
): Record<string, string> {
  const { base, fill } = tokenFor(status, tour);
  return {
    fill: hexToRgba(base, opts.highlighted ? Math.min(1, fill + 0.22) : fill),
    stroke: base,
    'stroke-width': opts.highlighted ? '4' : '2',
    'stroke-linejoin': 'round',
    'vector-effect': 'non-scaling-stroke',
  };
}

// ------------------------------------------------------------------- tooltip

export function tooltipHtml(facts: UnitFacts, tour: TourManifest): string {
  const { base } = tokenFor(facts.status, tour);
  const rows: string[] = [];
  if (facts.areaTotalM2 != null) rows.push(`${formatNumber(facts.areaTotalM2)} m²`);
  if (facts.price) rows.push(formatPrice(facts.price));
  return (
    `<div class="r360-tip">` +
    `<div class="r360-tip__code">${escapeHtml(facts.label)}</div>` +
    (rows.length ? `<div class="r360-tip__meta">${escapeHtml(rows.join(' · '))}</div>` : '') +
    `<div class="r360-tip__status"><i style="background:${base}"></i>` +
    `${escapeHtml(STATUS_TOKENS[facts.status].label)}` +
    (facts.fellBack ? ' <em>(sin dato)</em>' : '') +
    `</div></div>`
  );
}

const NUM = new Intl.NumberFormat('es-AR');
const formatNumber = (v: number) => NUM.format(v);

function formatPrice(p: { a: number; c: string }): string {
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency', currency: p.c, maximumFractionDigits: 0,
    }).format(p.a);
  } catch {
    return `${p.c} ${NUM.format(p.a)}`;
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

// ----------------------------------------------------------------- marcadores

export interface BuildResult {
  markers: MarkerConfig[];
  meta: Map<string, MarkerMeta>;
  fallbackCount: number;
}

export interface BuildOptions {
  /** Paso de densificación en grados. 0 desactiva (útil para el spike). */
  stepDeg?: number;
  /** Marcador de etiqueta en el centroide, además del polígono. */
  labels?: boolean;
}

/**
 * Sólo hotspots esféricos: los `polygon_px` son de escenas floorplan/map y los
 * dibuja Leaflet (ver floorplan.ts).
 */
export function buildMarkers(
  hotspots: readonly Hotspot[],
  tour: TourManifest,
  availability: AvailabilityFile | null,
  opts: BuildOptions = {},
): BuildResult {
  const stepDeg = opts.stepDeg ?? 2;
  const markers: MarkerConfig[] = [];
  const meta = new Map<string, MarkerMeta>();
  let fallbackCount = 0;

  for (const h of hotspots) {
    if (h.geometryKind !== 'polygon_sph' && h.geometryKind !== 'point_sph') continue;
    const facts = unitFacts(h, tour, availability);
    if (facts.fellBack) fallbackCount++;

    if (h.geometryKind === 'point_sph') {
      const [yaw, pitch] = (h.geometry as Sph[])[0] ?? (h.anchor as Sph) ?? [0, 0];
      markers.push({
        id: h.id,
        position: { yaw, pitch },
        circle: 12,
        svgStyle: svgStyleFor(facts.status, tour),
        tooltip: { content: tooltipHtml(facts, tour), position: 'top center' },
        zIndex: h.zIndex ?? 10,
        data: { hotspotId: h.id },
      });
      meta.set(h.id, { hotspotId: h.id, unitCode: h.unitCode, facts });
      continue;
    }

    const raw = h.geometry as Sph[];
    if (raw.length < 3) {
      console.warn(`[r360] Hotspot "${h.id}" tiene ${raw.length} vértices; se omite.`);
      continue;
    }
    // Sin densificar, PSV une los vértices con una recta EN PANTALLA y a FOV
    // ancho el borde se despega visiblemente del lote.
    const ring = stepDeg > 0 ? densifyRing(raw, stepDeg) : [...raw];

    markers.push({
      id: h.id,
      polygon: ring.map(([y, p]) => [y, p] as [number, number]),
      svgStyle: svgStyleFor(facts.status, tour),
      tooltip: { content: tooltipHtml(facts, tour), position: 'top center' },
      zIndex: h.zIndex ?? 1,
      data: { hotspotId: h.id },
    });
    meta.set(h.id, { hotspotId: h.id, unitCode: h.unitCode, facts });

    if (opts.labels !== false && facts.code) {
      const [yaw, pitch] = (h.anchor as Sph | undefined) ?? sphericalCentroid(raw);
      markers.push({
        id: `${h.id}::label`,
        position: { yaw, pitch },
        html: `<span class="r360-label">${escapeHtml(facts.label)}</span>`,
        anchor: 'center center',
        zIndex: (h.zIndex ?? 1) + 1000,
        style: { pointerEvents: 'none' },
        data: { hotspotId: h.id, isLabel: true },
      });
    }
  }

  return { markers, meta, fallbackCount };
}

/** Convierte geometría normalizada 0..1 a coordenadas de plano (px del master). */
export function pxToPlane(p: Px, width: number, height: number): [number, number] {
  return [p[0] * width, p[1] * height];
}
