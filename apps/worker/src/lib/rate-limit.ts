import type { Context, Next } from 'hono';
import type { Env } from '../env.ts';

/**
 * Rate limit de `/api/leads` (hallazgo I2 de la auditoría).
 *
 * Hoy el insert corre siempre con la service key de Supabase y no hay ningún
 * techo: un script en loop puede llenar la tabla de leads falsos y ensuciar
 * el panel de la inmobiliaria — justo lo que este endpoint existe para
 * evitarle al visitante real. Se reusa `TENANTS_KV` (el binding ya existe
 * para config de tenants y punteros de versión, no hace falta un namespace
 * nuevo) con ventanas de tiempo fijas: la clave incluye el índice de
 * ventana, así que la entrada expira sola en KV y nunca hay que limpiar
 * nada a mano.
 *
 * Es un contador aproximado (KV no da compare-and-swap atómico), no un
 * limitador exacto: bajo carrera dos requests casi simultáneos pueden leer
 * el mismo conteo y "colarse" los dos. Para el propósito de este endpoint
 * (frenar un script en loop, no rechazar el último request de un límite
 * duro) alcanza y sobra — el costo de una carrera ocasional es mil veces
 * menor que el de agregar Durable Objects sólo para esto.
 *
 * Números elegidos para un formulario de contacto inmobiliario, no para una
 * API de alto tráfico:
 *  - POR IP: 5 leads cada 10 minutos. Un visitante real consulta como mucho
 *    2-3 unidades distintas en una sesión (auditoría del propio flujo de
 *    `contact.ts`: un CTA por unidad/bloque que mira); 5 deja margen de
 *    sobra sin dejar pasar un script que golpea el endpoint en loop desde
 *    una sola IP.
 *  - POR PROYECTO (tenant+project): 60 leads cada 10 minutos. Cubre el caso
 *    de un ataque distribuido con IPs rotadas, que el límite por IP solo no
 *    frena. Un proyecto real recibe unos pocos leads por hora en su pico
 *    (compartido en un grupo, publicado en un portal); 60 cada 10 minutos es
 *    un techo generoso que no debería tocar nunca tráfico legítimo pero sí
 *    corta cualquier ráfaga automatizada.
 */
const WINDOW_SECONDS = 600; // 10 minutos
const IP_LIMIT = 5;
const PROJECT_LIMIT = 60;
// Margen sobre la ventana para el TTL de KV: sólo para que la clave de la
// ventana anterior no quede viva más tiempo del necesario, no afecta el
// conteo (que ya cambia de clave al cambiar de ventana).
const KV_TTL_MARGIN_SECONDS = 60;

export interface RateLimitKv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

/** `true` si el request entra dentro del límite (y ya quedó contado). */
export async function withinRateLimit(
  kv: RateLimitKv,
  key: string,
  limit: number,
  windowSeconds: number = WINDOW_SECONDS,
  now: number = Date.now(),
): Promise<boolean> {
  const windowIndex = Math.floor(now / (windowSeconds * 1000));
  const windowKey = `rl:${key}:${windowIndex}`;
  const raw = await kv.get(windowKey);
  const count = raw ? Number(raw) : 0;
  if (count >= limit) return false;
  await kv.put(windowKey, String(count + 1), { expirationTtl: windowSeconds + KV_TTL_MARGIN_SECONDS });
  return true;
}

/**
 * IP del cliente tal como la ve el proxy que tenemos delante.
 *
 * Este Worker ya no corre detrás del edge de Cloudflare (ver src/server.ts):
 * corre en un VPS propio, detrás de nginx como reverse proxy. `CF-Connecting-IP`
 * se deja como primer chequeo sólo por compatibilidad hacia atrás/por si
 * algún día se vuelve a poner Cloudflare delante - hoy en producción nunca va
 * a venir. La señal real es `X-Real-IP`, que es justo para esto: nginx la
 * setea con `proxy_set_header X-Real-IP $remote_addr;` a un único valor, sin
 * la ambigüedad de una lista. `X-Forwarded-For` (primer valor) queda como
 * segundo fallback, para el caso de un nginx configurado con
 * `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` en vez de
 * X-Real-IP.
 *
 * IMPORTANTE, operativo y no exigible desde acá: esto sólo es confiable si
 * nginx SETEA (sobreescribe) estos headers en vez de agregarlos a lo que
 * mande el cliente, y si Node NUNCA queda expuesto a Internet directamente
 * (sólo nginx). Si un cliente le puede hablar directo al proceso de Node, o
 * si nginx reenvía el X-Real-IP/X-Forwarded-For que el cliente mandó sin
 * pisarlo, cualquiera puede falsificar su IP y saltarse el rate limit.
 */
function clientIp(c: Context<{ Bindings: Env }>): string {
  return (
    c.req.header('CF-Connecting-IP') ??
    c.req.header('X-Real-IP') ??
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

/**
 * Middleware de `/api/leads`. Lee `tenant`/`project` del body para el límite
 * por proyecto — `c.req.json()` cachea el body internamente (Hono
 * `bodyCache`), así que el handler de la ruta lo puede volver a leer sin
 * problema, no se consume el stream dos veces.
 */
export async function rateLimitLeads(c: Context<{ Bindings: Env }>, next: Next): Promise<Response | void> {
  const ip = clientIp(c);
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const tenant = typeof (body as Record<string, unknown>).tenant === 'string' ? (body as { tenant: string }).tenant : 'unknown';
  const project = typeof (body as Record<string, unknown>).project === 'string' ? (body as { project: string }).project : 'unknown';

  const [ipOk, projectOk] = await Promise.all([
    withinRateLimit(c.env.TENANTS_KV, `leads:ip:${ip}`, IP_LIMIT),
    withinRateLimit(c.env.TENANTS_KV, `leads:project:${tenant}:${project}`, PROJECT_LIMIT),
  ]);

  if (!ipOk || !projectOk) {
    c.header('Retry-After', String(WINDOW_SECONDS));
    return c.json(
      { error: 'rate_limited', message: 'Demasiadas consultas en poco tiempo. Probá de nuevo en unos minutos.' },
      429,
    );
  }

  return next();
}
