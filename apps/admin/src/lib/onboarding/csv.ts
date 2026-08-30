/**
 * Importación de unidades desde CSV.
 *
 * El cliente casi siempre manda una planilla, y casi nunca con los
 * encabezados exactos de la plantilla. Acá hay tres cosas separadas a
 * propósito:
 *
 *   1. `parseCsv`        — texto → matriz. Comillas, CRLF, BOM, `;` o `,`.
 *   2. `detectMapping`   — encabezados → campos del modelo, por sinónimos.
 *   3. `validateRows`    — filas → unidades + errores POR FILA.
 *
 * El paso 3 corre SIEMPRE completo antes de escribir un solo byte en la base:
 * un import a medias con 300 unidades adentro y 40 en el error es peor que
 * no importar. El reporte se muestra, se corrige el archivo, se reintenta.
 */
import { UNIT_STATUSES, type UnitStatus } from '@r360/core';
import type { NewUnitInput } from '../data/repo.ts';
import { normalizeKey, slugify } from './slug.ts';

/* ── 1. parseo ────────────────────────────────────────────────────────── */

/** Detecta el separador mirando la primera línea: gana el que más aparece. */
export function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
  const counts = [',', ';', '\t'].map((d) => ({ d, n: firstLine.split(d).length - 1 }));
  const best = counts.reduce((a, b) => (b.n > a.n ? b : a));
  return best.n > 0 ? best.d : ',';
}

/** Texto CSV → matriz de celdas. Soporta comillas dobles con `""` escapado. */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const clean = text.replace(/^\ufeff/, '');
  const sep = delimiter ?? detectDelimiter(clean);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Descarta líneas totalmente vacías (colas de archivo, separadores).
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

/* ── 2. detección de columnas ─────────────────────────────────────────── */

export type CsvField =
  | 'code'
  | 'typeCode'
  | 'groupCode'
  | 'status'
  | 'areaTotalM2'
  | 'areaCoveredM2'
  | 'price'
  | 'currency'
  | 'priceVisibility'
  | 'financing'
  | 'orientation'
  | 'notes';

export const CSV_FIELD_LABEL: Record<CsvField, string> = {
  code: 'Código de unidad',
  typeCode: 'Tipología',
  groupCode: 'Grupo (bloque / manzana / piso)',
  status: 'Estado',
  areaTotalM2: 'Superficie total (m²)',
  areaCoveredM2: 'Superficie cubierta (m²)',
  price: 'Precio',
  currency: 'Moneda',
  priceVisibility: 'Mostrar precio público',
  financing: 'Financiación',
  orientation: 'Orientación',
  notes: 'Notas internas',
};

export const REQUIRED_FIELDS: readonly CsvField[] = ['code'];

/**
 * Sinónimos por campo, ya normalizados con `normalizeKey`. El orden importa:
 * gana el primero que matchea, así `superficie_total_m2` no se lleva la
 * columna de `superficie_cubierta_m2`.
 */
const ALIASES: Record<CsvField, readonly string[]> = {
  code: ['codigo_unidad', 'codigo', 'code', 'unidad', 'lote', 'uf', 'id_unidad', 'nro', 'numero'],
  typeCode: ['tipologia', 'tipo', 'tipo_unidad', 'tipologia_unidad', 'type', 'modelo'],
  groupCode: [
    'bloque_o_piso',
    'bloque',
    'manzana',
    'torre',
    'piso',
    'etapa',
    'grupo',
    'sector',
    'nivel',
  ],
  status: ['estado', 'status', 'situacion', 'disponibilidad'],
  areaTotalM2: [
    'superficie_total_m2',
    'superficie_total',
    'sup_total',
    'm2_totales',
    'superficie',
    'area_total',
    'area',
    'm2',
  ],
  areaCoveredM2: [
    'superficie_cubierta_m2',
    'superficie_cubierta',
    'sup_cubierta',
    'm2_cubiertos',
    'area_cubierta',
  ],
  price: ['precio', 'price', 'valor', 'importe', 'precio_lista'],
  currency: ['moneda', 'currency', 'divisa'],
  priceVisibility: ['mostrar_precio_publico', 'precio_publico', 'visibilidad', 'mostrar_precio'],
  financing: ['financiacion', 'financiamiento', 'cuotas', 'plan_de_pago'],
  orientation: ['orientacion', 'orientation', 'frente_a'],
  notes: ['notas_internas', 'notas', 'observaciones', 'comentarios', 'nota'],
};

