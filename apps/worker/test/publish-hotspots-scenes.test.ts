import { describe, it, expect } from 'vitest';
import type { Scene } from '@r360/core';
import { buildManifestFromSupabase, pickSceneExtras } from '../src/routes/publish.ts';
import { createSupabaseClient } from '../src/lib/supabase.ts';

/**
 * Lo que se prueba acá son los tres agujeros de la capa de publicación que
 * DEGRADABAN un recorrido que ya funciona:
 *
 *  1. Un hotspot que apunta a un GRUPO (un bloque del masterplan) salía sin
 *     `unitCode` y sin `action`: el visor lo trataba como punto informativo
 *     —celeste, sin estado, sin ficha— en vez de como bloque clickeable.
 *  2. Los hotspots salían en un orden indefinido, y el orden decide qué
 *     polígono queda arriba (Leaflet apila por inserción).
 *  3. Las escenas perdían `procedencia` y los tres extras de video.
 *
 * Todo contra un fake de Supabase, sin base: lo que se prueba es la
 * traducción, no PostgREST.
 */

/**
 * Fake de `createSupabaseClient` un poco más fiel que el de
 * publish-manifest-settings.test.ts, porque acá el ORDEN importa y hay que
 * poder distinguir "el publicador pidió ordenado" de "las filas ya venían
 * ordenadas por casualidad". Entonces:
 *
 *  - filtra los hotspots por `scene_id=eq.<id>`, como lo hace PostgREST;
 *  - ordena por `sort` SÓLO si la query lo pide con `order=sort`. Así, si
 *    alguien le saca el `order=` al publicador, los tests de orden fallan en
 *    vez de seguir pasando de casualidad;
 *  - registra cada query en `queries` para poder afirmarlo directamente.
 */
function fakeDb(rows: Partial<Record<string, Record<string, unknown>[]>>) {
  const queries: { table: string; query: string }[] = [];
  const db = {
    select: async (table: string, query = '') => {
      queries.push({ table, query });
      let out = [...(rows[table] ?? [])];
      const scoped = /scene_id=eq\.([^&]+)/.exec(query);
      if (scoped) out = out.filter((r) => r.scene_id === scoped[1]);
      if (query.includes('order=sort')) {
        out.sort((a, b) => (a.sort as number) - (b.sort as number));
      }
      return out;
    },
    insert: async () => undefined,
    update: async () => undefined,
    rpc: async () => undefined,
  } as unknown as ReturnType<typeof createSupabaseClient>;
  return { db, queries };
}

function sceneRow(over: Record<string, unknown> = {}) {
  return {
    id: 'scene-master',
    slug: 'masterplan',
    kind: 'floorplan',
    name: 'Masterplan',
    source: { url: 'media/masterplan.webp', width: 4000, height: 3000 },
    initial_view: null,
    north_offset: null,
    sort: 1,
    extras: {},
    ...over,
  };
}

function hotspotRow(over: Record<string, unknown> = {}) {
  return {
    id: 'hs-1',
    scene_id: 'scene-master',
    target_kind: 'info',
    unit_id: null,
    group_id: null,
    target_scene_id: null,
    geometry_kind: 'polygon_px',
    geometry: [
      [0, 0],
      [1, 0],
      [1, 1],
    ],
    label_anchor: null,
    meta: {},
    sort: 1,
    ...over,
  };
}

const grupoB2 = { id: 'g-b2', parent_id: null, kind: 'bloque', code: 'B2', name: 'Bloque 2', sort: 2 };

function build(
  rows: Partial<Record<string, Record<string, unknown>[]>>,
  settings: Record<string, unknown> | null = null,
) {
  const { db, queries } = fakeDb(rows);
  return {
    queries,
    manifest: buildManifestFromSupabase(db, 'dacal', 'baleia', 'proyecto-uuid', 7, settings),
  };
}

