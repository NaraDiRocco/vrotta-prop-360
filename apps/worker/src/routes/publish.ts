import { Hono } from 'hono';
import type { Env } from '../env.ts';
import type { TourManifest, Scene, Hotspot, GeometryKind, SceneKind } from '@r360/core';
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
}

async function buildManifestFromSupabase(
  db: ReturnType<typeof createSupabaseClient>,
  tenant: string,
  project: string,
  projectId: string,
  version: number,
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
  const hotspotsPerScene = await Promise.all(
    sceneRows.map((s) =>
      db.select<HotspotRow[]>('hotspots', `scene_id=eq.${s.id}`).catch(() => [] as HotspotRow[]),
    ),
  );
  const allHotspotRows = hotspotsPerScene.flat();

  const scenes: Scene[] = sceneRows.map((s) => ({
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

    let action: Hotspot['action'];
    if (h.target_kind === 'unit') action = { kind: 'unit' };
    else if (h.target_kind === 'scene' && targetScene) action = { kind: 'goto', sceneSlug: targetScene.slug };
    else if (h.meta?.url) action = { kind: 'url', href: h.meta.url };

    return {
      id: h.id,
      sceneId: h.scene_id,
      unitCode: unit?.code ?? null,
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

  const start = scenes[0]?.slug ?? '';

  return {
    schema: 1,
    project,
    version,
    tenant,
    availabilityUrl: `/t/${tenant}/${project}/availability.json`,
    start,
    scenes,
    hotspots,
    units,
  };
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
    manifest = await buildManifestFromSupabase(db, tenant, project, resolved.projectId, nextVersion);
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
