/**
 * Generador de códigos de unidad por patrón.
 *
 * Es la pieza que convierte horas en segundos: un loteo de 640 lotes se carga
 * escribiendo `M{manzana}-L{01..48}` en vez de tipear 640 filas.
 *
 * Gramática del patrón (todo lo que no esté entre llaves es literal):
 *   {01..48}   rango numérico; el padding sale del primer extremo
 *              (`{01..48}` → 01,02,…,48 · `{1..10}` → 1,2,…,10)
 *   {A..K}     rango de letras (respeta mayúscula/minúscula del primer extremo)
 *   {manzana}  variable: la reemplaza el valor que pasa el llamador
 *
 * Con más de un rango el resultado es el producto cartesiano, variando el
 * rango MÁS A LA DERECHA primero — que es como se numeran los edificios:
 * `T1-{1..2}{A..B}` → T1-1A, T1-1B, T1-2A, T1-2B.
 *
 * El plan se calcula sin materializar la lista: `codeAt()` resuelve el código
 * n-ésimo por aritmética de índices, así la vista previa de "los primeros 3 y
 * los últimos 2" no cuesta lo mismo que generar 20.000 códigos.
 */

export type PatternSegment =
  | { kind: 'literal'; text: string }
  | { kind: 'var'; name: string; value: string }
  | { kind: 'num'; from: number; to: number; pad: number }
  | { kind: 'alpha'; from: number; to: number };

export interface PatternPlan {
  segments: PatternSegment[];
  /** Cuántos códigos produce. Siempre ≥ 1 si el patrón es válido. */
  total: number;
  /** Nombres de las variables que aparecen en el patrón, en orden de aparición. */
  variables: string[];
}

export class PatternError extends Error {}

/** Tope duro por operación. Un loteo grande son ~1.000 lotes; 20.000 es techo. */
export const MAX_GENERATED = 20000;

const RANGE_NUM = /^(\d+)\.\.(\d+)$/;
const RANGE_ALPHA = /^([A-Za-z])\.\.([A-Za-z])$/;
const VAR_NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;

function sizeOf(segment: PatternSegment): number {
  if (segment.kind === 'num' || segment.kind === 'alpha') return segment.to - segment.from + 1;
  return 1;
}

/**
 * Compila el patrón. Lanza `PatternError` con un mensaje accionable: el
 * operador tiene que poder arreglar el patrón leyendo el error, no adivinando.
 */
export function parseCodePattern(
  pattern: string,
  vars: Readonly<Record<string, string | number>> = {},
): PatternPlan {
  if (pattern.trim().length === 0) throw new PatternError('El patrón está vacío.');

  const segments: PatternSegment[] = [];
  const variables: string[] = [];
  let cursor = 0;

  while (cursor < pattern.length) {
    const open = pattern.indexOf('{', cursor);
    if (open === -1) {
      segments.push({ kind: 'literal', text: pattern.slice(cursor) });
      break;
    }
    if (open > cursor) segments.push({ kind: 'literal', text: pattern.slice(cursor, open) });

    const close = pattern.indexOf('}', open);
    if (close === -1) throw new PatternError('Falta cerrar una llave `}`.');

    const body = pattern.slice(open + 1, close);
    segments.push(compileToken(body, vars, variables));
    cursor = close + 1;
  }

  let total = 1;
  for (const segment of segments) {
    total *= sizeOf(segment);
    if (total > MAX_GENERATED) {
      throw new PatternError(`El patrón produce más de ${MAX_GENERATED.toLocaleString('es')} códigos.`);
    }
  }

  return { segments, total, variables };
}

