import { describe, expect, it } from 'vitest';
import { assessSchemaChange, normalizeAttrSchema, validateAttrs } from './attrs.ts';

// El schema real del tipo "duplex" del seed de Baleia.
const DUPLEX = {
  type: 'object',
  properties: {
    dormitorios: { type: 'integer' },
    niveles: { type: 'integer' },
    balcon: { type: 'boolean' },
  },
};

describe('normalizeAttrSchema', () => {
  it('tolera basura', () => {
    expect(normalizeAttrSchema(null).properties).toEqual({});
    expect(normalizeAttrSchema('nope').required).toEqual([]);
    expect(normalizeAttrSchema(42).additionalProperties).toBe(true);
  });
  it('descarta propiedades con type desconocido pero conserva la clave', () => {
    const s = normalizeAttrSchema({ properties: { x: { type: 'geojson' } } });
    expect(s.properties['x']).toEqual({});
  });
  it('lee required y additionalProperties', () => {
    const s = normalizeAttrSchema({ required: ['a', 1], additionalProperties: false });
    expect(s.required).toEqual(['a']);
    expect(s.additionalProperties).toBe(false);
  });
});

describe('validateAttrs', () => {
  it('acepta los attrs del seed', () => {
    expect(validateAttrs(DUPLEX, { dormitorios: 2, niveles: 2 }).ok).toBe(true);
  });

  it('rechaza un decimal donde se espera entero', () => {
    const r = validateAttrs(DUPLEX, { dormitorios: 2.5 });
    expect(r.ok).toBe(false);
    expect(r.issues[0]).toMatchObject({ key: 'dormitorios' });
  });

  it('rechaza el tipo equivocado', () => {
    expect(validateAttrs(DUPLEX, { balcon: 'sí' }).ok).toBe(false);
    expect(validateAttrs(DUPLEX, { dormitorios: '2' }).ok).toBe(false);
  });

  it('permite atributos extra si additionalProperties no es false', () => {
    expect(validateAttrs(DUPLEX, { cochera: true }).ok).toBe(true);
  });

  it('los rechaza si additionalProperties es false', () => {
    const r = validateAttrs({ ...DUPLEX, additionalProperties: false }, { cochera: true });
    expect(r.ok).toBe(false);
    expect(r.issues[0]?.key).toBe('cochera');
  });

  it('exige los required', () => {
    const r = validateAttrs({ ...DUPLEX, required: ['dormitorios'] }, {});
    expect(r.ok).toBe(false);
    expect(r.issues[0]?.message).toContain('obligatorio');
  });

  it('null no dispara error de tipo, sólo de required', () => {
    expect(validateAttrs(DUPLEX, { niveles: null }).ok).toBe(true);
  });

  it('respeta enum y min/max', () => {
    const schema = {
      properties: {
        orientacion: { type: 'string', enum: ['norte', 'sur'] },
        dormitorios: { type: 'integer', minimum: 1, maximum: 4 },
      },
    };
    expect(validateAttrs(schema, { orientacion: 'este' }).ok).toBe(false);
    expect(validateAttrs(schema, { orientacion: 'norte' }).ok).toBe(true);
    expect(validateAttrs(schema, { dormitorios: 9 }).issues[0]?.message).toContain('máximo');
    expect(validateAttrs(schema, { dormitorios: 0 }).issues[0]?.message).toContain('mínimo');
  });
});

describe('assessSchemaChange', () => {
  const units = [
    { code: 'B2-A', attrs: { dormitorios: 2, niveles: 2 } },
    { code: 'B2-F', attrs: { dormitorios: 1 } },
    { code: 'B3-D', attrs: { dormitorios: 1 } },
  ];

  it('un schema compatible no rompe nada', () => {
    expect(assessSchemaChange(DUPLEX, units).invalid).toBe(0);
  });

  it('agregar un required cuenta las unidades que quedarían inválidas', () => {
    const impact = assessSchemaChange({ ...DUPLEX, required: ['niveles'] }, units);
    expect(impact.total).toBe(3);
    expect(impact.invalid).toBe(2);
    expect(impact.samples.map((s) => s.code)).toEqual(['B2-F', 'B3-D']);
  });

  it('agrupa los problemas por causa para poder ofrecer un arreglo masivo', () => {
    const impact = assessSchemaChange({ ...DUPLEX, required: ['niveles'] }, units);
    expect(impact.byIssue).toEqual([{ key: 'niveles', message: 'es obligatorio', count: 2 }]);
  });

  it('limita las muestras', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ code: `L-${i}`, attrs: {} }));
    const impact = assessSchemaChange({ ...DUPLEX, required: ['niveles'] }, many, 5);
    expect(impact.invalid).toBe(50);
    expect(impact.samples).toHaveLength(5);
  });
});
