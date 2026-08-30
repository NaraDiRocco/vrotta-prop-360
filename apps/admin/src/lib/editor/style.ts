/**
 * Colores de los polígonos en el editor.
 *
 * Réplica exacta de `apps/viewer/src/polygons.ts`. Es intencional que sea la
 * misma fórmula sobre los mismos `STATUS_TOKENS`: si el editor pintara con su
 * propia paleta, el operador elegiría opacidades que en el visor se ven
 * distintas, y "quedó bien en el editor" dejaría de significar nada.
 *
 * El único agregado es el resalte de selección, que existe sólo mientras se
 * edita y no viaja al `tour.json`.
 */
import { STATUS_TOKENS, type UnitStatus } from '@r360/core';

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return `rgba(100,116,139,${alpha})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export interface PolyStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
}

/**
 * `unassigned` es el estado visual de un polígono sin unidad. No es un
 * `UnitStatus` (no existe tal cosa en el contrato comercial): es una alerta del
 * editor para que un polígono huérfano no se confunda con uno "no disponible" y
 * se publique así.
 */
export type PolyStatus = UnitStatus | 'unassigned';

const UNASSIGNED = { base: '#E11D9B', fill: 0.22 };

export function polyStyle(status: PolyStatus, opts: { selected?: boolean } = {}): PolyStyle {
  const token = status === 'unassigned' ? UNASSIGNED : STATUS_TOKENS[status];
  const fill = opts.selected ? Math.min(1, token.fill + 0.22) : token.fill;
  return {
    fill: hexToRgba(token.base, fill),
    stroke: opts.selected ? '#FFD166' : token.base,
    strokeWidth: opts.selected ? 3 : 2,
  };
}

export function svgStyleFor(status: PolyStatus, opts: { selected?: boolean } = {}): Record<string, string> {
  const s = polyStyle(status, opts);
  return {
    fill: s.fill,
    stroke: s.stroke,
    'stroke-width': String(s.strokeWidth),
    'stroke-linejoin': 'round',
    'vector-effect': 'non-scaling-stroke',
  };
}
