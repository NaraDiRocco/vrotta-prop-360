-- 0023_hotspots_sort.sql
-- Le da a `hotspots` un orden explícito, como ya lo tienen `scenes.sort` y
-- `groups.sort` (0004/0006).
--
-- Por qué hace falta: el orden de los hotspots NO es cosmético. El visor
-- dibuja el plano con Leaflet, y Leaflet apila los polígonos por ORDEN DE
-- INSERCIÓN en el mapa — ignora el `zIndex` que viaja en el hotspot (ver
-- apps/viewer/src/floorplan.ts::mount y la decisión 4 de
-- tools/baleia/scripts/build_tour.py). En Baleia eso significa algo muy
-- concreto: el polígono del PERÍMETRO del terreno tiene que ir PRIMERO para
-- quedar debajo; si sale después, tapa los cinco bloques y el masterplan
-- queda sin nada clickeable.
--
-- Hasta ahora el publicador leía los hotspots sin `order=`, o sea en el
-- orden que a Postgres le resultara cómodo devolverlos: hoy suele coincidir
-- con el de inserción, pero nada lo garantiza — un UPDATE, un VACUUM o un
-- plan distinto lo cambian sin aviso, y el recorrido publicado saldría con
-- el perímetro encima sin que nadie hubiera tocado un dato.
alter table hotspots add column if not exists sort int not null default 0;

-- Relleno de las filas que ya existen. Un proyecto ya cargado (Baleia, sin ir
-- más lejos) tiene HOY un orden implícito y correcto: el de inserción. Al
-- agregar la columna con default 0 ese orden se perdería —todas empatadas en
-- cero— así que acá se lo escribe explícitamente antes de que eso pase.
--
-- `created_at, ctid` es la mejor reconstrucción disponible de "cómo se
-- insertaron": `created_at` separa las cargas hechas en momentos distintos y
-- `ctid` (posición física) desempata dentro de un mismo INSERT en lote, donde
-- las filas comparten timestamp al microsegundo. Es una heurística, no una
-- garantía —`ctid` se mueve si una fila se actualiza— pero es exactamente el
-- orden que el publicador venía leyendo de hecho, así que este backfill
-- CONGELA lo que ya se estaba publicando en vez de cambiarlo.
--
-- Sólo toca las filas que quedaron en 0: si la migración se corre de nuevo
-- sobre una base donde alguien ya ordenó los hotspots a mano, no los pisa.
update hotspots h
set sort = orden.rn
from (
  select id, row_number() over (partition by scene_id order by created_at, ctid) as rn
  from hotspots
) orden
where orden.id = h.id and h.sort = 0;

-- El publicador pide los hotspots de a una escena por vez y ordenados por
-- `sort` (apps/worker/src/routes/publish.ts): este índice es justo esa
-- consulta.
create index if not exists hotspots_scene_sort_idx on hotspots (scene_id, sort);