function compileToken(
  body: string,
  vars: Readonly<Record<string, string | number>>,
  variables: string[],
): PatternSegment {
  const num = RANGE_NUM.exec(body);
  if (num) {
    const rawFrom = num[1] ?? '';
    const rawTo = num[2] ?? '';
    const from = Number(rawFrom);
    const to = Number(rawTo);
    if (to < from) throw new PatternError(`Rango invertido en \`{${body}}\`: ${to} es menor que ${from}.`);
    const pad = rawFrom.startsWith('0') ? Math.max(rawFrom.length, rawTo.length) : 1;
    return { kind: 'num', from, to, pad };
  }

  const alpha = RANGE_ALPHA.exec(body);
  if (alpha) {
    const a = (alpha[1] ?? '').charCodeAt(0);
    const b = (alpha[2] ?? '').charCodeAt(0);
    if (b < a) throw new PatternError(`Rango de letras invertido en \`{${body}}\`.`);
    return { kind: 'alpha', from: a, to: b };
  }

  if (body.includes('..')) {
    throw new PatternError(`No entiendo el rango \`{${body}}\`. Se escribe \`{01..48}\` o \`{A..K}\`.`);
  }

  if (!VAR_NAME.test(body)) {
    throw new PatternError(`\`{${body}}\` no es ni un rango ni un nombre de variable válido.`);
  }

  const raw = vars[body];
  if (raw === undefined || raw === null || String(raw).length === 0) {
    throw new PatternError(`La variable \`{${body}}\` no tiene valor.`);
  }
  if (!variables.includes(body)) variables.push(body);
  return { kind: 'var', name: body, value: String(raw) };
}

function render(segment: PatternSegment, offset: number): string {
  switch (segment.kind) {
    case 'literal':
      return segment.text;
    case 'var':
      return segment.value;
    case 'num':
      return String(segment.from + offset).padStart(segment.pad, '0');
    case 'alpha':
      return String.fromCharCode(segment.from + offset);
  }
}

/**
 * El código en la posición `index` (0-based) sin materializar los anteriores.
 * El rango más a la derecha es el que varía más rápido.
 */
export function codeAt(plan: PatternPlan, index: number): string {
  if (index < 0 || index >= plan.total) throw new PatternError(`Índice ${index} fuera del plan.`);
  let rest = index;
  const parts: string[] = new Array<string>(plan.segments.length);
  for (let i = plan.segments.length - 1; i >= 0; i -= 1) {
    const segment = plan.segments[i];
    if (!segment) continue;
    const size = sizeOf(segment);
    const offset = size === 1 ? 0 : rest % size;
    rest = size === 1 ? rest : Math.floor(rest / size);
    parts[i] = render(segment, offset);
  }
  return parts.join('');
}

export function generateCodes(plan: PatternPlan): string[] {
  const out: string[] = new Array<string>(plan.total);
  for (let i = 0; i < plan.total; i += 1) out[i] = codeAt(plan, i);
  return out;
}

export interface CodePreview {
  total: number;
  /** Primeros códigos (por defecto 3). */
  head: string[];
  /** Últimos códigos (por defecto 2). */
  tail: string[];
  /** true cuando head+tail no cubren el total y hay que dibujar el «…». */
  elided: boolean;
}

/** Vista previa barata: los primeros y los últimos, sin generar el medio. */
export function previewCodes(plan: PatternPlan, headCount = 3, tailCount = 2): CodePreview {
  const head: string[] = [];
  const tail: string[] = [];
  for (let i = 0; i < Math.min(headCount, plan.total); i += 1) head.push(codeAt(plan, i));
  if (plan.total > headCount) {
    const start = Math.max(headCount, plan.total - tailCount);
    for (let i = start; i < plan.total; i += 1) tail.push(codeAt(plan, i));
  }
  return { total: plan.total, head, tail, elided: head.length + tail.length < plan.total };
}

export interface PatternCheck {
  plan: PatternPlan | null;
  error: string | null;
  preview: CodePreview | null;
}

/** Envoltorio sin excepciones, para usar directo desde la UI en cada tecleo. */
export function checkPattern(
  pattern: string,
  vars: Readonly<Record<string, string | number>> = {},
): PatternCheck {
  try {
    const plan = parseCodePattern(pattern, vars);
    return { plan, error: null, preview: previewCodes(plan) };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Patrón inválido.';
    return { plan: null, error: message, preview: null };
  }
}

/** Nombres de variable que aparecen en el patrón, aunque no tengan valor todavía. */
export function patternVariables(pattern: string): string[] {
  const names: string[] = [];
  const re = /\{([^}]*)\}/g;
  let match = re.exec(pattern);
  while (match !== null) {
    const body = match[1] ?? '';
    if (!body.includes('..') && VAR_NAME.test(body) && !names.includes(body)) names.push(body);
    match = re.exec(pattern);
  }
  return names;
}
