import { NextResponse, type NextRequest } from 'next/server';
import { resolveProjectActor } from '@/lib/auth.ts';
import { getRepo } from '@/lib/data/index.ts';
import { canEditHotspots } from '@/lib/roles.ts';
import type { HotspotRow, Pt } from '@/lib/editor/records.ts';

/**
 * Hotspots de un proyecto. Lo consume el editor y nada más.
 *
 * El GET trae los de TODAS las escenas de una: el editor necesita saber si una
 * unidad ya tiene polígono en otra escena (el indicador ◐) y pedir escena por
 * escena serían N viajes para pintar una lista.
 *
 * El PUT reemplaza el conjunto completo de UNA escena. Es idempotente a
 * propósito: el autosave puede reintentar el mismo cuerpo tantas veces como
 * haga falta sin duplicar nada ni dejar la escena a medio camino.
 *
 * Dibujar hotspots es tarea de Vrotta (`canEditHotspots`): la pantalla del
 * editor (`scenes/[scene]/edit/page.tsx`) ya redirige a quien no cumpla ese
 * rol, y este único consumidor (`components/editor/use-editor.ts`) nunca la
 * llama si no. Pero la ruta en sí sólo chequeaba sesión — la policy
 * `hotspots_write` de RLS permite `owner`/`editor` — así que por API directa
 * el hueco seguía abierto. Se cierra acá (no en RLS: mismo razonamiento que
 * el resto de esta auditoría, ver `publish/preview-tokens/route.ts`),
 * incluido el GET: nadie fuera de plataforma tiene un motivo legítimo para
 * pedirlo.
 */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ project: string }> }) {
  const lookup = await resolveProjectActor((await ctx.params).project);
  if (!lookup) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });
  if (lookup === 'sin-proyecto') return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  if (!lookup.actor || !canEditHotspots(lookup.actor)) {
    return NextResponse.json({ error: 'No podés ver los hotspots de este proyecto' }, { status: 403 });
  }
  const { project } = await ctx.params;
  return NextResponse.json({ hotspots: await getRepo().listHotspots(project) });
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ project: string }> }) {
  const lookup = await resolveProjectActor((await ctx.params).project);
  if (!lookup) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 });
  if (lookup === 'sin-proyecto') return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  if (!lookup.actor || !canEditHotspots(lookup.actor)) {
    return NextResponse.json({ error: 'No podés editar los hotspots de este proyecto' }, { status: 403 });
  }

  const { project } = await ctx.params;
  const body: unknown = await request.json().catch(() => null);
  const parsed = parseBody(body);
  if (!parsed) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });

  await getRepo().saveSceneHotspots(project, parsed.sceneId, parsed.hotspots);
  return NextResponse.json({ ok: true, saved: parsed.hotspots.length });
}

interface Body {
  sceneId: string;
  hotspots: HotspotRow[];
}

/**
 * Validación explícita: un anillo mal formado que entre acá se guarda y después
 * hace desaparecer el polígono en el visor, lejos de donde se originó.
 */
function parseBody(body: unknown): Body | null {
  if (typeof body !== 'object' || body === null) return null;
  const raw = body as Record<string, unknown>;
  const sceneId = raw['sceneId'];
  const list = raw['hotspots'];
  if (typeof sceneId !== 'string' || !sceneId || !Array.isArray(list)) return null;

  const hotspots: HotspotRow[] = [];
  for (const item of list) {
    if (typeof item !== 'object' || item === null) return null;
    const h = item as Record<string, unknown>;
    const geometry = toRing(h['geometry']);
    if (typeof h['id'] !== 'string' || geometry.length < 3) return null;
    const kind = h['geometryKind'];
    if (kind !== 'polygon_sph' && kind !== 'polygon_px') return null;
    hotspots.push({
      id: h['id'],
      sceneId,
      unitCode: typeof h['unitCode'] === 'string' ? h['unitCode'] : null,
      geometryKind: kind,
      geometry,
      anchor: null,
      label: typeof h['label'] === 'string' ? h['label'] : null,
      zIndex: typeof h['zIndex'] === 'number' ? h['zIndex'] : 1,
    });
  }
  return { sceneId, hotspots };
}

function toRing(value: unknown): Pt[] {
  if (!Array.isArray(value)) return [];
  const out: Pt[] = [];
  for (const p of value) {
    if (!Array.isArray(p) || typeof p[0] !== 'number' || typeof p[1] !== 'number') return [];
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return [];
    out.push([p[0], p[1]]);
  }
  return out;
}
