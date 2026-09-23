import { Hono } from 'hono';
import type { Env } from '../env.ts';
import type { TourManifest, Scene, Hotspot, GeometryKind, SceneKind, PhotoTour, PhotoTourItem } from '@r360/core';
import { createSupabaseClient } from '../lib/supabase.ts';
import { setActivePointer, getActivePointer } from '../lib/pointer.ts';
import { r2Paths } from '../lib/r2paths.ts';
import { resolveProject } from '../lib/resolve.ts';

/**
 * POST /api/publish
 * body: { tenant: string, project: string }
 *
 * Arma el TourManifest desde Supabase, lo escribe (junto con
 * availability.json) en R2 bajo `t/{tenant}/{project}/v{N}/`, y RECIÉN AL
 * FINAL mueve el puntero de versión activa en KV.
 *
 * Si cualquier paso previo al último falla, el puntero no se toca y la
 * versión en vivo sigue siendo la anterior — publish es "todo o nada" desde
 * el punto de vista de lo que ve el visitante. Se devuelve el detalle de
 * qué etapa se completó y cuál falló para poder diagnosticar sin reintentar
 * a ciegas.
 *
 * Tablas usadas (supabase/migrations/0004_structure.sql y 0006_scenes_hotspots.sql):
 * `groups`, `unit_types`, `units`, `scenes`, `hotspots`. También se deja
 * constancia de la publicación en `publications` (manifest inmutable,
 * versionado) y se actualiza `projects.published_version` — eso es lo que
 * lee el panel/admin; el puntero de KV es lo que lee ESTE Worker en cada
 * request de `/t/*` y es la fuente de verdad de "qué ve el visitante ahora".
 */
export const publish = new Hono<{ Bindings: Env }>();

type StageName =
  | 'resolve_project'
  | 'fetch_data'
  | 'build_manifest'
  | 'write_tour_json'
  | 'write_availability'
  | 'record_publication'
  | 'move_pointer';

interface StageResult {
  stage: StageName;
  ok: boolean;
  error?: string;
}

interface GroupRow {
  id: string;
  parent_id: string | null;
  kind: string;
  code: string;
  name: string | null;
  sort: number;
}

interface UnitTypeRow {
  id: string;
  code: string;
  name: string;
  attr_schema: Record<string, unknown>;
}

interface UnitRow {
  id: string;
  group_id: string | null;
  unit_type_id: string | null;
  code: string;
  area_total_m2: number | null;
  attrs: Record<string, unknown>;
  media: unknown;
}

interface SceneRow {
  id: string;
  slug: string;
  kind: SceneKind;
  name: string;
  source: Scene['source'];
  initial_view: Scene['initialView'] | null;
  north_offset: number | null;
  sort: number;
  /** Ver `pickSceneExtras` y supabase/migrations/0024_scenes_extras.sql. */
  extras: Record<string, unknown> | null;
}

interface HotspotRow {
  id: string;
  scene_id: string;
  target_kind: 'unit' | 'group' | 'scene' | 'info';
  unit_id: string | null;
  group_id: string | null;
  target_scene_id: string | null;
  geometry_kind: GeometryKind;
  geometry: Hotspot['geometry'];
  label_anchor: Hotspot['anchor'] | null;
  meta: { zIndex?: number; label?: string | null; url?: string } | null;
  /** Orden dentro de la escena. Ver supabase/migrations/0023_hotspots_sort.sql. */
  sort: number;
}

