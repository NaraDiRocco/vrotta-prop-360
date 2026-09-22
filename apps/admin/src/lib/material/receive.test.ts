import { describe, expect, it } from 'vitest';
import { receiveUpload } from './receive.ts';
import { MAX_FILE_BYTES } from './uploads.ts';

/**
 * Objeto mínimo con la forma que `receiveUpload` necesita de un `Request`:
 * `headers.get()` y `formData()`. Se castea a `Request` porque no hace falta
 * un `Request` de verdad — de hecho, para el primer test, el punto es
 * demostrar que `formData()` NUNCA se llama.
 */
function fakeRequest(opts: { contentLength?: string | null; formData?: () => Promise<FormData> }): Request {
  const headers = new Headers();
  if (opts.contentLength !== null && opts.contentLength !== undefined) {
    headers.set('content-length', opts.contentLength);
  }
  return {
    headers,
    formData: opts.formData ?? (async () => new FormData()),
  } as unknown as Request;
}

/**
 * El caso que encontró la auditoría: `receiveUpload` bufferea el multipart
 * entero (`request.formData()`) ANTES de poder mirar el tamaño declarado, lo
 * que deja a cualquiera con el link público mandar subidas grandes y
 * concurrentes para agotar la RAM del proceso. El fix corta por
 * `Content-Length` antes de tocar el body; estos tests prueban exactamente
 * ese orden, no sólo el resultado.
 */
describe('receiveUpload — Content-Length antes de bufferear', () => {
  it('rechaza sin llamar a formData() cuando Content-Length supera el máximo', async () => {
    const request = fakeRequest({
      contentLength: String(MAX_FILE_BYTES + 10 * 1024 * 1024), // 10 MB por encima, bien afuera del margen de overhead
      formData: async () => {
        throw new Error('no debería leer el body: el chequeo de Content-Length tiene que cortar antes');
      },
    });

    const result = await receiveUpload(request, 'proj-1', 'plano-masterplan', 'link');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.field).toBe('size');
  });

  it('dentro del margen de overhead del multipart, sigue de largo y llega a leer el body', async () => {
    let calledFormData = false;
    const request = fakeRequest({
      contentLength: String(MAX_FILE_BYTES + 1024), // adentro del margen de 64 KiB
      formData: async () => {
        calledFormData = true;
        return new FormData();
      },
    });

    await receiveUpload(request, 'proj-1', 'plano-masterplan', 'link');
    expect(calledFormData).toBe(true);
  });

  it('sin Content-Length no hay señal para prerrechazar, así que sigue al parseo del multipart', async () => {
    let calledFormData = false;
    const request = fakeRequest({
      contentLength: null,
      formData: async () => {
        calledFormData = true;
        return new FormData();
      },
    });

    await receiveUpload(request, 'proj-1', 'plano-masterplan', 'link');
    expect(calledFormData).toBe(true);
  });
});
