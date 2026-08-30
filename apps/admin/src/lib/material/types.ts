/**
 * Filas del backend de material requerido, ya normalizadas a camelCase.
 * Espejan `supabase/migrations/0016_material.sql`.
 */

/**
 * Estado de un ítem en un proyecto.
 *
 *   pendiente  — todavía no se lo pedimos, o no hubo respuesta
 *   solicitado — se lo pedimos al cliente y estamos esperando
 *   recibido   — llegó algo, falta que lo revisemos
 *   aprobado   — revisado y sirve: sólo esto cuenta como "lo tenemos"
 *   no_aplica  — decidimos que este proyecto no lo necesita
 *
 * `no_aplica` es una decisión del operador, distinta de que el catálogo no le
 * pida el ítem a ese tipo de proyecto: sirve para cerrar un obligatorio que en
 * este caso puntual no corresponde, sin que quede bloqueando el checklist.
 */
export type MaterialStatus = 'pendiente' | 'solicitado' | 'recibido' | 'aprobado' | 'no_aplica';

export const MATERIAL_STATUSES: readonly MaterialStatus[] = [
  'pendiente',
  'solicitado',
  'recibido',
  'aprobado',
  'no_aplica',
];

export function isMaterialStatus(v: unknown): v is MaterialStatus {
  return typeof v === 'string' && (MATERIAL_STATUSES as readonly string[]).includes(v);
}

/** Estado guardado de un ítem. Los ítems sin fila se asumen `pendiente`. */
export interface MaterialStateRow {
  itemId: string;
  status: MaterialStatus;
  notes: string | null;
  updatedAt: string;
  updatedByEmail: string | null;
}

export type MaterialUploadVia = 'panel' | 'link';

export interface MaterialFileRow {
  id: string;
  itemId: string;
  storagePath: string;
  filename: string;
  sizeBytes: number;
  mime: string;
  uploadedVia: MaterialUploadVia;
  /** null cuando lo subió el cliente por el link público, que no tiene cuenta. */
  uploadedByEmail: string | null;
  createdAt: string;
}

export interface MaterialShareLinkRow {
  id: string;
  token: string;
  label: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface MaterialPatch {
  status?: MaterialStatus;
  notes?: string | null;
}

/** Resumen para el checklist de salud del proyecto. */
export interface MaterialSummary {
  /** Ítems del catálogo que aplican a este tipo de proyecto. */
  total: number;
  obligatorios: number;
  /** Obligatorios sin resolver (ni aprobado ni no_aplica). */
  obligatoriosFaltantes: number;
  /** Ids de esos obligatorios faltantes, en orden de catálogo. */
  faltantes: string[];
  recibidosSinAprobar: number;
  archivos: number;
  /** 0..1 sobre los ítems que aplican, contando resueltos. */
  progreso: number;
}
