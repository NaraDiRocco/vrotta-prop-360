/**
 * Validación de subida de escenas — corre en el cliente ANTES de subir un
 * byte. `validateSceneUpload` es pura (recibe metadata ya extraída del
 * archivo, nunca el `File` en sí) para poder testearla sin DOM; el helper
 * `readImageDimensions` (abajo) es el único punto que toca el navegador.
 *
 * Motivos de rechazo, con el detalle concreto en el mensaje — nunca un
 * genérico "archivo inválido":
 *   - formato no soportado
 *   - relación de aspecto (2:1 exacto para panoramas equirectangulares)
 *   - resolución insuficiente
 *   - tamaño de archivo por encima del límite
 */
import type { SceneKind } from '@r360/core';
import type { UploadValidationIssue, UploadValidationResult } from '../data/types.ts';

export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024; // 200MB

export const MIN_PANORAMA_WIDTH = 4096;
export const MIN_FLOORPLAN_WIDTH = 1024;
export const MIN_MAP_WIDTH = 512;

/** Tolerancia relativa a la relación 2:1 exacta antes de rechazar. */
const ASPECT_TOLERANCE = 0.01;

const ALLOWED_MIME: Record<SceneKind, readonly string[]> = {
  panorama: ['image/jpeg', 'image/png', 'image/webp'],
  floorplan: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
  map: ['image/jpeg', 'image/png', 'image/webp'],
  video: ['video/mp4', 'video/webm'],
};

export interface SceneUploadInput {
  kind: SceneKind;
  file: { name: string; size: number; type: string };
  /** Dimensiones ya decodificadas. Ausente para video (no se valida por dimensión acá). */
  dimensions?: { width: number; height: number };
}

function formatRatio(width: number, height: number): string {
  if (height === 0) return `${width}:0`;
  // Reduce a la fracción más simple con GCD para mostrar algo legible (16:9, 4:3, etc).
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(Math.round(width), Math.round(height)) || 1;
  return `${Math.round(width / g)}:${Math.round(height / g)}`;
}

export function validateSceneUpload(input: SceneUploadInput): UploadValidationResult {
  const issues: UploadValidationIssue[] = [];
  const { kind, file, dimensions } = input;

  const allowed = ALLOWED_MIME[kind];
  if (!allowed.includes(file.type)) {
    issues.push({
      code: 'formato',
      message: `Formato no soportado (${file.type || 'desconocido'}). Formatos aceptados para ${kindLabel(kind)}: ${allowed.join(', ')}.`,
    });
  }

  if (file.size <= 0) {
    issues.push({ code: 'tamano', message: 'El archivo está vacío.' });
  } else if (file.size > MAX_UPLOAD_BYTES) {
    issues.push({
      code: 'tamano',
      message: `Tamaño excesivo (${fmtMB(file.size)}, máximo ${fmtMB(MAX_UPLOAD_BYTES)}).`,
    });
  }

  if (kind !== 'video') {
    if (!dimensions) {
      issues.push({ code: 'dimensiones', message: 'No se pudieron leer las dimensiones del archivo.' });
    } else {
      const { width, height } = dimensions;
      if (width <= 0 || height <= 0) {
        issues.push({ code: 'dimensiones', message: 'Dimensiones inválidas.' });
      } else {
        if (kind === 'panorama') {
          const ratio = width / height;
          if (Math.abs(ratio - 2) > ASPECT_TOLERANCE) {
            issues.push({
              code: 'aspecto',
              message: `No es equirectangular (relación detectada ${formatRatio(width, height)}, se requiere 2:1 exacto).`,
            });
          }
          if (width < MIN_PANORAMA_WIDTH) {
            issues.push({
              code: 'resolucion',
              message: `Resolución insuficiente (${width}px, mínimo ${MIN_PANORAMA_WIDTH}).`,
            });
          }
        } else {
          const minWidth = kind === 'floorplan' ? MIN_FLOORPLAN_WIDTH : MIN_MAP_WIDTH;
          if (width < minWidth) {
            issues.push({
              code: 'resolucion',
              message: `Resolución insuficiente (${width}px, mínimo ${minWidth}).`,
            });
          }
        }
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

function kindLabel(kind: SceneKind): string {
  switch (kind) {
    case 'panorama':
      return 'panoramas';
    case 'floorplan':
      return 'planos';
    case 'map':
      return 'mapas';
    case 'video':
      return 'videos';
  }
}

function fmtMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** Único punto que toca el navegador: decodifica un archivo de imagen para leer sus dimensiones. */
export async function readImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      const dims = { width: bitmap.width, height: bitmap.height };
      bitmap.close?.();
      return dims;
    } catch {
      return null;
    }
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
