import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildImportPlan,
  detectDelimiter,
  detectMapping,
  emptyMapping,
  parseBoolean,
  parseCsv,
  parseDecimal,
  parseStatus,
} from './csv.ts';

const REPO_ROOT = join(import.meta.dirname, '../../../../..');
const BALEIA_CSV = join(REPO_ROOT, 'tools/baleia/out/baleia_unidades.csv');
const BLANK_CSV = join(REPO_ROOT, 'docs/03-PLANTILLAS-CSV/plantilla-en-blanco.csv');

const PLANTILLA_HEADERS = [
  'codigo_unidad',
  'tipologia',
  'superficie_cubierta_m2',
  'superficie_total_m2',
  'estado',
  'precio',
  'moneda',
  'mostrar_precio_publico',
  'financiacion',
  'bloque_o_piso',
  'orientacion',
  'notas_internas',
];

describe('parseCsv', () => {
  it('respeta comillas, comas internas y comillas escapadas', () => {
    const rows = parseCsv('a,b\n"x,1","dijo ""hola"""');
    expect(rows).toEqual([
      ['a', 'b'],
      ['x,1', 'dijo "hola"'],
    ]);
  });

  it('tolera CRLF, BOM y líneas vacías al final', () => {
    const rows = parseCsv('﻿a,b\r\n1,2\r\n\r\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('detecta el separador `;`', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(parseCsv('a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('detectMapping', () => {
  it('mapea la plantilla oficial entera', () => {
    const mapping = detectMapping(PLANTILLA_HEADERS);
    expect(mapping.code).toBe(0);
    expect(mapping.typeCode).toBe(1);
    expect(mapping.areaCoveredM2).toBe(2);
    expect(mapping.areaTotalM2).toBe(3);
    expect(mapping.status).toBe(4);
    expect(mapping.price).toBe(5);
    expect(mapping.currency).toBe(6);
    expect(mapping.priceVisibility).toBe(7);
    expect(mapping.financing).toBe(8);
    expect(mapping.groupCode).toBe(9);
    expect(mapping.orientation).toBe(10);
    expect(mapping.notes).toBe(11);
  });

  it('mapea encabezados con acentos, mayúsculas y espacios', () => {
    const mapping = detectMapping(['Código', 'Manzana', 'Superficie Total', 'Estado', 'Precio']);
    expect(mapping.code).toBe(0);
    expect(mapping.groupCode).toBe(1);
    expect(mapping.areaTotalM2).toBe(2);
    expect(mapping.status).toBe(3);
    expect(mapping.price).toBe(4);
  });

  it('no asigna una misma columna a dos campos', () => {
    const mapping = detectMapping(['codigo', 'superficie_cubierta_m2', 'superficie_total_m2']);
    expect(mapping.areaCoveredM2).toBe(1);
    expect(mapping.areaTotalM2).toBe(2);
    expect(mapping.areaCoveredM2).not.toBe(mapping.areaTotalM2);
  });

  it('deja en -1 lo que no reconoce', () => {
    const mapping = detectMapping(['codigo', 'columna_rarisima']);
    expect(mapping.code).toBe(0);
    expect(mapping.price).toBe(-1);
    expect(mapping.status).toBe(-1);
  });

  it('un encabezado vacío nunca se mapea', () => {
    const mapping = detectMapping(['', 'codigo_unidad']);
    expect(mapping.code).toBe(1);
  });
});

describe('parseDecimal', () => {
  it.each([
    ['109.68', 109.68],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['120000', 120000],
    ['$ 120.000', 120000],
    ['175,92', 175.92],
    ['120 m2', 120],
  ])('%s → %s', (raw, expected) => {
    expect(parseDecimal(raw)).toBe(expected);
  });

  it('vacío es undefined y basura es null', () => {
    expect(parseDecimal('')).toBeUndefined();
    expect(parseDecimal('   ')).toBeUndefined();
    expect(parseDecimal('a consultar')).toBeNull();
  });
});

describe('parseStatus / parseBoolean', () => {
  it('acepta los estados canónicos y sus sinónimos', () => {
    expect(parseStatus('Disponible')).toBe('disponible');
    expect(parseStatus('VENDIDA')).toBe('vendido');
    expect(parseStatus('No Disponible')).toBe('no_disponible');
    expect(parseStatus('reserva')).toBe('reservado');
  });

  it('vacío es undefined, desconocido es null', () => {
    expect(parseStatus('')).toBeUndefined();
    expect(parseStatus('en trámite')).toBeNull();
  });

  it('parsea booleanos de planilla', () => {
    expect(parseBoolean('Sí')).toBe(true);
    expect(parseBoolean('no')).toBe(false);
    expect(parseBoolean('1')).toBe(true);
    expect(parseBoolean('quizás')).toBeNull();
    expect(parseBoolean('')).toBeUndefined();
  });
});

describe('buildImportPlan', () => {
  it('importa el CSV real de Baleia sin un solo error', () => {
    const plan = buildImportPlan(readFileSync(BALEIA_CSV, 'utf8'));
    expect(plan.issues).toEqual([]);
    expect(plan.units).toHaveLength(20);

    const first = plan.units[0];
    expect(first?.code).toBe('B2-A');
    expect(first?.groupCode).toBe('Bloque 2');
    expect(first?.typeCode).toBe('duplex');
    expect(first?.typeName).toBe('Dúplex');
    // 163.42 = precio real del brochure "BLOQUE 2 - DISPONIBLE" (set-2026),
    // sin cochera (se cobra aparte a USD 10.000 fijo). Antes de cargar el
    // dato comercial real, esta columna tenía 175.92 (con cochera incluida).
    expect(first?.areaTotalM2).toBe(163.42);
    expect(first?.attrs['sup_cubierta']).toBe(109.68);
    // La columna `estado` ahora trae el dato real del brochure (disponible).
    expect(first?.status).toBe('disponible');
    expect(first?.price).toEqual({ amount: 364861, currency: 'USD', visibility: 'public' });
    // Las notas con comas van entre comillas: tienen que llegar enteras.
    expect(String(first?.attrs['notas_internas'])).toContain('brochure pag.13');

    expect(plan.missingGroups).toEqual(['Bloque 2', 'Bloque 3']);
    expect(plan.missingTypes.map((t) => t.code)).toEqual(['duplex', '1-dormitorio']);
  });

  it('respeta el estado por defecto que elige el operador, sólo donde no hay dato real', () => {
    const plan = buildImportPlan(readFileSync(BALEIA_CSV, 'utf8'), { defaultStatus: 'no_disponible' });
    // Bloque 2 (9 unidades) ya trae estado real del brochure y no debe pisarse
    // con el default. Bloque 3 (11 unidades) sigue sin dato -> usa el default.
    const bloque2 = plan.units.filter((u) => u.code.startsWith('B2-'));
    const bloque3 = plan.units.filter((u) => u.code.startsWith('B3-'));
    // B2-F/B2-G (206/207) pasaron de 'disponible' a 'bloqueado' el 06/09/2026:
    // 3 de las 4 listas de precios del cliente dicen que esas unidades ya
    // están vendidas (ver tools/baleia/material/INVENTARIO.md §3 y
    // tools/baleia/README.md §3.2) y mientras no se confirme con Caetano el
    // recorrido no afirma disponibilidad ni publica precio para ellas.
    expect(bloque2.map((u) => u.status)).toEqual([
      'disponible', 'disponible', 'disponible', 'disponible', 'disponible',
      'bloqueado', 'bloqueado', 'vendido', 'vendido',
    ]);
    expect(bloque3.every((u) => u.status === 'no_disponible')).toBe(true);
  });

  it('no inventa unidades con la plantilla en blanco', () => {
    const plan = buildImportPlan(readFileSync(BLANK_CSV, 'utf8'));
    expect(plan.units).toEqual([]);
    expect(plan.totalRows).toBe(0);
    expect(plan.issues).toEqual([]);
  });

  it('reporta cada error con su número de línea y no devuelve la fila', () => {
    const csv = [
      'codigo_unidad,estado,superficie_total_m2,precio,moneda,mostrar_precio_publico',
      'A-1,disponible,100,1000,USD,si',
      ',disponible,100,,,',
      'A-3,en trámite,100,,,',
      'A-4,disponible,cien,,,',
      'A-1,disponible,100,,,',
      'A-6,disponible,100,-5,,',
      'A-7,disponible,100,1000,dólares,',
      'A-8,disponible,100,1000,USD,quizás',
    ].join('\n');
    const plan = buildImportPlan(csv);

    expect(plan.totalRows).toBe(8);
    expect(plan.units.map((u) => u.code)).toEqual(['A-1']);

    const byLine = new Map(plan.issues.map((i) => [i.line, i]));
    expect(byLine.get(3)?.field).toBe('code');
    expect(byLine.get(4)?.field).toBe('status');
    expect(byLine.get(5)?.field).toBe('areaTotalM2');
    expect(byLine.get(6)?.message).toMatch(/repetido.*línea 2/i);
    expect(byLine.get(7)?.field).toBe('price');
    expect(byLine.get(8)?.field).toBe('currency');
    expect(byLine.get(9)?.field).toBe('priceVisibility');
  });

  it('avisa cuando no encuentra la columna de código', () => {
    const plan = buildImportPlan('nombre,precio\nCasa,1000');
    expect(plan.issues.some((i) => i.field === 'code' && i.line === 1)).toBe(true);
  });

  it('marca como duplicadas las que ya están en el proyecto', () => {
    const csv = 'codigo_unidad\nB2-A\nB2-Z';
    const plan = buildImportPlan(csv, { existingUnitCodes: ['B2-A'] });
    expect(plan.issues).toEqual([]);
    expect(plan.duplicatesInProject).toEqual(['B2-A']);
  });

  it('no pide crear grupos ni tipos que ya existen', () => {
    const csv = 'codigo_unidad,tipologia,bloque_o_piso\nX-1,Dúplex,Bloque 2';
    const plan = buildImportPlan(csv, { existingGroupCodes: ['Bloque 2'], existingTypeCodes: ['duplex'] });
    expect(plan.missingGroups).toEqual([]);
    expect(plan.missingTypes).toEqual([]);
  });

  it('acepta un mapeo manual que pisa la autodetección', () => {
    const csv = 'col_a,col_b\nU-1,300';
    const mapping = { ...emptyMapping(), code: 0, areaTotalM2: 1 };
    const plan = buildImportPlan(csv, { mapping });
    expect(plan.issues).toEqual([]);
    expect(plan.units[0]?.code).toBe('U-1');
    expect(plan.units[0]?.areaTotalM2).toBe(300);
  });

  it('lee precio, moneda y visibilidad', () => {
    const csv = [
      'codigo_unidad,precio,moneda,mostrar_precio_publico',
      'A-1,"185.000",USD,si',
      'A-2,150000,uyu,no',
      'A-3,,,',
    ].join('\n');
    const plan = buildImportPlan(csv);
    expect(plan.issues).toEqual([]);
    expect(plan.units[0]?.price).toEqual({ amount: 185000, currency: 'USD', visibility: 'public' });
    expect(plan.units[1]?.price).toEqual({ amount: 150000, currency: 'UYU', visibility: 'on_request' });
    expect(plan.units[2]?.price).toBeNull();
  });
});
