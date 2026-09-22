import type { Context, Next } from 'hono';
import type { Env } from '../env.ts';

/**
 * Cabeceras de seguridad genéricas, aplicadas a TODA respuesta de este
 * Worker (shell HTML, tour.json, assets versionados, y las rutas /api/*).
 * Complementan — sin pisar — la Content-Security-Policy (`frame-ancestors`)
 * que `lib/csp.ts` calcula por tenant en `routes/serve.ts`: ese header sigue
 * viviendo ahí porque depende de KV por request; acá sólo van las cabeceras
 * que son iguales para cualquier response.
 *
 * Registrado como middleware global (`app.use('*', securityHeaders)`) ANTES
 * de montar las rutas en index.ts, para que corra tanto en las rutas con
 * path explícito como en `app.notFound` (`serveByHost`, ver routes/serve.ts)
 * y en `app.onError`.
 *
 * Por qué los headers se setean DESPUÉS de `await next()` (no antes):
 * `Context#header()` de Hono soporta setear headers sobre una respuesta ya
 * finalizada (clona el Response y le agrega el header), así que hacerlo
 * después de `next()` es lo único que garantiza que estas cabeceras terminen
 * en TODAS las respuestas — pasen por `c.json()`/`c.text()`/`c.body()` o
 * devuelvan un `Response` armado a mano. Esto último importa en serio acá:
 * `routes/serve.ts` ahora usa `c.body(...)` en vez de `new Response(...)`
 * para el shell/tour.json/passthrough de assets (ver el comentario ahí)
 * precisamente porque un `new Response(...)` devuelto directo NO pasa por
 * `Context#header()` ni por `#preparedHeaders` en esta versión de Hono, y
 * pierde en silencio cualquier header seteado antes con `c.header()` —
 * incluida la CSP por tenant. Este middleware, seteando SUS headers después
 * de `next()` en vez de antes, no depende de que cada handler futuro se
 * acuerde de usar `c.body()`: aun si algún handler nuevo volviera a devolver
 * un `Response` crudo, estas cabeceras (las de este archivo) van a seguir
 * llegando igual.
 *
 * El `try/finally` asegura que corra también camino al error: Hono resuelve
 * `app.onError` en el nivel de `dispatch` donde se originó la excepción y
 * esa promesa nunca rechaza hacia los middlewares de arriba salvo un caso
 * borde (algo no instancia de `Error` tirado más abajo) — el `finally` cubre
 * ese caso sin costo en el camino feliz.
 *
 * X-Frame-Options NO se setea acá a propósito — ver el docstring de
 * lib/csp.ts: sólo admite un origen (o DENY/SAMEORIGIN), no una lista, así
 * que es estrictamente más pobre que `frame-ancestors` para un producto que
 * se embebe en el dominio de cada cliente. Emitirla junto a `frame-ancestors`
 * no suma nada (los navegadores que entienden CSP ya ignoran XFO cuando hay
 * `frame-ancestors`) y sólo arriesga romper el embed en el navegador raro
 * que priorice XFO.
 */
