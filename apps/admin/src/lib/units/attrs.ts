/**
 * Validación de `units.attrs` contra el `attr_schema` de su `unit_type`.
 *
 * `attr_schema` es un JSON Schema guardado en jsonb. Acá implementamos el
 * subconjunto que el editor de estructura sabe generar (object + properties
 * con type/enum/min/max/required). No es un validador JSON Schema completo a
 * propósito: preferimos un validador chico y auditable a una dependencia que
 * acepte esquemas que el editor no sabe escribir.
 *
 * Se usa en dos lugares:
 *  1. edición inline de un atributo (validar un valor)
 *  2. guardar un cambio de schema — ANTES de commitear, para poder decir
 *     "esto deja 37 unidades inválidas" en vez de romperlas en silencio.
 */

export type AttrPrimitive = 'string' | 'number' | 'integer' | 'boolean';

export interface AttrIssue {
  key: string;
  message: string;
}

export interface AttrValidation {
  ok: boolean;
  issues: AttrIssue[];
}

export interface AttrPropSchema {
  type?: AttrPrimitive;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  title?: string;
}

export interface AttrSchema {
  type?: string;
  properties: Record<string, AttrPropSchema>;
  required: string[];
  additionalProperties: boolean;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Normaliza el jsonb crudo de la DB a una forma con la que se puede trabajar. */
export function normalizeAttrSchema(raw: unknown): AttrSchema {
  const out: AttrSchema = { type: 'object', properties: {}, required: [], additionalProperties: true };
  if (!isRecord(raw)) return out;
  if (typeof raw['type'] === 'string') out.type = raw['type'];
  if (raw['additionalProperties'] === false) out.additionalProperties = false;
  const req = raw['required'];
  if (Array.isArray(req)) out.required = req.filter((k): k is string => typeof k === 'string');
  const props = raw['properties'];
  if (isRecord(props)) {
    for (const [key, value] of Object.entries(props)) {
      if (!isRecord(value)) continue;
      const prop: AttrPropSchema = {};
      const t = value['type'];
      if (t === 'string' || t === 'number' || t === 'integer' || t === 'boolean') prop.type = t;
      if (Array.isArray(value['enum'])) prop.enum = value['enum'];
      if (typeof value['minimum'] === 'number') prop.minimum = value['minimum'];
      if (typeof value['maximum'] === 'number') prop.maximum = value['maximum'];
      if (typeof value['title'] === 'string') prop.title = value['title'];
      out.properties[key] = prop;
    }
  }
  return out;
}

export function validateAttrValue(key: string, prop: AttrPropSchema, value: unknown): AttrIssue[] {
  const issues: AttrIssue[] = [];
  if (value === null || value === undefined) return issues;

  switch (prop.type) {
    case 'integer':
      if (typeof value !== 'number' || !Number.isFinite(value)) issues.push({ key, message: 'debe ser un número entero' });
      else if (!Number.isInteger(value)) issues.push({ key, message: 'debe ser entero, no decimal' });
      break;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) issues.push({ key, message: 'debe ser un número' });
      break;
    case 'boolean':
      if (typeof value !== 'boolean') issues.push({ key, message: 'debe ser sí/no' });
      break;
    case 'string':
      if (typeof value !== 'string') issues.push({ key, message: 'debe ser texto' });
      break;
    default:
      break;
  }

  if (prop.enum && !prop.enum.some((o) => o === value)) {
    issues.push({ key, message: `debe ser uno de: ${prop.enum.map((o) => String(o)).join(', ')}` });
  }
  if (typeof value === 'number') {
    if (prop.minimum !== undefined && value < prop.minimum) issues.push({ key, message: `mínimo ${prop.minimum}` });
    if (prop.maximum !== undefined && value > prop.maximum) issues.push({ key, message: `máximo ${prop.maximum}` });
  }
  return issues;
}

export function validateAttrs(rawSchema: unknown, attrs: unknown): AttrValidation {
  const schema = normalizeAttrSchema(rawSchema);
  const issues: AttrIssue[] = [];
  const values = isRecord(attrs) ? attrs : {};

  for (const key of schema.required) {
    const v = values[key];
    if (v === undefined || v === null || v === '') issues.push({ key, message: 'es obligatorio' });
  }

  for (const [key, value] of Object.entries(values)) {
    const prop = schema.properties[key];
    if (!prop) {
      if (!schema.additionalProperties) issues.push({ key, message: 'no está en el esquema del tipo' });
      continue;
    }
    issues.push(...validateAttrValue(key, prop, value));
  }

  return { ok: issues.length === 0, issues };
}

export interface SchemaImpactUnit {
  code: string;
  attrs: unknown;
}

export interface SchemaImpact {
  total: number;
  invalid: number;
  /** Primeras N unidades que quedarían inválidas, para mostrarlas. */
  samples: { code: string; issues: AttrIssue[] }[];
  /** Cuántas unidades tienen cada problema, para ofrecer un arreglo masivo. */
  byIssue: { key: string; message: string; count: number }[];
}

/**
 * Simula un cambio de `attr_schema` contra las unidades existentes.
 * Se corre ANTES de guardar: sin esto, agregar un `required` rompe en silencio
 * todas las unidades viejas.
 */
export function assessSchemaChange(
  nextSchema: unknown,
  units: readonly SchemaImpactUnit[],
  sampleLimit = 10,
): SchemaImpact {
  const samples: SchemaImpact['samples'] = [];
  const counter = new Map<string, { key: string; message: string; count: number }>();
  let invalid = 0;

  for (const unit of units) {
    const result = validateAttrs(nextSchema, unit.attrs);
    if (result.ok) continue;
    invalid += 1;
    if (samples.length < sampleLimit) samples.push({ code: unit.code, issues: result.issues });
    for (const issue of result.issues) {
      const id = `${issue.key}::${issue.message}`;
      const entry = counter.get(id);
      if (entry) entry.count += 1;
      else counter.set(id, { key: issue.key, message: issue.message, count: 1 });
    }
  }

  return {
    total: units.length,
    invalid,
    samples,
    byIssue: [...counter.values()].sort((a, b) => b.count - a.count),
  };
}
