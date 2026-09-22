import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { access, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFsStorage } from '../src/lib/storage-fs.ts';

async function readBody(body: ReadableStream): Promise<string> {
  return new Response(body).text();
}

describe('createFsStorage', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'r360-storage-fs-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('get devuelve null si la key no existe', async () => {
    const storage = createFsStorage(root);
    expect(await storage.get('t/tenant/project/v1/tour.json')).toBeNull();
  });

  it('escribe y lee un objeto redondo, preservando el contentType', async () => {
    const storage = createFsStorage(root);
    const key = 't/tenant/project/v1/tour.json';
    await storage.put(key, JSON.stringify({ hello: 'mundo' }), {
      httpMetadata: { contentType: 'application/json', cacheControl: 'public, max-age=60' },
    });

    const obj = await storage.get(key);
    expect(obj).not.toBeNull();
    expect(obj?.httpMetadata?.contentType).toBe('application/json');
    expect(JSON.parse(await readBody(obj!.body))).toEqual({ hello: 'mundo' });
  });

  it('put crea los directorios intermedios que hagan falta (igual que una key jerárquica de R2)', async () => {
    const storage = createFsStorage(root);
    await storage.put('t/tenant/project/v3/tiles/0/0/0.jpg', 'binario-simulado');
    const obj = await storage.get('t/tenant/project/v3/tiles/0/0/0.jpg');
    expect(obj).not.toBeNull();
    expect(await readBody(obj!.body)).toBe('binario-simulado');
  });

  it('un put sin contentType no deja vivo el contentType de una escritura anterior con la misma key', async () => {
    const storage = createFsStorage(root);
    await storage.put('k', 'v1', { httpMetadata: { contentType: 'text/plain' } });
    await storage.put('k', 'v2');
    const obj = await storage.get('k');
    expect(obj?.httpMetadata?.contentType).toBeUndefined();
    expect(await readBody(obj!.body)).toBe('v2');
  });

  it('head devuelve null si no existe, y un objeto truthy con el tamaño si existe', async () => {
    const storage = createFsStorage(root);
    expect(await storage.head('missing')).toBeNull();

    await storage.put('present', 'contenido');
    const head = await storage.head('present');
    expect(head).not.toBeNull();
    expect(head?.key).toBe('present');
    expect(head?.size).toBe(Buffer.byteLength('contenido'));
  });

  it('la escritura es atómica: no quedan archivos temporales sueltos después de un put', async () => {
    const storage = createFsStorage(root);
    await storage.put('t/tenant/project/v1/tour.json', 'contenido', {
      httpMetadata: { contentType: 'application/json' },
    });
    const entries = await readdir(path.join(root, 't/tenant/project/v1'));
    expect(entries.every((name) => !name.includes('.tmp-'))).toBe(true);
  });

  describe('seguridad: keys que intentan escapar del directorio raíz', () => {
    it('rechaza una key con ".." que sube fuera de root, en get/put/head', async () => {
      const storage = createFsStorage(root);
      await expect(storage.get('../../etc/passwd')).rejects.toThrow();
      await expect(storage.put('../../etc/passwd', 'pwned')).rejects.toThrow();
      await expect(storage.head('../../etc/passwd')).rejects.toThrow();
    });

    it('rechaza una key absoluta', async () => {
      const storage = createFsStorage(root);
      await expect(storage.put('/etc/passwd', 'pwned')).rejects.toThrow();
    });

    it('rechaza una key vacía', async () => {
      const storage = createFsStorage(root);
      await expect(storage.get('')).rejects.toThrow();
    });

    it('un intento de escape con ".." efectivamente no escribe nada fuera de root', async () => {
      const storage = createFsStorage(root);
      const outsideMarker = path.join(path.dirname(root), 'no-deberia-existir.txt');
      await rm(outsideMarker, { force: true });

      await expect(storage.put('../no-deberia-existir.txt', 'pwned')).rejects.toThrow();
      await expect(access(outsideMarker)).rejects.toThrow();
    });
  });
});
