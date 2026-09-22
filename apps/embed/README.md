# @r360/embed

El loader `v1.js` que se embebe en el sitio de cada cliente. Es lo que nos
diferencia del competidor (que entrega un iframe crudo): carga diferida con
poster, sin salto de layout, deep links, fullscreen con fallback para iOS,
eventos hacia el dataLayer del cliente, y bloque SEO real junto al iframe.

- **Tamaño**: `dist/v1.js` pesa **~4 KB gzip** (presupuesto: 6 KB gzip).
- **Sin dependencias de runtime**, ES2018, se sirve como `<script>` clásico
  (no ESM) porque se inyecta desde WordPress, GTM, Wix, Webflow, etc., donde
  no se puede garantizar soporte de módulos.

## Modelo de URL: un subdominio por proyecto

El dominio de la plataforma es **`vrottaprop360.com`**, ya cargado y con
wildcard DNS (ver `DNS-VROTTAPROP360.md` y `DESPLIEGUE-VPS.md` en la raíz
del repo). La plataforma **no** sirve cada recorrido en una ruta
compartida: cada proyecto vive en su propio subdominio,
`{subdominio}.vrottaprop360.com`, y el worker resuelve cuál es por el
header `Host` de la petición. La ruta `/t/tenant/proyecto/` existe en el
worker pero **no** sirve el shell del visor (sus assets son absolutos
desde la raíz del subdominio, no desde esa ruta) — así que el iframe que
arma este loader **siempre** apunta a la raíz del subdominio del proyecto,
nunca a una ruta bajo el dominio pelado:

```
https://{subdominio}.vrottaprop360.com/?instance=...&parentOrigin=...[&unit=...][&scene=...]
```

`tenant`/`project` **no** viajan en esa URL: el visor no los lee de la
query string (el subdominio ya identifica el proyecto ante el worker), los
recibe recién en el primer `tour:init` por `postMessage`, después del
handshake — ver `apps/viewer/src/embed-bridge.ts`.

### Cómo recibe el snippet el subdominio: `data-subdomain`

El subdominio es la identidad **pública** del proyecto (columna
`projects.subdomain`, única a nivel **global** — ver
`supabase/migrations/0022_project_domains.sql`). El `data-project` que ya
existía es el **slug interno** del proyecto, único sólo **por tenant**
(`unique(tenant_id, slug)` en `supabase/migrations/0003_projects.sql`).
Hoy coinciden para los proyectos que existen (Baleia: `project="baleia"`,
`subdomain="baleia"`), pero son columnas distintas en la base y nada
garantiza que sigan coincidiendo siempre.

Por eso el snippet recibe el subdominio en un atributo **propio y
separado**, `data-subdomain`, en vez de reusar `data-project` para las dos
cosas. Se evaluaron las tres opciones:

- **Reusar `data-project`** para que valga el subdominio: se descartó
  porque pisaría su significado actual (slug interno, tenant-scoped) y el
  día que un proyecto tenga un slug distinto de su subdominio, el snippet
  apuntaría al recorrido equivocado sin ningún aviso.
- **`data-proyecto`** (en español, al lado de `data-project` en inglés): se
  descartó por parecerse *demasiado* a `data-project` — es exactamente el
  tipo de par de nombres que invita a un typo silencioso (¿cuál de los dos
  atributos casi iguales hay que tocar?). El resto de los atributos del
  snippet son todos en inglés (`data-tenant`, `data-poster`, `data-unit`,
  `data-seo-json`...) con prosa en español sólo en los comentarios, así que
  mezclar un nombre de atributo en español rompía además esa convención.
- **`data-subdomain`** (elegido): nombra exactamente lo que contiene, no se
  puede confundir con `data-project` de un vistazo, y sigue la convención
  en inglés del resto de los atributos.

**Compatibilidad**: si un snippet ya pegado en un sitio no trae
`data-subdomain` (todavía no existían), el loader **no rompe en
silencio** — usa `data-project` como mejor estimación del subdominio (hoy
es correcto en todos los proyectos existentes) y avisa por
`console.warn` con el nombre exacto del atributo que falta agregar. Ver
`parseTourDataset`/`subdomainFromProjectFallback` en `src/config.ts` y el
aviso en `mountOne` (`src/v1.ts`).

### El dominio base es configurable, en un solo lugar

