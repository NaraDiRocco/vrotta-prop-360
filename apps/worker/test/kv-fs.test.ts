import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFsKv } from '../src/lib/kv-fs.ts';

describe('createFsKv', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'r360-kv-fs-'));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(root, { recursive: true, force: true });
  });

  it('get devuelve null para una key que no existe', async () => {
    const kv = createFsKv(root);
    expect(await kv.get('ptr:tenant:project')).toBeNull();
    expect(await kv.get('ptr:tenant:project', { type: 'json' })).toBeNull();
  });

  it('guarda y lee un valor de texto plano, sin opts (como lo usa rate-limit.ts)', async () => {
    const kv = createFsKv(root);
    await kv.put('rl:leads:ip:1.2.3.4:0', '3');
    expect(await kv.get('rl:leads:ip:1.2.3.4:0')).toBe('3');
  });

  it('guarda y lee JSON con { type: "json" } (como lo usa pointer.ts)', async () => {
    const kv = createFsKv(root);
    const pointer = { version: 4, history: [1, 2, 3] };
    await kv.put('ptr:tenant:project', JSON.stringify(pointer));
    expect(await kv.get('ptr:tenant:project', { type: 'json' })).toEqual(pointer);
  });

  it('claves con ":" no chocan entre sí ni rompen el nombre de archivo', async () => {
    const kv = createFsKv(root);
    await kv.put('ptr:tenant-a:proyecto', 'A');
    await kv.put('ptr:tenant-b:proyecto', 'B');
    expect(await kv.get('ptr:tenant-a:proyecto')).toBe('A');
    expect(await kv.get('ptr:tenant-b:proyecto')).toBe('B');
  });

  it('get con type "json" sobre un valor que no parsea devuelve null en vez de explotar', async () => {
    const kv = createFsKv(root);
    await kv.put('config:rota', 'esto no es JSON');
    expect(await kv.get('config:rota', { type: 'json' })).toBeNull();
  });

  it('un archivo de clave corrupto en disco se trata como ausente, no rompe el request', async () => {
    const kv = createFsKv(root);
    await kv.put('ptr:tenant:project', JSON.stringify({ version: 1, history: [] }));

    const files = await readdir(root);
    expect(files).toHaveLength(1);
    const [file] = files;
    if (!file) throw new Error('esperaba un archivo de KV en disco');
    await writeFile(path.join(root, file), '{ esto no es json valido', 'utf8');

    expect(await kv.get('ptr:tenant:project', { type: 'json' })).toBeNull();
  });

  it('una clave sin expirationTtl nunca vence', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const kv = createFsKv(root);
    await kv.put('tenant:acme', JSON.stringify({ active: true, allowedAncestors: [] }));

    vi.setSystemTime(1000 * 60 * 60 * 24 * 365 * 10); // 10 años después
    expect(await kv.get('tenant:acme', { type: 'json' })).toEqual({ active: true, allowedAncestors: [] });
  });

  it('expirationTtl hace que la clave expire sola pasado ese tiempo, igual que el KV real', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const kv = createFsKv(root);
    await kv.put('rl:leads:ip:9.9.9.9:1', '1', { expirationTtl: 10 });

    vi.setSystemTime(1_000_000 + 5_000); // +5s: todavía dentro de la ventana
    expect(await kv.get('rl:leads:ip:9.9.9.9:1')).toBe('1');

    vi.setSystemTime(1_000_000 + 11_000); // +11s: venció
    expect(await kv.get('rl:leads:ip:9.9.9.9:1')).toBeNull();
  });

  it('la escritura es atómica: no quedan archivos temporales sueltos después de un put', async () => {
    const kv = createFsKv(root);
    await kv.put('ptr:tenant:project', JSON.stringify({ version: 1, history: [] }));
    const entries = await readdir(root);
    expect(entries.every((name) => !name.includes('.tmp-'))).toBe(true);
  });
});
