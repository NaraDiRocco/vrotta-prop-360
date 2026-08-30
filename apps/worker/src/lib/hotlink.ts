/**
 * Protección anti-hotlink para tiles.
 *
 * IMPORTANTE (ver también src/routes/serve.ts): los tiles NO pasan por este
 * Worker — se sirven directo del dominio público de R2 con caché de
 * Cloudflare, porque proxearlos acá triplicaría el costo y agregaría
 * latencia a cada tile. Esta función es lógica pura para usarse en una regla
 * de Cloudflare (WAF custom rule / Worker liviano montado sólo en el dominio
 * de tiles) que corte el pedido ANTES de tocar R2, no en el Worker principal
 * de la API. La dejamos acá, testeada, para que esa regla (o ese worker
 * satélite) la reuse en vez de reinventar la lógica.
 *
 * Señales:
 *  - `Sec-Fetch-Site`: la pone el navegador y el sitio que hace el pedido NO
 *    la puede falsificar. Es la señal primaria.
 *      - 'same-origin' / 'same-site': el propio visor de r360 (viewer.*,
 *        cdn.* bajo el mismo sitio) pidiendo sus propios tiles → permitir.
 *      - 'none': navegación directa (alguien pegó la URL del tile en la
 *        barra) → no es hotlinking de otra página, permitir.
 *      - 'cross-site': un documento de OTRO sitio está haciendo el pedido
 *        (el caso típico de <img src="tile-de-r360"> incrustado en una
 *        página ajena) → bloquear.
 *
 *    Nota: el iframe embebido del visor SIGUE siendo 'same-site' para este
 *    chequeo, porque Sec-Fetch-Site se calcula entre el documento que hace el
 *    fetch (el propio iframe, servido desde un dominio de r360) y el destino
 *    (el dominio de tiles, también de r360) — el dominio del sitio del
 *    cliente que embebe el iframe no entra en esta cuenta.
 *
 *  - `Referer`: señal secundaria, sólo se usa cuando `Sec-Fetch-Site` no vino
 *    en el pedido (navegadores viejos / extensiones que la quitan). Un
 *    Referer ausente NO bloquea por sí solo — hay navegadores y extensiones
 *    de privacidad legítimas que lo omiten, y penalizar eso rompe usuarios
 *    reales sin frenar a un atacante mínimamente cuidadoso (que puede
 *    mandar cualquier Referer que quiera). Sólo bloqueamos cuando el Referer
 *    SÍ vino y apunta a un host no permitido.
 */

export type HotlinkDecision =
  | { allowed: true; reason: 'same_site' | 'no_site_no_signal' | 'direct_navigation' | 'referer_allowed' }
  | { allowed: false; reason: 'cross_site' | 'referer_denied' };

export interface HotlinkCheckOptions {
  /** Hosts propios de r360 + hosts custom del tenant, ya resueltos. */
  allowedHosts: string[];
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function checkHotlink(
  headers: { get(name: string): string | null },
  opts: HotlinkCheckOptions,
): HotlinkDecision {
  const secFetchSite = headers.get('Sec-Fetch-Site');

  if (secFetchSite) {
    const v = secFetchSite.toLowerCase();
    if (v === 'same-origin' || v === 'same-site') {
      return { allowed: true, reason: 'same_site' };
    }
    if (v === 'none') {
      return { allowed: true, reason: 'direct_navigation' };
    }
    // 'cross-site' (o cualquier valor no reconocido, fail-closed)
    return { allowed: false, reason: 'cross_site' };
  }

  const referer = headers.get('Referer');
  if (!referer) {
    // Sin Sec-Fetch-Site y sin Referer: no hay señal, no penalizamos.
    return { allowed: true, reason: 'no_site_no_signal' };
  }

  const host = hostnameOf(referer);
  const allowed = host !== null && opts.allowedHosts.some((h) => h.toLowerCase() === host);
  return allowed
    ? { allowed: true, reason: 'referer_allowed' }
    : { allowed: false, reason: 'referer_denied' };
}
