# Harness de RLS — roles de plataforma e inmobiliaria

Prueba, contra un Supabase **local** de verdad, que las reglas de fila
(RLS) de Postgres separan a las inmobiliarias entre sí y respetan la
matriz de roles del plan (`platform_members` + `memberships.role`,
migraciones 0009–0019). Antes de esto no existía un solo test de RLS en el
proyecto.

## Por qué vitest + supabase-js, y no pgTAP

Se evaluaron las dos opciones del plan. Se eligió **vitest + supabase-js
contra `supabase start`** porque el bug real más caro que tuvo este
proyecto (migración 0015: `INSERT ... RETURNING` chocando contra la
policy de SELECT por el snapshot de las funciones `stable`) sólo se
manifiesta si el cliente hace exactamente lo que hace `supabase-js` en
producción: `.insert().select()`. Un test en pgTAP que hace
`select set_config('request.jwt.claims', ...)` a mano corre dentro de la
misma sesión SQL y no pasa por PostgREST, así que no reproduce ese camino.
Este harness sí: cada "usuario" de la matriz es un cliente de
`supabase-js` logueado de verdad (con un JWT emitido por GoTrue — ver más
abajo "Cómo se loguean los usuarios de prueba" para el detalle de cómo se
consigue esa sesión) hablando con el PostgREST local — el mismo camino que
usa el panel. Es más lento que pgTAP, pero para la cantidad de tests que
hay no importa (corre en ~1.5s).

## Qué cubre (matriz del plan, §7)

- **Aislamiento entre dos inmobiliarias (tenant A / tenant B) en las 11
  tablas relevantes** (`tenants`, `projects`, `groups`, `unit_types`,
  `units`, `scenes`, `hotspots`, `leads`, `publications`,
  `project_material`, `material_files`) más `platform_members`.
- Un `owner` de inmobiliaria no puede insertarse en `platform_members` ni
  crear un `tenant`.
- **Vrotta Operador**: ve proyectos de cualquier cliente; crea
  grupo/tipo/unidad/escena/hotspot/proyecto con `INSERT ... RETURNING`
  (la trampa del snapshot de 0015, reproducida contra un tenant ajeno);
  mueve estados en masa con `set_units_status`; sube a
  `storage.objects` bajo `material/<project>/...`; **no** puede crear un
  tenant, **no** puede borrar un proyecto, **no** puede gestionar un lead
  (`leads_update` lo excluye a propósito).
- **Vrotta Admin**: crea tenant con `RETURNING`, borra proyecto, borra
  tenant, se inserta en `platform_members`, gestiona leads.
- **Vendedor (`sales`)**: sólo ve/opera el proyecto que le asignaron vía
  `membership_projects` (hay un segundo proyecto en el tenant A, sin
  asignar, para probar que el scoping es real); no ve precios
  `on_request`; `set_units_status` funciona en su proyecto y falla en
  cualquier otro (mismo tenant o ajeno); no puede hacer `UPDATE` directo
  sobre `units` (sólo vía la RPC).
- **Vista `project_health`** (0018): el owner ve sólo su fila, Vrotta
  Operador ve las dos, `anon` no ve ninguna.
- **`leads_update`**: owner/editor/admin de plataforma pueden gestionar
  un lead propio; Vrotta Operador no; nadie puede tocar un lead de otro
  tenant.
- **Trigger `units_tenant_update_guard`**: owner y editor pueden cambiar
  `status`, `area_total_m2` y `attrs`; ninguno de los dos puede cambiar
  `code`, `group_id` ni `unit_type_id` (eso es "estructura", la administra
  Vrotta); Vrotta Operador puede cambiar cualquier columna, incluido
  `code`.
- **Storage del bucket `material`**: aislamiento por carpeta de proyecto
  (un owner de A no ve ni puede subir dentro de la carpeta del proyecto
  de B).
- **Invitaciones (`invitations`, migración 0020)**: aceptar con un email
  distinto al de la invitación falla (no es transferible); aceptar una
  invitación vencida falla; aceptar una revocada falla; aceptar dos veces
  el mismo token no duplica el membership (idempotente: la segunda vez
  falla porque ya tiene `accepted_at`); el token en claro no aparece en
  ningún `select` de la tabla — ni con la sesión de un owner (RLS) ni con
  el service client (la tabla, tal como la define 0020, ni siquiera tiene
  una columna para guardarlo).

Fuera de alcance a propósito: todo lo de la migración **0021** (la
restrictiva, que le saca a la inmobiliaria estructura/escenas/publicar) —
todavía no existe en `supabase/migrations`. Cuando se escriba, este
harness es el lugar natural para sumarle sus tests (el plan ya lo prevé
como paso posterior).

## Cómo se loguean los usuarios de prueba (y por qué no es `signInWithPassword`)

