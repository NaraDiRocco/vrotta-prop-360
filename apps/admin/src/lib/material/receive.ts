/**
 * Recepción de un archivo: leer el multipart, validar y dejar los bytes en el
 * storage. La comparten la subida del panel y la del link público, porque las
 * dos tienen que validar exactamente lo mismo — el link es una URL que
 * cualquiera puede llamar con curl, así que la validación del navegador no
 * cuenta para nada.
 */
import { putMaterialObject } from './storage.ts';
import { MAX_FILE_BYTES, sanitizeFilename, storagePathFor, validateUpload, type UploadRejection } from './uploads.ts';

export interface ReceivedFile {
  itemId: string;
  storagePath: string;
  filename: string;
  sizeBytes: number;
  mime: string;
}

export type ReceiveResult = { ok: true; file: ReceivedFile } | { ok: false; rejection: UploadRejection };

/**
 * @param projectId sólo se usa para armar la ruta del storage; nunca sale del
 *        servidor ni se toma del cuerpo de la request.
 */
export async function receiveUpload(
  request: Request,
  projectId: string,
  itemId: string,
  via: 'panel' | 'link',
): Promise<ReceiveResult> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { ok: false, rejection: { error: 'Se esperaba un envío multipart con el campo "file"', field: 'file' } };
  }

  const entry = form.get('file');
  if (entry === null || typeof entry === 'string') {
    return { ok: false, rejection: { error: 'Falta el archivo', field: 'file' } };
  }
  const blob = entry as File;
  const filename = sanitizeFilename(blob.name || 'archivo');
  const mime = blob.type === '' ? 'application/octet-stream' : blob.type;

  const rejection = validateUpload({ itemId, filename, sizeBytes: blob.size, mime });
  if (rejection) return { ok: false, rejection };

  const bytes = await blob.arrayBuffer();
  // Doble control: `blob.size` puede mentir; los bytes reales no.
  if (bytes.byteLength > MAX_FILE_BYTES) {
    return { ok: false, rejection: { error: 'El archivo supera el máximo permitido', field: 'size' } };
  }

  const storagePath = storagePathFor(projectId, itemId, filename);
  await putMaterialObject(storagePath, bytes, mime, via);
  return { ok: true, file: { itemId, storagePath, filename, sizeBytes: bytes.byteLength, mime } };
}
