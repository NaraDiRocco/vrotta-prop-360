import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { buildCodeIndex, matchCode, normalizeCode } from './codes.ts';
import {
  assignRowUnit,
  buildImportOps,
  classifyFeatures,
  parseGeoJson,
  setGroupAction,
  setRowAction,
  suggestCodeProperty,
  summarize,
} from './geojson-import.ts';
import { applyAction, createState, hotspotForUnit, hotspotsOf } from './state.ts';
import { emptyHistory, pushEntry, undo } from './history.ts';

/** El archivo real que produce el pipeline de Baleia. */
const BALEIA = new URL('../../../../../tools/baleia/out/baleia_hotspots.geojson', import.meta.url);

describe('normalización de códigos', () => {
  test('`L-14` ≈ «Lote 14» ≈ `14`', () => {
    expect(normalizeCode('L-14')).toBe('14');
    expect(normalizeCode('Lote 14')).toBe('14');
    expect(normalizeCode('lote 014')).toBe('14');
    expect(normalizeCode('14')).toBe('14');
    expect(normalizeCode('  LOTE  14 ')).toBe('14');
  });

  test('quita acentos y separadores pero conserva la estructura', () => {
    expect(normalizeCode('B2-A')).toBe('B2A');
    expect(normalizeCode('b2 a')).toBe('B2A');
    expect(normalizeCode('Manzana 3')).toBe('MANZANA3');
    expect(normalizeCode('Ñandú-1')).toBe('NANDU1');
  });

  test('no colapsa códigos que son genuinamente distintos', () => {
    // La `L` de `M1-L05` separa manzana de lote: quitarla haría chocar
    // `M1-L05` con `M15`, que son dos lotes diferentes del mismo loteo.
    expect(normalizeCode('M1-L05')).toBe('M1L5');
    expect(normalizeCode('M15')).toBe('M15');
    expect(normalizeCode('M1-L05')).not.toBe(normalizeCode('M15'));
  });

  test('el índice empareja exacto antes que normalizado', () => {
    const index = buildCodeIndex(['B2-A', 'B2-B']);
    expect(matchCode('B2-A', index)).toEqual({ kind: 'exact', code: 'B2-A' });
    expect(matchCode('b2 a', index)).toEqual({ kind: 'normalized', code: 'B2-A' });
    expect(matchCode('B9-Z', index)).toEqual({ kind: 'none' });
  });

  test('ante ambigüedad NO adivina', () => {
    const index = buildCodeIndex(['B2-A', 'B2A']);
    const out = matchCode('b2 a', index);
    expect(out.kind).toBe('ambiguous');
    if (out.kind === 'ambiguous') expect(out.candidates.sort()).toEqual(['B2-A', 'B2A']);
  });
});

describe('parseo', () => {
  test('parsea el GeoJSON real de Baleia: 11 features', () => {
    const parsed = parseGeoJson(readFileSync(BALEIA, 'utf8'), 'px');
    expect(parsed.features).toHaveLength(11);
    expect(parsed.propertyKeys).toEqual(['code', 'kind', 'name']);
    expect(parsed.skipped).toBe(0);
    const codes = parsed.features.map((f) => f.props['code']);
    expect(codes).toEqual(['B1', 'B2', 'B3', 'B4', 'B5', 'A', 'D', 'E', 'G', 'F', 'TERRENO']);
  });

  test('las coordenadas de Baleia ya vienen normalizadas 0..1', () => {
    const parsed = parseGeoJson(readFileSync(BALEIA, 'utf8'), 'px');
    for (const f of parsed.features) {
      for (const [x, y] of f.ring) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(1);
      }
    }
    expect(parsed.warnings).toEqual([]);
  });

  test('quita el vértice de cierre repetido del GeoJSON', () => {
    const text = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { code: 'X' },
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
        },
      ],
    });
    expect(parseGeoJson(text, 'px').features[0]!.ring).toHaveLength(3);
  });

  test('de un polígono con hueco toma el contorno exterior y avisa', () => {
    const text = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { code: 'X' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [[0, 0], [1, 0], [1, 1], [0, 1]],
              [[0.4, 0.4], [0.6, 0.4], [0.5, 0.6]],
            ],
          },
        },
      ],
    });
    const parsed = parseGeoJson(text, 'px');
    expect(parsed.features[0]!.ring).toHaveLength(4);
    expect(parsed.warnings.join(' ')).toContain('anillos secundarios');
  });

  test('en panorámica convierte grados a radianes', () => {
    const text = JSON.stringify({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [90, 0], [90, 45]]] },
    });
    const ring = parseGeoJson(text, 'sph').features[0]!.ring;
    expect(ring[1]![0]).toBeCloseTo(Math.PI / 2, 12);
    expect(ring[2]![1]).toBeCloseTo(Math.PI / 4, 12);
  });

  test('un archivo que no es JSON da un error legible, no una excepción cruda', () => {
    expect(() => parseGeoJson('{ esto no', 'px')).toThrow(/no es JSON válido/);
  });

  test('ignora geometrías que no son polígonos y lo dice', () => {
    const text = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0.5, 0.5] } },
        { type: 'Feature', properties: { code: 'A' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1]]] } },
      ],
    });
    const parsed = parseGeoJson(text, 'px');
    expect(parsed.features).toHaveLength(1);
    expect(parsed.skipped).toBe(1);
  });

  test('avisa si el archivo no parece normalizado sobre el master', () => {
    const text = JSON.stringify({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [[[100, 200], [300, 200], [300, 400]]] },
    });
    expect(parseGeoJson(text, 'px').warnings.join(' ')).toContain('fuera de 0..1');
  });
});