`VIEWER_BASE_DOMAIN` (default `"vrottaprop360.com"`) es una constante bien
visible al principio de `src/v1.ts`, junto a `EMBED_ORIGIN` (el origen
donde se sirve este mismo script):

```ts
// src/v1.ts
const VIEWER_BASE_DOMAIN = "vrottaprop360.com"; // {subdominio}.VIEWER_BASE_DOMAIN por proyecto
const EMBED_ORIGIN = "https://cdn.vrottaprop360.com"; // dónde se sirve v1.js — ver nota abajo
```

Se eligió una **constante fija + rebuild** y no un atributo `data-*` del
`<script>` para poder apuntar a un entorno de pruebas sin tocar código,
por el mismo motivo por el que ya funcionaba así antes de este cambio: un
build de `v1.js` sirve a **un solo entorno**. No hay un caso real de una
misma página necesitando mezclar producción y staging en el mismo script
(y si lo necesitara, sería una fuente de errores — un cliente real jamás
debería poder, ni por accidente, hacer que su embed apunte a staging).
Para probar contra otro entorno: cambiar `VIEWER_BASE_DOMAIN` acá y correr
`pnpm --filter @r360/embed build` — idealmente publicando ese
`dist/v1.js` de pruebas en una URL de staging aparte, nunca pisando el
build de producción. No hay ninguna otra referencia hardcodeada al
dominio en el código.

`EMBED_ORIGIN` sigue siendo puramente informativo (no valida nada, es el
mismo comportamiento que tenía antes) — se usa `cdn.vrottaprop360.com`
como default porque `cdn` es el subdominio que la plataforma **reserva
explícitamente** para "servir estáticos/tiles" (ver `reserved_subdomains`
en `supabase/migrations/0022_project_domains.sql`); no es todavía una
decisión operativa confirmada de dónde se aloja `dist/v1.js` en
producción, sólo el candidato más razonable dado lo que ya está
reservado. Ajustá esta constante (y el `<script src="...">` de los
snippets de abajo) cuando esa decisión se tome.

## Comandos

```bash
pnpm install                              # una vez, desde la raíz del monorepo
pnpm --filter @r360/embed typecheck       # tsc --noEmit
pnpm --filter @r360/embed test            # node:test sobre config.ts / protocol.ts (parseo + validación de origen)
pnpm --filter @r360/embed build           # genera dist/v1.js y reporta el tamaño gzip real
pnpm --filter @r360/embed demo            # build + levanta apps/embed/demo en http://localhost:8090
```

## Dos demos, dos propósitos distintos

### `demo/index.html` — arnés de protocolo, sin backend

Monta **dos tours a la vez** (instancias independientes, sin variables
globales compartidas — a propósito una de las dos **no** trae
`data-subdomain`, para ver en la consola el aviso de compatibilidad sin
que el tour deje de cargar), con botones para disparar comandos
(`goToUnit`) y un log en vivo de todo el tráfico del protocolo
(`postMessage` crudo + `CustomEvent`s + `dataLayer.push`). El "visor" de
cada iframe es `demo/mock-viewer.ts`, que importa el **mismo**
`src/protocol.ts` tipado que el visor real va a usar — no es un mock del
protocolo, es una implementación real y mínima del otro lado del cable.
Sirve para probar CADA mensaje del protocolo a demanda, de forma
determinística y sin depender de internet ni de que el visor real esté
desplegado.

Se sirve con un servidor estático propio (`scripts/serve-demo.mjs`, sin
dependencias) porque loader y iframes necesitan ser **same-origin** para
que la validación estricta de `event.origin` (nunca `'*'`) pase en local.
`demo/index.html` setea `window.__TM_DEV_VIEWER_ORIGIN__` antes de cargar
`v1.js` — es el único "hook" de desarrollo en el loader: reemplaza el
origen del visor para **todas** las instancias de la página por igual
(ignorando el subdominio real de cada `data-subdomain`), porque en
`localhost` no hay subdominios de verdad sin tocar `/etc/hosts`. Los
sitios de clientes nunca lo tocan; producción siempre resuelve por
subdominio real vía `VIEWER_BASE_DOMAIN`.

```bash
pnpm --filter @r360/embed demo
# abrir http://localhost:8090
```

### `demo/sitio-tercero.html` — el snippet real, contra el recorrido real