/**
 * Los siete campos opcionales y aditivos de `TourManifest` (`theme`,
 * `contact`, `brandLogo`, `social`, `photoTour`, `brochurePages`,
 * `cotizador` — ver packages/core/src/types.ts) no tienen tabla propia: en
 * el caso real de Baleia son justamente el recorrido narrativo entero
 * (tramos, brochure, logo, CTA de contacto, condiciones comerciales del
 * cotizador), así que hoy quedan guardados en `projects.settings` (jsonb,
 * 0003_projects.sql), la misma columna donde el panel guarda su propia
 * configuración interna (`initial_scene_id`, `allowed_domains`, ver
 * 0012_project_health_view.sql).
 *
 * Por eso acá se hace un pick explícito de esas siete claves nada más:
 * cualquier otra cosa que haya en `settings` (configuración de panel, restos
 * de una versión vieja, lo que sea) se ignora en silencio. Y una clave sólo
 * se copia si está REALMENTE presente y no es `null` — un `photoTour`
 * ausente en `settings` tiene que quedar ausente en el manifiesto (nunca
 * `undefined` serializado ni `null`), porque el contrato le da significado a
 * la ausencia de la clave (el visor simplemente no dibuja esa sección). Lo
 * mismo vale para `cotizador`: sin condiciones cargadas en `settings`, el
 * manifiesto sale sin `cotizador` y el visor no dibuja el simulador — nunca
 * unas condiciones inventadas o de otro proyecto.
 *
 * El tipo de retorno (`Partial<Pick<TourManifest, ...>>` con sólo estas
 * siete claves) es, a la vez, la garantía de seguridad: por construcción este
 * objeto no puede contener `scenes`, `version`, `tenant` ni ningún otro campo
 * obligatorio, así que un `settings` corrupto o cargado a mano de más nunca
 * tiene forma de pisar la geometría o el versionado que arma el publicador.
 */
type ManifestSettingsOverrides = Partial<
  Pick<
    TourManifest,
    | 'theme'
    | 'contact'
    | 'brandLogo'
    | 'portada360'
    | 'social'
    | 'photoTour'
    | 'brochurePages'
    | 'cotizador'
  >
>;

export function pickManifestOverrides(settings: Record<string, unknown> | null): ManifestSettingsOverrides {
  if (!settings || typeof settings !== 'object') return {};
  const overrides: ManifestSettingsOverrides = {};
  if (settings.theme != null) overrides.theme = settings.theme as TourManifest['theme'];
  if (settings.contact != null) overrides.contact = settings.contact as TourManifest['contact'];
  if (settings.brandLogo != null) overrides.brandLogo = settings.brandLogo as TourManifest['brandLogo'];
  if (settings.portada360 != null) overrides.portada360 = settings.portada360 as TourManifest['portada360'];
  if (settings.social != null) overrides.social = settings.social as TourManifest['social'];
  if (settings.photoTour != null) overrides.photoTour = settings.photoTour as TourManifest['photoTour'];
  if (settings.brochurePages != null) {
    overrides.brochurePages = settings.brochurePages as TourManifest['brochurePages'];
  }
  if (settings.cotizador != null) {
    overrides.cotizador = settings.cotizador as TourManifest['cotizador'];
  }
  return overrides;
}

/**
 * Los cuatro campos opcionales del contrato `Scene` (packages/core/src/types.ts)
 * que no tienen columna propia en la tabla `scenes`: `procedencia` (la chapa
 * de foto/render/IA, que en Baleia llevan 10 escenas) y los tres extras de
 * video — `poster`, `mobileUrl` y `portrait`. Viven en `scenes.extras`
 * (jsonb, 0024_scenes_extras.sql), que es a la escena lo que
 * `projects.settings` es al manifiesto.
 *
 * Mismo criterio que `pickManifestOverrides`, por las mismas razones:
 *
 *  - Pick EXPLÍCITO de esas cuatro claves y nada más. `extras` es una bolsa
 *    jsonb: puede traer restos de una versión vieja o lo que haya escrito un
 *    panel con un bug. Nada de eso llega al manifiesto.
 *  - Una clave sólo se copia si está presente y no es `null`, nunca como
 *    `undefined` ni como `null` serializado: el contrato le da significado a
 *    la AUSENCIA de la clave (una escena sin `poster` es una escena que el
 *    visor abre sin póster, no una con póster nulo).
 *  - El tipo de retorno —`Partial<Pick<Scene, ...>>` con sólo estas cuatro
 *    claves— es la garantía de que este objeto no puede contener `id`,
 *    `slug`, `kind`, `name`, `source` ni `sort`. Esos los arma el publicador
 *    desde las columnas reales y un `extras` corrupto no tiene forma de
 *    pisarlos.
 *
 * Que sean cuatro y no cinco campos de video: `poster`, `mobileUrl` y
 * `portrait` son los tres que quedaban fuera de la base; `source` (el video
 * de escritorio) ya tiene su columna.
 */
type SceneExtras = Partial<Pick<Scene, 'procedencia' | 'poster' | 'mobileUrl' | 'portrait'>>;

