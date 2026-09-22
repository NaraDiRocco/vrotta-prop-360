import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { securityHeaders } from '../src/lib/security-headers.ts';
import { createFsKv } from '../src/lib/kv-fs.ts';
import { createFsStorage } from '../src/lib/storage-fs.ts';
import app from '../src/index.ts';
import type { Env } from '../src/env.ts';

/**
 * Dos niveles de test, a propósito:
 *
 *  1. `securityHeaders` en aislamiento, montado sobre una app de juguete
 *     (mismo estilo que test/publish-auth.test.ts para `requirePublishSecret`)
 *     — cubre los bordes del middleware en sí: respuestas vía `c.json()`,
 *     respuestas `Response` crudas (como el passthrough de assets de
 *     routes/serve.ts), el camino de error, y que no pise un header que un
 *     handler de más abajo ya haya seteado (el caso real: la CSP por tenant).
 *
 *  2. La app COMPLETA de src/index.ts, de punta a punta, para el requisito
 *     más importante del pedido: que la CSP por tenant (frame-ancestors)
 *     siga funcionando EXACTAMENTE igual que antes de este cambio, ahora
 *     conviviendo con las cabeceras nuevas en la misma respuesta.
 */

function tinyApp(handler: (c: Context<{ Bindings: Env }>) => Response | Promise<Response>) {
  const a = new Hono<{ Bindings: Env }>();
  a.use('*', securityHeaders);
  a.get('/x', handler);
  a.onError((err, c) => c.json({ error: 'boom', message: (err as Error).message }, 500));
  return a;
}

