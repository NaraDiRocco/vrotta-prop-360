import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { createFsKv } from '../src/lib/kv-fs.ts';
import { createFsStorage } from '../src/lib/storage-fs.ts';
import { serve, serveByHost } from '../src/routes/serve.ts';
import type { Env } from '../src/env.ts';

/**
 * Integración de punta a punta de la resolución por `Host:`: arma la MISMA
 * app que index.ts (la ruta `/t/:tenant/:project/*` + `serveByHost` como
 * `app.notFound`), con los adaptadores de disco reales para KV/R2 (los
 * mismos que usa server.ts en producción — ver kv-fs.test.ts/storage-fs.test.ts
 * para esos mismos adaptadores probados en aislamiento) y un `fetch` global
 * mockeado como si fuera PostgREST, para no depender de Supabase real ni de
 * la migración 0022 (que arma otro agente en paralelo) durante el test.
 */

const PLATFORM_HOST = 'app.r360.test';
const PAGES_DOMAIN = 'pages.r360.test';

function buildApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/', serve);
  app.notFound(serveByHost);
  return app;
}

/**
 * Fake de PostgREST sobre `fetch`: interpreta `/rest/v1/{table}?col=eq.val&...`
 * contra las filas que le pasemos, igual que `fakeDb` en host-routing.test.ts
 * pero como `fetch` real (que es lo que `createSupabaseClient` usa
 * internamente) para probar el cableado completo, no sólo la función.
 */
