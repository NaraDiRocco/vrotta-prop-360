import { accessSync, constants as fsConstants, mkdirSync } from 'node:fs';
import path from 'node:path';
import { serve } from '@hono/node-server';
import app from './index.ts';
import type { Env } from './env.ts';
import { createFsKv } from './lib/kv-fs.ts';
import { createFsStorage } from './lib/storage-fs.ts';

/**
 * Entrypoint para correr este Worker con Node en un VPS propio, sin
 * Cloudflare. `src/index.ts` (las rutas Hono) no sabe ni le importa quién lo
 * arranca - acá se arma el `Env` que ese app espera, con los adaptadores de
 * disco (lib/kv-fs.ts, lib/storage-fs.ts) en vez de bindings reales de
 * Cloudflare, y se sirve con @hono/node-server.
 *
 * Filosofía: fallar ruidoso y de entrada, nunca "a medias". Igual que
 * requirePublishSecret (lib/publish-auth.ts) ya falla cerrado si falta el
 * secreto en runtime, acá se valida TODO lo crítico antes de levantar el
 * server: un Worker que arranca "casi bien" y recién explota en el primer
 * request real (o, peor, sirve /api/publish sin secreto configurado) es
 * mucho peor que uno que no arranca y te dice exactamente qué falta.
 */

const REQUIRED_ENV: Array<{ name: string; hint: string }> = [
  { name: 'EMBED_HMAC_SECRET', hint: 'secreto HMAC-SHA256 para firmar/verificar tokens de embed' },
  { name: 'SUPABASE_URL', hint: 'URL del proyecto Supabase (ej. https://xxxx.supabase.co)' },
  { name: 'SUPABASE_SERVICE_KEY', hint: 'service role key de Supabase (NUNCA la anon key)' },
  {
    name: 'PUBLISH_SECRET',
    hint: 'secreto compartido con apps/admin (R360_PUBLISH_SECRET ahí) para /api/publish, /api/rollback y /api/availability/:tenant/:project/regenerate',
  },
  {
    name: 'R360_STORAGE_ROOT',
    hint: 'directorio en disco donde persistir tour.json/availability.json/shell HTML por versión (reemplaza al bucket R2)',
  },
  {
    name: 'R360_KV_ROOT',
    hint: 'directorio en disco donde persistir punteros de versión, config de tenant y contadores de rate limit (reemplaza a TENANTS_KV)',
  },
];

function checkRequiredEnv(): void {
  const missing = REQUIRED_ENV.filter(({ name }) => !process.env[name]);
  if (missing.length === 0) return;

  console.error('No se puede arrancar el Worker: faltan variables de entorno obligatorias.\n');
  for (const { name, hint } of missing) {
    console.error(`  - ${name}: ${hint}`);
  }
  console.error(
    '\nConfigurá todas las que falten (ej. en el .env que carga tu proceso, o en la unit de systemd) y reintentá. ' +
      'El servidor NO arranca a medias.',
  );
  process.exit(1);
}

checkRequiredEnv();

/**
 * A partir de acá TypeScript no lo sabe, pero en runtime ya está
 * garantizado: `checkRequiredEnv` cortó el proceso si faltaba alguna de
 * `REQUIRED_ENV`. Este helper sólo evita sembrar `as string`/`!` sueltos por
 * todo el archivo.
 */
function requiredEnv(name: string): string {
  return process.env[name] as string;
}

/**
 * Crea (si no existe) y valida que se pueda escribir en `dir`, ANTES de
 * arrancar a servir requests. Un typo en el path, o un directorio sin
 * permisos (caso típico: systemd corriendo el proceso con un usuario que no
 * es dueño de la carpeta), tiene que tirar un error claro ACÁ - no en medio
 * del primer /api/publish real de un cliente.
 */
function ensureWritableDir(dir: string, label: string): void {
  try {
    mkdirSync(dir, { recursive: true });
    accessSync(dir, fsConstants.W_OK);
  } catch (err) {
    console.error(
      `No se puede crear o escribir en ${label} ("${dir}"): ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}

const storageRoot = path.resolve(requiredEnv('R360_STORAGE_ROOT'));
const kvRoot = path.resolve(requiredEnv('R360_KV_ROOT'));
ensureWritableDir(storageRoot, 'R360_STORAGE_ROOT');
ensureWritableDir(kvRoot, 'R360_KV_ROOT');

const env: Env = {
  TENANTS_KV: createFsKv(kvRoot),
  R2: createFsStorage(storageRoot),
  EMBED_HMAC_SECRET: requiredEnv('EMBED_HMAC_SECRET'),
  SUPABASE_URL: requiredEnv('SUPABASE_URL'),
  SUPABASE_SERVICE_KEY: requiredEnv('SUPABASE_SERVICE_KEY'),
  PUBLISH_SECRET: requiredEnv('PUBLISH_SECRET'),
};

const port = Number(process.env.PORT ?? 8787);
if (!Number.isInteger(port) || port <= 0) {
  console.error(`PORT inválido: "${process.env.PORT}". Tiene que ser un entero positivo.`);
  process.exit(1);
}

// `@hono/node-server` le pasa a `fetch` los HttpBindings de Node (incoming/
// outgoing) como segundo argumento por default - acá lo pisamos a propósito
// para pasarle en cambio el `Env` que las rutas de Hono esperan en `c.env`
// (mismo mecanismo que en Cloudflare, donde ese segundo argumento lo pone el
// runtime de Workers con los bindings de wrangler.toml).
const server = serve({ fetch: (request) => app.fetch(request, env), port }, (info) => {
  console.log(`r360-worker escuchando en http://localhost:${info.port}`);
  console.log(`  R360_STORAGE_ROOT = ${storageRoot}`);
  console.log(`  R360_KV_ROOT      = ${kvRoot}`);
});

// Apagado prolijo ante SIGTERM/SIGINT (systemd, docker stop, Ctrl+C): deja
// terminar los requests en vuelo en vez de cortarlos a mitad de camino.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.log(`Recibida ${signal}, cerrando el servidor...`);
    server.close((err) => {
      if (err) {
        console.error('Error al cerrar el servidor:', err);
        process.exit(1);
      }
      process.exit(0);
    });
  });
}
