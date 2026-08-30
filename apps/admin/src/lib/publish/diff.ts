/**
 * Diff semántico entre lo publicado (última versión) y el borrador actual.
 *
 * Deliberadamente NO es un diff de JSON crudo: agrupa por lo que le importa
 * a quien publica (unidades, hotspots, escenas, configuración) y cada entrada
 * linkea a la pantalla que la originó.
 *
 * Ojo con "Unidades": el `status` y el `price` de una unidad NO viven en el
 * tour.json versionado — el visor los lee en vivo desde availability.json —
 * así que un cambio de estado nunca requiere republicar. Igual se muestran
 * acá como contexto (para no publicar "a ciegas" sin saber qué pasó con el
 * inventario), pero marcados aparte de los cambios que sí importan para el
 * manifest: altas/bajas de unidades y cambios de atributos/grupo/tipo (que
 * si viajan en tour.json).
 *
 * Los hotspots no se modelan en detalle en el panel (eso lo hace el editor,
 * fuera de esta carpeta): la señal disponible acá es `hasPolygon` por unidad,
 * que alcanza para detectar geometría nueva/eliminada por unidad enlazada.
 */
import type { DiffEntry, PublishWarning, SceneRow, UnitRow } from '../data/types.ts';

export interface UnitSnapshot {
  code: string;
  status: string;
  price: { amount: number; currency: string } | null;
  groupCode: string | null;
  typeCode: string | null;
  areaTotalM2: number | null;
  attrsSignature: string;
  hasPolygon: boolean;
}

export interface SceneSnapshot {
  id: string;
  name: string;
  kind: string;
  hotspotCount: number;
}

export interface ConfigSnapshot {
  initialSceneId: string | null;
  allowedDomains: string[];
}

export interface PublishSnapshot {
  units: UnitSnapshot[];
  scenes: SceneSnapshot[];
  config: ConfigSnapshot;
}

export function unitToSnapshot(unit: UnitRow): UnitSnapshot {
  return {
    code: unit.code,
    status: unit.status,
    price: unit.price ? { amount: unit.price.amount, currency: unit.price.currency } : null,
    groupCode: unit.groupCode,
    typeCode: unit.typeCode,
    areaTotalM2: unit.areaTotalM2,
    attrsSignature: JSON.stringify(unit.attrs ?? {}),
    hasPolygon: unit.hasPolygon,
  };
}

export function sceneToSnapshot(scene: SceneRow): SceneSnapshot {
  return { id: scene.id, name: scene.name, kind: scene.kind, hotspotCount: scene.hotspotCount };
}

function href(tenant: string, project: string, path: string): string {
  return `/t/${tenant}/p/${project}${path}`;
}

/**
 * `live` es `null` cuando el proyecto nunca se publicó: todo entra como alta.
 */