function fakePostgrestFetch(tables: Record<string, Array<Record<string, unknown>>>) {
  return vi.fn(async (input: string | URL) => {
    const url = new URL(input);
    const table = url.pathname.replace('/rest/v1/', '');
    const rows = tables[table] ?? [];
    const params = new URLSearchParams(url.search);
    const filtered = rows.filter((row) => {
      for (const [key, value] of params) {
        if (key === 'select' || key === 'order') continue;
        if (!value.startsWith('eq.')) continue;
        if (String(row[key]) !== value.slice(3)) return false;
      }
      return true;
    });
    return new Response(JSON.stringify(filtered), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

let kvRoot: string;
let storageRoot: string;
let baseEnv: Omit<Env, 'R360_PLATFORM_HOST' | 'R360_PAGES_DOMAIN'>;

beforeEach(async () => {
  kvRoot = await mkdtemp(path.join(tmpdir(), 'r360-host-routing-kv-'));
  storageRoot = await mkdtemp(path.join(tmpdir(), 'r360-host-routing-r2-'));
  baseEnv = {
    TENANTS_KV: createFsKv(kvRoot),
    R2: createFsStorage(storageRoot),
    EMBED_HMAC_SECRET: 'test-secret',
    SUPABASE_URL: 'https://fake.supabase.test',
    SUPABASE_SERVICE_KEY: 'fake-service-key',
    PUBLISH_SECRET: 'test-publish-secret',
  };
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(kvRoot, { recursive: true, force: true });
  await rm(storageRoot, { recursive: true, force: true });
});

function envWith(fetchTables: Record<string, Array<Record<string, unknown>>>): Env {
  vi.stubGlobal('fetch', fakePostgrestFetch(fetchTables));
  return { ...baseEnv, R360_PLATFORM_HOST: PLATFORM_HOST, R360_PAGES_DOMAIN: PAGES_DOMAIN };
}

/** Publica un `index.html`/`tour.json` mínimo en R2 y mueve el puntero en KV, como haría /api/publish. */
async function publish(env: Env, tenant: string, project: string, version = 1) {
  await env.TENANTS_KV.put(`ptr:${tenant}:${project}`, JSON.stringify({ version, history: [] }));
  await env.R2.put(`t/${tenant}/${project}/v${version}/index.html`, `<html>shell de ${tenant}/${project}</html>`, {
    httpMetadata: { contentType: 'text/html; charset=utf-8' },
  });
  await env.R2.put(
    `t/${tenant}/${project}/v${version}/tour.json`,
    JSON.stringify({ tenant, project, scenes: [] }),
    { httpMetadata: { contentType: 'application/json' } },
  );
}

describe('serveByHost (resolución de proyecto por Host)', () => {
  it('host de plataforma no se trata como proyecto: sigue sirviendo /t/:tenant/:project/* como siempre', async () => {
    const env = envWith({});
    await publish(env, 'acme', 'demo');

    const res = await buildApp().request(
      '/t/acme/demo/',
      { headers: { Host: PLATFORM_HOST } },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('shell de acme/demo');
  });

  it('host de plataforma con un path que no matchea ninguna ruta -> 404 seco, sin intentar resolver proyecto', async () => {
    const env = envWith({});
    const fetchSpy = globalThis.fetch as ReturnType<typeof vi.fn>;

    const res = await buildApp().request('/', { headers: { Host: PLATFORM_HOST } }, env);
    expect(res.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('subdominio de plataforma válido resuelve y sirve el shell del proyecto', async () => {
    const env = envWith({
      tenants: [{ id: 'tenant-1', slug: 'acme' }],
      projects: [{ id: 'proj-1', slug: 'torres-del-lago', tenant_id: 'tenant-1', subdomain: 'torres' }],
    });
    await publish(env, 'acme', 'torres-del-lago');

    const host = 'torres.pages.r360.test';
    const res = await buildApp().request('/', { headers: { Host: host } }, env);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('shell de acme/torres-del-lago');

    // Segunda request al mismo host: no debería volver a pegarle a "Supabase"
    // (la caché de host-routing.ts absorbe la resolución).
    const fetchSpy = globalThis.fetch as ReturnType<typeof vi.fn>;
    const callsAfterFirst = fetchSpy.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);
    const res2 = await buildApp().request('/tour.json', { headers: { Host: host } }, env);
    expect(res2.status).toBe(200);
    expect(fetchSpy.mock.calls.length).toBe(callsAfterFirst);
  });

  it('dominio propio verified resuelve y sirve tour.json', async () => {
    const env = envWith({
      tenants: [{ id: 'tenant-2', slug: 'cliente-x' }],
      projects: [{ id: 'proj-2', slug: 'milomas', tenant_id: 'tenant-2' }],
      project_domains: [
        { project_id: 'proj-2', tenant_id: 'tenant-2', domain: 'milomas.com', status: 'verified' },
      ],
    });
    await publish(env, 'cliente-x', 'milomas');

    const res = await buildApp().request('/tour.json', { headers: { Host: 'milomas.com' } }, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(await res.json()).toEqual({ tenant: 'cliente-x', project: 'milomas', scenes: [] });
  });

  it('dominio propio con status pending NO resuelve (404, no sirve nada)', async () => {
    const env = envWith({
      tenants: [{ id: 'tenant-2', slug: 'cliente-x' }],
      projects: [{ id: 'proj-2', slug: 'milomas', tenant_id: 'tenant-2' }],
      project_domains: [
        { project_id: 'proj-2', tenant_id: 'tenant-2', domain: 'pendiente.com', status: 'pending' },
      ],
    });
    await publish(env, 'cliente-x', 'milomas');

    const res = await buildApp().request('/', { headers: { Host: 'pendiente.com' } }, env);
    expect(res.status).toBe(404);
  });

  it('host desconocido (sintaxis válida, sin match en ninguna tabla) -> 404 seco', async () => {
    const env = envWith({ tenants: [], projects: [], project_domains: [] });

    const res = await buildApp().request('/', { headers: { Host: 'nadie-me-registro.com' } }, env);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });

  it('host con caracteres inválidos se rechaza sin tocar la base', async () => {
    const env = envWith({
      // Si esto se consultara, cualquier fila alcanzaría para "resolver" —
      // el punto del test es que NUNCA se llega a preguntar.
      projects: [{ id: 'p', slug: 'lo-que-sea', tenant_id: 't', subdomain: 'lo-que-sea' }],
    });
    const fetchSpy = globalThis.fetch as ReturnType<typeof vi.fn>;

    const res = await buildApp().request(
      '/',
      { headers: { Host: 'host inválido con espacios.com' } },
      env,
    );
    expect(res.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('nunca cae a un proyecto por defecto: un host desconocido no sirve el primer proyecto que encuentre', async () => {
    const env = envWith({
      tenants: [{ id: 'tenant-1', slug: 'acme' }],
      projects: [{ id: 'proj-1', slug: 'torres-del-lago', tenant_id: 'tenant-1', subdomain: 'torres' }],
    });
    await publish(env, 'acme', 'torres-del-lago');

    // Ni el host de un subdominio ajeno ni uno random deberían nunca
    // devolver el shell de "torres-del-lago" — sólo lo sirve su propio host.
    const res = await buildApp().request('/', { headers: { Host: 'otro-cualquiera.com' } }, env);
    expect(res.status).toBe(404);
  });
});