export function pickSceneExtras(extras: Record<string, unknown> | null): SceneExtras {
  if (!extras || typeof extras !== 'object') return {};
  const picked: SceneExtras = {};
  if (extras.procedencia != null) picked.procedencia = extras.procedencia as Scene['procedencia'];
  if (extras.poster != null) picked.poster = extras.poster as Scene['poster'];
  if (extras.mobileUrl != null) picked.mobileUrl = extras.mobileUrl as Scene['mobileUrl'];
  if (extras.portrait != null) picked.portrait = extras.portrait as Scene['portrait'];
  return picked;
}

/**
 * PUENTE TEMPORAL, a quitar. Antes de que existiera `scenes.extras`
 * (0024_scenes_extras.sql) estos cuatro campos no tenían dónde guardarse, y
 * el ingestor de Baleia (tools/baleia/scripts/ingestar_a_plataforma.py) los
 * dejaba estacionados en `projects.settings.sceneExtras`, indexados por slug
 * de escena — lo dice él mismo en su informe: "10 escenas traen campos que
 * `scenes` no tiene columna para guardar ... quedan en
 * `settings.sceneExtras`, que el publicador de hoy no lee".
 *
 * Ahora la columna existe, pero el ingestor todavía escribe en el lugar
 * viejo. Sin este puente, publicar el proyecto tal como está cargado HOY
 * seguiría perdiendo el póster y la versión vertical del video — que es
 * justamente el agujero que se está tapando.
 *
 * `scenes.extras` MANDA: esto sólo se consulta para una escena cuya columna
 * está vacía. Cuando el ingestor escriba la columna, esta función deja de
 * tener efecto y se puede borrar junto con la clave `sceneExtras` de
 * `settings`.
 *
 * Todo lo que salga de acá pasa igual por `pickSceneExtras`, así que la
 * lista blanca de cuatro claves —y la garantía de que nada de esto puede
 * pisar un campo obligatorio de la escena— vale idéntico para este camino.
 */
function sceneExtrasFromSettings(
  settings: Record<string, unknown> | null,
): Record<string, Record<string, unknown>> {
  const bolsa = settings?.sceneExtras;
  if (!bolsa || typeof bolsa !== 'object' || Array.isArray(bolsa)) return {};
  return bolsa as Record<string, Record<string, unknown>>;
}

/**
 * Prefija con la base pública versionada (`/t/{tenant}/{project}/v{N}`) toda
 * ruta de media RELATIVA del manifiesto: `scenes[].source` (y, en escenas de
 * video, `poster`/`mobileUrl`/`portrait`), `units[].media`, `brandLogo`,
 * `brochurePages`, `photoTour` (items y pares antes/después) y, si vino
 * cargada, `social.image` (la imagen de la tarjeta de previsualización, ver
 * apps/worker/src/lib/og-tags.ts) — misma regla que el resto: sólo se toca
 * si es relativa.
 *
 * Por qué hace falta: la media pesada (fotos, tiles de 360, video, brochure)
 * no la sirve este Worker — la sirve un nginx aparte que sabe responder
 * `Range` (sin eso, adelantar un video de 64 MB significa bajarlo entero) —
 * y ese nginx enruta sólo por el path `/t/{tenant}/{project}/v{N}/...`: la
 * versión tiene que estar puesta en la URL. Cuando el recorrido se sirve por
 * el hostname propio del proyecto (`baleia.dominio.com/`) el navegador NUNCA
 * ve esa versión — la resuelve este Worker con su puntero interno
 * (`getActivePointer`) — así que las rutas de media DENTRO del manifiesto
 * tienen que traerla ya puesta; no hay otro lugar de donde sacarla.
 *
 * Regla: sólo se toca una ruta RELATIVA. Una ruta que ya empieza con `/`
 * (absoluta en este mismo origen, o protocol-relative `//...`) o que trae un
 * esquema (`http://`, `https://`, `data:`, etc.) se deja intacta. Esto es a
 * propósito lo que protege a `availabilityUrl`
 * (`/t/{tenant}/{project}/availability.json`, YA absoluto y A PROPÓSITO sin
 * versión: la disponibilidad cambia sin republicar). Por eso
 * `availabilityUrl` ni siquiera pasa por acá — se arma aparte, ya absoluto,
 * en `buildManifestFromSupabase` — y por eso esta función nunca debe
 * "mejorar" una ruta que ya es absoluta: precios y estados quedarían
 * pisados a la versión vieja para siempre si alguna vez se le pegara la
 * versión encima.
 *
 * También normaliza el `./` inicial que emite el pipeline de Baleia
 * (`./baleia/media/foto.webp`): mismo problema que ya resolvió
 * `tools/baleia/scripts/build_tour.py::publish` en su función `prefijar()`
 * (línea ~1193) — sin normalizar, el resultado sería
 * `/t/a/b/v1/./baleia/...` en vez de `/t/a/b/v1/baleia/...`.
 *
 * Función PURA: no muta `manifest`, devuelve uno nuevo. Así se puede probar
 * sola, sin pasar por Supabase.
 */
