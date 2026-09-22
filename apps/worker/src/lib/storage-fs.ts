import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { ObjectStorage } from '../env.ts';

/**
 * Adaptador de almacenamiento sobre el filesystem local, con la misma forma
 * mínima que el resto del código ya consume de R2 (ver src/routes/publish.ts,
 * availability.ts, rollback.ts y serve.ts). Sirve para correr en el VPS sin
 * Cloudflare: cada `key` que arma lib/r2paths.ts (ej.
 * `t/{tenant}/{project}/v{N}/tour.json`) pasa a ser una ruta relativa dentro
 * de `root`.
 *
 * Content-Type: R2 lo guarda como metadata del objeto (`httpMetadata`,
 * separado del contenido); un filesystem plano no tiene ese concepto. En vez
 * de adivinar el tipo por extensión (que ya no coincide 1:1 - `tour.json` es
 * `application/json` pero hay shells HTML, fuentes, etc.), se persiste el
 * `contentType` que cada `put` ya recibe explícito en un archivo `.meta.json`
 * al lado del contenido. Es más código que un mapa de extensiones, pero es
 * exacto: nunca hay que mantener sincronizada una tabla con lo que de verdad
 * pasan publish.ts/availability.ts en cada `put`.
 */

export interface StorageMeta {
  contentType?: string;
}

function metaPathFor(filePath: string): string {
  return `${filePath}.meta.json`;
}

/**
 * Convierte una key de R2 en una ruta de filesystem GARANTIZADA dentro de
 * `root`, o revienta.
 *
 * Por qué hace falta esto aunque r2paths.ts arme las keys a partir de
 * tenant/project "de confianza": esos dos componentes salen de :tenant/
 * :project en la URL (serve.ts) o del body de /api/publish, /api/rollback y
 * /api/availability/.../regenerate - nada valida ahí que no traigan '..' o
 * un path absoluto. R2 en Cloudflare no tiene noción de "directorio padre",
 * así que ese vector de ataque no existía; acá, sobre un filesystem real, un
 * tenant/project malicioso tipo '../../etc' podría leer o pisar cualquier
 * archivo fuera de `root` si no se lo frena ANTES de tocar disco.
 *
 * `path.relative` es la única forma confiable de detectar el escape en
 * cualquier plataforma, incluso cuando la key es un path absoluto: si se
 * hiciera sólo `path.resolve(root, key)`, un `key` absoluto ("/etc/passwd")
 * gana y `root` se ignora por completo - por eso acá nunca se confía en el
 * resultado de `resolve` sin comparar contra `root` primero.
 */
/**
 * Tipo de contenido deducido de la extensión, para los archivos que NO escribió
 * este adaptador.
 *
 * Hace falta porque el shell del visor y sus assets llegan al almacenamiento
 * por rsync, no por `put`: nunca pasan por acá y por lo tanto no tienen
 * `.meta.json` al lado. Sin esta tabla salían como `application/octet-stream`,
 * y el navegador RECHAZA un módulo de JavaScript servido así —"Strict MIME
 * type checking is enforced for module scripts"—, con lo cual el recorrido
 * quedaba en pantalla negra. El meta explícito, cuando existe, sigue ganando:
 * esto es sólo la red para lo que se deposita por otra vía.
 */
const TIPOS_POR_EXTENSION: Record<string, string> = {
  js: 'text/javascript',
  mjs: 'text/javascript',
  css: 'text/css',
  html: 'text/html; charset=utf-8',
  json: 'application/json',
  webmanifest: 'application/manifest+json',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  ico: 'image/x-icon',
  mp4: 'video/mp4',
  webm: 'video/webm',
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8',
  xml: 'application/xml',
  map: 'application/json',
};

export function tipoPorExtension(key: string): string | undefined {
  const ext = key.split('/').pop()?.split('.').pop()?.toLowerCase();
  return ext ? TIPOS_POR_EXTENSION[ext] : undefined;
}

function resolveKeyPath(root: string, key: string): string {
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error(`Key de storage inválida: ${JSON.stringify(key)}`);
  }
  const candidate = path.resolve(root, key);
  const relative = path.relative(root, candidate);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Key de storage fuera del directorio raíz: ${JSON.stringify(key)}`);
  }
  return candidate;
}

async function statOrNull(filePath: string) {
  try {
    return await stat(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

async function readMeta(filePath: string): Promise<StorageMeta | undefined> {
  try {
    const raw = await readFile(metaPathFor(filePath), 'utf8');
    const parsed = JSON.parse(raw) as StorageMeta;
    return typeof parsed.contentType === 'string' ? { contentType: parsed.contentType } : undefined;
  } catch {
    // Sin meta (nunca se escribió con contentType) o meta corrupto/truncado:
    // en ambos casos tratamos como "no sabemos el content-type", nunca
    // rompemos la lectura del objeto por esto.
    return undefined;
  }
}

/**
 * Escritura atómica: se escribe a un archivo temporal en el mismo directorio
 * y recién se hace `rename` sobre el destino final. `rename` dentro del
 * mismo filesystem es atómico a nivel de SO (POSIX), así que un `get`
 * concurrente nunca puede ver el archivo a medio escribir - o ve la versión
 * vieja completa, o ve la nueva completa, nunca algo a mitad de camino.
 */
async function writeFileAtomic(filePath: string, data: string | Uint8Array): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${randomUUID()}`;
  try {
    await writeFile(tmpPath, data);
    await rename(tmpPath, filePath);
  } catch (err) {
    await rm(tmpPath, { force: true }).catch(() => undefined);
    throw err;
  }
}

export function createFsStorage(root: string): ObjectStorage {
  const rootResolved = path.resolve(root);

  return {
    async get(key: string) {
      const filePath = resolveKeyPath(rootResolved, key);
      const stats = await statOrNull(filePath);
      if (!stats || !stats.isFile()) return null;

      const meta = await readMeta(filePath);
      return {
        // Readable.toWeb entrega un stream web estándar, consumible directo
        // por `new Response(obj.body)` en serve.ts - igual que el `body` que
        // devuelve R2Object en Cloudflare.
        body: Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream,
        // El meta explícito manda; si no hay, se deduce de la extensión.
        httpMetadata: meta ?? (() => {
          const contentType = tipoPorExtension(key);
          return contentType ? { contentType } : undefined;
        })(),
      };
    },

    async put(key: string, value: string | Uint8Array, opts) {
      const filePath = resolveKeyPath(rootResolved, key);
      await writeFileAtomic(filePath, value);

      const contentType = opts?.httpMetadata?.contentType;
      if (contentType) {
        await writeFileAtomic(metaPathFor(filePath), JSON.stringify({ contentType }));
      } else {
        // Si este `put` no trae contentType, no puede quedar mintiendo un
        // meta.json de una escritura anterior con la misma key (publish.ts
        // siempre manda contentType hoy, pero no hay que asumirlo para
        // siempre - mejor "no sé el tipo" que "tipo viejo incorrecto").
        await rm(metaPathFor(filePath), { force: true }).catch(() => undefined);
      }
    },

    async head(key: string) {
      const filePath = resolveKeyPath(rootResolved, key);
      const stats = await statOrNull(filePath);
      if (!stats || !stats.isFile()) return null;
      return { key, size: stats.size };
    },
  };
}
