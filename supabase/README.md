# Supabase — esquema de Recorrido 360

Esquema multi-tenant completo: tenants → proyectos → estructura (grupos,
tipos de unidad, unidades) → escenas/hotspots → publicaciones/leads/jobs.
Los nombres de enums y campos siguen exactamente el contrato compartido en
`packages/core/src/{status.ts,types.ts}`.

## Cómo aplicar las migraciones

Con la CLI de Supabase (recomendado, desde la raíz del monorepo):

```bash
supabase link --project-ref <tu-project-ref>
supabase db push
```

Esto aplica en orden todos los archivos de `supabase/migrations/`
(`0001_...sql` a `0014_...sql`). Son idempotentes: usan
`create table if not exists`, `create or replace function`,
`drop policy if exists` + `create policy`, `create index if not exists`,
etc., así que correr `db push` de nuevo sobre un esquema ya aplicado no
rompe nada.

Alternativa manual con `psql` (por ejemplo contra un Postgres local o el
pooler de un proyecto Supabase):

```bash
for f in supabase/migrations/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
```

### Orden y contenido de las migraciones

| Archivo | Contenido |
|---|---|
| `0001_extensions_and_enums.sql` | `pgcrypto`, enums (`unit_status`, `project_kind`, `scene_kind`, `geometry_kind`, `hotspot_target_kind`, `price_visibility`, `job_status`, `membership_role`) |
| `0002_tenants_memberships.sql` | `tenants`, `memberships`, `membership_projects` |
| `0003_projects.sql` | `projects` (+ FK diferida de `membership_projects`) |
| `0004_structure.sql` | `groups` (auto-referente), `unit_types`, `units` |
| `0005_pricing_and_status_log.sql` | `unit_prices`, `unit_status_log` + trigger de auditoría + `updated_at` |
| `0006_scenes_hotspots.sql` | `scenes`, `hotspots` (CHECKs de target único + índice único parcial) |
| `0007_publications_leads_jobs_saved_views.sql` | `publications`, `leads`, `jobs`, `saved_views` |
| `0008_tenant_denormalization.sql` | Triggers que completan `tenant_id` en `groups`/`unit_types`/`units`/`scenes` (desde `project_id`) y en `hotspots` (desde `scene_id`) |
| `0009_auth_functions.sql` | `auth_tenant_ids()`, `auth_role_for_tenant()`, `auth_accessible_project_ids()`, `auth_role_for_project()` |
| `0010_rls.sql` | `enable row level security` + policies deny-by-default en las 15 tablas |
| `0011_rpc_set_units_status.sql` | RPC `set_units_status(p_filter jsonb, p_status text, p_note text)` |
| `0012_project_health_view.sql` | Vista `project_health` |
| `0013_availability_json.sql` | Función `generate_availability_json(p_project_id uuid)` |
| `0014_indexes.sql` | Índices de consulta (project+status, project+group, prefijo de código) |

## Cómo correr el seed

`supabase/seed.sql` carga el proyecto **Baleia** (Punta Ballena, Uruguay,
`kind = complejo`, lat `-34.901110` / lng `-55.039971`): 5 grupos tipo
`bloque` (Bloque 1 a 5), los tipos de unidad `duplex` y `1dorm` con su
`attr_schema`, y las 20 unidades documentadas (Bloque 2: A–E dúplex + F–I de
1 dormitorio; Bloque 3: A–C dúplex + D–K de 1 dormitorio), con estados y
precios variados para poder demostrar la matriz de permisos y
`project_health`.

