# @r360/worker

API de Vrotta Prop 360 (Hono + TypeScript). Sirve el visor y `tour.json` vía
un puntero de versión, publica nuevas versiones, regenera
`availability.json`, registra leads, resuelve el proyecto por subdominio o
dominio propio, inyecta las etiquetas Open Graph de cada proyecto en el
shell, y protege el embed (CSP `frame-ancestors`, tokens de embed HMAC,
anti-hotlink de tiles).

> **Dónde corre hoy: Node en el VPS, no Cloudflare Workers.** Este paquete se
> escribió originalmente contra Cloudflare (KV + R2, ver `wrangler.toml`), pero
> la publicación real (ver `DESPLIEGUE-VPS.md` en la raíz del repo, sección 0)
> lo corre como proceso Node (`src/server.ts`, contenedor `r360-worker` en el
> VPS), con dos adaptadores propios sobre el filesystem
> (`src/lib/kv-fs.ts`, `src/lib/storage-fs.ts`) en lugar de bindings reales de
> Cloudflare. Las rutas Hono (`src/index.ts`) no saben ni les importa cuál de
> los dos arranca el proceso — `env.ts` sólo pide la forma mínima de un KV y
> un storage de objetos, así que el mismo código sigue pudiendo correr en
> Cloudflare (`wrangler dev` / `wrangler deploy`, sección siguiente) si algún
> día conviniera volver. Lo que sigue documenta las dos formas; la que se usa
> en producción hoy es la del VPS.

## Cómo corre en producción: Node en el VPS

`src/server.ts` arma el `Env` que las rutas esperan a partir de variables de
entorno, valida que estén TODAS antes de levantar el server (falla ruidoso,
nunca "a medias"), y sirve con `@hono/node-server`. Variables obligatorias:

| Variable | Qué es |
|---|---|
| `EMBED_HMAC_SECRET` | Secreto HMAC-SHA256 para firmar/verificar tokens de embed |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | Acceso a Supabase con la service role key |
| `PUBLISH_SECRET` | Compartido con `apps/admin` (ahí `R360_PUBLISH_SECRET`); protege `/api/publish`, `/api/rollback` y `/api/availability/:tenant/:project/regenerate` |
| `R360_STORAGE_ROOT` | Directorio en disco donde persisten `tour.json` / `availability.json` / shell HTML por versión — reemplaza al bucket R2 (`src/lib/storage-fs.ts`) |
| `R360_KV_ROOT` | Directorio en disco donde persisten punteros de versión, config de tenant y contadores de rate limit — reemplaza a `TENANTS_KV` (`src/lib/kv-fs.ts`) |
| `R360_PLATFORM_HOST` | Host fijo del panel/API de la plataforma (ej. `app.vrottaprop360.com`) — el `Host:` que NO se trata como proyecto |
| `R360_PAGES_DOMAIN` | Dominio base de los subdominios de proyecto (ej. `vrottaprop360.com`, para `{subdominio}.vrottaprop360.com`) |

**Limitación consciente de los adaptadores de disco: un solo nodo.** Son un
mapa clave/valor respaldado en archivos de UN proceso Node, sin lock entre
procesos — documentado en detalle en `src/lib/kv-fs.ts`. Con una sola réplica
(la situación actual) esto no es un descuido; si el worker llegara a correr
en más de una instancia detrás de un load balancer, el puntero de versión y
el rate limit dejarían de ser confiables y este es el archivo a reemplazar
por un backend compartido de verdad (Redis, Postgres, o volver a un KV real).

Los tiles (cientos por panorama) **tampoco pasan por este Worker** en el VPS:
los sirve `r360-media`, un nginx aparte que lee el mismo árbol de
`R360_STORAGE_ROOT` con soporte de rangos — ver `DESPLIEGUE-VPS.md` sección
0. Es la versión en disco de lo que en Cloudflare hacía el Custom Domain del
bucket R2 (ver más abajo): evitar que cada tile pague lectura + invocación +
egress del Worker/proceso principal.

## Alternativa (no usada hoy): Cloudflare Workers

El código sigue siendo compatible con Cloudflare tal cual se escribió
originalmente — `wrangler.toml` apunta a `src/index.ts`, el mismo entrypoint
Hono que usa `server.ts`. Para correrlo ahí en vez de en el VPS:

