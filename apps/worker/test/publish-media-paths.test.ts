import { describe, it, expect } from 'vitest';
import type { TourManifest, PhotoTour } from '@r360/core';
import { buildManifestFromSupabase, prefixManifestMediaPaths } from '../src/routes/publish.ts';
import { createSupabaseClient } from '../src/lib/supabase.ts';

/**
 * Manifiesto mínimo válido (los cinco opcionales quedan afuera salvo que el
 * test los agregue) — sirve de base para no repetir `schema`/`start` en cada
 * caso. `tenant`/`project`/`version` son los que definen la base pública
 * `/t/{tenant}/{project}/v{N}` que arma `prefixManifestMediaPaths`.
 */
function baseManifest(overrides: Partial<TourManifest> = {}): TourManifest {
  return {
    schema: 1,
    project: 'baleia',
    version: 5,
    tenant: 'demo',
    availabilityUrl: '/t/demo/baleia/availability.json',
    start: 'entrada',
    scenes: [],
    hotspots: [],
    units: {},
    ...overrides,
  };
}

describe('prefixManifestMediaPaths', () => {
  it('prefija una ruta relativa de scene.source.url con la base pública versionada', () => {
    const manifest = baseManifest({
      scenes: [
        {
          id: 's1',
          slug: 'entrada',
          kind: 'floorplan',
          name: 'Entrada',
          source: { url: 'media/masterplan.webp', width: 4000, height: 2000 },
          sort: 0,
        },
      ],
    });

    const result = prefixManifestMediaPaths(manifest);
    const source = result.scenes[0]!.source as { url: string };
    expect(source.url).toBe('/t/demo/baleia/v5/media/masterplan.webp');
  });

  it('prefija scene.source.base para escenas tiled (TiledSource)', () => {
    const manifest = baseManifest({
      scenes: [
        {
          id: 's1',
          slug: 'panoramica',
          kind: 'panorama',
          name: 'Panorámica',
          source: { base: 'scenes/panoramica/tiles', faceSize: 2048, tileSize: 512, levels: 3, format: 'webp' },
          sort: 0,
        },
      ],
    });

    const result = prefixManifestMediaPaths(manifest);
    const source = result.scenes[0]!.source as { base: string };
    expect(source.base).toBe('/t/demo/baleia/v5/scenes/panoramica/tiles');
  });

  it('NO toca una ruta que ya es absoluta (empieza con /)', () => {
    const manifest = baseManifest({
      scenes: [
        {
          id: 's1',
          slug: 'entrada',
          kind: 'floorplan',
          name: 'Entrada',
          source: { url: '/ya-absoluto/masterplan.webp', width: 4000, height: 2000 },
          sort: 0,
        },
      ],
    });

    const result = prefixManifestMediaPaths(manifest);
    const source = result.scenes[0]!.source as { url: string };
    expect(source.url).toBe('/ya-absoluto/masterplan.webp');
  });

  it('NO toca una URL con esquema (http, https o data)', () => {
    const manifest = baseManifest({
      scenes: [
        {
          id: 's1',
          slug: 'a',
          kind: 'floorplan',
          name: 'A',
          source: { url: 'https://cdn.example.com/masterplan.webp', width: 1, height: 1 },
          sort: 0,
        },
        {
          id: 's2',
          slug: 'b',
          kind: 'floorplan',
          name: 'B',
          source: { url: 'http://cdn.example.com/masterplan.webp', width: 1, height: 1 },
          sort: 1,
        },
        {
          id: 's3',
          slug: 'c',
          kind: 'floorplan',
          name: 'C',
          source: { url: 'data:image/webp;base64,AAAA', width: 1, height: 1 },
          sort: 2,
        },
      ],
    });

    const result = prefixManifestMediaPaths(manifest);
    expect((result.scenes[0]!.source as { url: string }).url).toBe('https://cdn.example.com/masterplan.webp');
    expect((result.scenes[1]!.source as { url: string }).url).toBe('http://cdn.example.com/masterplan.webp');
    expect((result.scenes[2]!.source as { url: string }).url).toBe('data:image/webp;base64,AAAA');
  });

  it('normaliza el "./" inicial que emite el pipeline de Baleia, sin dejar "/v5/./"', () => {
    const manifest = baseManifest({
      scenes: [
        {
          id: 's1',
          slug: 'entrada',
          kind: 'floorplan',
          name: 'Entrada',
          source: { url: './baleia/media/foto.webp', width: 1, height: 1 },
          sort: 0,
        },
      ],
    });

    const result = prefixManifestMediaPaths(manifest);
    const url = (result.scenes[0]!.source as { url: string }).url;
    expect(url).toBe('/t/demo/baleia/v5/baleia/media/foto.webp');
    expect(url).not.toContain('/./');
  });

  it('prefija poster, mobileUrl y portrait (con su propio poster) de una escena de video', () => {
    const manifest = baseManifest({
      scenes: [
        {
          id: 's1',
          slug: 'video',
          kind: 'video',
          name: 'Video',
          source: { url: 'video/tramo1.mp4', width: 1920, height: 1080 },
          poster: { url: 'video/tramo1-poster.webp', width: 1920, height: 1080 },
          mobileUrl: 'video/tramo1-mobile.mp4',
          portrait: {
            url: 'video/tramo1-vertical.mp4',
            width: 1080,
            height: 1920,
            duration: 12,
            mobileUrl: 'video/tramo1-vertical-mobile.mp4',
            poster: { url: 'video/tramo1-vertical-poster.webp', width: 1080, height: 1920 },
          },
          sort: 0,
        },
      ],
    });

    const result = prefixManifestMediaPaths(manifest);
    const scene = result.scenes[0]!;
    expect(scene.poster?.url).toBe('/t/demo/baleia/v5/video/tramo1-poster.webp');
    expect(scene.mobileUrl).toBe('/t/demo/baleia/v5/video/tramo1-mobile.mp4');
    expect(scene.portrait?.url).toBe('/t/demo/baleia/v5/video/tramo1-vertical.mp4');
    expect(scene.portrait?.mobileUrl).toBe('/t/demo/baleia/v5/video/tramo1-vertical-mobile.mp4');
    expect(scene.portrait?.poster?.url).toBe('/t/demo/baleia/v5/video/tramo1-vertical-poster.webp');
  });

  it('prefija units[].media', () => {
    const manifest = baseManifest({
      units: {
        'A-101': {
          media: ['./media/plantas/a101.webp', 'https://cdn.example.com/absoluto.webp'],
        },
      },
    });

    const result = prefixManifestMediaPaths(manifest);
    expect(result.units['A-101']!.media).toEqual([
      '/t/demo/baleia/v5/media/plantas/a101.webp',
      'https://cdn.example.com/absoluto.webp',
    ]);
  });

  it('prefija brandLogo', () => {
    const manifest = baseManifest({ brandLogo: './marca/logo.svg' });
    const result = prefixManifestMediaPaths(manifest);
    expect(result.brandLogo).toBe('/t/demo/baleia/v5/marca/logo.svg');
  });

  it('prefija social.image, conservando title/description intactos', () => {
    const manifest = baseManifest({
      social: { title: 'Título', description: 'Descripción', image: './social/portada.webp' },
    });
    const result = prefixManifestMediaPaths(manifest);
    expect(result.social).toEqual({
      title: 'Título',
      description: 'Descripción',
      image: '/t/demo/baleia/v5/social/portada.webp',
    });
  });

  it('NO toca social.image cuando ya es absoluta, y deja social intacto cuando no trae image', () => {
    const manifestAbsoluto = baseManifest({ social: { title: 'X', image: 'https://cdn.example.com/portada.webp' } });
    expect(prefixManifestMediaPaths(manifestAbsoluto).social?.image).toBe('https://cdn.example.com/portada.webp');

    const manifestSinImagen = baseManifest({ social: { title: 'Sólo título' } });
    expect(prefixManifestMediaPaths(manifestSinImagen).social).toEqual({ title: 'Sólo título' });
  });

  it('prefija brochurePages[]', () => {
    const manifest = baseManifest({ brochurePages: ['brochure/1.webp', 'brochure/2.webp'] });
    const result = prefixManifestMediaPaths(manifest);
    expect(result.brochurePages).toEqual([
      '/t/demo/baleia/v5/brochure/1.webp',
      '/t/demo/baleia/v5/brochure/2.webp',
    ]);
  });

  it('prefija photoTour: items y los pares antes/después (before y after)', () => {
    const photoTour: PhotoTour = {
      items: [
        {
          id: 'p1',
          url: './fotos/living.webp',
          thumbUrl: './fotos/living-thumb.webp',
          width: 100,
          height: 100,
          procedencia: { kind: 'foto', capturedAt: '2025-01-01' },
        },
      ],
      pairs: [
        {
          id: 'pair1',
          before: {
            id: 'b1',
            url: './fotos/antes.webp',
            thumbUrl: './fotos/antes-thumb.webp',
            width: 100,
            height: 100,
            procedencia: { kind: 'foto', capturedAt: '2025-01-01' },
          },
          after: {
            id: 'a1',
            url: './fotos/despues.webp',
            thumbUrl: './fotos/despues-thumb.webp',
            width: 100,
            height: 100,
            procedencia: { kind: 'ia', basedOn: 'b1' },
            restricted: true,
          },
        },
      ],
    };
    const manifest = baseManifest({ photoTour });

    const result = prefixManifestMediaPaths(manifest);
    expect(result.photoTour?.items[0]?.url).toBe('/t/demo/baleia/v5/fotos/living.webp');
    expect(result.photoTour?.items[0]?.thumbUrl).toBe('/t/demo/baleia/v5/fotos/living-thumb.webp');
    expect(result.photoTour?.pairs?.[0]?.before.url).toBe('/t/demo/baleia/v5/fotos/antes.webp');
    expect(result.photoTour?.pairs?.[0]?.after.url).toBe('/t/demo/baleia/v5/fotos/despues.webp');
    expect(result.photoTour?.pairs?.[0]?.after.thumbUrl).toBe('/t/demo/baleia/v5/fotos/despues-thumb.webp');
  });

  it('NO toca availabilityUrl (absoluto y a propósito sin versión)', () => {
    const manifest = baseManifest();
    const result = prefixManifestMediaPaths(manifest);
    expect(result.availabilityUrl).toBe('/t/demo/baleia/availability.json');
  });

  it('un manifiesto sin los campos opcionales sigue sin ellos después de prefijar', () => {
    const manifest = baseManifest();
    const result = prefixManifestMediaPaths(manifest);
    expect('brandLogo' in result).toBe(false);
    expect('photoTour' in result).toBe(false);
    expect('brochurePages' in result).toBe(false);
    expect('theme' in result).toBe(false);
    expect('contact' in result).toBe(false);
  });

  it('es pura: no muta el manifiesto que recibe', () => {
    const manifest = baseManifest({
      brandLogo: './marca/logo.svg',
      scenes: [
        {
          id: 's1',
          slug: 'entrada',
          kind: 'floorplan',
          name: 'Entrada',
          source: { url: './media/masterplan.webp', width: 1, height: 1 },
          sort: 0,
        },
      ],
    });
    const snapshot = JSON.parse(JSON.stringify(manifest));

    prefixManifestMediaPaths(manifest);

    expect(manifest).toEqual(snapshot);
  });
});

