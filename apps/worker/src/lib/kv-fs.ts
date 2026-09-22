import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { KeyValueStore } from '../env.ts';

/**
 * Adaptador de KV sobre el filesystem local: un archivo por clave. Cubre
 * exactamente lo que lib/pointer.ts, lib/csp.ts, lib/embed-token.ts y
 * lib/rate-limit.ts necesitan (`get` con `{ type: 'json' }` opcional, `put`
 * con `expirationTtl` opcional) - ver esos archivos para la forma exacta
 * esperada, ya escrita contra interfaces mínimas propias.
 *
 * LIMITACIÓN CONSCIENTE - UN SOLO NODO: esto es sólo un mapa clave/valor
 * respaldado en archivos de UN proceso Node, sin ningún lock entre procesos.
 * El puntero de versión activa (lib/pointer.ts, clave `ptr:tenant:project`) y
 * el rate limit (lib/rate-limit.ts) asumen que todas las lecturas/escrituras
 * pasan por el mismo almacén consistente - which a real KV distribuido (o
 * Cloudflare KV) te da gratis. Si este Worker corriera algún día en más de
 * una réplica (varias instancias de Node detrás de un load balancer), cada
 * una tendría su propio directorio (o carreras de escritura si comparten uno
 * por NFS/similar) y tanto el puntero como el rate limit dejarían de ser
 * confiables. Hoy, con un solo proceso, esto no es un descuido: es
 * exactamente el mismo nivel de consistencia "mejor esfuerzo, no atómico"
 * que rate-limit.ts ya documenta para el KV real de Cloudflare. El día que
 * haga falta escalar a más de un nodo, este archivo es el que hay que
 * reemplazar por un backend compartido de verdad (Redis, Postgres, o volver
 * a un KV real).
 */

interface StoredEntry {
  value: string;
  /** epoch ms - ausente si la clave no tiene TTL (punteros, config de tenant, revocación no expiran). */
  expiresAt?: number;
}

/**
 * Codifica la clave como nombre de archivo. Las claves reales tienen ':'
 * (`ptr:tenant:project`, `rl:leads:ip:1.2.3.4:1234`, `tenant:acme`) y en
 * teoría podrían traer '/' si tenant/project vienen de la URL sin validar.
 * `encodeURIComponent` escapa ambos (y cualquier otro separador de path), así
 * que el resultado es siempre UN ÚNICO segmento de archivo sin '/' - no hace
 * falta crear subdirectorios, y más importante, no hay forma de que el
 * nombre final sea '..' o '.' literal: el sufijo fijo `.kv.json` que se le
 * agrega después rompe cualquier intento de eso (ver el mismo razonamiento,
 * más elaborado, en storage-fs.ts para las keys de R2).
 */
function encodeKeyForFs(key: string): string {
  return encodeURIComponent(key);
}

function entryPathFor(root: string, key: string): string {
  return path.join(root, `${encodeKeyForFs(key)}.kv.json`);
}

/** Misma técnica de escritura atómica que storage-fs.ts: temp file + rename. */
async function writeFileAtomic(filePath: string, data: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${randomUUID()}`;
  try {
    await writeFile(tmpPath, data, 'utf8');
    await rename(tmpPath, filePath);
  } catch (err) {
    await rm(tmpPath, { force: true }).catch(() => undefined);
    throw err;
  }
}

export function createFsKv(root: string): KeyValueStore {
  const rootResolved = path.resolve(root);

  async function readEntry(key: string): Promise<StoredEntry | null> {
    const filePath = entryPathFor(rootResolved, key);
    let raw: string;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }

    let entry: StoredEntry;
    try {
      entry = JSON.parse(raw) as StoredEntry;
    } catch {
      // Archivo corrupto/truncado (ej. el proceso murió a mitad de un write
      // no atómico de una versión vieja, o alguien lo tocó a mano): mejor
      // tratarlo como ausente que romper el request que lo pidió.
      return null;
    }

    if (entry.expiresAt !== undefined && Date.now() >= entry.expiresAt) {
      // Vencido: se borra ahora, best-effort, para no acumular basura - pero
      // la decisión de "no existe" no depende de si el rm tuvo éxito.
      await rm(filePath, { force: true }).catch(() => undefined);
      return null;
    }

    return entry;
  }

  // `get` se declara con dos firmas (overload) para que el tipo de retorno
  // dependa de `opts.type`, igual que KeyValueStore en env.ts: sin esto,
  // lib/rate-limit.ts (que llama a `get(key)` sin opciones y espera
  // `string | null`) y lib/pointer.ts/csp.ts/embed-token.ts (que piden
  // `{ type: 'json' }` y esperan `unknown`) no podrían compartir la misma
  // implementación con el tipo correcto para cada uno.
  async function get(key: string, opts?: { type?: 'text' }): Promise<string | null>;
  async function get(key: string, opts: { type: 'json' }): Promise<unknown>;
  async function get(key: string, opts?: { type?: 'text' | 'json' }): Promise<unknown> {
    const entry = await readEntry(key);
    if (!entry) return null;
    if (opts?.type === 'json') {
      try {
        return JSON.parse(entry.value);
      } catch {
        // Mismo criterio que arriba: un valor que no parsea como JSON no
        // puede tirar abajo al que lo pide, se lee como "no hay nada".
        return null;
      }
    }
    return entry.value;
  }

  async function put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> {
    const entry: StoredEntry = { value };
    if (opts?.expirationTtl !== undefined) {
      entry.expiresAt = Date.now() + opts.expirationTtl * 1000;
    }
    await writeFileAtomic(entryPathFor(rootResolved, key), JSON.stringify(entry));
  }

  return { get, put };
}
