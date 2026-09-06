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
`supabase-js` logueado de verdad (`signInWithPassword`, con un JWT emitido
por GoTrue) hablando con el PostgREST local — el mismo camino que usa el
panel. Es más lento que pgTAP, pero para 45 tests no importa (corre en
~1.5s).

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

Fuera de alcance a propósito: todo lo de la migración **0021** (la
restrictiva, que le saca a la inmobiliaria estructura/escenas/publicar) y
la tabla `invitations` de la **0020** — ninguna de las dos existe todavía
en `supabase/migrations`. Cuando se escriban, este harness es el lugar
natural para sumarles sus tests (el plan ya lo prevé como paso posterior).

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
