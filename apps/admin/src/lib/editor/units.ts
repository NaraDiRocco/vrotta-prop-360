/**
 * Modelo del panel izquierdo: qué unidades hay, cuáles ya tienen polígono y
 * cuál es "la siguiente sin polígono".
 *
 * La navegación con `n`/`p` es la mecánica central del editor: permite recorrer
 * un loteo de 640 lotes sin tocar el mouse para navegar. Por eso salta SIEMPRE
 * a la siguiente unidad sin polígono en esta escena, ignorando las completas —
 * si tuviera que pasar por las 400 ya hechas dejaría de servir a la mitad del
 * trabajo.
 */
import type { GroupRow, UnitRow } from '../data/types.ts';

/**
 * Estado de una unidad respecto de la geometría.
 * `none` ○ · `other` ◐ (tiene polígono, pero en otra escena) · `here` ● ·
 * `selected` ◉.
 */
export type UnitGeomState = 'none' | 'other' | 'here';

export const GEOM_GLYPH: Record<UnitGeomState, string> = {
  none: '○',
  other: '◐',
  here: '●',
};

export const SELECTED_GLYPH = '◉';

export interface UnitEntry {
  unit: UnitRow;
  geom: UnitGeomState;
}

export interface UnitGroupNode {
  id: string;
  code: string;
  name: string;
  units: UnitEntry[];
  withPolygon: number;
  total: number;
}

export interface UnitsModel {
  groups: UnitGroupNode[];
  /** Códigos en el orden de recorrido (el que usan `n`/`p` y `j`/`k`). */
  ordered: string[];
  withPolygon: number;
  total: number;
}

export function geomStateOf(
  code: string,
  codesHere: ReadonlySet<string>,
  codesAnywhere: ReadonlySet<string>,
): UnitGeomState {
  if (codesHere.has(code)) return 'here';
  if (codesAnywhere.has(code)) return 'other';
  return 'none';
}

/**
 * Arma el árbol.
 *
 * `onlyWithout` filtra la LISTA pero no el progreso: la barra siempre dice
 * "398/412", porque si el denominador se moviera con el filtro el operador no
 * tendría forma de saber cuánto falta de verdad.
 */
export function buildUnitsModel(
  units: readonly UnitRow[],
  groups: readonly GroupRow[],
  codesHere: ReadonlySet<string>,
  codesAnywhere: ReadonlySet<string>,
  opts: { onlyWithout: boolean; search?: string } = { onlyWithout: false },
): UnitsModel {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const needle = (opts.search ?? '').trim().toLowerCase();

  const buckets = new Map<string, UnitGroupNode>();
  const ordered: string[] = [];
  let withPolygon = 0;

  const sorted = [...units].sort(
    (a, b) =>
      (a.groupCode ?? '').localeCompare(b.groupCode ?? '', 'es', { numeric: true }) ||
      a.sort - b.sort ||
      a.code.localeCompare(b.code, 'es', { numeric: true }),
  );

  for (const unit of sorted) {
    const geom = geomStateOf(unit.code, codesHere, codesAnywhere);
    if (geom === 'here') withPolygon += 1;

    const key = unit.groupId ?? '__sin_grupo__';
    let node = buckets.get(key);
    if (!node) {
      const g = unit.groupId ? byId.get(unit.groupId) : undefined;
      node = {
        id: key,
        code: g?.code ?? unit.groupCode ?? 'Sin grupo',
        name: g?.name ?? g?.code ?? 'Sin grupo',
        units: [],
        withPolygon: 0,
        total: 0,
      };
      buckets.set(key, node);
    }
    node.total += 1;
    if (geom === 'here') node.withPolygon += 1;

    if (opts.onlyWithout && geom === 'here') continue;
    if (needle && !unit.code.toLowerCase().includes(needle)) continue;

    node.units.push({ unit, geom });
    ordered.push(unit.code);
  }

  return {
    groups: [...buckets.values()].filter((g) => g.units.length > 0 || !opts.onlyWithout),
    ordered,
    withPolygon,
    total: units.length,
  };
}

/**
 * Siguiente unidad SIN polígono en esta escena, empezando después de `from`.
 * Da la vuelta al final de la lista; devuelve null si no queda ninguna, que es
 * la señal de que la escena está terminada.
 */
export function nextWithoutPolygon(
  ordered: readonly string[],
  codesHere: ReadonlySet<string>,
  from: string | null,
  direction: 1 | -1 = 1,
): string | null {
  const n = ordered.length;
  if (n === 0) return null;
  const start = from ? ordered.indexOf(from) : -1;
  for (let step = 1; step <= n; step += 1) {
    const i = (((start + direction * step) % n) + n) % n;
    const code = ordered[i]!;
    if (!codesHere.has(code)) return code;
  }
  return null;
}

/** Vecino en la lista, sin filtrar por geometría. Es lo que hacen `j` y `k`. */
export function neighbour(ordered: readonly string[], from: string | null, direction: 1 | -1): string | null {
  const n = ordered.length;
  if (n === 0) return null;
  const start = from ? ordered.indexOf(from) : direction === 1 ? -1 : 0;
  const i = (((start + direction) % n) + n) % n;
  return ordered[i] ?? null;
}

/**
 * Siguiente unidad sin polígono DEL MISMO GRUPO que `from`. Es lo que usa ⌘D:
 * duplicar el lote 12 de la manzana 3 tiene que caer en el 13 de la manzana 3,
 * no en el primer hueco de otra manzana al otro lado del loteo.
 */
export function nextWithoutPolygonInGroup(
  units: readonly UnitRow[],
  codesHere: ReadonlySet<string>,
  from: string | null,
): string | null {
  const source = units.find((u) => u.code === from);
  const groupId = source?.groupId ?? null;
  const siblings = units
    .filter((u) => u.groupId === groupId)
    .sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code, 'es', { numeric: true }));
  const codes = siblings.map((u) => u.code);
  const inGroup = nextWithoutPolygon(codes, codesHere, from, 1);
  if (inGroup) return inGroup;
  // Si la manzana está completa, se sigue por el proyecto entero: mejor eso
  // que dejar el duplicado sin unidad y obligar a asignarlo a mano.
  const all = [...units]
    .sort((a, b) => (a.groupCode ?? '').localeCompare(b.groupCode ?? '', 'es', { numeric: true }) || a.sort - b.sort)
    .map((u) => u.code);
  return nextWithoutPolygon(all, codesHere, from, 1);
}
