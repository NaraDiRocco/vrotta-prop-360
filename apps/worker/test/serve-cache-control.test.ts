import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { createFsKv } from '../src/lib/kv-fs.ts';
import { createFsStorage } from '../src/lib/storage-fs.ts';
import { serve } from '../src/routes/serve.ts';
import type { Env } from '../src/env.ts';

/**
 * `Cache-Control` del passthrough genérico de `serveProject` (routes/serve.ts,
 * rama final: cualquier sufijo que no sea el shell ni `tour.json`).
 *
 * Sólo lo que Vite emite bajo `assets/` con hash de contenido en el nombre
 * (`build.assetsDir` por default, ver apps/viewer/vite.config.ts) puede
 * marcarse `immutable` por un año: la URL cambia si el contenido cambia.
 * Todo lo demás que cae en ese mismo passthrough — en particular lo que
 * Vite copia tal cual desde `apps/viewer/public/` (`marca/dacal-blanco.png`,
 * `marca/caetano-blanco.png`, `marca/baleia-logo-blanco.svg`, ver
 * welcome.ts/tour-rail.ts/main.ts) — se sirve en un path SIN hash y SIN
 * versión: si ese archivo cambia (se optimiza, se corrige un Content-Type
 * mal seteado), `immutable` deja a cualquier visitante que ya lo haya
 * cacheado sin forma de enterarse durante un año. Ver el comentario en
 * routes/serve.ts para el caso real que motivó este test.
 */

function buildApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/', serve);
  return app;
}

let kvRoot: string;
let storageRoot: string;
let env: Env;

beforeEach(async () => {
  kvRoot = await mkdtemp(path.join(tmpdir(), 'r360-cache-kv-'));
  storageRoot = await mkdtemp(path.join(tmpdir(), 'r360-cache-r2-'));
  env = {
    TENANTS_KV: createFsKv(kvRoot),
    R2: createFsStorage(storageRoot),
    EMBED_HMAC_SECRET: 'test-secret',
    SUPABASE_URL: 'https://fake.supabase.test',
    SUPABASE_SERVICE_KEY: 'fake-service-key',
    PUBLISH_SECRET: 'test-publish-secret',
    R360_PLATFORM_HOST: 'app.r360.test',
    R360_PAGES_DOMAIN: 'pages.r360.test',
  };
  await env.TENANTS_KV.put('ptr:acme:torres', JSON.stringify({ version: 1, history: [] }));
});

afterEach(async () => {
  await rm(kvRoot, { recursive: true, force: true });
  await rm(storageRoot, { recursive: true, force: true });
});

describe('Cache-Control del passthrough genérico', () => {
  it('un asset bajo /assets/ (hasheado por Vite) sale immutable, un año', async () => {
    await env.R2.put('t/acme/torres/v1/assets/viewer-DakOp8ET.js', 'console.log(1)', {
      httpMetadata: { contentType: 'text/javascript' },
    });

    const res = await buildApp().request('/t/acme/torres/assets/viewer-DakOp8ET.js', {}, env);

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
  });

  it('un asset de apps/viewer/public/ (sin hash, ej. un logo bajo marca/) NO sale immutable', async () => {
    await env.R2.put('t/acme/torres/v1/marca/caetano-blanco.png', 'binario-de-mentira', {
      httpMetadata: { contentType: 'image/png' },
    });

    const res = await buildApp().request('/t/acme/torres/marca/caetano-blanco.png', {}, env);

    expect(res.status).toBe(200);
    const cacheControl = res.headers.get('Cache-Control');
    expect(cacheControl).not.toContain('immutable');
    expect(cacheControl).toBe('public, max-age=300, must-revalidate');
  });

  it('cualquier otro path fuera de /assets/ tampoco sale immutable (ej. un favicon suelto)', async () => {
    await env.R2.put('t/acme/torres/v1/favicon.ico', 'binario-de-mentira', {
      httpMetadata: { contentType: 'image/x-icon' },
    });

    const res = await buildApp().request('/t/acme/torres/favicon.ico', {}, env);

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).not.toContain('immutable');
  });
});
