/**
 * Plantillas de estructura por tipo de proyecto.
 *
 * DATOS, no código: agregar un tipo de emprendimiento nuevo es agregar una
 * entrada acá, sin tocar el formulario ni la API. Lo que la plantilla propone
 * es un punto de partida — el operador lo acepta, lo edita en el formulario o
 * lo descarta entero y arma la estructura a mano.
 */
import type { ProjectKind } from '@r360/core';
import type { NewGroupInput, NewUnitTypeInput } from '../data/repo.ts';

export interface TemplateLevel {
  /** `groups.kind`: manzana | bloque | torre | piso | etapa | … */
  kind: string;
  /** Rótulo en plural para la UI. */
  label: string;
  /** Cuántos crear por defecto. 0 = el nivel existe pero arranca vacío. */
  count: number;
  /** Código del grupo. `{n}` = índice 1-based dentro de su padre. */
  codePattern: string;
  /** Nombre legible del grupo. `{n}` = índice 1-based. */
  namePattern: string;
}

export interface TemplateUnitType extends NewUnitTypeInput {
  /** Qué representa este tipo, para el resumen de la plantilla. */
  hint: string;
}

export interface ProjectTemplate {
  kind: ProjectKind;
  label: string;
  /** Una línea: qué jerarquía arma y para qué sirve. */
  description: string;
  levels: TemplateLevel[];
  unitTypes: TemplateUnitType[];
  /** Patrón sugerido para el generador masivo, ya con las variables del nivel hoja. */
  unitCodePattern: string;
  /** `kind` del grupo al que cuelgan las unidades (el nivel hoja). */
  unitParentKind: string | null;
  /** Nombre de la unidad en singular, para los rótulos ("48 lotes"). */
  unitNoun: { one: string; many: string };
}

const M2 = { type: 'number' } as const;
const INT = { type: 'integer' } as const;
const BOOL = { type: 'boolean' } as const;
const ORIENTACION = {
  type: 'string',
  enum: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'],
  title: 'Orientación',
} as const;

function objectSchema(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return { type: 'object', properties, required, additionalProperties: false };
}

export const PROJECT_TEMPLATES: Record<ProjectKind, ProjectTemplate> = {
  loteo: {
    kind: 'loteo',
    label: 'Loteo',
    description: 'Etapas → manzanas → lotes. La estructura típica de un fraccionamiento.',
    levels: [
      { kind: 'etapa', label: 'Etapas', count: 1, codePattern: 'E{n}', namePattern: 'Etapa {n}' },
      { kind: 'manzana', label: 'Manzanas', count: 4, codePattern: 'M{n}', namePattern: 'Manzana {n}' },
    ],
    unitTypes: [
      {
        code: 'lote',
        name: 'Lote',
        hint: 'Terreno con frente, fondo y orientación.',
        attrSchema: objectSchema(
          { superficie: M2, frente: M2, fondo: M2, orientacion: ORIENTACION },
          ['superficie'],
        ),
      },
    ],
    unitCodePattern: 'M{manzana}-L{01..48}',
    unitParentKind: 'manzana',
    unitNoun: { one: 'lote', many: 'lotes' },
  },

  edificio: {
    kind: 'edificio',
    label: 'Edificio',
    description: 'Torres → pisos → unidades. Para torres de departamentos.',
    levels: [
      { kind: 'torre', label: 'Torres', count: 1, codePattern: 'T{n}', namePattern: 'Torre {n}' },
      { kind: 'piso', label: 'Pisos', count: 10, codePattern: 'P{n}', namePattern: 'Piso {n}' },
    ],
    unitTypes: [
      {
        code: 'departamento',
        name: 'Departamento',
        hint: 'Unidad de torre, con cubierta y balcón.',
        attrSchema: objectSchema(
          {
            dormitorios: INT,
            banos: { ...INT, title: 'Baños' },
            sup_cubierta: { ...M2, title: 'Sup. cubierta (m²)' },
            sup_balcon: { ...M2, title: 'Sup. balcón (m²)' },
            cochera: BOOL,
            orientacion: ORIENTACION,
          },
          ['dormitorios'],
        ),
      },
    ],
    unitCodePattern: 'T{torre}-{piso}{A..D}',
    unitParentKind: 'piso',
    unitNoun: { one: 'unidad', many: 'unidades' },
  },

  complejo: {
    kind: 'complejo',
    description: 'Bloques → viviendas. Un solo nivel de agrupación, como Baleia.',
    label: 'Complejo',
    levels: [{ kind: 'bloque', label: 'Bloques', count: 5, codePattern: 'B{n}', namePattern: 'Bloque {n}' }],
    unitTypes: [
      {
        code: 'duplex',
        name: 'Dúplex',
        hint: 'Vivienda en dos plantas.',
        attrSchema: objectSchema(
          {
            dormitorios: INT,
            sup_cubierta: { ...M2, title: 'Sup. cubierta (m²)' },
            sup_semicubierta: { ...M2, title: 'Sup. semicubierta (m²)' },
            sup_descubierta: { ...M2, title: 'Sup. descubierta (m²)' },
            cochera: BOOL,
          },
          ['dormitorios'],
        ),
      },
      {
        code: '1dorm',
        name: '1 dormitorio',
        hint: 'Vivienda de una planta.',
        attrSchema: objectSchema(
          {
            dormitorios: INT,
            sup_cubierta: { ...M2, title: 'Sup. cubierta (m²)' },
            sup_semicubierta: { ...M2, title: 'Sup. semicubierta (m²)' },
            sup_descubierta: { ...M2, title: 'Sup. descubierta (m²)' },
            cochera: BOOL,
          },
          ['dormitorios'],
        ),
      },
    ],
    unitCodePattern: 'B{bloque}-{A..K}',
    unitParentKind: 'bloque',
    unitNoun: { one: 'vivienda', many: 'viviendas' },
  },

  mixto: {
    kind: 'mixto',
    label: 'Mixto',
    description: 'Sin plantilla: la estructura se arma a mano o la trae el CSV.',
    levels: [],
    unitTypes: [],
    unitCodePattern: '{01..10}',
    unitParentKind: null,
    unitNoun: { one: 'unidad', many: 'unidades' },
  },
};

