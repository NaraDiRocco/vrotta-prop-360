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
 * Margen sobre `MAX_FILE_BYTES` para el chequeo de `Content-Length`: ese
 * header mide el request ENTERO (boundary + headers del multipart + el
 * archivo), no sólo los bytes del archivo. Acá sólo viaja un campo (`file`),
 * así que el overhead real es de un puñado de bytes; 64 KiB deja margen de
 * sobra sin abrir una rendija útil para colar un archivo más grande
 * escondiendo bytes en el resto del multipart.
 */
const CONTENT_LENGTH_OVERHEAD_BYTES = 64 * 1024;

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
  // El chequeo de tamaño va ACÁ, antes de `request.formData()`, y no después:
  // `formData()` lee el body entero a memoria para poder parsearlo (retiene
  // más o menos el doble del tamaño del archivo mientras dura la request), así
  // que para cuando `blob.size` está disponible más abajo el daño de RAM ya
  // está hecho. Vía `link` este endpoint es público (sin sesión, ver el
  // route handler de `/api/material/[token]/files`), así que cualquiera con
  // el link podía mandar subidas grandes y concurrentes para agotar la
  // memoria del proceso antes de que hubiera una sola chance de rechazarlas.
  // `Content-Length` es la única señal que el servidor tiene ANTES de tocar
  // el body. No es infalible — el cliente puede omitirlo, o mentir con
  // `Transfer-Encoding: chunked` sin Content-Length — así que esto es la
  // PRIMERA línea de defensa, no la única: el chequeo contra los bytes reales
  // de más abajo (que sí puede confiar en lo que llegó) se mantiene igual que
  // antes.
  const declaredLengthHeader = request.headers.get('content-length');
  const declaredLength = declaredLengthHeader === null ? null : Number(declaredLengthHeader);
  if (declaredLength !== null && Number.isFinite(declaredLength) && declaredLength > MAX_FILE_BYTES + CONTENT_LENGTH_OVERHEAD_BYTES) {
    return { ok: false, rejection: { error: 'El archivo supera el máximo permitido', field: 'size' } };
  }

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
