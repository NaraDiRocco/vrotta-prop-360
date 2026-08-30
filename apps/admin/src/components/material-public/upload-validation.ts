/**
 * Validación de subida de material — corre en el cliente antes de mandar un
 * byte. A diferencia de `lib/scenes/upload-validation.ts` (que valida un
 * único tipo de archivo con reglas de dimensión/aspecto muy estrictas), acá
 * cada ítem trae su propia lista de extensiones aceptadas (`MaterialItem.extensiones`)
 * porque el material de un cliente no técnico puede llegar en formatos muy
 * distintos (DWG, AI, PDF, XLSX, JPG...). Es deliberadamente más simple:
 * extensión + peso, nada de leer contenido del archivo.
 */
import type { MaterialItem } from './types.ts';
import { MAX_FILE_BYTES } from '../../lib/material/uploads.ts';

/**
 * El límite lo fija el SERVIDOR (`lib/material/uploads.ts`) y acá se reexporta.
 * Antes esta constante era un valor propio de 300 MB mientras el servidor
 * rechazaba a los 200: un archivo de 250 MB pasaba la validación del cliente,
 * mostraba barra de progreso, y recién al final volvía rechazado. Duplicar un
 * límite es garantizar que en algún momento diverjan.
 */
export const MAX_MATERIAL_UPLOAD_BYTES = MAX_FILE_BYTES;

export interface MaterialUploadIssue {
  code: 'extension' | 'tamano' | 'vacio';
  message: string;
}

export interface MaterialUploadValidation {
  ok: boolean;
  issues: MaterialUploadIssue[];
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot < 0 || dot === filename.length - 1) return '';
  return filename.slice(dot + 1).toLowerCase();
}

export function fmtMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function validateMaterialUpload(
  item: Pick<MaterialItem, 'extensiones'>,
  file: { name: string; size: number },
  maxBytes: number = MAX_MATERIAL_UPLOAD_BYTES,
): MaterialUploadValidation {
  const issues: MaterialUploadIssue[] = [];

  if (file.size <= 0) {
    issues.push({ code: 'vacio', message: 'El archivo está vacío.' });
  } else if (file.size > maxBytes) {
    issues.push({
      code: 'tamano',
      message: `Pesa demasiado (${fmtMB(file.size)}). El máximo por archivo es ${fmtMB(maxBytes)} — si es más grande, avisale al operador para coordinar otra vía.`,
    });
  }

  const allowed = item.extensiones;
  if (allowed && allowed.length > 0) {
    const ext = extensionOf(file.name);
    const normalized = allowed.map((e) => e.toLowerCase().replace(/^\./, ''));
    if (!ext || !normalized.includes(ext)) {
      issues.push({
        code: 'extension',
        message: `Ese formato no lo esperábamos para este material. Aceptamos: ${normalized.map((e) => `.${e}`).join(', ')}.`,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}
