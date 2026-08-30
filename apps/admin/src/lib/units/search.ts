/**
 * Parseo de la sintaxis de búsqueda del gestor de unidades.
 *
 * Es texto libre con operadores; el fundador escribe `m2>300 estado:reservado
 * sin:poligono` y espera que salga exactamente eso. La gramática es
 * deliberadamente chica y tolerante: un token que no se entiende NO rompe la
 * búsqueda, cae a texto libre y se reporta como aviso.
 *
 *   estado:reservado            estado:reservado,vendido
 *   grupo:B2                    tipo:duplex
 *   m2>300  m2>=300  m2<100  m2=91.3
 *   precio>150000
 *   sin:poligono | sin:precio   con:poligono | con:precio
 *   "texto entre comillas"      texto suelto
 */
import { isUnitStatus, type UnitStatus } from '@r360/core';

export interface NumRange {
  min: number | null;
  max: number | null;
  /** Inclusivo en cada extremo. `m2>300` deja min=300 inclusive=false. */
  minInclusive: boolean;
  maxInclusive: boolean;
}

export type MissingFlag = 'poligono' | 'precio';

export interface ParsedQuery {
  text: string[];
  status: UnitStatus[];
  groupCodes: string[];
  typeCodes: string[];
  m2: NumRange;
  price: NumRange;
  missing: MissingFlag[];
  has: MissingFlag[];
  warnings: string[];
}

export const EMPTY_RANGE: NumRange = { min: null, max: null, minInclusive: true, maxInclusive: true };

export function emptyQuery(): ParsedQuery {
  return {
    text: [],
    status: [],
    groupCodes: [],
    typeCodes: [],
    m2: { ...EMPTY_RANGE },
    price: { ...EMPTY_RANGE },
    missing: [],
    has: [],
    warnings: [],
  };
}

/** Separa respetando comillas dobles. */
export function tokenize(input: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (const ch of input) {
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && /\s/.test(ch)) {
      if (cur) out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

const NUM_FIELDS: Record<string, 'm2' | 'price'> = {
  m2: 'm2',
  'm²': 'm2',
  sup: 'm2',
  superficie: 'm2',
  precio: 'price',
  price: 'price',
};

const MISSING_ALIASES: Record<string, MissingFlag> = {
  poligono: 'poligono',
  polígono: 'poligono',
  poly: 'poligono',
  geometria: 'poligono',
  geometría: 'poligono',
  precio: 'precio',
  price: 'precio',
};

/**
 * `1.234,56` → separador de miles + coma decimal (es-AR/es-UY).
 * `300.5`    → punto decimal. Si hay coma, el punto es de miles.
 */
function parseNumber(raw: string): number {
  const cleaned = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  return Number(cleaned);
}

function applyComparison(range: NumRange, op: string, value: number): void {
  switch (op) {
    case '>':
      range.min = value;
      range.minInclusive = false;
      break;
    case '>=':
      range.min = value;
      range.minInclusive = true;
      break;
    case '<':
      range.max = value;
      range.maxInclusive = false;
      break;
    case '<=':
      range.max = value;
      range.maxInclusive = true;
      break;
    default:
      range.min = value;
      range.max = value;
      range.minInclusive = true;
      range.maxInclusive = true;
  }
}

function pushUnique<T>(arr: T[], v: T): void {
  if (!arr.includes(v)) arr.push(v);
}

export function parseUnitQuery(input: string): ParsedQuery {
  const q = emptyQuery();
  if (!input.trim()) return q;

  for (const token of tokenize(input)) {
    const num = /^([\p{L}0-9²]+)\s*(>=|<=|>|<|=)\s*(-?[\d.,]+)$/u.exec(token);
    if (num) {
      const rawField = (num[1] ?? '').toLowerCase();
      const field = NUM_FIELDS[rawField];
      const value = parseNumber(num[3] ?? '');
      if (field && Number.isFinite(value)) {
        applyComparison(field === 'm2' ? q.m2 : q.price, num[2] ?? '=', value);
        continue;
      }
      q.warnings.push(`No entiendo "${token}"; lo busco como texto.`);
      q.text.push(token);
      continue;
    }

    const kv = /^([\p{L}0-9]+):(.*)$/u.exec(token);
    if (kv) {
      const key = (kv[1] ?? '').toLowerCase();
      const rawValue = kv[2] ?? '';
      const values = rawValue.split(',').map((v) => v.trim()).filter(Boolean);
      if (values.length === 0) continue;

      if (key === 'estado' || key === 'status') {
        for (const v of values) {
          const norm = v.toLowerCase().replace(/[\s-]/g, '_');
          if (isUnitStatus(norm)) pushUnique(q.status, norm);
          else q.warnings.push(`Estado desconocido: "${v}".`);
        }
        continue;
      }
      if (key === 'grupo' || key === 'group' || key === 'bloque' || key === 'manzana') {
        for (const v of values) pushUnique(q.groupCodes, v.toUpperCase());
        continue;
      }
      if (key === 'tipo' || key === 'type') {
        for (const v of values) pushUnique(q.typeCodes, v.toLowerCase());
        continue;
      }
      if (key === 'sin' || key === 'con') {
        const target = key === 'sin' ? q.missing : q.has;
        for (const v of values) {
          const flag = MISSING_ALIASES[v.toLowerCase()];
          if (flag) pushUnique(target, flag);
          else q.warnings.push(`No sé qué es "${key}:${v}".`);
        }
        continue;
      }
      q.warnings.push(`Filtro desconocido "${key}:"; lo busco como texto.`);
      q.text.push(token);
      continue;
    }

    q.text.push(token);
  }

  return q;
}

export function rangeMatches(range: NumRange, value: number | null | undefined): boolean {
  if (range.min === null && range.max === null) return true;
  if (value === null || value === undefined) return false;
  if (range.min !== null && (range.minInclusive ? value < range.min : value <= range.min)) return false;
  if (range.max !== null && (range.maxInclusive ? value > range.max : value >= range.max)) return false;
  return true;
}

export function isEmptyRange(range: NumRange): boolean {
  return range.min === null && range.max === null;
}

/** ¿La query filtra por algo? Útil para decidir si mostrar "limpiar filtros". */
export function isEmptyQuery(q: ParsedQuery): boolean {
  return (
    q.text.length === 0 &&
    q.status.length === 0 &&
    q.groupCodes.length === 0 &&
    q.typeCodes.length === 0 &&
    isEmptyRange(q.m2) &&
    isEmptyRange(q.price) &&
    q.missing.length === 0 &&
    q.has.length === 0
  );
}
