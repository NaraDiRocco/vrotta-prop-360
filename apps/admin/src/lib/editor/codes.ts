/**
 * Emparejamiento de códigos entre un archivo importado y las unidades del
 * proyecto.
 *
 * El CAD del agrimensor nunca escribe el código igual que el Excel de ventas.
 * `L-14`, `Lote 14`, `lote 014` y `14` son el mismo lote, y hacer que el
 * operador los repare a mano de a uno es media jornada por loteo. La
 * normalización es deliberadamente conservadora: prefiere no emparejar antes
 * que emparejar mal, porque un polígono asignado a la unidad equivocada es un
 * error que nadie detecta hasta que un cliente pregunta por el lote que no es.
 */

/** Palabras que designan el tipo de unidad y no forman parte del código. */
const NOISE_WORDS = [
  'LOTE', 'LOTES', 'LOT', 'PARCELA', 'UNIDAD', 'UNIDADES', 'UF',
  'CASA', 'DEPARTAMENTO', 'DEPTO', 'DPTO', 'LOCAL', 'COCHERA',
];

/**
 * Forma canónica de un código.
 *
 * 1. Mayúsculas y sin acentos.
 * 2. Fuera las palabras de tipo (`Lote 14` → `14`).
 * 3. Fuera todo lo que no sea alfanumérico (`M1-L05` → `M1L05`).
 * 4. Ceros a la izquierda de cada grupo numérico (`M1L05` → `M1L5`).
 * 5. Una `L` inicial suelta delante de dígitos (`L14` → `14`), sólo cuando el
 *    código entero es esa forma: en `M1L5` la `L` separa manzana de lote y
 *    quitarla haría chocar `M1L5` con `M15`.
 */
export function normalizeCode(raw: string): string {
  let s = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  for (const w of NOISE_WORDS) s = s.replace(new RegExp(`\\b${w}\\b`, 'g'), ' ');

  s = s.replace(/[^A-Z0-9]+/g, '');
  s = s.replace(/\d+/g, (d) => String(Number.parseInt(d, 10)));
  if (/^L\d+$/.test(s)) s = s.slice(1);
  return s;
}

export interface CodeIndex {
  exact: Map<string, string>;
  /** normalizado → códigos reales que colapsan a él. */
  normalized: Map<string, string[]>;
}

export function buildCodeIndex(codes: readonly string[]): CodeIndex {
  const exact = new Map<string, string>();
  const normalized = new Map<string, string[]>();
  for (const code of codes) {
    exact.set(code, code);
    const key = normalizeCode(code);
    if (!key) continue;
    const bucket = normalized.get(key);
    if (bucket) bucket.push(code);
    else normalized.set(key, [code]);
  }
  return { exact, normalized };
}

export type MatchOutcome =
  | { kind: 'exact'; code: string }
  | { kind: 'normalized'; code: string }
  | { kind: 'ambiguous'; candidates: string[] }
  | { kind: 'none' };

/**
 * Resuelve un código crudo contra el índice.
 *
 * El match exacto manda. Si hay que normalizar y el cubo tiene más de un
 * candidato, se devuelve `ambiguous` y NO se elige: adivinar entre `B2-A` y
 * `B2A` es exactamente la clase de decisión que tiene que tomar una persona.
 */
export function matchCode(raw: string, index: CodeIndex): MatchOutcome {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: 'none' };

  const direct = index.exact.get(trimmed);
  if (direct) return { kind: 'exact', code: direct };

  const key = normalizeCode(trimmed);
  if (!key) return { kind: 'none' };

  const bucket = index.normalized.get(key);
  if (!bucket || bucket.length === 0) return { kind: 'none' };
  if (bucket.length > 1) return { kind: 'ambiguous', candidates: [...bucket] };
  return { kind: 'normalized', code: bucket[0]! };
}