export function prefixManifestMediaPaths(manifest: TourManifest): TourManifest {
  const publicBase = `/${r2Paths.base(manifest.tenant, manifest.project, manifest.version)}`;

  const prefix = (path: string): string => {
    // Esquema (`http:`, `https:`, `data:`, ...) o ya absoluta (`/...`,
    // incluye protocol-relative `//...`): se deja intacta.
    if (path.startsWith('/') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)) return path;
    const relativo = path.startsWith('./') ? path.slice(2) : path;
    return `${publicBase}/${relativo}`;
  };

  const prefixPhotoTourItem = (item: PhotoTourItem): PhotoTourItem => ({
    ...item,
    url: prefix(item.url),
    thumbUrl: prefix(item.thumbUrl),
  });

  const prefixScene = (scene: Scene): Scene => {
    const source: Scene['source'] =
      'url' in scene.source
        ? { ...scene.source, url: prefix(scene.source.url) }
        : { ...scene.source, base: prefix(scene.source.base) };

    const next: Scene = { ...scene, source };
    if (scene.poster) next.poster = { ...scene.poster, url: prefix(scene.poster.url) };
    if (scene.mobileUrl != null) next.mobileUrl = prefix(scene.mobileUrl);
    if (scene.portrait) {
      next.portrait = {
        ...scene.portrait,
        url: prefix(scene.portrait.url),
        ...(scene.portrait.mobileUrl != null ? { mobileUrl: prefix(scene.portrait.mobileUrl) } : {}),
        ...(scene.portrait.poster
          ? { poster: { ...scene.portrait.poster, url: prefix(scene.portrait.poster.url) } }
          : {}),
      };
    }
    return next;
  };

  const units: TourManifest['units'] = {};
  for (const [code, unit] of Object.entries(manifest.units)) {
    units[code] = unit.media ? { ...unit, media: unit.media.map(prefix) } : unit;
  }

  const next: TourManifest = {
    ...manifest,
    scenes: manifest.scenes.map(prefixScene),
    units,
  };

  if (manifest.brandLogo != null) next.brandLogo = prefix(manifest.brandLogo);
  if (manifest.portada360 != null) next.portada360 = prefix(manifest.portada360);
  if (manifest.social?.image != null) {
    next.social = { ...manifest.social, image: prefix(manifest.social.image) };
  }
  if (manifest.brochurePages) next.brochurePages = manifest.brochurePages.map(prefix);
  if (manifest.photoTour) {
    const photoTour: PhotoTour = {
      ...manifest.photoTour,
      items: manifest.photoTour.items.map(prefixPhotoTourItem),
    };
    if (manifest.photoTour.pairs) {
      photoTour.pairs = manifest.photoTour.pairs.map((pair) => ({
        ...pair,
        before: prefixPhotoTourItem(pair.before),
        after: prefixPhotoTourItem(pair.after),
      }));
    }
    next.photoTour = photoTour;
  }

  return next;
}