1. **KV namespace** (`TENANTS_KV`): config por tenant, punteros de versión
   activa, revocación de tokens.
   ```
   wrangler kv namespace create TENANTS_KV
   wrangler kv namespace create TENANTS_KV --preview
   ```
   Pegar los `id` / `preview_id` resultantes en `wrangler.toml` (hoy son
   placeholders, `REEMPLAZAR_CON_ID_DE_...`).

   Estructura de claves que este Worker asume en KV (la misma que usan hoy
   los adaptadores de disco, sólo cambia el backend):
   - `tenant:{tenant}` → `{ active: boolean, allowedAncestors: string[], allowedTileHosts?: string[], crmWebhookUrl?: string, requireEmbedToken?: boolean }`
   - `ptr:{tenant}:{project}` → `{ version: number, history: number[] }`
   - `revoked:{tenant}` → `{ revokedAt?: number, revokedKids?: string[] }`

2. **R2 bucket**: `tour.json`, `availability.json` y el shell HTML del visor,
   por versión. Los TILES también viven acá pero **no pasan por este
   Worker** — se sirven directo del dominio público del bucket con Cloudflare
   cache delante (ver `src/routes/serve.ts` y `src/lib/hotlink.ts`).
   ```
   wrangler r2 bucket create r360-tours
   wrangler r2 bucket create r360-tours-preview
   ```
   Configurar un **Custom Domain** para el bucket (Cloudflare Dashboard → R2
   → bucket → Settings → Custom Domains) para que los tiles se sirvan con
   caché de Cloudflare y sin pasar por el Worker.

3. **Secrets** (nunca en `wrangler.toml` ni en el repo):
   ```
   wrangler secret put EMBED_HMAC_SECRET
   wrangler secret put SUPABASE_URL
   wrangler secret put SUPABASE_SERVICE_KEY
   wrangler secret put PUBLISH_SECRET
   ```

4. **Ruta / dominio** del Worker: mapear `/t/*` y `/api/*` al dominio que
   sirva el producto, vía Workers Routes o un dominio custom en el dashboard.

## Layout de las claves (hoy: rutas bajo `R360_STORAGE_ROOT`; en Cloudflare: R2)

```
t/{tenant}/{project}/v{N}/tour.json
t/{tenant}/{project}/v{N}/availability.json
t/{tenant}/{project}/v{N}/index.html          (shell del visor)
t/{tenant}/{project}/v{N}/tiles/...           (servidos aparte: r360-media en el VPS, R2 en Cloudflare)
```

## Ruteo de tiles (por qué no pasan por el Worker)

Un panorama tiene cientos de tiles. Si cada uno pasara por este Worker
(lectura de storage + invocación + egress), se triplicaría el costo por tile
y se le sumaría latencia de ida y vuelta a cada uno. En el VPS los sirve
`r360-media` (nginx) directo del disco; en Cloudflare los serviría el Custom
Domain del bucket R2, cacheado en el edge. La protección anti-hotlink de esos
tiles (`src/lib/hotlink.ts`) está pensada para aplicarse en ESE servicio
liviano, no en este Worker principal — la lógica está implementada y
testeada acá para que se reuse sin reinventarla.

## Endpoints

- `GET /t/:tenant/:project/*` — resuelve el puntero de versión activa y sirve
  el shell HTML / `tour.json` / assets versionados. Setea
  `Content-Security-Policy: frame-ancestors ...` por tenant (nunca
  `X-Frame-Options`, que no admite múltiples orígenes). Al servir el shell
  (`index.html`), inyecta las etiquetas Open Graph / Twitter Card del
  proyecto (ver más abajo).
- **Ruteo por hostname** (`app.notFound` en `src/index.ts`, `serveByHost` en
  `src/routes/serve.ts`) — cualquier pedido que no matchea ninguna ruta
  explícita llega acá con un path "pelado" (`/`, `/tour.json`, `/assets/x.js`)
  porque el proyecto se identificó por el header `Host`, no por
  `/t/:tenant/:project/`. Resuelve el host a `(tenant, project)` de dos
  formas (`src/lib/host-routing.ts`, `supabase/migrations/0022_project_domains.sql`):
  subdominio de plataforma (`{label}.R360_PAGES_DOMAIN` → `projects.subdomain`)
  o dominio propio del cliente (`project_domains.status = 'verified'`). Sirve
  exactamente lo mismo que `GET /t/:tenant/:project/*`, con caché en memoria
  (TTL 60s, tope de entradas) delante de la consulta a Supabase.