Un HTML suelto que simula la web de un cliente (Inmobiliaria Dacal),
con el snippet **real** pegado tal cual se le entregaría a un cliente
(apuntando a `baleia.vrottaprop360.com` vía `data-subdomain="baleia"`) y
un log en pantalla de los `CustomEvent` `tm:*` que dispara. No tiene build
ni servidor propio — **se abre haciendo doble clic** en el archivo, o
sirviéndolo con cualquier servidor estático si se quiere probar el
handshake completo (ver la nota sobre `file://` dentro del archivo: un
origen `file://` es "opaco", así que `parentOrigin`/`document.referrer`
no llegan y el visor no puede validar el origen — el tour va a intentar
cargar y, sin handshake, el loader dispara `tm:loadError` a los 8s; es el
comportamiento correcto ante un origen no verificable, no un bug de esta
demo). Es la forma de verificar el circuito completo —snippet real,
dominio real— sin volver a levantar nada de este repo.

## El protocolo (`src/protocol.ts`)

Contrato tipado y versionado (`channel: "tumarca-tour"`, `v: 1`,
`instance: <id>` en cada mensaje) que el visor va a importar directamente
de este paquete. Incluye los type guards que loader y visor deberían usar
para validar mensajes entrantes: `isTourMessage`, `isKnownProtocolVersion`,
`isTrustedOrigin`.

Mensajes iframe → padre: `tour:hello`, `tour:ready`, `tour:resize`,
`tour:sceneView`, `tour:unitView`, `tour:lotClick`, `tour:leadIntent`,
`tour:deeplink`, `tour:error`, `tour:requestFullscreenFallback`,
`tour:exitFullscreenFallback`.

Mensajes padre → iframe: `tour:init`, `tour:command:goToUnit`,
`tour:command:enterFullscreenFallback:ack`.

Si no llega `tour:hello` dentro de 8s de crear el iframe, el loader dispara
`tm:loadError` (causa típica: la CSP del cliente bloqueando el origen del
visor, `{subdominio}.vrottaprop360.com`).

## Snippets por plataforma

El snippet de abajo es el **real**, listo para copiar y pegar en la web de
un cliente: apunta al recorrido de Baleia ya publicado en
`baleia.vrottaprop360.com`. Para otro proyecto, reemplazá `dacal` (tenant),
`baleia` (project) **y** `baleia` en `data-subdomain` (el subdominio real
del proyecto en la plataforma — puede no ser igual al `project`, ver
"Modelo de URL" más arriba) — y la URL del poster / la unidad por los
datos reales. `data-aspect` acepta `"16/9"`, `"4/3"`, `"1/1"`, etc.
(default 16/9). `data-seo-json` es opcional: si lo pasás, el loader arma
el bloque indexable (nombre, lista de unidades con link a la página
canónica) y el JSON-LD a partir de ese JSON.

```html
<div
  class="tm-tour"
  data-tenant="baleia"
  data-project="baleia"
  data-subdomain="baleia"
  data-poster="https://baleia.vrottaprop360.com/poster.jpg"
  data-unit="B2-A"
  data-aspect="16/9"
  data-seo-json='{"name":"Baleia — Dacal","canonicalUrl":"https://dacal.com.uy/baleia","units":[{"label":"Unidad B2-A","url":"https://dacal.com.uy/baleia/b2-a"}]}'
></div>
<script src="https://cdn.vrottaprop360.com/v1.js" async></script>
```

Los ejemplos por plataforma de abajo usan la misma identidad (Baleia) y
sólo cambian dónde se pega cada bloque.

### WordPress

