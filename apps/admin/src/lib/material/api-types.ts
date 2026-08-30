/** Contratos de las rutas de material. Los comparten el route handler y la UI. */
import type { MaterialItem } from './catalog.ts';
import type { PublicMaterialItem } from './share.ts';
import type {
  MaterialFileRow,
  MaterialShareLinkRow,
  MaterialStatus,
  MaterialSummary,
} from './types.ts';
import type { ShareLinkState } from './share.ts';
import type { ProjectKind } from '@r360/core';

/* ── Panel ──────────────────────────────────────────────────────────────── */

export interface MaterialEntryDto {
  item: MaterialItem;
  status: MaterialStatus;
  notes: string | null;
  updatedAt: string | null;
  files: MaterialFileRow[];
}

export interface MaterialResponse {
  projectKind: ProjectKind;
  entries: MaterialEntryDto[];
  summary: MaterialSummary;
}

export interface MaterialPatchRequest {
  status?: MaterialStatus;
  notes?: string | null;
}

export interface ShareLinkDto extends MaterialShareLinkRow {
  estado: ShareLinkState;
  /** Ruta relativa que se le manda al cliente. El host lo pone quien comparte. */
  path: string;
}

export interface CreateShareLinkRequest {
  label?: string | null;
  /** Días de vida. Omitido = 30. `null` = no vence. */
  ttlDays?: number | null;
}

/* ── Link público ───────────────────────────────────────────────────────── */

/**
 * Lo que ve quien tiene el link. Sin tenant, sin precios, sin proveedores, sin
 * quién subió qué. Ver el encabezado de `share.ts`.
 */
export interface PublicMaterialFile {
  id: string;
  itemId: string;
  filename: string;
  sizeBytes: number;
  createdAt: string;
  /** URL firmada de vida corta, o null en modo mock. */
  url: string | null;
}

export interface PublicMaterialEntry {
  item: PublicMaterialItem;
  status: MaterialStatus;
  files: PublicMaterialFile[];
}

export interface PublicMaterialResponse {
  projectName: string;
  entries: PublicMaterialEntry[];
  /** Cuántos obligatorios faltan, para el encabezado "te faltan N cosas". */
  obligatoriosFaltantes: number;
  maxFileBytes: number;
}