/** Campo → índice de columna. `-1` = sin columna. */
export type CsvMapping = Record<CsvField, number>;

export function emptyMapping(): CsvMapping {
  return {
    code: -1,
    typeCode: -1,
    groupCode: -1,
    status: -1,
    areaTotalM2: -1,
    areaCoveredM2: -1,
    price: -1,
    currency: -1,
    priceVisibility: -1,
    financing: -1,
    orientation: -1,
    notes: -1,
  };
}

/**
 * Mapeo automático por sinónimo exacto y, si no hay, por prefijo. Una columna
 * no se asigna dos veces: al hacer match queda consumida.
 */
export function detectMapping(headers: readonly string[]): CsvMapping {
  const normalized = headers.map((h) => normalizeKey(h));
  const mapping = emptyMapping();
  const used = new Set<number>();

  const fields = Object.keys(ALIASES) as CsvField[];

  for (const pass of ['exact', 'prefix'] as const) {
    for (const field of fields) {
      if (mapping[field] !== -1) continue;
      for (const alias of ALIASES[field]) {
        const index = normalized.findIndex((header, i) => {
          if (used.has(i) || header.length === 0) return false;
          return pass === 'exact' ? header === alias : header.startsWith(alias) || alias.startsWith(header);
        });
        if (index !== -1) {
          mapping[field] = index;
          used.add(index);
          break;
        }
      }
    }
  }

  return mapping;
}

/* ── 3. validación ────────────────────────────────────────────────────── */

/**
 * Número de planilla → number. Acepta `1.234,56`, `1,234.56`, `109.68`,
 * `$ 120.000` y `120 m2`. Devuelve `undefined` si la celda está vacía y
 * `null` si hay texto que no es un número.
 */
