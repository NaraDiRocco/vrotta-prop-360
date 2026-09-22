import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../env.ts';
import { getActivePointer } from '../lib/pointer.ts';
import { r2Paths } from '../lib/r2paths.ts';
import { cspHeaderForTenant, getTenantConfig } from '../lib/csp.ts';
import { verifyEmbedToken, loadRevocationState } from '../lib/embed-token.ts';
import { createSupabaseClient } from '../lib/supabase.ts';
import {
  normalizeHost,
  classifyHost,
  resolveProjectForHost,
  createHostResolutionCache,
} from '../lib/host-routing.ts';

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
 *
 * El cuerpo de esta ruta vive en `serveProject`, exportada aparte, porque
 * `serveByHost` (más abajo) necesita servir EXACTAMENTE lo mismo cuando el
 * proyecto se resuelve por `Host:` en vez de por `/t/:tenant/:project/` en
 * el path — mismo contenido, dos formas de llegar a `(tenant, project)`.
 */
export const serve = new Hono<{ Bindings: Env }>();

export async function serveProject(
  c: Context<{ Bindings: Env }>,
  tenant: string,
  project: string,
  wildcard: string,
): Promise<Response> {
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
}

serve.get('/t/:tenant/:project/*', async (c) => {
  const { tenant, project } = c.req.param();
  const wildcard = c.req.path.replace(`/t/${tenant}/${project}`, '').replace(/^\/+/, '');
  return serveProject(c, tenant, project, wildcard);
});

// Caché de resolución host → proyecto, a nivel de módulo: tiene que
// sobrevivir entre requests (todo el sentido de tener TTL es no volver a
// pegarle a Supabase en el siguiente pedido), así que NO puede vivir dentro
// de `serveByHost` — una instancia por request equivaldría a no cachear
// nada. Ver lib/host-routing.ts para el porqué del TTL y el tope.
const hostResolutionCache = createHostResolutionCache();

/**
 * Handler de fallback para cuando NINGUNA ruta con path explícito matcheó
 * (`/api/*`, `/t/:tenant/:project/*`, etc.) — se conecta como
 * `app.notFound` en index.ts, no como una ruta más. Es justo ahí donde
 * caen los pedidos a un hostname propio de un proyecto (subdominio de
 * plataforma o dominio del cliente): llegan con paths "pelados" (`/`,
 * `/tour.json`, `/assets/x.js`) que no matchean el prefijo
 * `/t/:tenant/:project/` de la ruta de arriba.
 *
 * El host de la plataforma (`R360_PLATFORM_HOST`) nunca llega a intentar
 * resolver un proyecto: si su path no matcheó ninguna ruta ya es un 404 de
 * verdad (una ruta que no existe en el panel/API), no el indicio de que
 * haya que buscar un proyecto — mezclar esos dos casos sería el agujero de
 * spoofing que describe el docstring de `classifyHost` en
 * lib/host-routing.ts: el header `Host` lo elige quien hace el request, así
 * que jamás cae a un proyecto (ni al host de plataforma) "por las dudas".
 */
export async function serveByHost(c: Context<{ Bindings: Env }>): Promise<Response> {
  const host = normalizeHost(c.req.header('host'));
  if (!host) {
    return c.json({ error: 'not_found' }, 404);
  }

  const classification = classifyHost(host, {
    platformHost: c.env.R360_PLATFORM_HOST,
    pagesDomain: c.env.R360_PAGES_DOMAIN,
  });
  if (classification.kind === 'platform') {
    return c.json({ error: 'not_found' }, 404);
  }

  const db = createSupabaseClient({ url: c.env.SUPABASE_URL, serviceKey: c.env.SUPABASE_SERVICE_KEY });
  // Un error de Supabase (caída, timeout) se trata como "no encontrado" acá
  // — mismo criterio que `resolveProject(...).catch(() => null)` en
  // publish.ts/leads.ts — y a propósito NO se cachea: el `catch` está fuera
  // de `resolveProjectForHost`, así que un error transitorio nunca deja un
  // negativo pegado en la caché por 60s (ver lib/host-routing.ts).
  const resolved = await resolveProjectForHost(db, host, classification, hostResolutionCache).catch(
    () => null,
  );
  if (!resolved) {
    return c.json({ error: 'not_found' }, 404);
  }

  const wildcard = c.req.path.replace(/^\/+/, '');
  return serveProject(c, resolved.tenantSlug, resolved.projectSlug, wildcard);
}
