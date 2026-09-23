import { describe, it, expect } from 'vitest';
import type { PhotoTour, CondicionesVenta } from '@r360/core';
import { buildManifestFromSupabase, pickManifestOverrides } from '../src/routes/publish.ts';
import { createSupabaseClient } from '../src/lib/supabase.ts';

/**
 * Fake mínimo de createSupabaseClient: sólo implementa `select`, que es lo
 * único que usa buildManifestFromSupabase. Devuelve, por nombre de tabla, las
 * filas que le pasemos en `rows` — no pega a Supabase de verdad, mismo
 * criterio que `fakeKv` en rate-limit.test.ts. `insert`/`update`/`rpc` no los
 * usa esta función, pero hacen falta para que el objeto tenga la forma de
 * `ReturnType<typeof createSupabaseClient>`.
 */
function fakeDb(rows: Partial<Record<string, unknown[]>>) {
  return {
    select: async (table: string) => rows[table] ?? [],
    insert: async () => undefined,
    update: async () => undefined,
    rpc: async () => undefined,
  } as unknown as ReturnType<typeof createSupabaseClient>;
}

// Una sola escena alcanza: lo que se está probando acá es el fundido de
// `settings`, no el armado de escenas/hotspots/unidades (eso ya lo prueban,
// indirectamente, los tests de publish-auth y el resto del pipeline).
const oneSceneRow = {
  id: 'scene-1',
  slug: 'entrada',
  kind: 'panorama',
  name: 'Entrada',
  source: { url: 'https://example.com/entrada.jpg', width: 4000, height: 2000 },
  initial_view: null,
  north_offset: null,
  sort: 0,
};

function buildManifest(settings: Record<string, unknown> | null) {
  const db = fakeDb({ groups: [], unit_types: [], units: [], scenes: [oneSceneRow], hotspots: [] });
  return buildManifestFromSupabase(db, 'baleia', 'baleia', 'project-uuid', 3, settings);
}

describe('pickManifestOverrides', () => {
  it('con settings vacío no copia ninguno de los cinco opcionales', () => {
    expect(pickManifestOverrides({})).toEqual({});
  });

  it('con settings null no copia nada (la columna es not null en la base, pero la función no debe romper)', () => {
    expect(pickManifestOverrides(null)).toEqual({});
  });

  it('ignora en silencio claves de settings que no son ninguno de los cinco campos del manifiesto', () => {
    // initial_scene_id y allowed_domains son configuración real del panel
    // que convive en la misma columna (ver 0012_project_health_view.sql).
    const settings = { initial_scene_id: 'uuid-x', allowed_domains: ['baleia.com'], somethingElse: 42 };
    expect(pickManifestOverrides(settings)).toEqual({});
  });

  it('copia photoTour y brochurePages cuando están presentes en settings', () => {
    const photoTour: PhotoTour = {
      items: [
        {
          id: 'p1',
          url: 'https://example.com/p1.jpg',
          thumbUrl: 'https://example.com/p1-thumb.jpg',
          width: 1200,
          height: 800,
          procedencia: { kind: 'foto', capturedAt: '2025-03-01' },
        },
      ],
    };
    const brochurePages = ['https://example.com/b1.jpg', 'https://example.com/b2.jpg'];
    expect(pickManifestOverrides({ photoTour, brochurePages })).toEqual({ photoTour, brochurePages });
  });

  it('trata un null explícito en una de las cinco claves como ausente, no lo copia', () => {
    expect(pickManifestOverrides({ brandLogo: null })).toEqual({});
  });

  it('copia social (título/descripción/imagen de la tarjeta de previsualización) cuando está presente', () => {
    const social = { title: 'Baleia — reservá tu unidad', description: 'Recorrido 360°.', image: './social/portada.webp' };
    expect(pickManifestOverrides({ social })).toEqual({ social });
  });

  it('copia cotizador (condiciones comerciales) cuando está presente', () => {
    const cotizador: CondicionesVenta = {
      anticipoPct: 0.5,
      tasaAnualPct: 0.06,
      plazoMeses: 12,
      gastosOcupacionPct: 0.04,
      gastosOcupacionReparto: { posesionPct: 0.025, escrituraPct: 0.015 },
    };
    expect(pickManifestOverrides({ cotizador })).toEqual({ cotizador });
  });

  it('trata un null explícito en cotizador como ausente, no lo copia', () => {
    expect(pickManifestOverrides({ cotizador: null })).toEqual({});
  });
});

describe('buildManifestFromSupabase — fundido de projects.settings', () => {
  it('(a) con settings vacío, el manifiesto no lleva ninguna de las claves opcionales', async () => {
    const manifest = await buildManifest({});
    for (const key of ['theme', 'contact', 'brandLogo', 'photoTour', 'brochurePages', 'cotizador'] as const) {
      expect(key in manifest).toBe(false);
    }
  });

  it('(b) con photoTour y brochurePages en settings, aparecen en el manifiesto tal cual', async () => {
    const photoTour: PhotoTour = { items: [] };
    const brochurePages = ['https://example.com/b1.jpg'];
    const manifest = await buildManifest({ photoTour, brochurePages });

    expect(manifest.photoTour).toEqual(photoTour);
    expect(manifest.brochurePages).toEqual(brochurePages);
    // Los otros tres opcionales siguen ausentes: settings sólo tenía estos dos.
    expect('theme' in manifest).toBe(false);
    expect('contact' in manifest).toBe(false);
    expect('brandLogo' in manifest).toBe(false);
  });

  it('(c) un settings que intenta pisar version, scenes, tenant, hotspots o units no logra alterarlos', async () => {
    const settings = {
      version: 999,
      scenes: [{ id: 'fake', slug: 'atacante' }],
      tenant: 'otro-tenant',
      hotspots: [{ id: 'fake-hotspot' }],
      units: { EVIL: { label: 'inyectado' } },
      // Uno legítimo mezclado en el mismo objeto, para probar que convive
      // sin que el resto se filtre.
      brandLogo: '/logo.png',
    };
    const manifest = await buildManifest(settings);

    expect(manifest.version).toBe(3);
    expect(manifest.tenant).toBe('baleia');
    expect(manifest.scenes).toHaveLength(1);
    expect(manifest.scenes[0]?.slug).toBe('entrada');
    expect(manifest.hotspots).toEqual([]);
    expect(manifest.units).toEqual({});
    expect(manifest.brandLogo).toBe('/logo.png');
  });
});
