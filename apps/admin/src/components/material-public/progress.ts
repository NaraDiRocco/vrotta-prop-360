/**
 * Cálculo de progreso para el encabezado de `/m/[token]`. Puro, sin DOM —
 * para poder mostrarle al cliente un número simple ("faltan 3 obligatorios")
 * sin que tenga que interpretar una tabla de estados.
 */
import type { MaterialItemState } from './types.ts';

/** Un ítem "cuenta como resuelto" si ya llegó material, está aprobado, o el cliente avisó que no lo tiene. */
export function isResolved(state: MaterialItemState): boolean {
  return state.estado === 'recibido' || state.estado === 'aprobado' || state.estado === 'no_aplica';
}

export interface MaterialProgress {
  total: number;
  resueltos: number;
  obligatoriosTotal: number;
  obligatoriosResueltos: number;
  obligatoriosPendientes: MaterialItemState[];
  /** 0..1 — sobre el total de ítems, no solo obligatorios (para la barra general). */
  ratio: number;
  /** true cuando ya no hay ningún obligatorio bloqueando. */
  listoParaArrancar: boolean;
}

export function computeProgress(items: MaterialItemState[]): MaterialProgress {
  const total = items.length;
  const resueltos = items.filter(isResolved).length;
  const obligatorios = items.filter((s) => s.item.requisito === 'obligatorio');
  const obligatoriosPendientes = obligatorios.filter((s) => !isResolved(s));
  return {
    total,
    resueltos,
    obligatoriosTotal: obligatorios.length,
    obligatoriosResueltos: obligatorios.length - obligatoriosPendientes.length,
    obligatoriosPendientes,
    ratio: total === 0 ? 1 : resueltos / total,
    listoParaArrancar: obligatoriosPendientes.length === 0,
  };
}