export const PROJECT_KINDS: readonly ProjectKind[] = ['loteo', 'edificio', 'complejo', 'mixto'];

export function templateFor(kind: ProjectKind): ProjectTemplate {
  return PROJECT_TEMPLATES[kind];
}

/** Cantidades por nivel, editables en el formulario antes de aceptar la plantilla. */
export type LevelCounts = Readonly<Record<string, number>>;

export function defaultCounts(template: ProjectTemplate): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const level of template.levels) counts[level.kind] = level.count;
  return counts;
}

function fill(pattern: string, n: number): string {
  return pattern.replace(/\{n\}/g, String(n));
}

export interface ExpandedTemplate {
  groups: NewGroupInput[];
  unitTypes: NewUnitTypeInput[];
}

/**
 * Materializa el árbol de grupos. Los niveles anidan: con 2 etapas y 4
 * manzanas salen 2 etapas y 8 manzanas (4 por etapa), con códigos únicos
 * dentro de su padre — que es exactamente lo que exige el índice único de
 * `groups(project_id, parent_id, code)`.
 *
 * Un nivel con `count = 0` se salta y sus hijos suben un escalón: pedir "0
 * etapas, 4 manzanas" da 4 manzanas top-level, no un árbol vacío.
 */
export function expandTemplate(
  template: ProjectTemplate,
  counts: LevelCounts = defaultCounts(template),
  newId: () => string = () => crypto.randomUUID(),
): ExpandedTemplate {
  const groups: NewGroupInput[] = [];
  let parents: (string | null)[] = [null];

  for (const level of template.levels) {
    const count = Math.max(0, Math.floor(counts[level.kind] ?? level.count));
    if (count === 0) continue;
    const next: (string | null)[] = [];
    for (const parentId of parents) {
      for (let n = 1; n <= count; n += 1) {
        const id = newId();
        groups.push({
          id,
          parentId,
          kind: level.kind,
          code: fill(level.codePattern, n),
          name: fill(level.namePattern, n),
          sort: n,
        });
        next.push(id);
      }
    }
    parents = next;
  }

  return { groups, unitTypes: template.unitTypes.map(({ hint: _hint, ...type }) => type) };
}

/** Cuántos grupos crearía la plantilla, por nivel. Para el resumen previo. */
export function templateSummary(
  template: ProjectTemplate,
  counts: LevelCounts = defaultCounts(template),
): { kind: string; label: string; total: number }[] {
  const rows: { kind: string; label: string; total: number }[] = [];
  let multiplier = 1;
  for (const level of template.levels) {
    const count = Math.max(0, Math.floor(counts[level.kind] ?? level.count));
    if (count === 0) continue;
    multiplier *= count;
    rows.push({ kind: level.kind, label: level.label, total: multiplier });
  }
  return rows;
}
