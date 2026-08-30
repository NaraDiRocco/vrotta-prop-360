import { describe, expect, it } from 'vitest';
import { checkPattern } from './codes.ts';
import { defaultCounts, expandTemplate, PROJECT_KINDS, PROJECT_TEMPLATES, templateFor, templateSummary } from './templates.ts';
import { slugify, uniqueSlug, slugError, normalizeKey } from './slug.ts';

const ids = () => {
  let n = 0;
  return () => `id-${(n += 1)}`;
};

describe('PROJECT_TEMPLATES', () => {
  it('cubre todos los kinds del enum', () => {
    for (const kind of PROJECT_KINDS) expect(PROJECT_TEMPLATES[kind]?.kind).toBe(kind);
  });

  it('el patrón sugerido de cada plantilla compila con las variables de sus niveles', () => {
    for (const kind of PROJECT_KINDS) {
      const template = templateFor(kind);
      const vars: Record<string, string> = {};
      for (const level of template.levels) vars[level.kind] = '1';
      const check = checkPattern(template.unitCodePattern, vars);
      expect(check.error, `${kind}: ${check.error}`).toBeNull();
    }
  });
});

describe('expandTemplate', () => {
  it('loteo: etapas × manzanas anidadas', () => {
    const { groups, unitTypes } = expandTemplate(PROJECT_TEMPLATES.loteo, { etapa: 2, manzana: 3 }, ids());
    expect(groups.filter((g) => g.kind === 'etapa')).toHaveLength(2);
    expect(groups.filter((g) => g.kind === 'manzana')).toHaveLength(6);
    // Cada manzana cuelga de una etapa, no de la raíz.
    expect(groups.filter((g) => g.kind === 'manzana').every((g) => g.parentId !== null)).toBe(true);
    expect(unitTypes.map((t) => t.code)).toEqual(['lote']);
  });

  it('los códigos son únicos dentro de su padre (es el índice único de la tabla)', () => {
    const { groups } = expandTemplate(PROJECT_TEMPLATES.loteo, { etapa: 2, manzana: 4 }, ids());
    const seen = new Set<string>();
    for (const g of groups) {
      const key = `${g.parentId ?? 'root'}::${g.code}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('complejo: un solo nivel de bloques, sin padre', () => {
    const { groups, unitTypes } = expandTemplate(PROJECT_TEMPLATES.complejo, defaultCounts(PROJECT_TEMPLATES.complejo), ids());
    expect(groups).toHaveLength(5);
    expect(groups.map((g) => g.code)).toEqual(['B1', 'B2', 'B3', 'B4', 'B5']);
    expect(groups.every((g) => g.parentId === null)).toBe(true);
    expect(unitTypes.map((t) => t.code)).toEqual(['duplex', '1dorm']);
  });

  it('edificio: 1 torre × 10 pisos por defecto', () => {
    const { groups } = expandTemplate(PROJECT_TEMPLATES.edificio, defaultCounts(PROJECT_TEMPLATES.edificio), ids());
    expect(groups.filter((g) => g.kind === 'torre')).toHaveLength(1);
    expect(groups.filter((g) => g.kind === 'piso')).toHaveLength(10);
  });

  it('un nivel en 0 se saltea y sus hijos suben', () => {
    const { groups } = expandTemplate(PROJECT_TEMPLATES.loteo, { etapa: 0, manzana: 3 }, ids());
    expect(groups).toHaveLength(3);
    expect(groups.every((g) => g.kind === 'manzana' && g.parentId === null)).toBe(true);
  });

  it('mixto no propone nada', () => {
    const expanded = expandTemplate(PROJECT_TEMPLATES.mixto, {}, ids());
    expect(expanded.groups).toEqual([]);
    expect(expanded.unitTypes).toEqual([]);
  });

  it('el resumen coincide con lo que expande', () => {
    const counts = { etapa: 2, manzana: 3 };
    const summary = templateSummary(PROJECT_TEMPLATES.loteo, counts);
    const { groups } = expandTemplate(PROJECT_TEMPLATES.loteo, counts, ids());
    for (const row of summary) {
      expect(groups.filter((g) => g.kind === row.kind)).toHaveLength(row.total);
    }
  });
});

describe('slug', () => {
  it('slugifica nombres reales', () => {
    expect(slugify('Baleia Punta Ballena')).toBe('baleia-punta-ballena');
    expect(slugify('Dúplex Ñandú 3')).toBe('duplex-nandu-3');
    expect(slugify('  ---  ')).toBe('');
  });

  it('desambigua contra los que ya existen', () => {
    expect(uniqueSlug('baleia', [])).toBe('baleia');
    expect(uniqueSlug('baleia', ['baleia'])).toBe('baleia-2');
    expect(uniqueSlug('baleia', ['baleia', 'baleia-2'])).toBe('baleia-3');
  });

  it('rechaza slugs inválidos y reservados', () => {
    expect(slugError('')).toMatch(/vacío/);
    expect(slugError('Con Mayúsculas')).toMatch(/minúsculas/);
    expect(slugError('doble--guion')).toMatch(/minúsculas/);
    expect(slugError('-borde')).toMatch(/minúsculas/);
    expect(slugError('new', { reserved: ['new'] })).toMatch(/reservado/);
    expect(slugError('baleia-2')).toBeNull();
  });

  it('normalizeKey aplana encabezados de planilla', () => {
    expect(normalizeKey('Superficie Cubierta (m²)')).toBe('superficie_cubierta_m');
    expect(normalizeKey('  Código_Unidad ')).toBe('codigo_unidad');
  });
});
