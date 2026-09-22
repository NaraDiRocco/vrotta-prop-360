/**
 * Rate limit de `POST /api/material/[token]/files` (tercer hallazgo de la
 * misma auditoría que encontró la escalada de roles en `apps/admin/src/app/api/p/**`).
 *
 * Ese endpoint no tiene sesión: se entra con el token del link, que está
 * pensado justamente para reenviarse por WhatsApp sin control de quién lo
 * recibe (ver el comentario de `app/api/material/[token]/files/route.ts`).
 * Y no tenía ningún techo. Como `receiveUpload` (ver `receive.ts`) bufferea
 * el archivo entero en memoria antes de poder rechazarlo por tamaño,
 * cualquiera con el link puede mandar subidas grandes y concurrentes para
 * agotar la RAM del proceso del panel. No es fuga de datos: es caída de
 * servicio, y encima la sufre un proceso que sirve a TODOS los tenants, no
 * sólo al dueño del link.
 *
 * Mismo criterio que `apps/worker/src/lib/rate-limit.ts` (hallazgo I2 de
 * una auditoría anterior): ventana fija, contador aproximado y no exacto —
 * alcanza para frenar un script en loop, no para un límite duro— pero acá no
 * hay KV de Cloudflare ni Redis a mano (el panel es un proceso Next.js en un
 * VPS, no un Worker), así que el contador vive en memoria del propio
 * proceso, colgado de `globalThis` con el mismo patrón que ya usan
 * `lib/data/mock.ts` y `lib/editor/hotspot-store.ts` para sobrevivir al
 * hot-reload de Next en dev.
 *
 * Dos límites del enfoque, dichos en voz alta y no escondidos:
 *  1. Un restart del proceso limpia el contador entero. Aceptable: es un
 *     freno a un abuso obvio, no una cuota de negocio.
 *  2. Si el panel corriera detrás de más de una instancia de Node, cada una
 *     contaría por su cuenta y el límite real sería `limite × instancias`.
 *     Hoy corre una sola instancia en el VPS (ver DESPLIEGUE-VPS.md); si eso
 *     cambia, este contador tiene que migrar a un store compartido.
 */

const WINDOW_SECONDS = 600; // 10 minutos: mismo orden de magnitud que /api/leads del worker.

/**
 * Subidas por link cada 10 minutos. Una carga real de material para un
 * proyecto son un puñado de archivos repartidos en ~15-20 ítems del
 * catálogo (ver `catalog.ts`); 30 deja margen de sobra para una sesión
 * cargada de un cliente real sin dejar pasar un script golpeando el link en
 * loop.
 */
const TOKEN_LIMIT = 30;

export interface RateLimitCounter {
  get(key: string): number | undefined;
  set(key: string, value: number): void;
  delete(key: string): void;
}

function createCounter(): RateLimitCounter {
  return new Map<string, number>();
}

const KEY = Symbol.for('r360.material.upload-rate-limit');

function defaultCounter(): RateLimitCounter {
  const g = globalThis as unknown as Record<symbol, RateLimitCounter | undefined>;
  let c = g[KEY];
  if (!c) {
    c = createCounter();
    g[KEY] = c;
  }
  return c;
}

/** Sólo para tests: un contador nuevo y aislado, sin tocar el que cuelga de `globalThis`. */
export function createUploadRateLimitCounter(): RateLimitCounter {
  return createCounter();
}

/**
 * `true` si la subida entra dentro del límite del token (y ya quedó
 * contada); `false` si hay que cortar con 429.
 *
 * La clave incluye el índice de ventana, así que al cruzar a la ventana
 * siguiente el conteo de ese token arranca solo de cero — no hace falta
 * limpiar nada a mano. De paso se poda la entrada de la ventana ANTERIOR de
 * este mismo token, así el contador no crece sin límite mientras el proceso
 * sigue vivo (queda, sí, una entrada por cada token que se usó alguna vez en
 * la ventana actual o la pasada; eso es acotado por la cantidad de links
 * activos, no por el tráfico).
 */
export function withinUploadRateLimit(
  token: string,
  now: number = Date.now(),
  limit: number = TOKEN_LIMIT,
  windowSeconds: number = WINDOW_SECONDS,
  counter: RateLimitCounter = defaultCounter(),
): boolean {
  const windowIndex = Math.floor(now / (windowSeconds * 1000));
  const key = `${token}:${windowIndex}`;
  const previousWindowKey = `${token}:${windowIndex - 1}`;

  const count = counter.get(key) ?? 0;
  if (count >= limit) return false;

  counter.set(key, count + 1);
  counter.delete(previousWindowKey);
  return true;
}

export const UPLOAD_RATE_LIMIT_WINDOW_SECONDS = WINDOW_SECONDS;