describe('hotspots que apuntan a un grupo', () => {
  it('emite el code del grupo como unitCode y una acción de unidad', async () => {
    const { manifest } = build({
      groups: [grupoB2],
      scenes: [sceneRow()],
      hotspots: [hotspotRow({ target_kind: 'group', group_id: 'g-b2', meta: { label: 'Bloque 2' } })],
    });
    const hotspot = (await manifest).hotspots[0]!;

    // Esto es lo que el visor ya sabe leer: un unitCode y una acción de
    // unidad. El modelo de la base sigue diciendo "grupo"; la traducción
    // vive en el publicador.
    expect(hotspot.unitCode).toBe('B2');
    expect(hotspot.action).toEqual({ kind: 'unit' });
    expect(hotspot.label).toBe('Bloque 2');
  });

  it('un hotspot de unidad sigue saliendo igual que antes', async () => {
    const { manifest } = build({
      groups: [grupoB2],
      units: [
        { id: 'u-1', group_id: 'g-b2', unit_type_id: null, code: 'B2-A', area_total_m2: 80, attrs: {}, media: [] },
      ],
      scenes: [sceneRow()],
      hotspots: [hotspotRow({ target_kind: 'unit', unit_id: 'u-1' })],
    });
    const hotspot = (await manifest).hotspots[0]!;

    expect(hotspot.unitCode).toBe('B2-A');
    expect(hotspot.action).toEqual({ kind: 'unit' });
  });

  it('si el grupo apuntado no existe, el hotspot cae a informativo en vez de desaparecer', async () => {
    // Regla dura del producto: un polígono del plano nunca se va en
    // silencio. Sin grupo no hay code que emitir, así que queda como punto
    // de interés (INFO_TOKEN en el visor), pero sigue dibujándose.
    const { manifest } = build({
      groups: [],
      scenes: [sceneRow()],
      hotspots: [hotspotRow({ target_kind: 'group', group_id: 'g-fantasma' })],
    });
    const hotspot = (await manifest).hotspots[0]!;

    expect(hotspot.unitCode).toBeNull();
    expect(hotspot.action).toBeUndefined();
  });

  it('un hotspot informativo (perímetro, amenity sin destino) sigue sin unitCode ni acción', async () => {
    const { manifest } = build({
      scenes: [sceneRow()],
      hotspots: [hotspotRow({ meta: { label: 'Perímetro del terreno' } })],
    });
    const hotspot = (await manifest).hotspots[0]!;

    expect(hotspot.unitCode).toBeNull();
    expect(hotspot.action).toBeUndefined();
  });
});

describe('orden de los hotspots', () => {
  it('los pide a Supabase ordenados por sort', async () => {
    const { manifest, queries } = build({ scenes: [sceneRow()], hotspots: [hotspotRow()] });
    await manifest;

    const deHotspots = queries.filter((q) => q.table === 'hotspots');
    expect(deHotspots).toHaveLength(1);
    expect(deHotspots[0]!.query).toContain('order=sort');
  });

  it('el perímetro queda primero aunque llegue último desde la base', async () => {
    // El caso real de Baleia: el polígono del terreno tiene que dibujarse
    // DEBAJO de los bloques, y Leaflet apila por orden de inserción. Las
    // filas se le entregan al fake desordenadas a propósito.
    const { manifest } = build({
      groups: [grupoB2],
      scenes: [sceneRow()],
      hotspots: [
        hotspotRow({ id: 'hs-b2', target_kind: 'group', group_id: 'g-b2', sort: 3 }),
        hotspotRow({ id: 'hs-amenity', sort: 7 }),
        hotspotRow({ id: 'hs-terreno', sort: 1 }),
      ],
    });

    expect((await manifest).hotspots.map((h) => h.id)).toEqual(['hs-terreno', 'hs-b2', 'hs-amenity']);
  });

  it('el orden final es: escenas por sort, y dentro de cada escena sus hotspots por sort', async () => {
    const { manifest } = build({
      scenes: [
        sceneRow({ id: 'scene-b', slug: 'amenities', sort: 2 }),
        sceneRow({ id: 'scene-a', slug: 'masterplan', sort: 1 }),
      ],
      hotspots: [
        hotspotRow({ id: 'b-2', scene_id: 'scene-b', sort: 2 }),
        hotspotRow({ id: 'a-2', scene_id: 'scene-a', sort: 2 }),
        hotspotRow({ id: 'b-1', scene_id: 'scene-b', sort: 1 }),
        hotspotRow({ id: 'a-1', scene_id: 'scene-a', sort: 1 }),
      ],
    });

    expect((await manifest).hotspots.map((h) => h.id)).toEqual(['a-1', 'a-2', 'b-1', 'b-2']);
  });
});