describe('securityHeaders (aislado)', () => {
  it('setea nosniff, Referrer-Policy y Permissions-Policy en una respuesta c.json normal', async () => {
    const a = tinyApp((c) => c.json({ ok: true }));
    const res = await a.request('/x');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('Permissions-Policy')).toContain('fullscreen=(self)');
    expect(res.headers.get('Permissions-Policy')).toContain('accelerometer=(self)');
    expect(res.headers.get('Permissions-Policy')).toContain('gyroscope=(self)');
    expect(res.headers.get('Permissions-Policy')).toContain('camera=()');
    expect(res.headers.get('Permissions-Policy')).toContain('microphone=()');
    expect(res.headers.get('Permissions-Policy')).toContain('geolocation=()');
  });

  it('NUNCA setea X-Frame-Options (lo reemplaza frame-ancestors, ver lib/csp.ts)', async () => {
    const a = tinyApp((c) => c.json({ ok: true }));
    const res = await a.request('/x');
    expect(res.headers.get('X-Frame-Options')).toBeNull();
  });

  it('borra X-Powered-By si algún handler lo llegó a setear', async () => {
    const a = tinyApp((c) => {
      c.header('X-Powered-By', 'Express');
      return c.json({ ok: true });
    });
    const res = await a.request('/x');
    expect(res.headers.get('X-Powered-By')).toBeNull();
  });

  it('también llega a una respuesta Response cruda (patrón del passthrough de assets en serve.ts)', async () => {
    const a = tinyApp(() => new Response('binario', { headers: { 'Content-Type': 'application/octet-stream' } }));
    const res = await a.request('/x');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('no pisa un header que el handler ya seteó (simulando la CSP por tenant de serve.ts)', async () => {
    const a = tinyApp((c) => {
      c.header('Content-Security-Policy', "frame-ancestors https://cliente.example");
      return c.json({ ok: true });
    });
    const res = await a.request('/x');
    expect(res.headers.get('Content-Security-Policy')).toBe('frame-ancestors https://cliente.example');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('sigue presente incluso cuando el handler tira (camino de error)', async () => {
    const a = tinyApp(() => {
      throw new Error('algo explotó');
    });
    const res = await a.request('/x');
    expect(res.status).toBe(500);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('Strict-Transport-Security SÓLO si X-Forwarded-Proto: https', async () => {
    const a = tinyApp((c) => c.json({ ok: true }));

    const porHttp = await a.request('/x');
    expect(porHttp.headers.get('Strict-Transport-Security')).toBeNull();

    const porHttpExplicito = await a.request('/x', { headers: { 'X-Forwarded-Proto': 'http' } });
    expect(porHttpExplicito.headers.get('Strict-Transport-Security')).toBeNull();

    const porHttps = await a.request('/x', { headers: { 'X-Forwarded-Proto': 'https' } });
    expect(porHttps.headers.get('Strict-Transport-Security')).toBe('max-age=86400');
  });

  it('Strict-Transport-Security NUNCA trae includeSubDomains ni preload', async () => {
    const a = tinyApp((c) => c.json({ ok: true }));
    const res = await a.request('/x', { headers: { 'X-Forwarded-Proto': 'https' } });
    const hsts = res.headers.get('Strict-Transport-Security');
    expect(hsts).not.toBeNull();
    expect(hsts).not.toMatch(/includeSubDomains/i);
    expect(hsts).not.toMatch(/preload/i);
  });
});

describe('cabeceras de seguridad + CSP por tenant, de punta a punta (app completa)', () => {
  let kvRoot: string;
  let storageRoot: string;
  let env: Env;

  beforeEach(async () => {
    kvRoot = await mkdtemp(path.join(tmpdir(), 'r360-secheaders-kv-'));
    storageRoot = await mkdtemp(path.join(tmpdir(), 'r360-secheaders-r2-'));
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
  });

  afterEach(async () => {
    await rm(kvRoot, { recursive: true, force: true });
    await rm(storageRoot, { recursive: true, force: true });
  });

  async function publicarShell(tenant: string, project: string, version = 1) {
    await env.TENANTS_KV.put(`ptr:${tenant}:${project}`, JSON.stringify({ version, history: [] }));
    await env.R2.put(
      `t/${tenant}/${project}/v${version}/index.html`,
      '<!doctype html><html><head><title>shell</title></head><body></body></html>',
      { httpMetadata: { contentType: 'text/html; charset=utf-8' } },
    );
  }

  it('tenant activo con ancestros: frame-ancestors correcto Y cabeceras nuevas presentes en la MISMA respuesta', async () => {
    await publicarShell('acme', 'torres');
    await env.TENANTS_KV.put(
      'tenant:acme',
      JSON.stringify({ active: true, allowedAncestors: ['https://acme.com', 'https://www.acme.com'] }),
    );

    const res = await app.request('/t/acme/torres/', {}, env);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Security-Policy')).toBe('frame-ancestors https://acme.com https://www.acme.com');
    expect(res.headers.get('X-Frame-Options')).toBeNull();
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('Permissions-Policy')).toContain('fullscreen=(self)');
  });

  it('tenant inexistente: sigue siendo frame-ancestors \'none\' (fail closed) y las cabeceras nuevas igual están', async () => {
    await publicarShell('sin-config', 'torres');

    const res = await app.request('/t/sin-config/torres/', {}, env);

    expect(res.headers.get('Content-Security-Policy')).toBe("frame-ancestors 'none'");
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('assets versionados (passthrough de R2) también llevan las cabeceras nuevas', async () => {
    await env.TENANTS_KV.put('ptr:acme:torres', JSON.stringify({ version: 1, history: [] }));
    await env.R2.put('t/acme/torres/v1/assets/app.js', 'console.log(1)', {
      httpMetadata: { contentType: 'text/javascript' },
    });

    const res = await app.request('/t/acme/torres/assets/app.js', {}, env);

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('la API (/api/health) también lleva las cabeceras, sin X-Frame-Options ni Strict-Transport-Security sin HTTPS', async () => {
    const res = await app.request('/api/health', {}, env);

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('X-Frame-Options')).toBeNull();
    expect(res.headers.get('Strict-Transport-Security')).toBeNull();
  });

  it('con X-Forwarded-Proto: https, /api/health trae Strict-Transport-Security sin includeSubDomains', async () => {
    const res = await app.request('/api/health', { headers: { 'X-Forwarded-Proto': 'https' } }, env);

    const hsts = res.headers.get('Strict-Transport-Security');
    expect(hsts).toBe('max-age=86400');
  });

  it('una ruta 404 (app.notFound / serveByHost) también lleva las cabeceras', async () => {
    const res = await app.request('/', { headers: { Host: 'no-existe.pages.r360.test' } }, env);
    expect(res.status).toBe(404);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('/api/publish sin secreto (401, de requirePublishSecret) igual lleva las cabeceras nuevas', async () => {
    const res = await app.request(
      '/api/publish',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) },
      env,
    );
    expect(res.status).toBe(401);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});