export async function buildManifestFromSupabase(
  db: ReturnType<typeof createSupabaseClient>,
  tenant: string,
  project: string,
  projectId: string,
  version: number,
  /** `projects.settings` tal cual lo devuelve `resolveProject` — ver `pickManifestOverrides`. */
  settings: Record<string, unknown> | null,
): Promise<TourManifest> {
  const [groupRows, unitTypeRows, unitRows, sceneRows] = await Promise.all([
    db.select<GroupRow[]>('groups', `project_id=eq.${projectId}&order=sort`),
    db.select<UnitTypeRow[]>('unit_types', `project_id=eq.${projectId}`),
    db.select<UnitRow[]>('units', `project_id=eq.${projectId}`),
    db.select<SceneRow[]>('scenes', `project_id=eq.${projectId}&order=sort`),
  ]);

  const groupById = new Map(groupRows.map((g) => [g.id, g]));
  const unitTypeById = new Map(unitTypeRows.map((t) => [t.id, t]));
  const unitById = new Map(unitRows.map((u) => [u.id, u]));
  const sceneById = new Map(sceneRows.map((s) => [s.id, s]));

  // hotspots no tiene project_id propio (ver 0006_scenes_hotspots.sql) — se
  // piden por scene_id y se combinan acá. `hotspots.scene_id=in.(id1,id2,...)`
  // sería una sola query, pero con muchas escenas la URL puede pasarse de
  // largo; una query por escena es más simple y sigue siendo O(escenas), no
  // O(hotspots).
  //
  // `order=sort` NO es un detalle: el visor dibuja el plano con Leaflet y
  // Leaflet apila los polígonos por orden de inserción, sin mirar el `zIndex`
  // del hotspot (apps/viewer/src/floorplan.ts::mount). En Baleia el polígono
  // del perímetro del terreno tiene que salir primero para quedar DEBAJO; si
  // sale después, tapa los cinco bloques. Sin `order=` el orden lo elegía
  // Postgres. Ver 0023_hotspots_sort.sql.
  //
  // Las escenas ya vienen ordenadas por `sort`, así que el orden final del
  // array es: escenas por `sort`, y dentro de cada escena sus hotspots por
  // `sort`.
  const hotspotsPerScene = await Promise.all(
    sceneRows.map((s) =>
      db
        .select<HotspotRow[]>('hotspots', `scene_id=eq.${s.id}&order=sort`)
        .catch(() => [] as HotspotRow[]),
    ),
  );
  const allHotspotRows = hotspotsPerScene.flat();

  const extrasEstacionados = sceneExtrasFromSettings(settings);

  const scenes: Scene[] = sceneRows.map((s) => ({
    // Los extras van primero por la misma razón que en el manifiesto: los
    // campos de abajo salen de columnas reales y tienen que ganar siempre.
    // Ver `pickSceneExtras`.
    ...pickSceneExtras(
      s.extras && Object.keys(s.extras).length > 0 ? s.extras : (extrasEstacionados[s.slug] ?? null),
    ),
    id: s.id,
    slug: s.slug,
    kind: s.kind,
    name: s.name,
    source: s.source,
    initialView: s.initial_view ?? undefined,
    northOffset: s.north_offset ?? undefined,
    sort: s.sort,
  }));

  const hotspots: Hotspot[] = allHotspotRows.map((h) => {
    const unit = h.unit_id ? unitById.get(h.unit_id) : undefined;
    const targetScene = h.target_scene_id ? sceneById.get(h.target_scene_id) : undefined;

    // Un hotspot de GRUPO (un bloque del masterplan, una manzana de un loteo)
    // se emite como si el grupo fuera, él mismo, una unidad: `unitCode` = el
    // code del grupo y `action: {kind:'unit'}`. La traducción va acá, en el
    // publicador, y no en la base ni en el visor, porque cada capa conserva
    // así lo que le corresponde: la base sigue modelando un bloque como lo
    // que es —una fila de `groups`, con sus unidades colgando— y el
    // manifiesto sale hablando el único idioma que el visor entiende, que es
    // el de `unitCode` (el contrato `Hotspot` no tiene noción de grupo, ver
    // packages/core/src/types.ts). La otra mitad de este arreglo está en
    // `generate_availability_json` (0025), que le da estado a esos codes de
    // grupo para que el polígono se pinte.
    //
    // Sin esto el bloque salía sin `action` y con `unitCode: null`: el visor
    // lo trataba como un punto informativo —celeste, sin estado y sin ficha
    // al tocarlo— en vez de como el bloque clickeable y coloreado que es.
    const group = h.target_kind === 'group' && h.group_id ? groupById.get(h.group_id) : undefined;

    let action: Hotspot['action'];
    if (h.target_kind === 'unit') action = { kind: 'unit' };
    else if (h.target_kind === 'group' && group) action = { kind: 'unit' };
    else if (h.target_kind === 'scene' && targetScene) action = { kind: 'goto', sceneSlug: targetScene.slug };
    else if (h.meta?.url) action = { kind: 'url', href: h.meta.url };

    return {
      id: h.id,
      sceneId: h.scene_id,
      // Si el grupo apuntado no aparece (borrado, o fuera de este proyecto),
      // el hotspot cae a informativo en vez de desaparecer: la regla dura del
      // producto es que un polígono del plano nunca se va en silencio.
      unitCode: unit?.code ?? group?.code ?? null,
      geometryKind: h.geometry_kind,
      geometry: h.geometry,
      anchor: h.label_anchor ?? undefined,
      action,
      zIndex: h.meta?.zIndex,
      label: h.meta?.label ?? null,
    };
  });

  const units: TourManifest['units'] = {};
  for (const u of unitRows) {
    const group = u.group_id ? groupById.get(u.group_id) : undefined;
    const unitType = u.unit_type_id ? unitTypeById.get(u.unit_type_id) : undefined;
    units[u.code] = {
      groupCode: group?.code ?? null,
      typeCode: unitType?.code ?? null,
      areaTotalM2: u.area_total_m2 ?? null,
      attrs: u.attrs,
      media: Array.isArray(u.media) ? (u.media as string[]) : undefined,
    };
  }

  // Pseudo-unidades de bloque: la otra mitad de la traducción grupo→unidad.
  //
  // Un hotspot de grupo se emite con `unitCode` = el code del bloque y
  // `action: {kind:'unit'}` (ver más abajo), pero eso solo no alcanza: el
  // visor, al abrir una ficha, hace `tour.units[code]` y si no existe se va
  // en silencio — el bloque se pintaba bien y no respondía al click.
  //
  // El manifiesto tiene que traer, además, una entrada por bloque. No es un
  // invento nuestro: es exactamente lo que ya emitía el pipeline viejo, con
  // `typeCode: 'bloque'` y los atributos que la ficha del bloque lee para
  // decir "9 unidades · 5 disponibles". Se arma acá, en el publicador, por la
  // misma razón que la traducción del hotspot: la base guarda el modelo
  // correcto (un bloque es un grupo) y el manifiesto habla el idioma que el
  // visor ya entiende.
  //
  // Las unidades reales se escriben DESPUÉS, así un bloque nunca puede pisar
  // a una unidad que se llame igual.
  const unidadesDeBloque: TourManifest['units'] = {};
  for (const g of groupRows) {
    const suyas = unitRows.filter((u) => u.group_id === g.id);
    const superficies = suyas
      .map((u) => u.area_total_m2)
      .filter((a): a is number => typeof a === 'number');
    unidadesDeBloque[g.code] = {
      // `label` del manifiesto es `string | undefined`; la columna admite null.
      label: g.name ?? undefined,
      groupCode: null,
      typeCode: 'bloque',
      attrs: {
        unitCount: suyas.length,
        unitCodes: suyas.map((u) => u.code),
        superficieTotalUnidadesM2: superficies.length
          ? Number(superficies.reduce((a, b) => a + b, 0).toFixed(2))
          : null,
      },
    };
  }
  const unitsConBloques: TourManifest['units'] = { ...unidadesDeBloque, ...units };

  const start = scenes[0]?.slug ?? '';

  const manifest: TourManifest = {
    // Los opcionales de settings van primero: los campos obligatorios de
    // abajo los arma esta misma función a partir de Supabase, no vienen de
    // `overrides`, así que ni hace falta que el orden decida nada — pero
    // dejarlos después documenta a simple vista que settings jamás gana.
    ...pickManifestOverrides(settings),
    schema: 1,
    project,
    version,
    tenant,
    availabilityUrl: `/t/${tenant}/${project}/availability.json`,
    start,
    scenes,
    hotspots,
    units: unitsConBloques,
  };

  // El prefijado va DESPUÉS del fundido de `settings`: `photoTour`,
  // `brochurePages` y `brandLogo` pueden venir de ahí (ver
  // `pickManifestOverrides`) y también tienen que quedar con la base
  // pública versionada puesta — si se prefijara antes de fundir, esos tres
  // campos se colarían sin tocar.
  return prefixManifestMediaPaths(manifest);
}

