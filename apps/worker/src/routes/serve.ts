import { Hono } from 'hono';
import type { Context } from 'hono';
import type { TourManifest } from '@r360/core';
import type { Env } from '../env.ts';
import { getActivePointer } from '../lib/pointer.ts';
import { r2Paths } from '../lib/r2paths.ts';
import { cspHeaderForTenant, getTenantConfig } from '../lib/csp.ts';
import { verifyEmbedToken, loadRevocationState } from '../lib/embed-token.ts';
import { createSupabaseClient } from '../lib/supabase.ts';
import { buildOgTags, injectOgTags } from '../lib/og-tags.ts';
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

    // Hasta acá el shell se devolvía como stream (`new Response(obj.body)`),
    // sin pasar por memoria entera — el criterio correcto para los assets
    // versionados de abajo (fuentes, JS, y sobre todo lo pesado como tiles y
    // video, que ni siquiera pasan por este Worker). Para inyectar las
    // etiquetas Open Graph hace falta el documento completo como string, así
    // que ACÁ se deja de streamear y se lee entero con `.text()`. Es
    // aceptable únicamente porque el shell del visor pesa apenas un par de
    // KB (ver README/apps/viewer): nada que ver con la media, que sigue sin
    // tocar este código.
    const html = await new Response(obj.body).text();
    const htmlConOg = await withOgTags(c, tenant, project, pointer.version, html);

    // `c.body(...)`, NO `new Response(...)`: la CSP por tenant se seteó unas
    // líneas arriba con `c.header('Content-Security-Policy', csp)`, ANTES de
    // saber si esto termina siendo el shell, tour.json o un 404 — es un
    // header que aplica a toda la ruta, se setea una sola vez arriba de
    // todos los `if`. Con esta versión de Hono (ver context.js: `header()`
    // guarda en `#preparedHeaders` cuando todavía no hay `c.res`), esos
    // headers previos sólo se mezclan en la respuesta final si se construye
    // con un método de `c` (`c.body/c.json/c.text/...`, que internamente
    // leen `#preparedHeaders`) — un `new Response(...)` devuelto directo NO
    // pasa por ahí y los pierde en silencio. Se comprobó: con `new
    // Response(...)` acá, `Content-Security-Policy` llegaba `null` al
    // visitante pase lo que pase en KV — la restricción de `frame-ancestors`
    // por tenant no se estaba aplicando de verdad. Ver
    // test/security-headers.test.ts para el test de punta a punta que lo
    // cubre.
    return c.body(htmlConOg, {
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
    // `c.body(...)`, no `new Response(...)` — mismo motivo que en el shell
    // de arriba: así no se pierde la CSP por tenant seteada al principio de
    // `serveProject`.
    return c.body(obj.body, {
      headers: {
        'Content-Type': 'application/json',
        // Igual razonamiento que el shell: el contenido en R2 es inmutable
        // por versión, pero qué versión es "la activa" puede cambiar.
        'Cache-Control': 'public, max-age=60, must-revalidate',
      },
    });
  }

  // Passthrough genérico para cualquier otro asset versionado (fuentes, css,
  // js del bundle del visor, PERO TAMBIÉN archivos de `apps/viewer/public/`
  // como `marca/dacal-blanco.png` — ver más abajo). Los tiles caen acá
  // también si alguien les pega directo a este dominio, pero el camino
  // soportado es el dominio de R2.
  const key = `${r2Paths.base(tenant, project, pointer.version)}/${wildcard}`;
  const obj = await c.env.R2.get(key);
  if (!obj) return c.json({ error: 'missing_asset', key }, 404);

  // `immutable` + un año de `max-age` SÓLO es correcto para lo que Vite
  // emite bajo `assets/` (ver apps/viewer/vite.config.ts: `build.assetsDir`
  // por default, con el hash de contenido en el nombre — `viewer-DakOp8ET.js`
  // tipo) — si el contenido cambia, la URL cambia con él, así que "cachear
  // para siempre" es seguro.
  //
  // NO es correcto para el resto de lo que cae en este passthrough: todo lo
  // que Vite copia tal cual desde `apps/viewer/public/` (ej. `marca/
  // dacal-blanco.png`, `marca/caetano-blanco.png`, `marca/
  // baleia-logo-blanco.svg` — ver welcome.ts/tour-rail.ts/main.ts) se sirve
  // en un path SIN hash y SIN versión. Caso real de hoy: se optimizó
  // `caetano-blanco.png` de 120 KB a 22 KB, mismo nombre de archivo — con
  // `immutable, max-age=31536000` ningún navegador que ya hubiera visitado
  // el sitio iba a volver a pedirlo en un año. Peor todavía: esta misma
  // mañana este passthrough sirvió por error una respuesta con el
  // Content-Type equivocado (recorrido en pantalla negra) y, marcada
  // `immutable`, esa respuesta mala quedó pegada en el caché de cada
  // visitante mucho después de arreglado el servidor — el síntoma
  // sobrevivió a la causa.
  //
  // La media pesada (fotos/video de los tiles) NO pasa por acá — se sirve
  // por otro camino (nginx, con la versión en la URL, ver el comentario de
  // `serveProject` más arriba) — así que este passthrough sólo carga con
  // archivos chicos del bundle del visor. `max-age=300, must-revalidate`
  // (5 minutos): alcanza para cubrir los pedidos repetidos de una MISMA
  // sesión de navegación (que es donde de verdad ayuda cachear un logo que
  // se ve una sola vez por visita) sin dejar una respuesta mala pegada por
  // más que unos minutos — el mismo orden de magnitud que ya usan el shell
  // y tour.json un poco más arriba en este archivo, por la misma razón.
  // Si algún día se le agrega hash al nombre de los archivos de `public/`
  // (dejarían de ser "públicos" en el sentido de Vite), recién ahí tiene
  // sentido tratarlos como inmutables.
  const esAssetConHash = wildcard.startsWith('assets/');
  // `c.body(...)`, no `new Response(...)` — mismo motivo que en el shell y
  // tour.json más arriba: preserva la CSP por tenant seteada al principio de
  // `serveProject`.
  return c.body(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': esAssetConHash
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=300, must-revalidate',
    },
  });
}

