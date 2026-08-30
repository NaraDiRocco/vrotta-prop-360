/**
 * Reglas de subida: qué archivo se acepta, cómo se lo nombra y dónde se guarda.
 *
 * Se aplican igual venga del panel o del link público. La validación del
 * navegador es cortesía; la que cuenta es la del route handler, porque el link
 * público es una URL que cualquiera puede llamar con curl.
 */
import { materialItem } from './catalog.ts';

/** 200 MB. Una panorámica de 12288×6144 en PNG 16-bit entra holgada. */
export const MAX_FILE_BYTES = 200 * 1024 * 1024;

/**
 * Extensiones aceptadas cuando el ítem no declara una lista propia.
 * Deliberadamente sin ejecutables ni scripts: nada de .html, .svg salvo que el
 * ítem lo pida (el logo), .js, .exe, .sh.
 */
const FALLBACK_EXTENSIONS: readonly string[] = [
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.tif',
  '.tiff',
  '.webp',
  '.zip',
  '.csv',
  '.xlsx',
  '.txt',
];

export interface UploadCandidate {
  itemId: string;
  filename: string;
  sizeBytes: number;
  mime: string;
}

export interface UploadRejection {
  error: string;
  field: 'itemId' | 'file' | 'filename' | 'size';
}

export function extensionOf(filename: string): string {
  const base = filename.slice(filename.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot).toLowerCase();
}

/**
 * Nombre seguro para guardar y mostrar: se queda con el último segmento (mata
 * cualquier `../` o ruta absoluta), reemplaza todo lo que no sea alfanumérico,
 * punto, guion o guion bajo, y corta a 120 caracteres.
 */
export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[.\-]+/, '')
    .slice(0, 120);
  return cleaned === '' ? 'archivo' : cleaned;
}

/**
 * Ruta dentro del bucket. Se deriva SIEMPRE de ids del servidor
 * (project/item + un uuid nuevo); el nombre que manda el cliente sólo se
 * guarda como metadato para mostrarlo. Así, aunque el saneo fallara, no hay
 * forma de escribir fuera de la carpeta del proyecto.
 */
export function storagePathFor(projectId: string, itemId: string, filename: string): string {
  const ext = extensionOf(sanitizeFilename(filename));
  return `${projectId}/${itemId}/${crypto.randomUUID()}${ext}`;
}

/** null si el archivo se acepta; el motivo del rechazo si no. */
export function validateUpload(candidate: UploadCandidate): UploadRejection | null {
  const item = materialItem(candidate.itemId);
  if (!item) return { error: 'Ítem de material desconocido', field: 'itemId' };
  if (!item.aceptaArchivos) {
    return { error: `"${item.nombre}" son datos, no archivos: se cargan desde el panel`, field: 'itemId' };
  }
  if (!Number.isFinite(candidate.sizeBytes) || candidate.sizeBytes <= 0) {
    return { error: 'Archivo vacío', field: 'file' };
  }
  if (candidate.sizeBytes > MAX_FILE_BYTES) {
    return { error: `El archivo supera el máximo de ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB`, field: 'size' };
  }
  const ext = extensionOf(candidate.filename);
  if (ext === '') return { error: 'El archivo no tiene extensión', field: 'filename' };
  const allowed = item.extensiones ?? FALLBACK_EXTENSIONS;
  if (!allowed.includes(ext)) {
    return { error: `Formato ${ext} no aceptado para este ítem. Esperamos: ${allowed.join(', ')}`, field: 'filename' };
  }
  return null;
}
