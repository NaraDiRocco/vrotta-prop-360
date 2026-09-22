-- 0025_availability_groups.sql
-- Reemplaza `generate_availability_json` (0013) para que los GRUPOS también
-- tengan estado en `availability.json`.
--
-- Por qué: en el masterplan de un complejo los polígonos no son unidades sino
-- bloques, y un bloque es una fila de `groups` (0004), no de `units`. El
-- color de un polígono sale de `availability.json`, así que con la versión
-- anterior de esta función —que sólo miraba `units`— los cinco bloques de
-- Baleia quedaban SIN entrada y el visor los pintaba a todos con el gris de
-- "no disponible" (FALLBACK_STATUS, packages/core/src/status.ts). Un
-- masterplan donde el bloque que está en venta se ve igual que el que no
-- existe todavía.
--
-- Esta migración NO toca el modelo: un bloque sigue siendo un grupo. Lo que
-- hace es que la disponibilidad hable también de grupos, que es la otra mitad
-- del mismo arreglo — la primera mitad está en el publicador, que traduce un
-- hotspot `target_kind='group'` a `unitCode` + `action:{kind:'unit'}` para
-- que el visor lo trate como cualquier otro polígono con estado
-- (apps/worker/src/routes/publish.ts).
--
-- Tres decisiones, y las tres importan para no degradar un recorrido que hoy
-- funciona:
--
-- 1. EL ESTADO DE UN GRUPO ES EL "MÁS DISPONIBLE" DE SUS UNIDADES, no un
--    promedio ni el más frecuente: lo que el comprador necesita saber de un
--    vistazo es si el bloque tiene ALGO para vender. Un bloque con ocho
--    unidades vendidas y una disponible es, para quien mira el plano, un
--    bloque disponible. El orden es el de `STATUS_TOKENS[...].order` en
--    packages/core/src/status.ts, que es la ÚNICA fuente de verdad de los
--    estados comerciales; acá se lo repite en un array porque SQL no puede
--    leer TypeScript, pero si allá cambia, cambia acá. (Se repite el orden y
--    no el ordinal del enum `unit_status` a propósito: el enum crece por el
--    final —'proximamente' se agregó así en 0017— y su ordinal coincide hoy
--    con el de status.ts por casualidad, no por contrato.)
--
-- 2. UN GRUPO SIN UNIDADES NO GENERA ENTRADA. No es un caso a tapar: es la
--    regla dura del producto (tools/baleia/README.md §3.1). De los cinco
--    bloques de Baleia, el 4 y el 5 no tienen ni una unidad cargada porque no
--    hay literalmente ningún dato comercial de ellos —ni siquiera dice
--    "próximamente" el brochure— y esa AUSENCIA es la que hace que el visor
--    los dibuje grises con su warning en consola, en vez de inventarles un
--    estado. El `join` contra las unidades del proyecto (no `left join`) es
--    lo que mantiene esa ausencia. Inventar una entrada acá cambiaría la cara
--    del masterplan de un proyecto que ya está frente a un cliente.
--
-- 3. UN GRUPO NUNCA LLEVA PRECIO (`p: null`), aunque sus unidades sí tengan.
--    "Desde USD X" es una decisión comercial (¿el mínimo?, ¿el mínimo
--    publicable?, ¿con o sin las bloqueadas?) que nadie tomó, y el precio de
--    una unidad suelta puesto sobre un bloque entero es directamente
--    engañoso. Mientras no haya una regla explícita, el bloque no dice
--    precio.
--
-- Las unidades se agregan al final (`grupos || unidades`) para que, en el
-- caso patológico de un grupo y una unidad con el MISMO code, gane la unidad:
-- la unidad es el dato real, la entrada de grupo es derivada.
--
-- Lo demás queda igual que en 0013: la forma exacta de `AvailabilityFile`
-- (packages/core/src/types.ts), `p` en null si el precio vigente no es
-- 'public', y sin security definer (corre con la RLS de quien llama; el
-- publish real usa service_role).
create or replace function generate_availability_json(p_project_id uuid) returns jsonb
language sql
stable
as $$
  with unidades as (
    select u.id, u.code, u.status, u.group_id,
           price.amount, price.currency, price.visibility
    from units u
    left join lateral (
      select up.amount, up.currency, up.visibility
      from unit_prices up
      where up.unit_id = u.id
        and up.valid_from <= now()
        and (up.valid_to is null or up.valid_to > now())
      order by up.valid_from desc
      limit 1
    ) price on true
    where u.project_id = p_project_id
  ),
  entradas_unidad as (
    select coalesce(
      jsonb_object_agg(
        u.code,
        jsonb_build_object(
          's', u.status,
          'p', case
                 when u.amount is not null and u.visibility = 'public'
                   then jsonb_build_object('a', u.amount, 'c', u.currency)
                 else null
               end
        )
      ) filter (where u.code is not null),
      '{}'::jsonb
    ) as obj
    from unidades u
  ),
  estado_por_grupo as (
    -- El primer estado al ordenar por el `order` de STATUS_TOKENS = el "más
    -- disponible". El `join` (no `left join`) es lo que deja afuera a los
    -- grupos sin unidades: ver decisión 2 arriba.
    select g.code,
           (array_agg(
              u.status
              order by coalesce(
                array_position(
                  array['disponible', 'reservado', 'vendido', 'bloqueado',
                        'no_disponible', 'proximamente']::unit_status[],
                  u.status
                ),
                2147483647  -- un estado que no esté en la lista va último, nunca primero
              )
            ))[1] as status
    from groups g
    join unidades u on u.group_id = g.id
    where g.project_id = p_project_id
    group by g.id, g.code
  ),
  entradas_grupo as (
    select coalesce(
      jsonb_object_agg(g.code, jsonb_build_object('s', g.status, 'p', null)),
      '{}'::jsonb
    ) as obj
    from estado_por_grupo g
  )
  select jsonb_build_object(
    'v', 1,
    'generated_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'units', entradas_grupo.obj || entradas_unidad.obj
  )
  from entradas_unidad, entradas_grupo;
$$;

grant execute on function generate_availability_json(uuid) to authenticated, service_role;