- `POST /api/publish` — arma el `TourManifest`, escribe con cache inmutable,
  y recién al final mueve el puntero. Devuelve el detalle de etapas
  completadas; si falla antes del final, el puntero no se toca.
- `POST /api/rollback` — mueve el puntero a una versión anterior ya
  publicada. **No** revierte `availability.json` (los estados se leen en
  vivo) — la respuesta siempre incluye esa advertencia.
- `POST /api/availability/:tenant/:project/regenerate` — regenera
  `availability.json` desde Supabase, respetando `visibility` de precio
  (`p: null` si no es público). TTL corto (`max-age=30, s-maxage=60,
  stale-while-revalidate=300`). Pensado para dispararse desde un Supabase
  Database Webhook al cambiar `units` / `unit_prices`.
- `POST /api/leads` — registra el lead en Supabase **antes** de resolver el
  destino (form / webhook CRM del tenant / deep link de WhatsApp). Con rate
  limit (`src/lib/rate-limit.ts`) porque inserta con la service key sin
  autenticación de por medio.
- `GET /api/health` — monitoreo.

## Tarjeta de previsualización (Open Graph)

`src/lib/og-tags.ts`, usado desde `routes/serve.ts` al servir el shell. Un
recorrido circula por WhatsApp, y el shell del visor es el MISMO archivo para
todos los proyectos del SaaS — no se puede fijar una imagen en el HTML sin
que le muestre la portada de un proyecto a la tarjeta de otro. El Worker arma
`og:title` / `og:description` / `og:image` / `og:url` por request, a partir
del `tour.json` de la versión activa y del `Host` real de la visita (para que
la URL de la tarjeta apunte al subdominio o dominio propio que se usó). Si el
manifiesto no tiene ni imagen ni descripción cargada, esas etiquetas
simplemente no se emiten — nunca se manda una imagen rota. Si el shell no
tiene un `</head>` reconocible, se sirve sin tocar: que falte la tarjeta es
un detalle, que no cargue el recorrido no.

## Seguridad (`src/lib/`)

- `csp.ts` — `frame-ancestors` por tenant desde KV. Tenant inexistente,
  inactivo, o sin ancestros configurados → `'none'` (fail closed).
- `embed-token.ts` — firma/verifica tokens HMAC-SHA256 con `crypto.subtle`
  (sin librerías externas, corre igual en Workers y Node). Comparación de
  firma en tiempo constante. Revocación por tenant (`revoked:{tenant}` en
  KV) independiente del TTL del token, para cortar acceso al instante.
- `hotlink.ts` — protección de tiles: `Sec-Fetch-Site` como señal primaria
  (no falsificable por el cliente), `Referer` como secundaria sólo cuando la
  primera no está. Un `Referer` ausente **no** bloquea por sí solo.

## Desarrollo

```
pnpm install
pnpm --filter @r360/worker typecheck
pnpm --filter @r360/worker test
pnpm --filter @r360/worker dev      # wrangler dev — sólo sirve si se cargaron los ids de KV/R2, ver "Alternativa" arriba
```

Para probar el entrypoint que realmente corre en producción (`src/server.ts`)
hace falta setear a mano las variables de la tabla de arriba y correrlo con
`tsx`/`node --experimental-strip-types` apuntando a `src/server.ts`, con
`R360_STORAGE_ROOT`/`R360_KV_ROOT` apuntando a un directorio temporal.

## Deploy

En producción **no se usa `wrangler deploy`** — se publica con
`bash tools/deploy/publicar-plataforma.sh <tenant> <proyecto>` (ver
`DESPLIEGUE-VPS.md` en la raíz del repo), que sube el shell del visor y la
media al VPS y llama a `/api/publish`. Actualizar el propio binario del
Worker en el VPS es correr `pnpm --filter @r360/worker bundle` (esbuild →
`dist/worker.mjs`, ~150 KB) y reemplazar ese archivo en el contenedor
`r360-worker`.

`pnpm --filter @r360/worker deploy` (`wrangler deploy`) sigue existiendo para
la alternativa de Cloudflare de la sección de arriba, pero no es el camino
que usa este proyecto hoy.

## TODOs explícitos

