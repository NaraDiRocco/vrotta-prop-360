-- 0027_availability_group_status.sql
-- Reemplaza `generate_availability_json` (0025) para que respete el estado
-- DECLARADO de un grupo (`groups.status`, 0026_groups_status.sql) por encima
-- del que se deriva de sus unidades.
--
-- La precedencia, que es todo lo que cambia acá, queda así:
--
--   1. `groups.status` NO es null  → se usa ese, tal cual, SIN mirar las
--      unidades. Es una declaración comercial explícita sobre el bloque y
--      gana siempre: si alguien escribió ahí "proximamente", nadie tiene que
--      andar adivinando a partir de lo que haya o no haya adentro.
--   2. `groups.status` es null y el grupo tiene al menos una unidad → se
--      deriva como en 0025: el estado "más disponible" entre sus unidades,
--      con el orden de `STATUS_TOKENS` (packages/core/src/status.ts).
--   3. `groups.status` es null y el grupo no tiene unidades → NO se emite
--      entrada. Es la regla dura, y es lo que mantiene a los Bloques 4 y 5 de
--      Baleia fuera de `availability.json`: de ellos no hay NINGÚN dato, ni
--      siquiera un "próximamente" en el brochure, así que el visor los pinta
--      grises con su warning en vez de mostrar un estado que nadie declaró.
--      Así es como el cliente los ve hoy y así tienen que seguir viéndose.
--
-- El caso 1 es el que arregla el Bloque 1: tiene fecha pública de
-- "próximamente" y cero unidades cargadas, así que con la regla de 0025 sola
-- caía en el caso 3 y el plano lo rotulaba "Etapa futura" en gris, como si
-- fuera un B4 más. Con el estado declarado vuelve a salir con su chip de
-- contorno "Próximamente".
--
-- Lo demás no se mueve: un grupo NUNCA lleva precio (`p: null`), aunque sus
-- unidades tengan — "desde USD X" es una decisión comercial que nadie tomó, y
-- el precio de una unidad suelta puesto sobre un bloque entero engaña. Y las
-- unidades se funden al final (`grupos || unidades`) para que, ante un code
-- repetido, gane la unidad: la unidad es el dato real, la entrada de grupo es
-- derivada. Un `groups.status` declarado tampoco toca en nada las entradas de
-- SUS unidades: cada unidad sigue publicando su propio estado y su propio
-- precio.
--
-- Sigue sin ser security definer: corre con la RLS de quien la llama.
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
    -- `coalesce` ES la precedencia: lo declarado primero, lo derivado
    -- después. El `left join` deja entrar a los grupos sin unidades para que
    -- un estado declarado alcance por sí solo (caso 1); si tampoco hay
    -- estado declarado, el array_agg viene vacío, el coalesce da null y el
    -- grupo queda afuera más abajo (caso 3).
    select g.code,
           coalesce(
             g.status,
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
              ) filter (where u.status is not null))[1]
           ) as status
    from groups g
    left join unidades u on u.group_id = g.id
    where g.project_id = p_project_id
    group by g.id, g.code, g.status
  ),
  entradas_grupo as (
    select coalesce(
      jsonb_object_agg(g.code, jsonb_build_object('s', g.status, 'p', null))
        filter (where g.status is not null),
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