Los seis usuarios de la matriz (`lib/fixtures.ts`) y la usuaria invitada del
bloque de `invitations` (`rls.test.ts`) se crean con
`svc.auth.admin.createUser({ email_confirm: true })` — la API de
administración, con `service_role`, que ya bypasea `enable_signup`. Eso es
necesario pero **no alcanza**: conseguirles una sesión con la que ejercitar
las policies de RLS no se puede hacer con `signInWithPassword`.

Este local corre con `GOTRUE_EXTERNAL_EMAIL_ENABLED=false` (lo pone
`supabase/config.toml` → `[auth.email] enable_signup = false`, R360 hallazgo
B7: la inmobiliaria no se autoregistra, la da de alta la dueña a mano). El
comentario de ese `config.toml` asume que el flag "no afecta el login con
contraseña (`/token`)... son endpoints distintos, gotrue los sigue
sirviendo igual para los usuarios que ya existen". **Esa asunción es
incorrecta** en gotrue v2.188.1 (la que trae este proyecto): se verificó a
mano pegándole directo a la API, sin pasar por `supabase-js`—

```bash
curl -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"...","password":"..."}'
# → 422 {"error_code":"email_provider_disabled","msg":"Email logins are disabled"}
```

—contra un usuario recién creado y confirmado por la API de administración.
El flag apaga el proveedor "email" **entero**, signup y login por igual, no
sólo el alta. Por eso `pnpm test` fallaba entero en el `beforeAll` con
exactamente ese mensaje, aunque el usuario de prueba se hubiera creado bien.

La salida (también verificada a mano, mismo método) es generar un magic
link con `service_role` vía `auth.admin.generateLink({ type: 'magiclink',
email })` — otro endpoint de administración, que no pasa por el chequeo de
"proveedor habilitado" — y canjear el `hashed_token` que devuelve con
`client.auth.verifyOtp({ type: 'magiclink', token_hash })` desde el cliente
anon. Esa ruta sí funciona con el proveedor apagado, y entrega una sesión
(`access_token` + `refresh_token`) igual de real que la que usa el panel.
Queda envuelta en `loginViaAdminMagicLink` (`lib/fixtures.ts`), exportada y
reusada en `rls.test.ts`.

**No volver a `signInWithPassword`** para loguear usuarios de prueba: con
`enable_signup = false` (una decisión de seguridad deliberada, no algo para
tocar por comodidad de testing) siempre va a fallar con el mismo 422, sin
importar cómo se haya creado el usuario.

## Cómo correrlos

Hace falta Docker corriendo y el CLI de Supabase (`supabase`). Este
harness **nunca** debe apuntar al VPS de producción (179.199.142.5): hay
una barrera en `lib/env.ts` que aborta si `SUPABASE_URL` no es
`127.0.0.1`/`localhost`, aunque alguien la pise por variable de entorno.

```bash
# 1. Levantar Supabase local con TODAS las migraciones (incluida 0019) y el seed.
supabase start
supabase db reset   # sólo si el local ya estaba corriendo con migraciones viejas

# 2. Instalar las dependencias de este harness (una sola vez; no es parte
#    del workspace de pnpm — ver nota más abajo).
cd supabase/tests/rls
pnpm install

# 3. Correr los tests.
pnpm test
```

O, desde la raíz del repo, una vez instalado:

```bash
pnpm test:rls
```

Si no hay un Supabase local respondiendo en `SUPABASE_URL` (por defecto
`http://127.0.0.1:54921`, el puerto de `supabase/config.toml`), la suite
entera se **salta** (no falla) con un mensaje explícito. Es la razón por
la que `pnpm test:rls` nunca puede romper el `pnpm test` de la raíz.

### Por qué `supabase/tests/rls` tiene su propio `package.json` (y su propio `pnpm-workspace.yaml`)

`pnpm-workspace.yaml` de la raíz sólo incluye `packages/*` y `apps/*`:
este directorio queda afuera a propósito, así **`pnpm -r test` en la raíz
nunca lo toca** (los 744 tests existentes siguen corriendo exactamente
igual, sin este harness ni sus dependencias en el medio). El
`pnpm-workspace.yaml` vacío (`packages: []`) que hay acá adentro es lo que
le permite a `pnpm install` tratar esta carpeta como un proyecto aparte en
vez de intentar resolverla contra el workspace de todo el monorepo.

## Limpieza

Cada corrida crea sus propios tenants/usuarios (con un sufijo aleatorio
por corrida) y los borra en un `afterAll`. El orden de borrado importa:
primero los tenants (la cascada se lleva puestas las filas de
`unit_status_log`, que referencian al usuario que cambió el estado sin
`ON DELETE CASCADE`), recién después los usuarios de `auth.users` — al
revés, el borrado del usuario falla calladito por esa FK y queda
huérfano. Si por lo que sea una corrida quedó a mitad camino (se mató el
proceso, cayó Docker), un `supabase db reset` deja todo limpio de nuevo.
