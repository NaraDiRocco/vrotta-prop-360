# @r360/worker

API de Recorrido 360 en Cloudflare Workers (Hono + TypeScript). Sirve el
visor y `tour.json` desde R2 vía un puntero de versión en KV, publica nuevas
versiones, regenera `availability.json`, registra leads, y protege el embed
(CSP `frame-ancestors`, tokens de embed HMAC, anti-hotlink de tiles).

## Recursos a crear en Cloudflare

1. **KV namespace** (`TENANTS_KV`): config por tenant, punteros de versión
   activa, revocación de tokens.
   ```
   wrangler kv namespace create TENANTS_KV
   wrangler kv namespace create TENANTS_KV --preview
   ```
   Pegar los `id` / `preview_id` resultantes en `wrangler.toml`.

   Estructura de claves que este Worker asume en KV (documentarlo también en
   el panel/admin cuando se implemente la escritura de esta config):
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
   ```

4. **Ruta / dominio** del Worker: mapear `/t/*` y `/api/*` al dominio que
   sirva el producto (ej. `app.r360.io/*`), vía Workers Routes o un dominio
   custom en el dashboard.

## Layout de R2

```
t/{tenant}/{project}/v{N}/tour.json
t/{tenant}/{project}/v{N}/availability.json
t/{tenant}/{project}/v{N}/index.html          (shell del visor)
t/{tenant}/{project}/v{N}/tiles/...           (servidos directo desde R2, no por el Worker)
```

## Ruteo de tiles (por qué no pasan por el Worker)

Un panorama tiene cientos de tiles. Si cada uno pasara por este Worker
(lectura de R2 + invocación de Worker + egress), se triplicaría el costo por
tile y se le sumaría latencia de ida y vuelta al Worker a cada uno. En su
lugar, el visor pide los tiles directo al Custom Domain del bucket R2, que
cachea en el edge de Cloudflare. La protección anti-hotlink de esos tiles
(`src/lib/hotlink.ts`) está pensada para aplicarse ahí (regla WAF / Worker
satélite muy liviano en esa ruta), no en este Worker principal — la lógica
está implementada y testeada acá para que se reuse sin reinventarla.

## Endpoints

- `GET /t/:tenant/:project/*` — resuelve el puntero de versión activa (KV) y
  sirve el shell HTML / `tour.json` / assets versionados desde R2. Setea
  `Content-Security-Policy: frame-ancestors ...` por tenant (nunca
  `X-Frame-Options`, que no admite múltiples orígenes).
- `POST /api/publish` — arma el `TourManifest`, escribe en R2 con cache
  inmutable, y recién al final mueve el puntero en KV. Devuelve el detalle
  de etapas completadas; si falla antes del final, el puntero no se toca.
- `POST /api/rollback` — mueve el puntero a una versión anterior ya
  publicada. **No** revierte `availability.json` (los estados se leen en
  vivo) — la respuesta siempre incluye esa advertencia.
- `POST /api/availability/:tenant/:project/regenerate` — regenera
  `availability.json` desde Supabase, respetando `visibility` de precio
  (`p: null` si no es público). TTL corto (`max-age=30, s-maxage=60,
  stale-while-revalidate=300`). Pensado para dispararse desde un Supabase
  Database Webhook al cambiar `units` / `unit_prices`.
- `POST /api/leads` — registra el lead en Supabase **antes** de resolver el
  destino (form / webhook CRM del tenant / deep link de WhatsApp).
- `GET /api/health` — monitoreo.

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
pnpm --filter @r360/worker dev      # wrangler dev, con bindings simulados
```

## Deploy

```
pnpm --filter @r360/worker deploy
```

Requiere haber creado los recursos de la sección anterior y tener
`wrangler` autenticado (`wrangler login`).

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
- **Shell HTML del visor**: `serve.ts` espera encontrar
  `t/{tenant}/{project}/v{N}/index.html` en R2. Falta decidir/implementar
  cómo `apps/viewer` termina publicando ese shell junto con `tour.json` en
  el paso de publish (¿bundle estático compartido entre versiones, o un
  index.html por versión como está armado ahora?).
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
  (`REEMPLAZAR_CON_ID_DE_...`) — hay que pegarlos después de crear el
  namespace real.