describe('pickSceneExtras', () => {
  const procedencia: Scene['procedencia'] = { kind: 'foto', capturedAt: '2026-09-02' };
  const poster: Scene['poster'] = { url: 'media/video/poster.jpg', width: 1280, height: 720 };
  const portrait: Scene['portrait'] = {
    url: 'media/video/vertical.mp4',
    width: 1080,
    height: 1920,
    duration: 31.5,
  };

  it('con extras vacío o null no copia nada', () => {
    expect(pickSceneExtras({})).toEqual({});
    expect(pickSceneExtras(null)).toEqual({});
  });

  it('copia los cuatro campos cuando están', () => {
    expect(pickSceneExtras({ procedencia, poster, mobileUrl: 'media/video/lite.mp4', portrait })).toEqual({
      procedencia,
      poster,
      mobileUrl: 'media/video/lite.mp4',
      portrait,
    });
  });

  it('ignora en silencio cualquier otra clave que haya quedado en la bolsa', () => {
    expect(pickSceneExtras({ procedencia, restoDeUnaVersionVieja: 42, notas: 'x' })).toEqual({ procedencia });
  });

  it('no copia una clave presente pero en null (la ausencia tiene significado en el contrato)', () => {
    const picked = pickSceneExtras({ poster: null, mobileUrl: null });
    expect('poster' in picked).toBe(false);
    expect('mobileUrl' in picked).toBe(false);
  });
});

describe('extras de escena en el manifiesto', () => {
  it('la escena de video sale con procedencia, poster, mobileUrl y portrait, y con las rutas prefijadas', async () => {
    const { manifest } = build({
      scenes: [
        sceneRow({
          slug: 'video',
          kind: 'video',
          source: { url: 'media/video/horizontal.mp4', width: 1920, height: 1080 },
          extras: {
            procedencia: { kind: 'foto', capturedAt: '2026-09-02' },
            poster: { url: 'media/video/poster.jpg', width: 1280, height: 720 },
            mobileUrl: 'media/video/lite.mp4',
            portrait: { url: 'media/video/vertical.mp4', width: 1080, height: 1920, duration: 31.5 },
          },
        }),
      ],
    });
    const escena = (await manifest).scenes[0]!;

    expect(escena.procedencia).toEqual({ kind: 'foto', capturedAt: '2026-09-02' });
    // Las rutas de los extras también tienen que llevar la base versionada:
    // las sirve nginx por path, no este Worker.
    expect(escena.poster?.url).toBe('/t/dacal/baleia/v7/media/video/poster.jpg');
    expect(escena.mobileUrl).toBe('/t/dacal/baleia/v7/media/video/lite.mp4');
    expect(escena.portrait?.url).toBe('/t/dacal/baleia/v7/media/video/vertical.mp4');
  });

  it('una escena sin extras no gana ninguna clave', async () => {
    const { manifest } = build({ scenes: [sceneRow()] });
    const escena = (await manifest).scenes[0]!;

    expect('procedencia' in escena).toBe(false);
    expect('poster' in escena).toBe(false);
    expect('mobileUrl' in escena).toBe(false);
    expect('portrait' in escena).toBe(false);
  });

  it('un extras cargado de más no puede pisar los campos obligatorios de la escena', async () => {
    // `extras` es una bolsa jsonb: puede traer cualquier cosa. Los campos
    // que el publicador arma desde columnas reales tienen que ganar siempre.
    const { manifest } = build({
      scenes: [
        sceneRow({
          extras: {
            id: 'id-falso',
            slug: 'slug-falso',
            kind: 'video',
            name: 'nombre falso',
            source: { url: 'media/pirata.mp4', width: 1, height: 1 },
            sort: 999,
            procedencia: { kind: 'render' },
          },
        }),
      ],
    });
    const escena = (await manifest).scenes[0]!;

    expect(escena.id).toBe('scene-master');
    expect(escena.slug).toBe('masterplan');
    expect(escena.kind).toBe('floorplan');
    expect(escena.name).toBe('Masterplan');
    expect(escena.sort).toBe(1);
    expect(escena.source).toEqual({ url: '/t/dacal/baleia/v7/media/masterplan.webp', width: 4000, height: 3000 });
    // Lo único de `extras` que sí pasa es lo que está en la lista blanca.
    expect(escena.procedencia).toEqual({ kind: 'render' });
  });
});