export async function securityHeaders(c: Context<{ Bindings: Env }>, next: Next): Promise<void> {
  try {
    await next();
  } finally {
    // Nunca delatar la stack tecnológica: no es un secreto que rompa nada
    // por sí solo, pero le regala a un atacante un dato gratis para afinar
    // exploits conocidos de Node/Hono. Hono/@hono/node-server no la setean
    // por defecto (a diferencia de Express) — esto es un borrado defensivo
    // por si algún día se suma una dependencia que sí la agregue.
    c.header('X-Powered-By', undefined);

    // El storage de este Worker (lib/storage-fs.ts) recibe archivos por
    // rsync: si no vino un `.meta.json` con el contentType explícito, el
    // Content-Type se DEDUCE de la extensión del archivo (mapa
    // `TIPOS_POR_EXTENSION`). Un archivo mal etiquetado (ej. un `.txt` que en
    // realidad es HTML/JS, subido por error o por un cliente malicioso con
    // acceso al rsync) podría ser "sniffeado" por el navegador a un tipo más
    // peligroso que el declarado y ejecutarse como HTML/script en el origen
    // del tenant (dominio propio del cliente o subdominio de plataforma) —
    // el clásico XSS por MIME-sniffing. `nosniff` obliga al navegador a
    // respetar el Content-Type tal cual se sirvió, sin adivinar.
    c.header('X-Content-Type-Options', 'nosniff');

    // apps/embed/src/v1.ts fija EXPLÍCITAMENTE `referrerpolicy:
    // "strict-origin-when-cross-origin"` en el <iframe> que crea (ver el
    // comentario de `loadIframe` ahí) — es la política real que gobierna qué
    // ve `document.referrer` dentro del visor embebido, y es lo que
    // `resolveExpectedParentOrigin` en apps/viewer/src/embed-bridge.ts usa
    // como respaldo cuando no llegó `?parentOrigin=`. Usar acá el MISMO
    // valor como cabecera de respuesta no cambia ese caso (lo gobierna el
    // atributo del iframe, no esta cabecera) pero sí cubre los otros dos
    // caminos que si dependen de esta cabecera: (a) alguien abre la URL del
    // recorrido directo, sin iframe — ahí no hay atributo que mande y esta
    // cabecera es la única política en juego — y (b) los pedidos que el
    // propio shell dispara después de cargar (tour.json, tiles en el dominio
    // de R2, `/api/leads`) — con `no-referrer` esos pedidos cross-origin
    // llegarían sin Referer, algo que no rompe nada hoy (hotlink.ts trata la
    // ausencia de Referer como señal neutra, no como bloqueo) pero sí
    // debilita esa señal secundaria en navegadores viejos sin
    // `Sec-Fetch-Site`. `strict-origin-when-cross-origin` manda el ORIGEN
    // completo en cross-origin same-scheme (lo que pide la tarea), nunca el
    // path completo a un tercero, y nada en un downgrade https→http.
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');

    // apps/embed/src/v1.ts delega al iframe exactamente
    // `"accelerometer; gyroscope; fullscreen; xr-spatial-tracking"` (atributo
    // `allow`) para el visor 360 (orientación del dispositivo en mobile,
    // pantalla completa, y XR si el navegador lo soporta). Esa delegación
    // desde el padre es necesaria pero NO alcanza: si el documento que
    // sirve ESTE Worker se negara a sí mismo esas features con una
    // Permissions-Policy propia más estricta, ganaría la más restrictiva de
    // las dos y el visor perdería pantalla completa/giroscopio en el
    // embed. Por eso acá se permiten esas cuatro para `self` — ni más
    // (nada de `*`, que las habilitaría también en cualquier iframe que
    // este documento pudiera anidar) ni menos — y se deniegan explícitamente
    // las que el código de apps/viewer no usa nunca (cámara, micrófono,
    // geolocalización, pagos, USB, MIDI, magnetómetro): de nuevo, nada que
    // este producto necesite, y con eso cerrado no queda margen para que un
    // script inyectado (dependencia comprometida, XSS) los invoque desde
    // este origen.
    c.header(
      'Permissions-Policy',
      [
        'fullscreen=(self)',
        'accelerometer=(self)',
        'gyroscope=(self)',
        'xr-spatial-tracking=(self)',
        'camera=()',
        'microphone=()',
        'geolocation=()',
        'payment=()',
        'usb=()',
        'midi=()',
        'magnetometer=()',
      ].join(', '),
    );

    // Strict-Transport-Security: sólo cuando el request llegó por HTTPS.
    // Este Worker corre detrás de Traefik, que termina TLS y le habla a Node
    // por HTTP plano (mismo escenario que documenta `requestOrigin` en
    // routes/serve.ts para armar `og:url`) — así que la única forma
    // confiable de saber si el VISITANTE entró por HTTPS es mirar
    // `X-Forwarded-Proto`, no el esquema de la request que ve este proceso.
    // Además, por spec (RFC 6797 §8.1) un HSTS Host no debería emitir esta
    // cabecera sobre transporte no seguro; los navegadores la ignoran igual
    // si llega por HTTP plano, pero no tiene sentido ni mandarla ahí.
    //
    // NO se setea `includeSubDomains`: bajo `R360_PAGES_DOMAIN` cada tenant
    // tiene su propio subdominio (`{slug}.pages.r360.io`), y además cada
    // cliente puede apuntar su PROPIO dominio (`dacal.com.uy`, etc. — ver
    // `lib/host-routing.ts`) a este Worker. `includeSubDomains` en un
    // response servido desde el host exacto de un tenant extendería el
    // pin de HSTS a los sub-subdominios de ESE host — territorio que no
    // controlamos (son del cliente, no nuestro) y cuyo TLS no gestionamos.
    // Si algún día ese cliente aloja otra cosa en un sub-subdominio sin
    // HTTPS bien configurado, `includeSubDomains` se la rompería sin que
    // nosotros podamos revertirlo del lado del visitante ya afectado.
    //
    // `max-age` deliberadamente CORTO (1 día) en vez del año/dos años
    // habitual: el propio dominio de la plataforma se migró hace apenas un
    // puñado de commits (ver el historial: "La plataforma estrena dominio
    // propio", "El cambio al dominio propio, en un comando que se niega a
    // correr antes de tiempo", "Los registros del dominio de la plataforma,
    // listos para cargar") y el TLS de dominios propios de cliente vía
    // Traefik es relativamente nuevo en este stack. Un `max-age` largo con
    // cualquier problema de certificado (renovación de Traefik/ACME que
    // falla, un cliente que mueve su DNS) deja a los visitantes que ya
    // cachearon la política sin forma de volver a entrar por HTTP durante
    // ese tiempo — con un día de ventana, un problema así se autorresuelve
    // rápido. Sin `preload` (ni de cerca: exige `includeSubDomains` + un año
    // mínimo, y salir de la lista de precarga de los navegadores lleva
    // meses — totalmente prematuro acá). Conviene revisar este valor hacia
    // arriba (ej. 6 meses) una vez que el dominio propio y los dominios de
    // cliente lleven un tiempo estables.
    const forwardedProto = c.req.header('X-Forwarded-Proto')?.split(',')[0]?.trim().toLowerCase();
    const isHttps = forwardedProto === 'https' || new URL(c.req.url).protocol === 'https:';
    if (isHttps) {
      c.header('Strict-Transport-Security', 'max-age=86400');
    }
  }
}
