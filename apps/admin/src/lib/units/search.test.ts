import { describe, expect, it } from 'vitest';
import { emptyQuery, isEmptyQuery, parseUnitQuery, rangeMatches, tokenize } from './search.ts';

describe('tokenize', () => {
  it('respeta comillas dobles', () => {
    expect(tokenize('a "dos palabras" b')).toEqual(['a', 'dos palabras', 'b']);
  });
  it('colapsa espacios', () => {
    expect(tokenize('  a   b  ')).toEqual(['a', 'b']);
  });
});

describe('parseUnitQuery', () => {
  it('query vacía', () => {
    expect(isEmptyQuery(parseUnitQuery('   '))).toBe(true);
    expect(isEmptyQuery(emptyQuery())).toBe(true);
  });

  it('m2>300 deja un mínimo exclusivo', () => {
    const q = parseUnitQuery('m2>300');
    expect(q.m2.min).toBe(300);
    expect(q.m2.minInclusive).toBe(false);
    expect(q.m2.max).toBeNull();
  });

  it('m2>=90 m2<=100 arma un rango cerrado', () => {
    const q = parseUnitQuery('m2>=90 m2<=100');
    expect(q.m2).toMatchObject({ min: 90, max: 100, minInclusive: true, maxInclusive: true });
  });

  it('m2=91,3 acepta coma decimal', () => {
    const q = parseUnitQuery('m2=91,3');
    expect(q.m2.min).toBeCloseTo(91.3);
    expect(q.m2.max).toBeCloseTo(91.3);
  });

  it('precio>150.000 lee el punto como separador de miles', () => {
    expect(parseUnitQuery('precio>150.000').price.min).toBe(150000);
    expect(parseUnitQuery('precio>150.000,50').price.min).toBeCloseTo(150000.5);
  });

  it('estado:reservado', () => {
    expect(parseUnitQuery('estado:reservado').status).toEqual(['reservado']);
  });

  it('estado con varios valores y normalización', () => {
    const q = parseUnitQuery('estado:reservado,no disponible'.replace(' ', '_'));
    expect(q.status).toEqual(['reservado', 'no_disponible']);
  });

  it('estado inválido avisa sin romper el resto', () => {
    const q = parseUnitQuery('estado:violeta m2>10');
    expect(q.status).toEqual([]);
    expect(q.warnings).toHaveLength(1);
    expect(q.m2.min).toBe(10);
  });

  it('sin:poligono y con:precio', () => {
    const q = parseUnitQuery('sin:poligono con:precio');
    expect(q.missing).toEqual(['poligono']);
    expect(q.has).toEqual(['precio']);
  });

  it('acepta tildes en sin:polígono', () => {
    expect(parseUnitQuery('sin:polígono').missing).toEqual(['poligono']);
  });

  it('grupo y tipo se normalizan', () => {
    const q = parseUnitQuery('grupo:b2 tipo:DUPLEX');
    expect(q.groupCodes).toEqual(['B2']);
    expect(q.typeCodes).toEqual(['duplex']);
  });

  it('un filtro desconocido cae a texto libre y avisa', () => {
    const q = parseUnitQuery('color:rojo');
    expect(q.text).toEqual(['color:rojo']);
    expect(q.warnings).toHaveLength(1);
  });

  it('mezcla operadores y texto libre', () => {
    const q = parseUnitQuery('B2 m2>170 estado:disponible sin:precio');
    expect(q.text).toEqual(['B2']);
    expect(q.m2.min).toBe(170);
    expect(q.status).toEqual(['disponible']);
    expect(q.missing).toEqual(['precio']);
    expect(isEmptyQuery(q)).toBe(false);
  });

  it('no duplica valores repetidos', () => {
    expect(parseUnitQuery('estado:vendido estado:vendido').status).toEqual(['vendido']);
  });
});

describe('rangeMatches', () => {
  const q = parseUnitQuery('m2>300');
  it('excluye el borde cuando es exclusivo', () => {
    expect(rangeMatches(q.m2, 300)).toBe(false);
    expect(rangeMatches(q.m2, 300.01)).toBe(true);
  });
  it('un rango vacío acepta todo', () => {
    expect(rangeMatches(emptyQuery().m2, null)).toBe(true);
  });
  it('un valor nulo no matchea un rango con límites', () => {
    expect(rangeMatches(q.m2, null)).toBe(false);
  });
  it('bordes inclusivos', () => {
    const r = parseUnitQuery('m2>=90 m2<=100').m2;
    expect(rangeMatches(r, 90)).toBe(true);
    expect(rangeMatches(r, 100)).toBe(true);
    expect(rangeMatches(r, 100.5)).toBe(false);
  });
});
