import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { createFsKv } from '../src/lib/kv-fs.ts';
import { createFsStorage } from '../src/lib/storage-fs.ts';
import { serve } from '../src/routes/serve.ts';
import type { Env } from '../src/env.ts';
import type { PhotoTourItem, TourManifest } from '@r360/core';

/**
 * Inyección de etiquetas Open Graph/Twitter Card en el shell (tarea de
 * previsualización al compartir el link por WhatsApp). Usa los mismos
 * adaptadores de disco para KV/R2 que serve-by-host.test.ts, pero pega
 * directo a `/t/:tenant/:project/*` (la ruta con path explícito, ver
 * routes/serve.ts): no hace falta resolver por `Host:` contra Supabase para
 * probar esto — `requestOrigin` en serve.ts lee el header `Host` tal cual
 * llegó, así que alcanza con mandarlo a mano en cada request para simular
 * "el visitante entró por tal dominio".
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
  kvRoot = await mkdtemp(path.join(tmpdir(), 'r360-og-kv-'));
  storageRoot = await mkdtemp(path.join(tmpdir(), 'r360-og-r2-'));
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

/** Shell mínimo, deliberadamente sin ninguna etiqueta `og:*` — como el de apps/viewer/index.html hoy. */
const SHELL_HTML = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Shell de prueba</title>
</head>
<body>
  <div id="app"></div>
