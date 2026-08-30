/**
 * Contrato de la vista pública de material (`/m/[token]`).
 *
 * `MaterialItem` es el tipo acordado con el agente que construye
 * `lib/material/**` y las rutas API — cuando ese trabajo se publique, este
 * archivo se reemplaza por el import real (`import type { MaterialItem } from
 * '@/lib/material/types.ts'`) y el resto de estos tipos locales (los de
 * runtime/token) probablemente migran junto con él. Hasta entonces vive acá
 * para que esta ruta compile y se pueda ejercitar con datos de ejemplo.
 */
import type { ProjectKind } from '@r360/core';

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

/* ── Tipos propios de esta vista (runtime del token, no del contrato) ──── */

/** Un archivo ya subido para un ítem. Nunca expone paths internos de storage. */
export interface MaterialUploadedFile {
  id: string;
  nombre: string;
  pesoBytes: number;
  subidoEl: string; // ISO 8601
}

/** Estado de un ítem para el proyecto concreto que resolvió el token. */
export interface MaterialItemState {
  item: MaterialItem;
  estado: MaterialStatus;
  archivos: MaterialUploadedFile[];
  comentario: string | null;
  /** El cliente marcó explícitamente "no lo tengo" — es información, no un vacío. */
  marcadoSinMaterial: boolean;
}

/** Lo mínimo para orientar al cliente — nada comercial, nada de otros tenants. */
export interface MaterialProjectSummary {
  nombre: string;
  kind: ProjectKind;
}

/** A quién escribirle cuando el link no sirve. Sin datos internos del operador. */
export interface MaterialContact {
  nombre: string;
  medio: 'whatsapp' | 'email';
  valor: string;
}

export type MaterialTokenResolution =
  | { status: 'ok'; proyecto: MaterialProjectSummary; items: MaterialItemState[] }
  | { status: 'invalido' }
  | { status: 'vencido'; contacto: MaterialContact | null }
  | { status: 'revocado'; contacto: MaterialContact | null };
