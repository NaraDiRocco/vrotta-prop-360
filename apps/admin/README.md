# @r360/admin — Panel de administración

Next.js 15 (App Router) · TypeScript estricto · Tailwind v4 · TanStack Table + Virtual + Query · supabase-js.

```bash
pnpm install                      # desde la raíz del monorepo
pnpm --filter @r360/admin dev     # http://localhost:3001
pnpm --filter @r360/admin typecheck
pnpm --filter @r360/admin test
pnpm --filter @r360/admin build && pnpm --filter @r360/admin start
```

## Modo mock (por defecto)

No hace falta una instancia de Supabase para ver y probar el panel.
`NEXT_PUBLIC_R360_MOCK=1` (default en `.env.local`) hace que **todo** el acceso a
datos pase por `MockRepo`, un repo en memoria que sirve:

- **Baleia** — réplica fiel de `supabase/seed.sql`: 20 unidades `B2-A`..`B3-K`
  con sus m², estados, precios y visibilidades reales. Sin escenas, así el
  checklist de salud tiene un bloqueante de verdad que mostrar.
- **Las Lomas** — loteo sintético de 640 lotes en 8 manzanas dentro de 2 etapas.
  Existe para poder probar lo que con 20 filas no se ve: virtualización, árbol
  de grupos anidado, selección por predicado y paginación.

El mock **escribe de verdad**: cambiar un estado y recargar muestra el cambio, y
queda registrado en el historial de la unidad. El estado vive en un singleton de
`globalThis` (sobrevive al hot-reload, se pierde al reiniciar el proceso).
No hay autenticación: entrás como `owner` del tenant `baleia`.

Para hablar con Supabase de verdad: `NEXT_PUBLIC_R360_MOCK=0` +
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Ahí se activan el
middleware de sesión y el login por magic link.

## Rutas

| Ruta | Qué es |
| --- | --- |
| `/login` · `/auth/callback` | Magic link |
| `/t/[tenant]/p` | Listado de proyectos (banda "requiere atención" + cards) |
| `/t/[tenant]/p/[project]` | Resumen + checklist de salud (`project_health`) |
| `/t/[tenant]/p/[project]/units` | **Gestor de unidades** |
| `/t/[tenant]/p/[project]/structure` | Editor de grupos y tipos |
| `/s/t/[tenant]/[project]/units` | Shell `sales`, mobile-first |

El tenant va **en la URL**, no en cookie: dos pestañas con clientes distintos no
se pisan.

> El shell de ventas cuelga de `/s/...` y no de un route group sobre `/t/...`
> porque `/t/[tenant]/p` (listado) y `/t/[tenant]/[project]` (ventas) colisionan
> cuando un proyecto se llama `p`.

## Decisiones que conviene saber antes de tocar el código

**Los colores de estado no están en el CSS.** Salen de `STATUS_TOKENS` de
`@r360/core` y se inyectan como variables `--st-<estado>` desde
`components/status.tsx`. Es la única forma de que panel, editor y visor no
diverjan. No agregues un hex de estado a `globals.css`.

**Densidad propia.** Base 13px, fila 32px, control 28px — contradice los
defaults de Tailwind a propósito: en una tabla de 1.000 lotes son 28 filas
visibles en vez de 20. Toda celda numérica lleva `.tnum`
(`font-variant-numeric: tabular-nums`).

**Todo el estado de la tabla vive en la URL** (`lib/units/url-state.ts`).
Recargar no pierde el contexto y el link es compartible. Cambiar un filtro
**limpia la selección**: seguir con filas seleccionadas que ya no se ven es la
receta para cambiarle el estado a lo que no era.

**Selección por predicado.** Elegir "las 640 que coinciden" produce
`{mode:'filter', filter, excluded}`, no una lista de ids.
`planBulkStatusChange` traduce eso a llamadas de `set_units_status`:

- El RPC (migración 0011) sólo entiende `project_id`, `group_id`,
  `unit_type_id`, `status_in`, `code_in`, `code_prefix`.
- Si el filtro entra en ese vocabulario → **predicado**: 1 llamada, ~200 bytes,
  sin ids. Un subárbol de N grupos son N llamadas (el RPC toma un `group_id`).
- Si no entra (rango de m², `sin:poligono`, exclusiones a mano) → el
  **servidor** resuelve los códigos y los manda en tandas de 500. La UI dice
  cuál de los dos caminos va a tomar, antes de apretar, y cuál tomó después.

**Paginación server-side.** El repo trae el universo de unidades del proyecto y
`queryUnits` (función pura) filtra/ordena/pagina en el servidor; al navegador va
una página. Así el modo mock y el modo Supabase filtran exactamente igual,
incluida la sintaxis de búsqueda. Tope duro de 20.000 unidades por proyecto
(`UNIT_HARD_LIMIT`); más que eso pide empujar el filtro a un RPC.

**Cambio de `attr_schema`.** El editor de estructura valida contra las unidades
existentes **antes** de commitear (`dryRun`) y muestra cuántas quedarían
inválidas, agrupadas por causa. Guardar igual exige confirmación.

## Atajos del gestor de unidades

| Tecla | Acción |
| --- | --- |
| `/` | Foco en la búsqueda |
| `j` / `k` (o ↑↓) | Mover el cursor |
| `x` | Marcar/desmarcar la fila del cursor |
| `⌘A` / `⌘⇧A` | Seleccionar la página / **todas las que coinciden** |
| `1`–`5` | Estado: disponible · reservado · vendido · bloqueado · no disponible |
| `⌘D` | Rellenar hacia abajo: aplica el estado del cursor a lo seleccionado debajo |
| `Enter` | Abrir el panel lateral |
| `Esc` | Cerrar el panel / limpiar la selección |

Marcar más de una unidad como **vendido** pide confirmación (en el panel y en el
shell de ventas).

## Sintaxis de búsqueda

```
estado:reservado          estado:reservado,vendido
grupo:B2                  tipo:duplex
m2>300   m2>=90   m2<=100   m2=91,3
precio>150.000
sin:poligono   sin:precio   con:poligono   con:precio
"texto entre comillas"    texto suelto
```

Un token que no se entiende **no rompe la búsqueda**: cae a texto libre y se
reporta como aviso arriba de la tabla. Los números aceptan coma decimal y punto
de miles (`150.000` = 150000).

## Tests

`vitest` sobre la lógica pura, que es donde están los errores caros:

- `lib/units/search.test.ts` — parseo de la sintaxis
- `lib/units/selection.test.ts` — construcción del predicado y del plan de RPC
- `lib/units/attrs.test.ts` — validación de `attrs` contra `attr_schema`