</body>
</html>
`;

/** Host con el que "entra" el visitante en cada request — nginx real setearía además X-Forwarded-Proto. */
const VISITOR_HEADERS = { Host: 'baleia.vrottaprop360.com', 'X-Forwarded-Proto': 'https' };

function manifest(overrides: Partial<TourManifest> & { project: string }): TourManifest {
  return {
    schema: 1,
    version: 1,
    tenant: 'acme',
    availabilityUrl: '/t/acme/baleia/availability.json',
    start: '',
    scenes: [],
    hotspots: [],
    units: {},
    ...overrides,
  };
}

function fotoItem(id: string, url: string, extra: Partial<PhotoTourItem> = {}): PhotoTourItem {
  return {
    id,
    url,
    thumbUrl: url,
    width: 800,
    height: 600,
    procedencia: { kind: 'foto' },
    ...extra,
  };
}

/** Publica sólo el shell (sin tour.json), como si el manifiesto nunca se hubiera escrito para esa versión. */
async function publishShellOnly(tenant: string, project: string, version = 1, html = SHELL_HTML) {
  await env.TENANTS_KV.put(`ptr:${tenant}:${project}`, JSON.stringify({ version, history: [] }));
  await env.R2.put(`t/${tenant}/${project}/v${version}/index.html`, html, {
    httpMetadata: { contentType: 'text/html; charset=utf-8' },
  });
}

/** Publica shell + tour.json (el manifiesto), como haría /api/publish. */
async function publish(tenant: string, project: string, m: TourManifest, version = 1, html = SHELL_HTML) {
  await publishShellOnly(tenant, project, version, html);
  await env.R2.put(`t/${tenant}/${project}/v${version}/tour.json`, JSON.stringify(m), {
    httpMetadata: { contentType: 'application/json' },
  });
}

describe('inyección de etiquetas Open Graph en el shell (routes/serve.ts)', () => {
  it('inyecta título (deducido del proyecto) e imagen (primera foto del photoTour) con URLs absolutas', async () => {
    await publish(
      'acme',
      'baleia',
      manifest({
        project: 'Baleia · Punta Ballena',
        photoTour: {
          items: [fotoItem('p1', '/t/acme/baleia/v1/fotos/living.webp')],
        },
      }),
    );

    const res = await buildApp().request('/t/acme/baleia/', { headers: VISITOR_HEADERS }, env);
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(html).toContain('<meta property="og:type" content="website">');
    expect(html).toContain('<meta property="og:site_name" content="Baleia · Punta Ballena">');
    expect(html).toContain('<meta property="og:title" content="Baleia · Punta Ballena">');
    // URL absoluta contra el origen del REQUEST (Host + esquema), no una constante.
    expect(html).toContain('<meta property="og:url" content="https://baleia.vrottaprop360.com/t/acme/baleia/">');
    expect(html).toContain(
      '<meta property="og:image" content="https://baleia.vrottaprop360.com/t/acme/baleia/v1/fotos/living.webp">',
    );
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain('<meta name="twitter:title" content="Baleia · Punta Ballena">');
    expect(html).toContain(
      '<meta name="twitter:image" content="https://baleia.vrottaprop360.com/t/acme/baleia/v1/fotos/living.webp">',
    );
    // El shell original se conserva alrededor de las etiquetas inyectadas.
    expect(html).toContain('<title>Shell de prueba</title>');
    expect(html).toContain('<div id="app"></div>');
  });

  it('settings.social (title/description/image) le gana a lo deducido del manifiesto', async () => {
    await publish(
      'acme',
      'baleia',
      manifest({
        project: 'baleia', // deducido, no debería aparecer
        social: {
          title: 'Baleia — reserva tu unidad',
          description: 'Recorrido 360° de las unidades disponibles en Punta Ballena.',
          image: '/t/acme/baleia/v1/social/portada.webp',
        },
        brandLogo: '/t/acme/baleia/v1/marca/logo.svg', // tampoco debería aparecer: social.image gana
        photoTour: { items: [fotoItem('p1', '/t/acme/baleia/v1/fotos/living.webp')] }, // idem
      }),
    );

    const res = await buildApp().request('/t/acme/baleia/', { headers: VISITOR_HEADERS }, env);
    const html = await res.text();

    expect(html).toContain('<meta property="og:title" content="Baleia — reserva tu unidad">');
    expect(html).toContain(
      '<meta property="og:description" content="Recorrido 360° de las unidades disponibles en Punta Ballena.">',
    );
    expect(html).toContain(
      '<meta property="og:image" content="https://baleia.vrottaprop360.com/t/acme/baleia/v1/social/portada.webp">',
    );
    expect(html).not.toContain('fotos/living.webp');
    expect(html).not.toContain('marca/logo.svg');
    expect(html).not.toContain('content="baleia"');
  });

  it('sin ninguna imagen posible NO emite og:image ni twitter:image (nunca una etiqueta vacía o rota)', async () => {
    await publish(
      'acme',
      'baleia',
      manifest({ project: 'Sin fotos ni logo' }), // sin social.image, sin photoTour, sin brandLogo
    );

    const res = await buildApp().request('/t/acme/baleia/', { headers: VISITOR_HEADERS }, env);
    const html = await res.text();

    expect(html).toContain('<meta property="og:title" content="Sin fotos ni logo">');
    expect(html).not.toContain('og:image');
    expect(html).not.toContain('twitter:image');
    // Tampoco og:description: no hay de dónde deducirlo sin settings.social.
    expect(html).not.toContain('og:description');
    expect(html).not.toContain('twitter:description');
  });

  it('salta las fotos restricted del photoTour (recreaciones de IA) y cae a brandLogo', async () => {
    await publish(
      'acme',
      'baleia',
      manifest({
        project: 'Con recreación IA',
        photoTour: {
          items: [fotoItem('ia1', '/t/acme/baleia/v1/fotos/recreacion-ia.webp', { restricted: true })],
        },
        brandLogo: '/t/acme/baleia/v1/marca/logo.svg',
      }),
    );

    const res = await buildApp().request('/t/acme/baleia/', { headers: VISITOR_HEADERS }, env);
    const html = await res.text();

    expect(html).not.toContain('recreacion-ia.webp');
    expect(html).toContain(
      '<meta property="og:image" content="https://baleia.vrottaprop360.com/t/acme/baleia/v1/marca/logo.svg">',
    );
  });

  it('escapa un nombre de proyecto malicioso: no rompe el documento ni cuela un <script>', async () => {
    const nombreMalicioso = 'Baleia" /><script>alert(1)</script>';
    await publish('acme', 'baleia', manifest({ project: nombreMalicioso }));

    const res = await buildApp().request('/t/acme/baleia/', { headers: VISITOR_HEADERS }, env);
    expect(res.status).toBe(200);
    const html = await res.text();

    // El payload NUNCA aparece sin escapar en el documento.
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('Baleia" />');

    // Aparece correctamente escapado dentro del atributo `content`.
    expect(html).toContain(
      '<meta property="og:title" content="Baleia&quot; /&gt;&lt;script&gt;alert(1)&lt;/script&gt;">',
    );
    expect(html).toContain(
      '<meta property="og:site_name" content="Baleia&quot; /&gt;&lt;script&gt;alert(1)&lt;/script&gt;">',
    );

    // El documento sigue teniendo exactamente el mismo <head> que abrió: no se coló ningún tag nuevo fuera de los <meta> esperados.
    const headMatches = html.match(/<head>/gi) ?? [];
    const scriptMatches = html.match(/<script/gi) ?? [];
    expect(headMatches.length).toBe(1);
    expect(scriptMatches.length).toBe(0);
  });

  it('si no hay tour.json publicado para esa versión, sirve el shell tal cual, sin etiquetas', async () => {
    await publishShellOnly('acme', 'baleia');

    const res = await buildApp().request('/t/acme/baleia/', { headers: VISITOR_HEADERS }, env);
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(html).toBe(SHELL_HTML);
    expect(html).not.toContain('og:');
  });

  it('si el tour.json de esa versión está corrupto (no es JSON válido), sirve el shell tal cual', async () => {
    await publishShellOnly('acme', 'baleia');
    await env.R2.put('t/acme/baleia/v1/tour.json', '{ esto no es JSON válido', {
      httpMetadata: { contentType: 'application/json' },
    });

    const res = await buildApp().request('/t/acme/baleia/', { headers: VISITOR_HEADERS }, env);
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(html).toBe(SHELL_HTML);
    expect(html).not.toContain('og:');
  });
});