export function computeDiff(
  live: PublishSnapshot | null,
  draft: PublishSnapshot,
  tenant: string,
  project: string,
): DiffEntry[] {
  const entries: DiffEntry[] = [];

  const liveUnits = new Map((live?.units ?? []).map((u) => [u.code, u]));
  const draftUnits = new Map(draft.units.map((u) => [u.code, u]));

  // Altas / bajas de unidades.
  for (const code of draftUnits.keys()) {
    if (!liveUnits.has(code)) {
      entries.push({
        id: `unit-added-${code}`,
        section: 'units',
        kind: 'added',
        label: code,
        detail: 'Unidad nueva desde la última publicación.',
        href: href(tenant, project, `/units?q=${encodeURIComponent(code)}`),
      });
    }
  }
  for (const code of liveUnits.keys()) {
    if (!draftUnits.has(code)) {
      entries.push({
        id: `unit-removed-${code}`,
        section: 'units',
        kind: 'removed',
        label: code,
        detail: 'Unidad eliminada desde la última publicación.',
        href: href(tenant, project, `/units?q=${encodeURIComponent(code)}`),
      });
    }
  }

  // Cambios estructurales que sí viajan en tour.json: grupo, tipo, área,
  // atributos y geometría (hasPolygon). Estado y precio se listan aparte,
  // marcados como informativos (no fuerzan publicar).
  for (const [code, after] of draftUnits) {
    const before = liveUnits.get(code);
    if (!before) continue;

    const structuralChanges: string[] = [];
    if (before.groupCode !== after.groupCode) structuralChanges.push(`grupo ${before.groupCode ?? '—'} → ${after.groupCode ?? '—'}`);
    if (before.typeCode !== after.typeCode) structuralChanges.push(`tipo ${before.typeCode ?? '—'} → ${after.typeCode ?? '—'}`);
    if (before.areaTotalM2 !== after.areaTotalM2) structuralChanges.push(`m² ${before.areaTotalM2 ?? '—'} → ${after.areaTotalM2 ?? '—'}`);
    if (before.attrsSignature !== after.attrsSignature) structuralChanges.push('atributos');
    if (structuralChanges.length > 0) {
      entries.push({
        id: `unit-modified-${code}`,
        section: 'units',
        kind: 'modified',
        label: code,
        detail: structuralChanges.join(', '),
        href: href(tenant, project, `/units?q=${encodeURIComponent(code)}`),
      });
    }

    if (before.status !== after.status) {
      entries.push({
        id: `unit-status-${code}`,
        section: 'units',
        kind: 'modified',
        label: `${code} · estado`,
        detail: `${before.status} → ${after.status} (informativo: no requiere publicar, se lee en vivo)`,
        href: href(tenant, project, `/units?q=${encodeURIComponent(code)}`),
      });
    }
    if (JSON.stringify(before.price) !== JSON.stringify(after.price)) {
      entries.push({
        id: `unit-price-${code}`,
        section: 'units',
        kind: 'modified',
        label: `${code} · precio`,
        detail: 'Precio cambiado (informativo: no requiere publicar, se lee en vivo)',
        href: href(tenant, project, `/units?q=${encodeURIComponent(code)}`),
      });
    }

    // Geometría: usamos hasPolygon como proxy de "tiene hotspot con polígono".
    if (before.hasPolygon !== after.hasPolygon) {
      entries.push({
        id: `hotspot-${code}`,
        section: 'hotspots',
        kind: after.hasPolygon ? 'added' : 'removed',
        label: code,
        detail: after.hasPolygon ? 'Polígono nuevo.' : 'Polígono eliminado.',
        href: href(tenant, project, `/units?q=${encodeURIComponent(code)}`),
      });
    }
  }

  // Escenas.
  const liveScenes = new Map((live?.scenes ?? []).map((s) => [s.id, s]));
  const draftScenes = new Map(draft.scenes.map((s) => [s.id, s]));
  for (const [id, after] of draftScenes) {
    const before = liveScenes.get(id);
    if (!before) {
      entries.push({
        id: `scene-added-${id}`,
        section: 'scenes',
        kind: 'added',
        label: after.name,
        detail: `Escena nueva (${after.kind}).`,
        href: href(tenant, project, '/scenes'),
      });
      continue;
    }
    if (before.name !== after.name) {
      entries.push({
        id: `scene-renamed-${id}`,
        section: 'scenes',
        kind: 'modified',
        label: after.name,
        detail: `Renombrada de "${before.name}".`,
        href: href(tenant, project, '/scenes'),
      });
    }
    if (before.hotspotCount !== after.hotspotCount) {
      const delta = after.hotspotCount - before.hotspotCount;
      entries.push({
        id: `scene-hotspots-${id}`,
        section: 'hotspots',
        kind: delta > 0 ? 'added' : 'removed',
        label: after.name,
        detail: `${Math.abs(delta)} hotspot(s) ${delta > 0 ? 'nuevos' : 'eliminados'}.`,
        href: href(tenant, project, `/scenes/${id}/edit`),
      });
    }
  }
  for (const [id, before] of liveScenes) {
    if (!draftScenes.has(id)) {
      entries.push({
        id: `scene-removed-${id}`,
        section: 'scenes',
        kind: 'removed',
        label: before.name,
        detail: 'Escena eliminada.',
        href: href(tenant, project, '/scenes'),
      });
    }
  }

  // Configuración.
  const liveConfig = live?.config ?? { initialSceneId: null, allowedDomains: [] };
  if (liveConfig.initialSceneId !== draft.config.initialSceneId) {
    entries.push({
      id: 'config-initial-scene',
      section: 'config',
      kind: 'modified',
      label: 'Escena inicial',
      detail: 'Cambió la escena de entrada del recorrido.',
      href: href(tenant, project, '/scenes'),
    });
  }
  const liveDomains = [...liveConfig.allowedDomains].sort().join(',');
  const draftDomains = [...draft.config.allowedDomains].sort().join(',');
  if (liveDomains !== draftDomains) {
    entries.push({
      id: 'config-domains',
      section: 'config',
      kind: 'modified',
      label: 'Dominios autorizados',
      detail: `${liveConfig.allowedDomains.join(', ') || '(ninguno)'} → ${draft.config.allowedDomains.join(', ') || '(ninguno)'}`,
      href: href(tenant, project, '/publish'),
    });
  }

  return entries;
}

/** Advertencias que se muestran antes de publicar (no bloquean, pero avisan). */
export function computeWarnings(draft: PublishSnapshot, tenant: string, project: string): PublishWarning[] {
  const warnings: PublishWarning[] = [];

  const withoutPolygon = draft.units.filter((u) => !u.hasPolygon);
  if (withoutPolygon.length > 0) {
    warnings.push({
      id: 'units-without-polygon',
      message: `${withoutPolygon.length} unidad(es) sin polígono cargado — no van a ser clickeables en el recorrido.`,
      href: href(tenant, project, '/units?q=sin:poligono'),
    });
  }

  if (draft.config.allowedDomains.length === 0) {
    warnings.push({
      id: 'no-authorized-domains',
      message: 'No hay dominios autorizados configurados — el embed va a rechazar cualquier origen.',
      href: href(tenant, project, '/publish'),
    });
  }

  if (!draft.config.initialSceneId) {
    warnings.push({
      id: 'no-initial-scene',
      message: 'No hay escena inicial marcada — el recorrido no sabe por dónde arrancar.',
      href: href(tenant, project, '/scenes'),
    });
  }

  return warnings;
}
