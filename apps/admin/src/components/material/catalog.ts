/**
 * Catálogo de material — REEXPORTA el del backend. No define nada propio.
 *
 * Antes este archivo tenía su propia copia del catálogo, escrita en paralelo
 * mientras `lib/material/**` no existía. Cuando ambos convivieron, 10 de los
 * 17 identificadores no coincidían (`masterplan` vs `plano-masterplan`,
 * `datos-comerciales` vs `listado-unidades`, `logo` vs `logo-vectorial`…), así
 * que la pantalla mostraba como "pendiente" material que en la base figuraba
 * cargado: los ids que sí coincidían casaban y los otros no.
 *
 * El catálogo es el contrato entre la base de datos, el panel y el link
 * público. Tiene que haber uno solo, y es el de `lib/material/catalog.ts`,
 * que es el que conoce la base.
 */
export { catalogFor as catalogForKind, MATERIAL_CATALOG } from '../../lib/material/catalog.ts';
export type { MaterialItem, MaterialRequirement } from '../../lib/material/catalog.ts';
export type { MaterialStatus } from '../../lib/material/types.ts';
