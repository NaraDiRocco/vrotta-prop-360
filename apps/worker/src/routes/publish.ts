import { Hono } from 'hono';
import type { Env } from '../env.ts';
import type { TourManifest } from '@r360/core';
import { createSupabaseClient } from '../lib/supabase.ts';
import { setActivePointer, getActivePointer } from '../lib/pointer.ts';
import { r2Paths } from '../lib/r2paths.ts';

/**
 * POST /api/publish
 * body: { tenant: string, project: string }
 *
 * Arma el TourManifest desde Supabase, lo escribe (junto con lo que haga
 * falta) en R2 bajo `t/{tenant}/{project}/v{N}/`, y RECIÉN AL FINAL mueve el
 * puntero de versión activa en KV.
 *
 * Si cualquier paso previo al último falla, el puntero no se toca y la
 * versión en vivo sigue siendo la anterior — publish es "todo o nada" desde
 * el punto de vista de lo que ve el visitante. Se devuelve el detalle de
 * qué etapa se completó y cuál falló para poder diagnosticar sin reintentar
 * a ciegas.
 *
 * TODO: el armado real del manifest (groups, unitTypes, units, scenes,
 * hotspots) depende del schema de supabase/migrations, que todavía no
 * existe en este monorepo. `buildManifestFromSupabase` de acá abajo es un
 * esqueleto con la forma correcta de salida (TourManifest) y llamadas de
 * ejemplo — hay que revisarlo en cuanto el schema esté definido.
 */
export const publish = new Hono<{ Bindings: Env }>();

type StageName = 'fetch_data' | 'build_manifest' | 'write_tour_json' | 'write_availability' | 'move_pointer';

interface StageResult {
  stage: StageName;
  ok: boolean;
  error?: string;
}

async function buildManifestFromSupabase(
  db: ReturnType<typeof createSupabaseClient>,
  tenant: string,
  project: string,
  version: number,
): Promise<TourManifest> {
  // TODO: reemplazar por las tablas reales. Se dejan los `select` de ejemplo
  // comentados para que quede claro el shape esperado por tabla.
  //
  // const scenesRows = await db.select<SceneRow[]>('scenes', `project_id=eq.${project}&order=sort`);
  // const hotspotsRows = await db.select<HotspotRow[]>('hotspots', `project_id=eq.${project}`);
  // const unitsRows = await db.select<UnitRow[]>('units', `project_id=eq.${project}`);
  void db;

  const manifest: TourManifest = {
    schema: 1,
    project,
    version,
    tenant,
    availabilityUrl: `/t/${tenant}/${project}/availability.json`,
    start: '',
    scenes: [],
    hotspots: [],
    units: {},
  };
  return manifest;
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
    return c.json({ ok: false, stages }, 500);
  };

  const current = await getActivePointer(c.env.TENANTS_KV, tenant, project);
  const nextVersion = (current?.version ?? 0) + 1;

  const db = createSupabaseClient({ url: c.env.SUPABASE_URL, serviceKey: c.env.SUPABASE_SERVICE_KEY });

  let manifest: TourManifest;
  try {
    manifest = await buildManifestFromSupabase(db, tenant, project, nextVersion);
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

  // El availability.json inicial de la versión nueva se escribe con TTL corto
  // (ver /api/availability/:tenant/:project/regenerate) — acá sólo nos
  // aseguramos de que exista algo servible desde el momento en que se mueve
  // el puntero.
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
    const pointer = await setActivePointer(c.env.TENANTS_KV, tenant, project, nextVersion);
    stages.push({ stage: 'move_pointer', ok: true });
    return c.json({ ok: true, tenant, project, version: nextVersion, pointer, stages });
  } catch (err) {
    // El contenido de la versión nueva ya está en R2 pero el puntero NO se
    // movió: el sitio en vivo sigue sirviendo la versión anterior intacta.
    return fail('move_pointer', err);
  }
});
