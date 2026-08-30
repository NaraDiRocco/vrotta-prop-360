/**
 * Contrato de la pantalla de Material.
 *
 * Este archivo espeja el tipo que va a exponer `lib/material/**` (lo
 * construye otro agente en paralelo). Mientras esa librería y sus rutas
 * `/api/p/[project]/material` no existan, esta pantalla trabaja contra el
 * catálogo y el estado de ejemplo de `./catalog.ts` y `./mock-state.ts`.
 *
 * Punto de conexión futuro (ver `material-screen.tsx`):
 *   GET   /api/p/[project]/material            → { items: MaterialItem[]; state: MaterialItemState[]; links: MaterialShareLink[] }
 *   PATCH /api/p/[project]/material/[itemId]    → { status?: MaterialStatus }
 *   POST  /api/p/[project]/material/[itemId]/files    (subida)
 *   DELETE /api/p/[project]/material/[itemId]/files/[fileId]
 *   POST  /api/p/[project]/material/links       (crear link compartible)
 *   DELETE /api/p/[project]/material/links/[linkId] (revocar)
 * Cuando esas rutas existan, sólo hay que reemplazar los `queryFn`/`mutationFn`
 * de `material-screen.tsx` — la forma de los datos ya es la definitiva.
 */
import type { ProjectKind } from '@/lib/data/types.ts';

export type MaterialRequirement = 'obligatorio' | 'recomendado' | 'opcional';
export type MaterialStatus = 'pendiente' | 'solicitado' | 'recibido' | 'aprobado' | 'no_aplica';

export interface MaterialItem {
  id: string;
  categoria: string;
  nombre: string;
  queEs: string;
  paraQue: string;
  formato: string;
  requisito: MaterialRequirement;
  siNoLoTienen: string;
  quienLoHace?: string;
  comoSeHace?: string;
  dondeContratarlo?: string;
  precioReferencia?: string;
  aplicaA: ProjectKind[];
  aceptaArchivos: boolean;
  extensiones?: string[];
}

/** Un archivo ya subido para un ítem de material. */
export interface MaterialFile {
  id: string;
  itemId: string;
  name: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedByEmail: string;
}

/** Parte mutable de un ítem: lo que cambia con la producción, no con el catálogo. */
export interface MaterialItemState {
  itemId: string;
  status: MaterialStatus;
  files: MaterialFile[];
}

/** Link compartible para que el cliente suba material sin acceso al panel. */
export interface MaterialShareLink {
  id: string;
  token: string;
  createdAt: string;
  createdByEmail: string;
  revoked: boolean;
}

export const STATUS_LABEL: Record<MaterialStatus, string> = {
  pendiente: 'Pendiente',
  solicitado: 'Solicitado',
  recibido: 'Recibido',
  aprobado: 'Aprobado',
  no_aplica: 'No aplica',
};

export const REQUIREMENT_LABEL: Record<MaterialRequirement, string> = {
  obligatorio: 'Obligatorio',
  recomendado: 'Recomendado',
  opcional: 'Opcional',
};

/** ¿Este estado cuenta como "resuelto" para el progreso de obligatorios? */
export function isResolved(status: MaterialStatus): boolean {
  return status === 'recibido' || status === 'aprobado' || status === 'no_aplica';
}
