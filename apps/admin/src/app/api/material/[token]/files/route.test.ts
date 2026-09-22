import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { POST } from './route.ts';

function uploadRequest(token: string) {
  return new NextRequest(`http://test/api/material/${token}/files?item=plano-masterplan`, { method: 'POST' });
}

function ctxFor(token: string) {
  return { params: Promise.resolve({ token }) };
}

/**
 * Rate limit por token (ver `lib/material/rate-limit.ts`, tercer hallazgo de
 * la auditoría que también encontró la escalada de roles en
 * `app/api/p/[project]/**`). El límite es 30 subidas cada 10 minutos — se
 * prueba acá contra la ruta completa (no sólo `withinUploadRateLimit`, que ya
 * se prueba aislada en `lib/material/rate-limit.test.ts`) para confirmar el
 * ORDEN: el 429 tiene que ganarle al 404 de "el link no existe", porque el
 * rate limit corre antes de tocar la base.
 */
describe('POST /api/material/[token]/files — rate limit', () => {
  it('corta con 429 después de 30 subidas con el mismo token', async () => {
    const token = 'ml_' + '1'.repeat(32);
    for (let i = 0; i < 30; i++) {
      const res = await POST(uploadRequest(token), ctxFor(token));
      // El token no existe de verdad: las primeras 30 caen en el 404 de
      // "el link no existe o ya no está vigente", nunca en 429.
      expect(res.status).not.toBe(429);
    }
    const res = await POST(uploadRequest(token), ctxFor(token));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });

  it('un token distinto no se ve afectado por el límite del anterior', async () => {
    const tokenA = 'ml_' + '2'.repeat(32);
    const tokenB = 'ml_' + '3'.repeat(32);
    for (let i = 0; i < 30; i++) await POST(uploadRequest(tokenA), ctxFor(tokenA));
    expect((await POST(uploadRequest(tokenA), ctxFor(tokenA))).status).toBe(429);
    expect((await POST(uploadRequest(tokenB), ctxFor(tokenB))).status).not.toBe(429);
  });
});
