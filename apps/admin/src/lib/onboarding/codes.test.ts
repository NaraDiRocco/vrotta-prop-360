import { describe, expect, it } from 'vitest';
import {
  checkPattern,
  codeAt,
  generateCodes,
  MAX_GENERATED,
  parseCodePattern,
  patternVariables,
  previewCodes,
} from './codes.ts';

describe('parseCodePattern', () => {
  it('expande un rango numérico con padding tomado del primer extremo', () => {
    const codes = generateCodes(parseCodePattern('L{01..05}'));
    expect(codes).toEqual(['L01', 'L02', 'L03', 'L04', 'L05']);
  });

  it('no padea cuando el extremo no empieza en cero', () => {
    expect(generateCodes(parseCodePattern('{8..11}'))).toEqual(['8', '9', '10', '11']);
  });

  it('expande rangos de letras respetando la caja', () => {
    expect(generateCodes(parseCodePattern('B1-{A..D}'))).toEqual(['B1-A', 'B1-B', 'B1-C', 'B1-D']);
    expect(generateCodes(parseCodePattern('{a..c}'))).toEqual(['a', 'b', 'c']);
  });

  it('sustituye variables', () => {
    const plan = parseCodePattern('M{manzana}-L{01..03}', { manzana: 7 });
    expect(generateCodes(plan)).toEqual(['M7-L01', 'M7-L02', 'M7-L03']);
    expect(plan.variables).toEqual(['manzana']);
  });

  it('con dos rangos varía primero el de la derecha', () => {
    const plan = parseCodePattern('T{torre}-{1..2}{A..B}', { torre: 1 });
    expect(generateCodes(plan)).toEqual(['T1-1A', 'T1-1B', 'T1-2A', 'T1-2B']);
  });

  it('cubre el caso real de 640 lotes', () => {
    // 640 lotes = un patrón por manzana; acá comprobamos el volumen de uno.
    const plan = parseCodePattern('M{manzana}-L{001..640}', { manzana: 1 });
    expect(plan.total).toBe(640);
    const codes = generateCodes(plan);
    expect(codes[0]).toBe('M1-L001');
    expect(codes[639]).toBe('M1-L640');
    expect(new Set(codes).size).toBe(640);
  });

  it('rechaza patrones imposibles con un mensaje accionable', () => {
    expect(() => parseCodePattern('L{10..1}')).toThrow(/invertido/i);
    expect(() => parseCodePattern('L{01..')).toThrow(/cerrar/i);
    expect(() => parseCodePattern('L{manzana}')).toThrow(/no tiene valor/i);
    expect(() => parseCodePattern('L{1...5}')).toThrow(/rango/i);
    expect(() => parseCodePattern('   ')).toThrow(/vacío/i);
  });

  it('corta antes de generar más de MAX_GENERATED', () => {
    expect(() => parseCodePattern(`L{1..${MAX_GENERATED + 1}}`)).toThrow(/más de/i);
  });
});

describe('codeAt', () => {
  it('coincide con la expansión completa en todas las posiciones', () => {
    const plan = parseCodePattern('M{1..3}-L{01..04}');
    const all = generateCodes(plan);
    for (let i = 0; i < plan.total; i += 1) expect(codeAt(plan, i)).toBe(all[i]);
  });

  it('no acepta índices fuera del plan', () => {
    const plan = parseCodePattern('{1..3}');
    expect(() => codeAt(plan, 3)).toThrow();
    expect(() => codeAt(plan, -1)).toThrow();
  });
});

describe('previewCodes', () => {
  it('devuelve los primeros 3 y los últimos 2', () => {
    const preview = previewCodes(parseCodePattern('M1-L{01..48}'));
    expect(preview.total).toBe(48);
    expect(preview.head).toEqual(['M1-L01', 'M1-L02', 'M1-L03']);
    expect(preview.tail).toEqual(['M1-L47', 'M1-L48']);
    expect(preview.elided).toBe(true);
  });

  it('no elide ni repite cuando entran todos', () => {
    const preview = previewCodes(parseCodePattern('L{1..4}'));
    expect(preview.head).toEqual(['L1', 'L2', 'L3']);
    expect(preview.tail).toEqual(['L4']);
    expect(preview.elided).toBe(false);
    expect([...preview.head, ...preview.tail]).toEqual(['L1', 'L2', 'L3', 'L4']);
  });

  it('con menos de 3 códigos no inventa cola', () => {
    const preview = previewCodes(parseCodePattern('L{1..2}'));
    expect(preview.head).toEqual(['L1', 'L2']);
    expect(preview.tail).toEqual([]);
  });
});

describe('checkPattern', () => {
  it('no lanza: devuelve el error como dato', () => {
    const bad = checkPattern('L{9..1}');
    expect(bad.plan).toBeNull();
    expect(bad.error).toMatch(/invertido/i);

    const good = checkPattern('B{bloque}-{A..C}', { bloque: 2 });
    expect(good.error).toBeNull();
    expect(good.preview?.total).toBe(3);
  });
});

describe('patternVariables', () => {
  it('lista las variables aunque no tengan valor', () => {
    expect(patternVariables('T{torre}-{piso}{A..D}')).toEqual(['torre', 'piso']);
    expect(patternVariables('L{01..10}')).toEqual([]);
  });
});