Usa UUIDs fijos (no `gen_random_uuid()`) y `on conflict (id) do nothing`,
así que es seguro correrlo más de una vez.

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
# o, con la CLI:
supabase db reset   # aplica migraciones + seed.sql automáticamente
```

El seed **no** crea usuarios de `auth.users` ni `memberships`: eso depende
del flujo real de signup (Supabase Auth). Al final del archivo hay un
`insert into memberships (...)` de ejemplo, comentado, para vincular un
usuario ya creado como `owner` del tenant `baleia`
(`a0000000-0000-0000-0000-000000000001`).

## Matriz de permisos (RLS)

Todas las tablas tienen RLS habilitada con deny-by-default: sin policy para
una operación, esa operación queda denegada para cualquier rol que no sea
`service_role` (que sigue bypasseando todo, como es estándar en Supabase).

| | owner | editor | sales |
|---|---|---|---|
| Ver proyectos asignados | ✓ | ✓ | ✓ (todos los del tenant, o sólo los de `membership_projects` si está scopeado) |
| Cambiar estado de unidad | ✓ (UPDATE directo o RPC) | ✓ (UPDATE directo o RPC) | ✓ (**sólo** vía RPC `set_units_status`, que es `security definer`) |
| Ver/editar precios (`unit_prices`) | ✓ CRUD completo | ✓ CRUD completo | Sólo lectura, y sólo filas con `visibility = 'public'` |
| Ver leads | ✓ | ✓ | ✓ |
| Editar hotspots/escenas/estructura (`groups`, `unit_types`, `scenes`, `hotspots`, alta/baja/edición de `units`) | ✓ | ✓ | ✗ |
| Publicar (`publications`, insert) | ✓ | ✓ | ✗ |
| Configuración del tenant (`tenants`, update) | ✓ | ✗ | ✗ |

Notas de implementación:

- `auth_tenant_ids()` / `auth_accessible_project_ids()` / `auth_role_for_project()`
  son `security definer stable`: las usan las policies para no tener que
  volver a evaluar RLS sobre `memberships`/`projects` en cada chequeo.
- El scoping de un membership a un subconjunto de proyectos es opcional:
  si `membership_projects` no tiene filas para ese `membership_id`, el
  usuario ve **todos** los proyectos del tenant; si tiene filas, sólo ve
  los ahí listados. Pensado sobre todo para vendedores (`sales`) atados a
  proyectos puntuales.
- `unit_status_log` no tiene policy de `insert` para usuarios: sólo se
  escribe desde el trigger `units_status_change_log`, que corre como dueño
  de la tabla y por lo tanto bypassea la RLS (patrón estándar).
- `leads` permite `insert` a los roles `anon`/`authenticated` sin
  restricción de rol (además del `select` para los 3 roles del tenant):
  el formulario de contacto del visor público no tiene sesión de
  Supabase.

## RPC `set_units_status`

```sql
select set_units_status(
  jsonb_build_object('project_id', '<uuid>', 'group_id', '<uuid>'), -- filtro
  'reservado',                                                      -- nuevo estado
  'reserva por asesor comercial'                                    -- nota (opcional)
);
```

Claves soportadas en `p_filter` (todas opcionales salvo `project_id`):
`group_id`, `unit_type_id`, `status_in` (array de estados actuales),
`code_in` (array de códigos), `code_prefix` (para algo como `'B2-'`).
Devuelve la cantidad de unidades actualizadas. Es `security definer`: valida
a mano el acceso del usuario al tenant/proyecto (usa
`auth_role_for_tenant`/`auth_accessible_project_ids`) antes de tocar nada,
porque al ser `definer` bypassea la policy de `UPDATE` directo sobre
`units` (que es sólo owner/editor). Cada fila afectada queda en
`unit_status_log` automáticamente, con la nota pasada vía
`set_config('app.status_change_note', ...)`.

## Vista `project_health`

`select * from project_health` devuelve, por proyecto: unidades sin
polígono (`units_without_geometry`), escenas con jobs fallidos
(`scenes_with_failed_jobs`), unidades públicas sin precio vigente
(`public_units_without_current_price`), si hay escena inicial configurada
(`has_initial_scene`, lee `projects.settings->>'initial_scene_id'`) y si hay
dominios autorizados (`has_authorized_domains`, lee
`projects.settings->'allowed_domains'`). Es una vista simple (no
`security_barrier`), así que hereda la RLS de las tablas de base: cada
usuario sólo ve la salud de los proyectos a los que ya tiene acceso.

## Función `generate_availability_json`

```sql
select generate_availability_json('<project_id>');
```

Devuelve el `jsonb` con la forma exacta de `AvailabilityFile`
(`packages/core/src/types.ts`): `{ v, generated_at, units: { [code]: { s, p } } }`.
`p` viaja en `null` si no hay un `unit_prices` vigente con
`visibility = 'public'` — el precio nunca sale del backend si la
visibilidad no lo permite. No es `security definer`: corre con los
privilegios (y la RLS) de quien la llama; el proceso real de publish debe
invocarla con `service_role` desde el backend para ver todas las unidades
del proyecto sin restricciones.

## Qué se verificó y cómo

No hay Postgres accesible por defecto en este entorno, pero **sí** se pudo
verificar de punta a punta: se levantó un contenedor Docker descartable con
`postgres:16` (sin las extensiones/roles propios de Supabase Auth/Storage),
se le agregó un stub mínimo de `auth.users` + `auth.uid()` + roles
`anon`/`authenticated`/`service_role`, y sobre eso se corrieron, en orden,
las 14 migraciones y `seed.sql`. Se confirmó explícitamente:

- Las 14 migraciones aplican sin errores de sintaxis y son re-aplicables
  (segunda pasada sin fallos, gracias a los guards de idempotencia).
- El seed carga las 20 unidades de Baleia sin violar ningún constraint.
- `project_health` y `generate_availability_json()` devuelven los valores
  esperados sobre los datos del seed (10 unidades públicas sin precio
  vigente, precios en `null` para visibilidad `on_request`/`private`, etc).
- RLS end-to-end con tres usuarios reales (`owner`/`editor`/`sales`)
  conectados con un rol restringido tipo `authenticated`:
  - `sales` puede leer proyectos/unidades, ve sólo los `unit_prices`
    públicos, **no puede** hacer `UPDATE` directo sobre `units.status`
    (0 filas afectadas), y **sí** puede cambiar 11 unidades de una sola
    vez con `set_units_status(...)`, quedando el `unit_status_log`
    completo con `changed_by` y la nota.
  - `editor` puede crear `scenes`/`hotspots` (con `tenant_id` autocompletado
    por trigger) y **no puede** modificar `tenants.settings` (0 filas).
- Los CHECK de `hotspots` (a lo sumo un target, `target_kind` coherente con
  el target seteado) y el índice único parcial `(scene_id, unit_id)`
  rechazan filas inválidas/duplicadas.
- El índice único de `groups` sobre `(project_id, parent_id ?? sentinel, code)`
  rechaza códigos duplicados dentro del mismo proyecto/padre, incluyendo
  el caso `parent_id is null`.

### Pendiente de verificar (no se pudo probar en este entorno)

- **`auth.users` real de Supabase**: se verificó contra un stub (una tabla
  con `id`+`email` y una función `auth.uid()` que lee
  `request.jwt.claim.sub`). El comportamiento debería ser idéntico en un
  proyecto Supabase real (mismo mecanismo de JWT → `auth.uid()`), pero no
  se probó contra una instancia real de GoTrue/Auth.
- **`storage`**: no hay tablas de Storage en este esquema (los buckets de
  tiles/paneles se asumen fuera de este alcance); si el editor sube media a
  Storage, sus propias policies de bucket son un tema aparte.
- **Rendimiento a escala real** (miles de unidades, `EXPLAIN ANALYZE` de
  `set_units_status` y `project_health` con datos grandes): sólo se probó
  con el volumen chico del seed (20 unidades).
- **CLI `supabase db push` / `supabase db reset`** contra un proyecto real:
  se simuló el flujo aplicando los archivos uno por uno con `psql`, no con
  la CLI en sí, aunque el SQL es estándar y no debería haber diferencia.
- **Políticas de `jobs`/`leads`/`publications` frente al backend real** de
  procesamiento de tiles y de publish: se asume que ese backend usa la
  `service_role` key (bypassea RLS); no hay un backend real contra el cual
  probar esa integración en este entorno.
