-- 0017_unit_status_proximamente.sql
-- Da de alta "proximamente" como valor real del enum `unit_status`.
--
-- Contexto: packages/core/src/status.ts (UNIT_STATUSES/STATUS_TOKENS) es la
-- ÚNICA fuente de estados comerciales — el comentario en
-- 0001_extensions_and_enums.sql ya advierte que este enum "debe coincidir
-- EXACTAMENTE" con esa lista. El plan de experiencia de Baleia
-- (docs/06-BENCHMARK/5-EXPERIENCIA-BALEIA.md, §5.3) necesita "próximamente"
-- como estado de PRIMERA CLASE para los bloques que el brochure marca
-- explícitamente "PRÓXIMAMENTE" (hoy Bloque 1 y Bloque 3): antes de este
-- cambio, `tools/baleia/scripts/build_tour.py` emitía a propósito un string
-- ("proximamente") que el visor NO reconocía, para demostrar la regla dura
-- (hotspot gris + warning en consola en vez de desaparecer) — ver el
-- historial de ese script y `tools/baleia/README.md` §3.1. Con el token real
-- ya no hace falta el truco: el bloque se dibuja con un chip de CONTORNO
-- (`STATUS_TOKENS.proximamente`: fill 0, pattern 'outline'), distinto tanto
-- del verde de "disponible" como del gris de "sin dato" (regla dura, que
-- sigue existiendo para Bloque 4 y 5, que no tienen ni siquiera esto).
--
-- ALTER TYPE ... ADD VALUE no puede usarse en la misma transacción en la que
-- después SE LEE ese valor (restricción de Postgres, no de Supabase), pero
-- esta migración sólo agrega el valor: no inserta ni compara filas contra
-- él, así que corre sin problema dentro de la transacción normal de
-- `supabase migration up`.
do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'unit_status' and e.enumlabel = 'proximamente'
  ) then
    alter type unit_status add value 'proximamente';
  end if;
end $$;