/**
 * Origen (esquema + host) tal como lo vio el visitante — hace falta para que
 * `og:url`/`og:image` sean URLs ABSOLUTAS (exigencia de Open Graph) y, sobre
 * todo, para que apunten al host que la visita realmente usó: el mismo
 * proyecto puede atenderse tanto en su subdominio de plataforma como en el
 * dominio propio del cliente (ver lib/host-routing.ts), así que el origen no
 * puede salir de una constante — tiene que armarse por request.
 *
 * El host sale del header `Host` tal cual llegó: es la misma fuente de
 * verdad que ya usa el resto del ruteo (`serveByHost`, `normalizeHost`). El
 * esquema es más delicado: este Worker corre detrás de nginx (mismo
 * escenario que documenta `clientIp` en lib/rate-limit.ts para la IP), que
 * termina TLS y le habla a Node por HTTP plano — así que la URL que ESTE
 * proceso ve casi siempre dice "http" aunque el visitante entró por HTTPS.
 * Se respeta `X-Forwarded-Proto` (lo que nginx debería setear) primero, y
 * recién si no vino se mira el esquema de la propia request.
 *
 * Devuelve `null` si ni siquiera hay `Host` (no debería pasar en un request
 * HTTP/1.1 real) — quien llama lo trata igual que cualquier otro motivo para
 * no poder armar las etiquetas: se sirve el shell sin ellas.
 */
function requestOrigin(c: Context<{ Bindings: Env }>): string | null {
  const host = c.req.header('host');
  if (!host) return null;
  const forwardedProto = c.req.header('X-Forwarded-Proto')?.split(',')[0]?.trim();
  const scheme = forwardedProto || new URL(c.req.url).protocol.replace(':', '') || 'https';
  return `${scheme}://${host}`;
}

/**
 * Lee y valida el manifiesto de esta versión SÓLO para las etiquetas Open
 * Graph — nunca para nada que el visor necesite (eso lo sigue sirviendo
 * `/t/.../tour.json` tal cual, un poco más abajo). Cualquier problema
 * (objeto ausente en R2, JSON corrupto, forma inesperada) devuelve `null`:
 * la tarjeta de previsualización es un detalle estético; que el recorrido no
 * cargue por esto sería un desastre (tarea 6 del pedido), así que acá no hay
 * ningún camino que pueda tirar un error hacia arriba.
 */
async function readManifestForOgTags(
  c: Context<{ Bindings: Env }>,
  tenant: string,
  project: string,
  version: number,
): Promise<TourManifest | null> {
  try {
    const obj = await c.env.R2.get(r2Paths.tourJson(tenant, project, version));
    if (!obj) return null;
    const text = await new Response(obj.body).text();
    const parsed = JSON.parse(text) as Partial<TourManifest> | null;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.project !== 'string' || !parsed.project) {
      return null;
    }
    return parsed as TourManifest;
  } catch {
    return null;
  }
}

/**
 * Intenta inyectar las etiquetas Open Graph en el shell. Cualquier eslabón
 * que falle (no se pudo leer el manifiesto, no hay `Host`, el manifiesto no
 * tiene ni título posible) devuelve el `html` de entrada sin tocar — mismo
 * criterio de "nunca romper lo que anda" en cada paso, no sólo en el
 * primero.
 */
async function withOgTags(
  c: Context<{ Bindings: Env }>,
  tenant: string,
  project: string,
  version: number,
  html: string,
): Promise<string> {
  const manifest = await readManifestForOgTags(c, tenant, project, version);
  if (!manifest) return html;

  const origin = requestOrigin(c);
  if (!origin) return html;

  const tags = buildOgTags(manifest, origin, c.req.path);
  if (!tags) return html;

  return injectOgTags(html, tags);
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