publish.post('/api/publish', async (c) => {
  const body = await c.req
    .json<{ tenant?: string; project?: string }>()
    .catch(() => ({}) as { tenant?: string; project?: string });
  const { tenant, project } = body;
  if (!tenant || !project) {
    return c.json({ error: 'bad_request', message: 'Faltan tenant y/o project' }, 400);
  }

  const stages: StageResult[] = [];
  const fail = (stage: StageName, err: unknown) => {
    stages.push({ stage, ok: false, error: err instanceof Error ? err.message : String(err) });
    return c.json({ ok: false, stages }, stage === 'resolve_project' ? 404 : 500);
  };

  const db = createSupabaseClient({ url: c.env.SUPABASE_URL, serviceKey: c.env.SUPABASE_SERVICE_KEY });

  const resolved = await resolveProject(db, tenant, project).catch(() => null);
  if (!resolved) {
    return fail('resolve_project', `No existe ${tenant}/${project} en Supabase`);
  }
  stages.push({ stage: 'resolve_project', ok: true });

  const current = await getActivePointer(c.env.TENANTS_KV, tenant, project);
  const nextVersion = (current?.version ?? resolved.publishedVersion ?? 0) + 1;

  let manifest: TourManifest;
  try {
    manifest = await buildManifestFromSupabase(
      db,
      tenant,
      project,
      resolved.projectId,
      nextVersion,
      resolved.settings,
    );
    stages.push({ stage: 'build_manifest', ok: true });
  } catch (err) {
    return fail('build_manifest', err);
  }

  try {
    await c.env.R2.put(r2Paths.tourJson(tenant, project, nextVersion), JSON.stringify(manifest), {
      httpMetadata: {
        contentType: 'application/json',
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });
    stages.push({ stage: 'write_tour_json', ok: true });
  } catch (err) {
    return fail('write_tour_json', err);
  }

  // El availability.json inicial de la versión nueva se escribe vacío acá —
  // el contenido real lo llena /api/availability/:tenant/:project/regenerate
  // (que conviene disparar automáticamente después de este publish, y cada
  // vez que cambian units/unit_prices). Esto sólo asegura que el path exista
  // desde el momento en que se mueve el puntero.
  try {
    await c.env.R2.put(
      r2Paths.availabilityJson(tenant, project, nextVersion),
      JSON.stringify({ v: nextVersion, generated_at: new Date().toISOString(), units: {} }),
      {
        httpMetadata: {
          contentType: 'application/json',
          cacheControl: 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
        },
      },
    );
    stages.push({ stage: 'write_availability', ok: true });
  } catch (err) {
    return fail('write_availability', err);
  }

  try {
    await db.insert('publications', [
      { project_id: resolved.projectId, version: nextVersion, manifest },
    ]);
    stages.push({ stage: 'record_publication', ok: true });
  } catch (err) {
    // No abortamos el publish por esto: el contenido ya es válido en R2. Lo
    // que falta es el registro histórico en Postgres, que se puede
    // reconstruir a mano si hace falta. Igual lo reportamos.
    stages.push({ stage: 'record_publication', ok: false, error: err instanceof Error ? err.message : String(err) });
  }

  try {
    const pointer = await setActivePointer(c.env.TENANTS_KV, tenant, project, nextVersion);
    stages.push({ stage: 'move_pointer', ok: true });

    // Best-effort: reflejar la versión activa en projects.published_version
    // para que el panel/admin no tenga que leer KV. Si falla, el puntero de
    // KV (la fuente de verdad para el visor) ya se movió igual.
    await db
      .update('projects', `id=eq.${resolved.projectId}`, { published_version: nextVersion })
      .catch(() => undefined);

    return c.json({ ok: true, tenant, project, version: nextVersion, pointer, stages });
  } catch (err) {
    // El contenido de la versión nueva ya está en R2 pero el puntero NO se
    // movió: el sitio en vivo sigue sirviendo la versión anterior intacta.
    return fail('move_pointer', err);
  }
});