/**
 * Fake mínimo de createSupabaseClient, mismo criterio que
 * publish-manifest-settings.test.ts: sólo implementa `select`.
 */
function fakeDb(rows: Partial<Record<string, unknown[]>>) {
  return {
    select: async (table: string) => rows[table] ?? [],
    insert: async () => undefined,
    update: async () => undefined,
    rpc: async () => undefined,
  } as unknown as ReturnType<typeof createSupabaseClient>;
}

describe('buildManifestFromSupabase — el prefijado queda integrado en el publish real', () => {
  const sceneRow = {
    id: 'scene-1',
    slug: 'entrada',
    kind: 'floorplan',
    name: 'Entrada',
    source: { url: './media/masterplan.webp', width: 4000, height: 2000 },
    initial_view: null,
    north_offset: null,
    sort: 0,
  };
  const unitRow = {
    id: 'unit-1',
    group_id: null,
    unit_type_id: null,
    code: 'A-101',
    area_total_m2: 50,
    attrs: {},
    media: ['./media/plantas/a101.webp'],
  };

  function build(settings: Record<string, unknown> | null) {
    const db = fakeDb({ groups: [], unit_types: [], units: [unitRow], scenes: [sceneRow], hotspots: [] });
    return buildManifestFromSupabase(db, 'demo', 'baleia', 'project-uuid', 7, settings);
  }

  it('las rutas de scenes.source y units.media salen con la base pública versionada puesta', async () => {
    const manifest = await build({});
    expect((manifest.scenes[0]!.source as { url: string }).url).toBe('/t/demo/baleia/v7/media/masterplan.webp');
    expect(manifest.units['A-101']!.media).toEqual(['/t/demo/baleia/v7/media/plantas/a101.webp']);
  });

  it('photoTour y brochurePages, aunque vengan de projects.settings, salen prefijados (el prefijado corre DESPUÉS del fundido)', async () => {
    const photoTour: PhotoTour = {
      items: [
        {
          id: 'p1',
          url: './fotos/living.webp',
          thumbUrl: './fotos/living-thumb.webp',
          width: 100,
          height: 100,
          procedencia: { kind: 'foto', capturedAt: '2025-01-01' },
        },
      ],
    };
    const manifest = await build({ photoTour, brochurePages: ['./brochure/1.webp'], brandLogo: './marca/logo.svg' });

    expect(manifest.photoTour?.items[0]?.url).toBe('/t/demo/baleia/v7/fotos/living.webp');
    expect(manifest.brochurePages).toEqual(['/t/demo/baleia/v7/brochure/1.webp']);
    expect(manifest.brandLogo).toBe('/t/demo/baleia/v7/marca/logo.svg');
  });

  it('availabilityUrl sigue absoluto y SIN versión de punta a punta', async () => {
    const manifest = await build({});
    expect(manifest.availabilityUrl).toBe('/t/demo/baleia/availability.json');
  });
});