describe('conflictos', () => {
  const text = () => readFileSync(BALEIA, 'utf8');
  /** Unidades de un proyecto ficticio que se parece a la realidad de Baleia. */
  const UNITS = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'];

  test('sugiere `code` como propiedad del código', () => {
    const parsed = parseGeoJson(text(), 'px');
    expect(suggestCodeProperty(parsed.features, buildCodeIndex(UNITS))).toBe('code');
  });

  test('los once features de Baleia caen en los grupos esperados', () => {
    const parsed = parseGeoJson(text(), 'px');
    // B2 ya tiene polígono dibujado; el resto de los bloques está libre.
    const taken = new Map([['B2', 'hs-existente']]);
    const rows = classifyFeatures(parsed.features, 'code', UNITS, taken, 'px');
    const s = summarize(rows);

    expect(s.counts.match_free).toBe(4); // B1, B3, B4, B5
    expect(s.counts.match_taken).toBe(1); // B2
    expect(s.counts.no_unit).toBe(6); // A, D, E, G, F, TERRENO
    expect(s.counts.no_code).toBe(0);

    // Los defaults: sólo entra lo que coincide y está libre.
    expect(s.willImport).toBe(4);
    expect(s.willSkip).toBe(7);
    expect(s.willReplace).toBe(0);
  });

  test('sin propiedad de código todo cae en «sin código legible»', () => {
    const parsed = parseGeoJson(text(), 'px');
    const rows = classifyFeatures(parsed.features, null, UNITS, new Map(), 'px');
    expect(summarize(rows).counts.no_code).toBe(11);
  });

  test('acción por grupo y anulación por fila', () => {
    const parsed = parseGeoJson(text(), 'px');
    let rows = classifyFeatures(parsed.features, 'code', UNITS, new Map([['B2', 'hs-existente']]), 'px');

    rows = setGroupAction(rows, 'no_unit', 'unassigned');
    expect(summarize(rows).unassigned).toBe(6);

    // Las amenities entran sin unidad, salvo el perímetro que no interesa.
    const perimetro = rows.find((r) => r.rawCode === 'TERRENO')!;
    rows = setRowAction(rows, perimetro.featureIndex, 'skip');
    const s = summarize(rows);
    expect(s.unassigned).toBe(5);
    expect(s.willSkip).toBe(2); // TERRENO + B2
  });

  test('asignar la unidad a mano recategoriza la fila', () => {
    const parsed = parseGeoJson(text(), 'px');
    let rows = classifyFeatures(parsed.features, 'code', UNITS, new Map(), 'px');
    const acceso = rows.find((r) => r.rawCode === 'A')!;
    expect(acceso.group).toBe('no_unit');

    rows = assignRowUnit(rows, acceso.featureIndex, 'B6', new Map());
    const fixed = rows.find((r) => r.featureIndex === acceso.featureIndex)!;
    expect(fixed.group).toBe('match_free');
    expect(fixed.unitCode).toBe('B6');
    expect(fixed.action).toBe('import');
  });

  test('reemplazar apunta al hotspot existente', () => {
    const parsed = parseGeoJson(text(), 'px');
    let rows = classifyFeatures(parsed.features, 'code', UNITS, new Map([['B2', 'hs-existente']]), 'px');
    rows = setGroupAction(rows, 'match_taken', 'replace');
    const ops = buildImportOps(rows, parsed.features, (i) => `imp-${i}`);
    const replacing = ops.find((o) => o.unitCode === 'B2')!;
    expect(replacing.replaces).toBe('hs-existente');
  });

  test('«importar sin unidad» conserva el código crudo como etiqueta', () => {
    const parsed = parseGeoJson(text(), 'px');
    const rows = setGroupAction(
      classifyFeatures(parsed.features, 'code', UNITS, new Map(), 'px'),
      'no_unit',
      'unassigned',
    );
    const ops = buildImportOps(rows, parsed.features, (i) => `imp-${i}`);
    const laguna = ops.find((o) => o.label === 'G')!;
    expect(laguna.unitCode).toBeNull();
    expect(laguna.ring.length).toBeGreaterThan(2);
  });
});

describe('importación de Baleia de punta a punta', () => {
  test('importa, queda asignado, y ⌘Z lo revierte entero', () => {
    const parsed = parseGeoJson(readFileSync(BALEIA, 'utf8'), 'px');
    const units = ['B1', 'B2', 'B3', 'B4', 'B5'];
    const rows = classifyFeatures(parsed.features, 'code', units, new Map(), 'px');
    const ops = buildImportOps(rows, parsed.features, (i) => `imp-${i}`);
    expect(ops).toHaveLength(5);

    const start = createState({ sceneId: 'plano', space: 'px', hotspots: [] });
    const r = applyAction(start, { type: 'importHotspots', ops });
    expect(hotspotsOf(r.state)).toHaveLength(5);
    expect(hotspotForUnit(r.state, 'B1')?.ring.length).toBe(parsed.features[0]!.ring.length);

    const history = pushEntry(emptyHistory(), {
      label: r.label,
      patches: r.patches,
      inverse: r.inverse,
      persists: r.persists,
    });
    expect(history.past).toHaveLength(1);
    expect(hotspotsOf(undo(r.state, history)!.state)).toHaveLength(0);
  });
});