Pegalo en un bloque HTML personalizado (Gutenberg → bloque "HTML
personalizado") o en el `functions.php` del tema vía `wp_footer`. **Ojo**:
algunos plugins de optimización/minificación (Autoptimize, WP Rocket con
"minificar JS combinado", etc.) reescriben o eliminan atributos de
`<script>` al minificar — si el tour no carga, excluí `v1.js` de la
minificación/combinación del plugin (suelen tener una lista de exclusión
por URL).

```html
<!-- Bloque HTML personalizado -->
<div class="tm-tour" data-tenant="baleia" data-project="baleia" data-subdomain="baleia"
     data-poster="https://baleia.vrottaprop360.com/poster.jpg"
     data-unit="B2-A" data-aspect="16/9"></div>
<script src="https://cdn.vrottaprop360.com/v1.js" async></script>
```

### Webflow

Pegalo en **Page settings → Custom code → Before `</body>` tag** (o en
Site settings si querés que esté en todas las páginas). El contenedor
`.tm-tour` puede ir dentro de un Embed HTML component en el punto exacto
del layout donde va el tour.

```html
<!-- Embed HTML component, donde quieras el tour -->
<div class="tm-tour" data-tenant="baleia" data-project="baleia" data-subdomain="baleia"
     data-poster="https://baleia.vrottaprop360.com/poster.jpg"
     data-aspect="16/9"></div>

<!-- Footer code (una sola vez por página) -->
<script src="https://cdn.vrottaprop360.com/v1.js" async></script>
```

### Wix

Wix Embed (`<iframe>` de Wix, "HTML embebido") suele forzar una **altura
fija** al componente contenedor. Dale al widget de Wix una altura holgada
(ej. 500–600px) — el `.tm-tour` interno maneja su propio `aspect-ratio` y
el loader ajusta la altura real vía `postMessage` cuando el visor la
reporta, pero necesita que el widget de Wix no lo recorte con
`overflow:hidden` a una altura menor.

```html
<!-- Dentro del widget "Embebir HTML" de Wix -->
<div class="tm-tour" data-tenant="baleia" data-project="baleia" data-subdomain="baleia"
     data-poster="https://baleia.vrottaprop360.com/poster.jpg"
     data-aspect="16/9"></div>
<script src="https://cdn.vrottaprop360.com/v1.js" async></script>
```

### Squarespace

Bloque de código (Code Block), tipo HTML, insertado donde va el tour. Para
que corra en todas las páginas, usá **Settings → Advanced → Code
Injection → Footer**.

```html
<div class="tm-tour" data-tenant="baleia" data-project="baleia" data-subdomain="baleia"
     data-poster="https://baleia.vrottaprop360.com/poster.jpg"
     data-aspect="16/9"></div>
<script src="https://cdn.vrottaprop360.com/v1.js" async></script>
```

### HTML plano + jQuery (contenido inyectado dinámicamente)

El loader escanea el DOM una sola vez al cargar (o en `DOMContentLoaded`).
Si insertás el `.tm-tour` después con jQuery/AJAX, llamá a
`window.tumarcaEmbed.init()` vos mismo — es idempotente, así que podés
llamarlo de más sin miedo (ignora los elementos ya montados).

```html
<script src="https://cdn.vrottaprop360.com/v1.js" async></script>
<script>
  $(function () {
    $("#tour-slot").html(
      '<div class="tm-tour" data-tenant="baleia" data-project="baleia" data-subdomain="baleia" data-aspect="16/9"></div>'
    );
    // El <script> es async, puede no haber terminado de cargar todavía:
    if (window.tumarcaEmbed) {
      window.tumarcaEmbed.init();
    } else {
      window.addEventListener("load", () => window.tumarcaEmbed?.init());
    }
  });
</script>
```

### Next.js / React

Wrapper mínimo que monta el `<div class="tm-tour">`, carga el script una
sola vez, y llama a `init()` cuando el componente aparece (cubre
navegación client-side donde el nodo se vuelve a montar sin recargar la
página).

```tsx
"use client";
import { useEffect, useId } from "react";

declare global {
  interface Window {
    tumarcaEmbed?: { init: () => void; goToUnit: (el: Element, unitId: string) => void };
  }
}

const SCRIPT_ID = "tumarca-embed-v1";

function ensureScriptLoaded(onReady: () => void) {
  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    if (window.tumarcaEmbed) onReady();
    else existing.addEventListener("load", onReady, { once: true });
    return;
  }
  const script = document.createElement("script");
  script.id = SCRIPT_ID;
  script.src = "https://cdn.vrottaprop360.com/v1.js";
  script.async = true;
  script.addEventListener("load", onReady, { once: true });
  document.body.appendChild(script);
}

export function TourEmbed(props: {
  tenant: string;
  project: string;
  /** Subdominio público del proyecto en la plataforma, p.ej. "baleia"
   *  (`baleia.vrottaprop360.com`) — no siempre igual a `project`, ver
   *  "Modelo de URL" en el README de @r360/embed. */
  subdomain: string;
  poster?: string;
  unit?: string;
  aspect?: string;
}) {
  const reactId = useId();

  useEffect(() => {
    ensureScriptLoaded(() => window.tumarcaEmbed?.init());
  }, []);

  return (
    <div
      key={reactId} // fuerza remount (y por lo tanto data-tm-mounted limpio) si cambian los props
      className="tm-tour"
      data-tenant={props.tenant}
      data-project={props.project}
      data-subdomain={props.subdomain}
      data-poster={props.poster}
      data-unit={props.unit}
      data-aspect={props.aspect ?? "16/9"}
    />
  );
}
```

### Google Tag Manager

Tag tipo "HTML personalizado", trigger "All Pages" (o donde corresponda),
con "Support document.write" desactivado (el script no lo usa). El
contenedor `.tm-tour` en sí va en el HTML de la página, no en GTM — GTM
sólo inyecta el `<script>` del loader.

```html
<!-- Tag "HTML personalizado" en GTM -->
<script src="https://cdn.vrottaprop360.com/v1.js" async></script>
```

Los eventos del tour ya empujan a `window.dataLayer` automáticamente
(`tm_ready`, `tm_sceneView`, `tm_unitView`, `tm_lotClick`, `tm_leadIntent`,
`tm_deeplink`, `tm_error`, `tm_loadError`), con `instance` y el resto del
payload del mensaje. Para disparar un píxel de Meta Ads por unidad, un
trigger de evento personalizado `tm_lotClick` con la variable de dataLayer
`unitId` alcanza — no hace falta tocar código del embed.

## Deep links

La página madre usa `?tm_unit=B2-A&tm_scene=lobby`. Si hay más de un tour
en la página, cada uno usa un prefijo por índice de montaje:
`?t1_tm_unit=B2-A&t2_tm_unit=C4-B` (con un solo tour no hay prefijo). El
loader lee la URL al montar y se la pasa al iframe por query string (para
que no haya flash de la escena por defecto antes de aplicar el deep link),
y sincroniza cambios de escena/unidad con `history.replaceState` — nunca
`pushState`, para no ensuciar el historial de navegación del cliente.

## API pública

```ts
window.tumarcaEmbed.init(): void
```
Re-escanea el DOM en busca de `.tm-tour:not([data-tm-mounted])`. Llamalo
después de insertar contenido dinámicamente (SPA, jQuery, etc.).

```ts
window.tumarcaEmbed.goToUnit(el: Element, unitId: string): void
```
Comanda un tour ya montado (por ejemplo desde un link "Ver esta unidad" en
otro lugar de la página) para que salte a esa unidad.

## Estructura

```
src/
  v1.ts          # loader — montaje, IntersectionObserver, protocolo, fullscreen fallback, deep links, SEO
  protocol.ts    # contrato de mensajes tipado (el visor lo importa)
  config.ts      # funciones puras: parseo de dataset, aspect-ratio, deep links (testeadas con node:test)
  *.test.ts
demo/
  index.html         # arnés de protocolo: 2 tours simultáneos + log, sin backend
  mock-viewer.ts     # "visor" mínimo que habla protocol.ts de verdad, sin backend
  mock-viewer.html
  sitio-tercero.html # snippet REAL contra baleia.vrottaprop360.com — abrí este archivo directo
scripts/
  build.mjs        # esbuild → dist/v1.js (IIFE, ES2018, minificado) + reporte de tamaño gzip
  serve-demo.mjs   # server estático sin dependencias para demo/
```

## ¿Por qué ~4 KB y no más chico?

El grueso es: construcción de DOM del contenedor/poster/botón de play +
bloque SEO (con su `<script type="application/ld+json">`), el router de
mensajes con el `switch` de los 11 tipos entrantes, la lógica de fullscreen
fallback (guardar/restaurar scroll y estilos del `<body>`), y las funciones
puras de `config.ts` (parseo de aspect-ratio, deep links con prefijo por
instancia). No hay ninguna librería de terceros — es 100% código propio.
Si en el futuro se acerca al límite de 6 KB, los candidatos a recortar
primero son el bloque SEO (podría simplificarse a sólo JSON-LD, sin la
lista `<ul>` visualmente oculta) y los estilos inline del botón de play
(podrían moverse a una clase CSS más corta).
