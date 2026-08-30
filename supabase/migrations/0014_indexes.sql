-- 0014_indexes.sql
-- Índices adicionales para las consultas reales del panel: filtrado de
-- unidades por proyecto+estado, por grupo, y búsqueda/prefijo por código.
-- (Los índices únicos ya creados por las tablas cubren el resto.)

create index if not exists units_project_status_idx
  on units (project_id, status);

create index if not exists units_project_group_idx
  on units (project_id, group_id);

-- Búsqueda por prefijo de código (usada por set_units_status code_prefix y
-- por el buscador del panel). text_pattern_ops acelera LIKE 'ABC%'.
create index if not exists units_code_prefix_idx
  on units (code text_pattern_ops);

create index if not exists groups_project_kind_idx
  on groups (project_id, kind);

create index if not exists unit_status_log_changed_at_idx
  on unit_status_log (changed_at desc);