export function parseDecimal(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  const stripped = trimmed.replace(/[^\d.,-]/g, '');
  if (stripped.length === 0 || !/\d/.test(stripped)) return null;

  const lastComma = stripped.lastIndexOf(',');
  const lastDot = stripped.lastIndexOf('.');
  let normalized: string;
  if (lastComma === -1 && lastDot === -1) {
    normalized = stripped;
  } else if (lastComma > lastDot) {
    normalized = stripped.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    normalized = stripped.replace(/,/g, '');
  } else {
    normalized = stripped;
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

const STATUS_SYNONYMS: Record<string, UnitStatus> = {
  disponible: 'disponible',
  disponibles: 'disponible',
  libre: 'disponible',
  a_la_venta: 'disponible',
  reservado: 'reservado',
  reservada: 'reservado',
  reserva: 'reservado',
  senado: 'reservado',
  vendido: 'vendido',
  vendida: 'vendido',
  venta_cerrada: 'vendido',
  bloqueado: 'bloqueado',
  bloqueada: 'bloqueado',
  no_disponible: 'no_disponible',
  nodisponible: 'no_disponible',
  no_a_la_venta: 'no_disponible',
  retirado: 'no_disponible',
};

export function parseStatus(raw: string): UnitStatus | null | undefined {
  const key = normalizeKey(raw);
  if (key.length === 0) return undefined;
  const direct = (UNIT_STATUSES as readonly string[]).includes(key) ? (key as UnitStatus) : undefined;
  return direct ?? STATUS_SYNONYMS[key] ?? null;
}

const TRUE_WORDS = new Set(['si', 'sí', 'true', '1', 'x', 'publico', 'público', 'y', 'yes']);
const FALSE_WORDS = new Set(['no', 'false', '0', 'privado', 'a_consultar', 'consultar', 'n']);

export function parseBoolean(raw: string): boolean | null | undefined {
  const key = normalizeKey(raw);
  if (key.length === 0) return undefined;
  if (TRUE_WORDS.has(key)) return true;
  if (FALSE_WORDS.has(key)) return false;
  return null;
}

export interface RowIssue {
  /** Línea del archivo, 1-based e incluyendo el encabezado. */
  line: number;
  field: CsvField | 'fila';
  message: string;
  /** Valor tal cual venía, para poder señalarlo en la vista previa. */
  value: string;
}

export interface ImportPrice {
  amount: number;
  currency: string;
  visibility: 'public' | 'on_request';
}

export interface ImportUnit extends NewUnitInput {
  /** Línea del archivo de la que salió, para el reporte. */
  line: number;
  price: ImportPrice | null;
}

export interface ImportPlan {
  headers: string[];
  mapping: CsvMapping;
  /** Unidades listas para escribir. Vacío si `issues` tiene algo. */
  units: ImportUnit[];
  issues: RowIssue[];
  /** Códigos de grupo que hay que crear porque no existen en el proyecto. */
  missingGroups: string[];
  /** Códigos de tipo que hay que crear porque no existen en el proyecto. */
  missingTypes: { code: string; name: string }[];
  totalRows: number;
  /** Filas que se descartarían por tener un código que ya existe en el proyecto. */
  duplicatesInProject: string[];
}

export interface ImportOptions {
  /** Mapeo manual; si falta, se autodetecta. */
  mapping?: CsvMapping;
  /** Estado para las filas sin columna de estado o con la celda vacía. */
  defaultStatus?: UnitStatus;
  /** Moneda para las filas con precio y sin moneda. */
  defaultCurrency?: string;
  /** Códigos de grupo que ya existen en el proyecto. */
  existingGroupCodes?: readonly string[];
  /** Códigos de tipo que ya existen en el proyecto. */
  existingTypeCodes?: readonly string[];
  /** Códigos de unidad que ya existen en el proyecto. */
  existingUnitCodes?: readonly string[];
}

function cell(row: readonly string[], index: number): string {
  return index >= 0 ? (row[index] ?? '').trim() : '';
}

/**
 * Construye el plan de importación completo: unidades válidas, errores por
 * fila y qué grupos/tipos habría que crear. No escribe nada.
 */
export function buildImportPlan(text: string, options: ImportOptions = {}): ImportPlan {
  const rows = parseCsv(text);
  const headerRow = rows[0] ?? [];
  const headers = headerRow.map((h) => h.trim());
  const mapping = options.mapping ?? detectMapping(headers);
  const defaultStatus = options.defaultStatus ?? 'disponible';
  const defaultCurrency = options.defaultCurrency ?? 'USD';

  const issues: RowIssue[] = [];
  const units: ImportUnit[] = [];
  const seen = new Map<string, number>();
  const existingGroups = new Set(options.existingGroupCodes ?? []);
  const existingTypes = new Set(options.existingTypeCodes ?? []);
  const existingUnits = new Set(options.existingUnitCodes ?? []);
  const missingGroups: string[] = [];
  const missingTypes: { code: string; name: string }[] = [];
  const duplicatesInProject: string[] = [];

  if (rows.length === 0) {
    issues.push({ line: 0, field: 'fila', message: 'El archivo está vacío.', value: '' });
    return { headers, mapping, units, issues, missingGroups, missingTypes, totalRows: 0, duplicatesInProject };
  }

  for (const field of REQUIRED_FIELDS) {
    if (mapping[field] === -1) {
      issues.push({
        line: 1,
        field,
        message: `No encontré la columna de «${CSV_FIELD_LABEL[field]}». Asignala a mano.`,
        value: headers.join(', '),
      });
    }
  }

  const body = rows.slice(1);

  for (let i = 0; i < body.length; i += 1) {
    const row = body[i] ?? [];
    const line = i + 2; // +1 por el encabezado, +1 porque las líneas son 1-based
    const rowIssues: RowIssue[] = [];

    const code = cell(row, mapping.code);
    if (code.length === 0) {
      rowIssues.push({ line, field: 'code', message: 'Falta el código de unidad.', value: '' });
    } else {
      const previous = seen.get(code);
      if (previous !== undefined) {
        rowIssues.push({
          line,
          field: 'code',
          message: `Código repetido: ya aparece en la línea ${previous}.`,
          value: code,
        });
      } else {
        seen.set(code, line);
      }
      if (existingUnits.has(code) && !duplicatesInProject.includes(code)) duplicatesInProject.push(code);
    }

    const rawStatus = cell(row, mapping.status);
    const parsedStatus = parseStatus(rawStatus);
    if (parsedStatus === null) {
      rowIssues.push({
        line,
        field: 'status',
        message: `Estado desconocido. Los válidos son: ${UNIT_STATUSES.join(', ')}.`,
        value: rawStatus,
      });
    }
    const status: UnitStatus = parsedStatus ?? defaultStatus;

    const areaTotal = numberOrIssue(cell(row, mapping.areaTotalM2), 'areaTotalM2', line, rowIssues);
    const areaCovered = numberOrIssue(cell(row, mapping.areaCoveredM2), 'areaCoveredM2', line, rowIssues);
    const amount = numberOrIssue(cell(row, mapping.price), 'price', line, rowIssues);

    if (areaTotal !== undefined && areaTotal !== null && areaTotal <= 0) {
      rowIssues.push({ line, field: 'areaTotalM2', message: 'La superficie tiene que ser mayor que cero.', value: cell(row, mapping.areaTotalM2) });
    }
    if (amount !== undefined && amount !== null && amount < 0) {
      rowIssues.push({ line, field: 'price', message: 'El precio no puede ser negativo.', value: cell(row, mapping.price) });
    }

    const rawVisible = cell(row, mapping.priceVisibility);
    const visible = parseBoolean(rawVisible);
    if (visible === null) {
      rowIssues.push({ line, field: 'priceVisibility', message: 'Poné sí/no (o 1/0).', value: rawVisible });
    }

    const rawCurrency = cell(row, mapping.currency);
    let currency = defaultCurrency;
    if (rawCurrency.length > 0) {
      const upper = rawCurrency.toUpperCase().replace(/[^A-Z]/g, '');
      if (upper.length !== 3) {
        rowIssues.push({ line, field: 'currency', message: 'La moneda va en código ISO de 3 letras (USD, UYU, ARS).', value: rawCurrency });
      } else currency = upper;
    }

    const rawType = cell(row, mapping.typeCode);
    const typeCode = rawType.length > 0 ? slugify(rawType) : null;
    if (typeCode !== null && !existingTypes.has(typeCode) && !missingTypes.some((t) => t.code === typeCode)) {
      missingTypes.push({ code: typeCode, name: rawType });
    }

    const rawGroup = cell(row, mapping.groupCode);
    const groupCode = rawGroup.length > 0 ? rawGroup : null;
    if (groupCode !== null && !existingGroups.has(groupCode) && !missingGroups.includes(groupCode)) {
      missingGroups.push(groupCode);
    }

    if (rowIssues.length > 0) {
      issues.push(...rowIssues);
      continue;
    }

    const attrs: Record<string, unknown> = {};
    if (areaCovered !== undefined && areaCovered !== null) attrs['sup_cubierta'] = areaCovered;
    const orientation = cell(row, mapping.orientation);
    if (orientation.length > 0) attrs['orientacion'] = orientation;
    const financing = cell(row, mapping.financing);
    if (financing.length > 0) attrs['financiacion'] = financing;
    const notes = cell(row, mapping.notes);
    if (notes.length > 0) attrs['notas_internas'] = notes;

    units.push({
      line,
      code,
      groupCode,
      typeCode,
      typeName: rawType.length > 0 ? rawType : null,
      status,
      areaTotalM2: areaTotal ?? null,
      attrs,
      sort: i + 1,
      price:
        amount !== undefined && amount !== null
          ? { amount, currency, visibility: visible === false ? 'on_request' : 'public' }
          : null,
    });
  }

  return { headers, mapping, units, issues, missingGroups, missingTypes, totalRows: body.length, duplicatesInProject };
}

function numberOrIssue(
  raw: string,
  field: CsvField,
  line: number,
  sink: RowIssue[],
): number | null | undefined {
  const value = parseDecimal(raw);
  if (value === null) {
    sink.push({ line, field, message: `«${raw}» no es un número.`, value: raw });
  }
  return value;
}

/** Resumen de una línea para el reporte y los tests. */
export function summarizePlan(plan: ImportPlan): string {
  if (plan.issues.length > 0) {
    return `${plan.issues.length} error(es) en ${plan.totalRows} fila(s). No se escribió nada.`;
  }
  const parts = [`${plan.units.length} unidad(es) listas`];
  if (plan.missingGroups.length > 0) parts.push(`${plan.missingGroups.length} grupo(s) a crear`);
  if (plan.missingTypes.length > 0) parts.push(`${plan.missingTypes.length} tipo(s) a crear`);
  if (plan.duplicatesInProject.length > 0) parts.push(`${plan.duplicatesInProject.length} ya existentes (se omiten)`);
  return `${parts.join(' · ')}.`;
}
