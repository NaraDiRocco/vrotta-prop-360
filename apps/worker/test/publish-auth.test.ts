import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { requirePublishSecret } from '../src/lib/publish-auth.ts';
import type { Env } from '../src/env.ts';

function buildApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.use('/protected', requirePublishSecret);
  app.post('/protected', (c) => c.json({ ok: true }));
  return app;
}

const envWithSecret = (secret = 'topsecret') => ({ PUBLISH_SECRET: secret }) as Env;

describe('requirePublishSecret', () => {
  it('rechaza sin header Authorization', async () => {
    const res = await buildApp().request('/protected', { method: 'POST' }, envWithSecret());
    expect(res.status).toBe(401);
  });

  it('rechaza con un secreto incorrecto', async () => {
    const res = await buildApp().request(
      '/protected',
      { method: 'POST', headers: { Authorization: 'Bearer secreto-equivocado' } },
      envWithSecret(),
    );
    expect(res.status).toBe(401);
  });

  it('rechaza un header sin el prefijo Bearer', async () => {
    const res = await buildApp().request(
      '/protected',
      { method: 'POST', headers: { Authorization: 'topsecret' } },
      envWithSecret(),
    );
    expect(res.status).toBe(401);
  });

  it('permite con el secreto correcto', async () => {
    const res = await buildApp().request(
      '/protected',
      { method: 'POST', headers: { Authorization: 'Bearer topsecret' } },
      envWithSecret(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('falla cerrado (500) si falta PUBLISH_SECRET en el entorno, aunque el header venga', async () => {
    const res = await buildApp().request(
      '/protected',
      { method: 'POST', headers: { Authorization: 'Bearer lo-que-sea' } },
      {} as Env,
    );
    expect(res.status).toBe(500);
  });
});