- **`buildManifestFromSupabase`** (`src/routes/publish.ts`) ya consulta las
  tablas reales (`groups`, `unit_types`, `units`, `scenes`, `hotspots` de
  `supabase/migrations/0004_structure.sql` y `0006_scenes_hotspots.sql`) y
  arma un `TourManifest` completo, pero no está probado contra datos reales
  (sólo compila y respeta los tipos). Ojo particular con `hotspots`: se
  arma `action`/`unitCode` a partir de `target_kind` + `unit_id` /
  `target_scene_id` + `meta` (jsonb libre) — si el shape real de `meta` que
  termina usando el editor/admin difiere de `{ zIndex?, label?, url? }`, hay
  que ajustar el mapeo.
- **`/api/availability/.../regenerate`** ahora llama al RPC
  `generate_availability_json` (`0013_availability_json.sql`) en vez de
  reimplementar la query — mucho menos superficie de bug. Esa función
  hardcodea `v: 1` en su salida; el Worker lo pisa con la versión activa real
  de KV antes de escribir a R2. Si se cambia la función para que reciba la
  versión como parámetro, se puede simplificar `availability.ts` acorde.
- **`/api/leads`** inserta en la tabla real `leads(project_id, unit_id,
  channel, payload jsonb)` (`0007_publications_leads_jobs_saved_views.sql`),
  resolviendo `unitCode → unit_id` contra `units`. Falta decidir si conviene
  un índice/constraint adicional para ese lookup si el volumen de leads
  crece mucho (hoy es una query simple por `project_id + code`, ya indexado
  vía `units_project_id_idx`, pero no hay índice sobre `code` solo).
- **`publications` / `projects.published_version`**: `publish.ts` ahora
  también inserta en `publications` (histórico versionado en Postgres, lo
  que lee el panel/admin) y actualiza `projects.published_version`, pero
  ambos son best-effort DESPUÉS de mover el puntero de KV — si fallan, el
  puntero (fuente de verdad para el visor) ya se movió igual y sólo queda
  desincronizado el histórico/admin. Falta decidir si eso es aceptable o si
  hace falta un job de reconciliación.
- **Notificación por email en `/api/leads` canal `form`**: no implementada,
  requiere elegir proveedor de email (Resend, Postmark, etc.) y agregar su
  API key como secret.
- **Escritura de la config de tenant en KV** (`tenant:{tenant}`,
  `allowedAncestors`, `crmWebhookUrl`, `requireEmbedToken`): este Worker sólo
  la lee. Falta el flujo de administración (probablemente en `apps/admin`)
  que la escriba. Nota: `tenants.settings jsonb` ya existe en Postgres
  (`0002_tenants_memberships.sql`) — probablemente esa sea la fuente que se
  sincroniza hacia KV (vía trigger/webhook, similar a availability), en vez
  de escribirse en KV directamente desde el admin. Queda por decidir.
- **RLS**: este Worker usa `SUPABASE_SERVICE_KEY` (service_role), que
  bypassea Row Level Security (`0010_rls.sql`) a propósito — es un backend de
  confianza, no un cliente del navegador. Cualquier query nueva que se
  agregue acá debe filtrar explícitamente por `tenant`/`project` en el WHERE
  (como ya hacen `resolve.ts` y las rutas existentes): no hay RLS que
  compense un filtro faltante.
- **Tokens de embed**: `serve.ts` los valida sólo si `requireEmbedToken` está
  en `true` para el tenant (opt-in). Falta el endpoint/flujo que los emita
  (`signEmbedToken`) — hoy sólo existe la firma/verificación como librería.
- **Tests**: son unitarios puros sobre las funciones de `src/lib/` (csp,
  embed-token, hotlink), corridos con `vitest` en Node — no se usa
  `@cloudflare/vitest-pool-workers` porque no hacía falta el runtime real de
  Workers para probar esta lógica. Si más adelante se agregan tests de
  integración de las rutas Hono con bindings reales de KV/R2, ahí sí conviene
  sumar `@cloudflare/vitest-pool-workers`.
- **`wrangler.toml`**: los `id` / `preview_id` de KV son placeholders
  (`REEMPLAZAR_CON_ID_DE_...`) — sólo importa si algún día se vuelve a la
  alternativa de Cloudflare; hoy el deploy real no lee este archivo.