describe('puente temporal: extras estacionados en settings.sceneExtras', () => {
  // El ingestor de Baleia todavía deja estos campos en
  // `projects.settings.sceneExtras` (indexados por slug), porque los cargó
  // antes de que existiera la columna. Ver `sceneExtrasFromSettings`.
  const settings = {
    sceneExtras: {
      masterplan: { procedencia: { kind: 'render' } },
      video: { mobileUrl: 'media/video/lite.mp4' },
    },
  };

  it('los levanta cuando la escena no tiene nada en su columna', async () => {
    const { manifest } = build({ scenes: [sceneRow({ extras: {} })] }, settings);
    expect((await manifest).scenes[0]!.procedencia).toEqual({ kind: 'render' });
  });

  it('la columna de la escena manda sobre lo estacionado en settings', async () => {
    const { manifest } = build(
      { scenes: [sceneRow({ extras: { procedencia: { kind: 'foto', capturedAt: '2026-09-02' } } })] },
      settings,
    );
    expect((await manifest).scenes[0]!.procedencia).toEqual({ kind: 'foto', capturedAt: '2026-09-02' });
  });

  it('una escena que no figura en settings.sceneExtras no gana nada', async () => {
    const { manifest } = build({ scenes: [sceneRow({ slug: 'otra', extras: {} })] }, settings);
    expect('procedencia' in (await manifest).scenes[0]!).toBe(false);
  });

  it('no rompe si sceneExtras viene con una forma inesperada', async () => {
    for (const bolsa of [null, 'texto', 42, ['a']]) {
      const { manifest } = build({ scenes: [sceneRow({ extras: {} })] }, { sceneExtras: bolsa });
      expect('procedencia' in (await manifest).scenes[0]!).toBe(false);
    }
  });

  it('sigue ignorando el resto de settings, como siempre', async () => {
    const { manifest } = build(
      { scenes: [sceneRow({ extras: {} })] },
      { sceneExtras: { masterplan: { procedencia: { kind: 'render' }, slug: 'pirata' } }, initial_scene_id: 'x' },
    );
    const escena = (await manifest).scenes[0]!;
    expect(escena.slug).toBe('masterplan');
    expect(escena.procedencia).toEqual({ kind: 'render' });
  });
});

describe('pseudo-unidades de bloque', () => {
  it('emite una entrada por grupo, para que el click en el bloque abra su ficha', async () => {
    const { manifest } = build({
      groups: [
        { id: 'g1', code: 'B2', name: 'Bloque 2', sort: 1 },
        { id: 'g2', code: 'B4', name: 'Bloque 4', sort: 2 },
      ],
      units: [
        { id: 'u1', code: 'B2-A', group_id: 'g1', area_total_m2: 100, attrs: {} },
        { id: 'u2', code: 'B2-B', group_id: 'g1', area_total_m2: 50.5, attrs: {} },
      ],
    });
    const m = await manifest;

    expect(m.units['B2']).toMatchObject({
      label: 'Bloque 2',
      groupCode: null,
      typeCode: 'bloque',
      attrs: { unitCount: 2, unitCodes: ['B2-A', 'B2-B'], superficieTotalUnidadesM2: 150.5 },
    });
    // Un bloque sin unidades igual existe: el hotspot tiene que poder abrirlo.
    expect(m.units['B4']).toMatchObject({
      typeCode: 'bloque',
      attrs: { unitCount: 0, unitCodes: [], superficieTotalUnidadesM2: null },
    });
    // Y las unidades reales siguen estando.
    expect(m.units['B2-A']).toMatchObject({ groupCode: 'B2' });
  });

  it('una unidad real le gana a un bloque que se llame igual', async () => {
    const { manifest } = build({
      groups: [{ id: 'g1', code: 'CHOQUE', name: 'Bloque raro', sort: 1 }],
      units: [{ id: 'u1', code: 'CHOQUE', group_id: null, area_total_m2: 10, attrs: {} }],
    });
    const m = await manifest;
    expect(m.units['CHOQUE']).toMatchObject({ areaTotalM2: 10 });
    expect(m.units['CHOQUE']).not.toMatchObject({ typeCode: 'bloque' });
  });
});
