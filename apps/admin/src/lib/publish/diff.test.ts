import { describe, expect, it } from 'vitest';
import { computeDiff, computeWarnings, type PublishSnapshot, type UnitSnapshot } from './diff.ts';

function unit(overrides: Partial<UnitSnapshot> & { code: string }): UnitSnapshot {
  return {
    status: 'disponible',
    price: null,
    groupCode: 'B2',
    typeCode: 'duplex',
    areaTotalM2: 100,
    attrsSignature: '{}',
    hasPolygon: true,
    ...overrides,
  };
}

describe('computeDiff', () => {
  it('cuando no hay versión publicada, todo entra como alta', () => {
    const draft: PublishSnapshot = {
      units: [unit({ code: 'B2-A' })],
      scenes: [],
      config: { initialSceneId: null, allowedDomains: [] },
    };
    const entries = computeDiff(null, draft, 'baleia', 'baleia');
    expect(entries.some((e) => e.id === 'unit-added-B2-A')).toBe(true);
  });

  it('detecta altas y bajas de unidades', () => {
    const live: PublishSnapshot = { units: [unit({ code: 'B2-A' })], scenes: [], config: { initialSceneId: null, allowedDomains: [] } };
    const draft: PublishSnapshot = { units: [unit({ code: 'B2-B' })], scenes: [], config: { initialSceneId: null, allowedDomains: [] } };
    const entries = computeDiff(live, draft, 'baleia', 'baleia');
    expect(entries.find((e) => e.id === 'unit-added-B2-B')).toBeDefined();
    expect(entries.find((e) => e.id === 'unit-removed-B2-A')).toBeDefined();
  });

  it('marca el cambio de estado como informativo y no lo confunde con un cambio estructural', () => {
    const live: PublishSnapshot = { units: [unit({ code: 'B2-A', status: 'disponible' })], scenes: [], config: { initialSceneId: null, allowedDomains: [] } };
    const draft: PublishSnapshot = { units: [unit({ code: 'B2-A', status: 'vendido' })], scenes: [], config: { initialSceneId: null, allowedDomains: [] } };
    const entries = computeDiff(live, draft, 'baleia', 'baleia');
    const statusEntry = entries.find((e) => e.id === 'unit-status-B2-A');
    expect(statusEntry?.detail).toContain('no requiere publicar');
    expect(entries.find((e) => e.id === 'unit-modified-B2-A')).toBeUndefined();
  });

  it('detecta cambios estructurales (grupo/tipo/m²/atributos)', () => {
    const live: PublishSnapshot = { units: [unit({ code: 'B2-A', areaTotalM2: 100 })], scenes: [], config: { initialSceneId: null, allowedDomains: [] } };
    const draft: PublishSnapshot = { units: [unit({ code: 'B2-A', areaTotalM2: 120 })], scenes: [], config: { initialSceneId: null, allowedDomains: [] } };
    const entries = computeDiff(live, draft, 'baleia', 'baleia');
    const modified = entries.find((e) => e.id === 'unit-modified-B2-A');
    expect(modified?.detail).toContain('m²');
  });

  it('detecta polígono nuevo/eliminado como cambio de hotspots', () => {
    const live: PublishSnapshot = { units: [unit({ code: 'B2-A', hasPolygon: false })], scenes: [], config: { initialSceneId: null, allowedDomains: [] } };
    const draft: PublishSnapshot = { units: [unit({ code: 'B2-A', hasPolygon: true })], scenes: [], config: { initialSceneId: null, allowedDomains: [] } };
    const entries = computeDiff(live, draft, 'baleia', 'baleia');
    const hotspot = entries.find((e) => e.id === 'hotspot-B2-A');
    expect(hotspot?.section).toBe('hotspots');
    expect(hotspot?.kind).toBe('added');
  });

  it('detecta escenas nuevas, renombradas y eliminadas', () => {
    const live: PublishSnapshot = {
      units: [],
      scenes: [{ id: 's1', name: 'Entrada', kind: 'panorama', hotspotCount: 2 }, { id: 's2', name: 'Fondo', kind: 'panorama', hotspotCount: 1 }],
      config: { initialSceneId: null, allowedDomains: [] },
    };
    const draft: PublishSnapshot = {
      units: [],
      scenes: [{ id: 's1', name: 'Hall', kind: 'panorama', hotspotCount: 2 }, { id: 's3', name: 'Terraza', kind: 'panorama', hotspotCount: 0 }],
      config: { initialSceneId: null, allowedDomains: [] },
    };
    const entries = computeDiff(live, draft, 'baleia', 'baleia');
    expect(entries.find((e) => e.id === 'scene-renamed-s1')).toBeDefined();
    expect(entries.find((e) => e.id === 'scene-added-s3')).toBeDefined();
    expect(entries.find((e) => e.id === 'scene-removed-s2')).toBeDefined();
  });

  it('detecta cambio de escena inicial y de dominios autorizados', () => {
    const live: PublishSnapshot = { units: [], scenes: [], config: { initialSceneId: 's1', allowedDomains: ['a.com'] } };
    const draft: PublishSnapshot = { units: [], scenes: [], config: { initialSceneId: 's2', allowedDomains: ['a.com', 'b.com'] } };
    const entries = computeDiff(live, draft, 'baleia', 'baleia');
    expect(entries.find((e) => e.id === 'config-initial-scene')).toBeDefined();
    expect(entries.find((e) => e.id === 'config-domains')).toBeDefined();
  });

  it('no genera entradas cuando no cambió nada', () => {
    const snap: PublishSnapshot = {
      units: [unit({ code: 'B2-A' })],
      scenes: [{ id: 's1', name: 'Entrada', kind: 'panorama', hotspotCount: 1 }],
      config: { initialSceneId: 's1', allowedDomains: ['a.com'] },
    };
    const entries = computeDiff(snap, snap, 'baleia', 'baleia');
    expect(entries).toHaveLength(0);
  });
});

describe('computeWarnings', () => {
  it('avisa de unidades sin polígono', () => {
    const draft: PublishSnapshot = {
      units: [unit({ code: 'B2-A', hasPolygon: false })],
      scenes: [],
      config: { initialSceneId: 's1', allowedDomains: ['a.com'] },
    };
    const warnings = computeWarnings(draft, 'baleia', 'baleia');
    expect(warnings.some((w) => w.id === 'units-without-polygon')).toBe(true);
  });

  it('avisa de dominios no autorizados', () => {
    const draft: PublishSnapshot = { units: [], scenes: [], config: { initialSceneId: 's1', allowedDomains: [] } };
    const warnings = computeWarnings(draft, 'baleia', 'baleia');
    expect(warnings.some((w) => w.id === 'no-authorized-domains')).toBe(true);
  });

  it('no avisa cuando todo está en orden', () => {
    const draft: PublishSnapshot = {
      units: [unit({ code: 'B2-A', hasPolygon: true })],
      scenes: [],
      config: { initialSceneId: 's1', allowedDomains: ['a.com'] },
    };
    const warnings = computeWarnings(draft, 'baleia', 'baleia');
    expect(warnings).toHaveLength(0);
  });
});
