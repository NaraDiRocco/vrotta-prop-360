import { Hono } from 'hono';
import type { Env } from '../env.ts';
import { getActivePointer } from '../lib/pointer.ts';
import { r2Paths } from '../lib/r2paths.ts';
import { cspHeaderForTenant, getTenantConfig } from '../lib/csp.ts';
import { verifyEmbedToken, loadRevocationState } from '../lib/embed-token.ts';

const EMBED_TOKEN_KID = 'default';

/**
 * GET /t/:tenant/:project/*
 *
 * Resuelve el puntero de versión activa en KV y sirve:
 *   - `/t/:tenant/:project/`           → shell HTML del visor (versión activa)
 *   - `/t/:tenant/:project/tour.json`  → tour.json de la versión activa
 *   - cualquier otro sufijo            → passthrough a esa versión en R2
 *
 * Los TILES (`/t/:tenant/:project/tiles/...`) NO se sirven acá: en producción
 * el visor los pide directo al dominio público de R2 (con caché de
 * Cloudflare delante), nunca a este Worker. Hacerlos pasar por acá
 * triplicaría el costo (lectura R2 + invocación Worker + egress) y le
 * agregaría latencia a cada uno de los cientos de tiles de un panorama. Si
 * este handler recibe un pedido de tiles de todos modos (por ejemplo por un
 * link directo mal armado), lo devuelve igual desde R2 para no romper, pero
 * NO es el camino esperado — ver README.md, sección "Ruteo de tiles".
 */
export const serve = new Hono<{ Bindings: Env }>();

serve.get('/t/:tenant/:project/*', async (c) => {
  const { tenant, project } = c.req.param();
  const wildcard = c.req.path.replace(`/t/${tenant}/${project}`, '').replace(/^\/+/, '');

  const csp = await cspHeaderForTenant(c.env.TENANTS_KV, tenant);
  c.header('Content-Security-Policy', csp);
  // Deliberadamente NO seteamos X-Frame-Options acá (ver lib/csp.ts).

  const pointer = await getActivePointer(c.env.TENANTS_KV, tenant, project);
  if (!pointer) {
    return c.json({ error: 'not_published', message: `No hay versión activa para ${tenant}/${project}` }, 404);
  }

  // Si el tenant requiere token de embed (config en KV), lo validamos acá.
  // TODO: por ahora es opt-in por tenant (`requireEmbedToken: true` en
  // `tenant:{tenant}`); la mayoría de los tenants arrancan sin esto y se
  // protegen sólo con frame-ancestors + hotlink en tiles.
  const tenantConfig = await getTenantConfig(c.env.TENANTS_KV, tenant);
  if ((tenantConfig as { requireEmbedToken?: boolean } | null)?.requireEmbedToken) {
    const token = c.req.query('t');
    if (!token) {
      return c.json({ error: 'missing_token', message: 'Falta ?t= con el token de embed' }, 401);
    }
    const revocation = await loadRevocationState(c.env.TENANTS_KV, tenant);
    const result = await verifyEmbedToken(token, {
      secrets: { [EMBED_TOKEN_KID]: c.env.EMBED_HMAC_SECRET },
      revocation,
    });
    if (!result.valid) {
      return c.json({ error: 'invalid_token', reason: result.reason }, 401);
    }
    if (result.payload.tenant !== tenant || result.payload.project !== project) {
      return c.json({ error: 'invalid_token', reason: 'malformed' as const }, 401);
    }
  }

  if (wildcard === '' || wildcard === 'index.html') {
    const key = r2Paths.indexHtml(tenant, project, pointer.version);
    const obj = await c.env.R2.get(key);
    if (!obj) return c.json({ error: 'missing_asset', key }, 404);
    return new Response(obj.body, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // El shell referencia tour.json vía el puntero, así que su propio
        // cache debe ser corto: si se hace rollback/publish, no queremos
        // que el visitante quede pegado a una versión vieja.
        'Cache-Control': 'public, max-age=60, must-revalidate',
      },
    });
  }

  if (wildcard === 'tour.json') {
    const key = r2Paths.tourJson(tenant, project, pointer.version);
    const obj = await c.env.R2.get(key);
    if (!obj) return c.json({ error: 'missing_asset', key }, 404);
    return new Response(obj.body, {
      headers: {
        'Content-Type': 'application/json',
        // Igual razonamiento que el shell: el contenido en R2 es inmutable
        // por versión, pero qué versión es "la activa" puede cambiar.
        'Cache-Control': 'public, max-age=60, must-revalidate',
      },
    });
  }

  // Passthrough genérico para cualquier otro asset versionado (fuentes, css,
  // js del bundle del visor). Los tiles caen acá también si alguien les pega
  // directo a este dominio, pero el camino soportado es el dominio de R2.
  const key = `${r2Paths.base(tenant, project, pointer.version)}/${wildcard}`;
  const obj = await c.env.R2.get(key);
  if (!obj) return c.json({ error: 'missing_asset', key }, 404);
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
});
