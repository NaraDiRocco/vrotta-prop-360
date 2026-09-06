import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { rateLimitLeads, withinRateLimit, type RateLimitKv } from '../src/lib/rate-limit.ts';
import type { Env } from '../src/env.ts';

/** KV en memoria, alcanza para probar el conteo por ventana. */
function fakeKv(): RateLimitKv {
  const store = new Map<string, string>();
  return {
    async get(key) {
      return store.get(key) ?? null;
    },
    async put(key, value) {
      store.set(key, value);
    },
  };
}

describe('withinRateLimit', () => {
  it('deja pasar hasta el límite y corta el siguiente', async () => {
    const kv = fakeKv();
    const now = Date.now();
    for (let i = 0; i < 3; i++) {
      expect(await withinRateLimit(kv, 'test:ip:1.2.3.4', 3, 600, now)).toBe(true);
    }
    expect(await withinRateLimit(kv, 'test:ip:1.2.3.4', 3, 600, now)).toBe(false);
  });

  it('IPs distintas no comparten contador', async () => {
    const kv = fakeKv();
    const now = Date.now();
    for (let i = 0; i < 3; i++) expect(await withinRateLimit(kv, 'test:ip:1.1.1.1', 3, 600, now)).toBe(true);
    // Otra IP arranca en cero, no hereda el conteo de la primera.
    expect(await withinRateLimit(kv, 'test:ip:2.2.2.2', 3, 600, now)).toBe(true);
  });

  it('una vez que pasa la ventana, el contador se reinicia solo', async () => {
    const kv = fakeKv();
    const now = Date.now();
    for (let i = 0; i < 3; i++) expect(await withinRateLimit(kv, 'test:ip:1.2.3.4', 3, 600, now)).toBe(true);
    expect(await withinRateLimit(kv, 'test:ip:1.2.3.4', 3, 600, now)).toBe(false);
    // 10 minutos después, ventana nueva: la clave cambia de índice.
    const later = now + 600_000;
    expect(await withinRateLimit(kv, 'test:ip:1.2.3.4', 3, 600, later)).toBe(true);
  });
});

function buildApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.use('/api/leads', rateLimitLeads);
  app.post('/api/leads', (c) => c.json({ ok: true }));
  return app;
}

const post = (app: ReturnType<typeof buildApp>, env: Env, ip = '9.9.9.9') =>
  app.request(
    '/api/leads',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
      body: JSON.stringify({ tenant: 'baleia', project: 'baleia', channel: 'whatsapp', name: 'x' }),
    },
    env,
  );

describe('rateLimitLeads (middleware)', () => {
  it('corta con 429 al pasarse del límite por IP', async () => {
    const kv = fakeKv();
    const env = { TENANTS_KV: kv } as unknown as Env;
    const app = buildApp();

    // El límite por IP es 5 cada 10 minutos (ver lib/rate-limit.ts).
    for (let i = 0; i < 5; i++) {
      const res = await post(app, env);
      expect(res.status).toBe(200);
    }
    const res = await post(app, env);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
    expect((await res.json()) as { error: string }).toMatchObject({ error: 'rate_limited' });
  });

  it('una IP distinta no se ve afectada por el límite de la primera', async () => {
    const kv = fakeKv();
    const env = { TENANTS_KV: kv } as unknown as Env;
    const app = buildApp();

    for (let i = 0; i < 5; i++) await post(app, env, '1.1.1.1');
    expect((await post(app, env, '1.1.1.1')).status).toBe(429);
    expect((await post(app, env, '2.2.2.2')).status).toBe(200);
  });

  it('deja pasar el request al siguiente handler cuando no se pasó del límite', async () => {
    const kv = fakeKv();
    const env = { TENANTS_KV: kv } as unknown as Env;
    const app = buildApp();
    const res = await post(app, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
