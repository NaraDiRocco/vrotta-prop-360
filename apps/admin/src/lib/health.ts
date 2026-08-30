/**
 * Checklist de salud del proyecto, derivado de la vista `project_health`.
 *
 * Tres niveles con consecuencias distintas:
 *   ok    — nada que hacer
 *   warn  — se puede publicar igual, pero el resultado va a ser peor
 *   block — publicar produciría un recorrido roto; deshabilita Publicar
 *
 * Cada issue trae un deeplink a la pantalla que lo resuelve, ya filtrada.
 * Un checklist que dice "faltan polígonos" y te deja buscándolos no sirve.
 */
import type { HealthRow, ProjectRow } from './data/types.ts';

export type HealthLevel = 'ok' | 'warn' | 'block';

export interface HealthIssue {
  id: string;
  level: HealthLevel;
  title: string;
  detail: string;
  /** Pantalla que resuelve el problema, con el filtro ya puesto. */
  href: string;
}

export function healthIssues(
  project: ProjectRow & { health: HealthRow },
  tenant: string,
): HealthIssue[] {
  const base = `/t/${tenant}/p/${project.slug}`;
  const h = project.health;
  const issues: HealthIssue[] = [];

  if (h.scenesTotal === 0) {
    issues.push({
      id: 'scenes',
      level: 'block',
      title: 'Sin escenas',
      detail: 'El recorrido no tiene ninguna escena cargada.',
      href: `${base}/scenes`,
    });
  } else if (!h.hasInitialScene) {
    issues.push({
      id: 'initial-scene',
      level: 'block',
      title: 'Sin escena inicial',
      detail: 'Hay escenas pero ninguna marcada como punto de entrada del recorrido.',
      href: `${base}/scenes`,
    });
  } else {
    issues.push({ id: 'initial-scene', level: 'ok', title: 'Escena inicial definida', detail: '', href: `${base}/scenes` });
  }

  if (h.scenesWithFailedJobs > 0) {
    issues.push({
      id: 'jobs',
      level: 'block',
      title: `${h.scenesWithFailedJobs} escena(s) con procesamiento fallido`,
      detail: 'Los tiles de esas escenas no existen: el visor mostraría un panorama en negro.',
      href: `${base}/scenes`,
    });
  }

  if (h.unitsTotal === 0) {
    issues.push({
      id: 'units',
      level: 'block',
      title: 'Sin unidades',
      detail: 'No hay nada que mostrar como disponible.',
      href: `${base}/units`,
    });
  } else if (h.unitsWithoutGeometry === h.unitsTotal) {
    issues.push({
      id: 'geometry',
      level: 'block',
      title: 'Ninguna unidad tiene polígono',
      detail: 'No habría un solo lote clickeable en el recorrido.',
      href: `${base}/units?q=${encodeURIComponent('sin:poligono')}`,
    });
  } else if (h.unitsWithoutGeometry > 0) {
    issues.push({
      id: 'geometry',
      level: 'warn',
      title: `${h.unitsWithoutGeometry} unidad(es) sin polígono`,
      detail: 'Esas unidades existen en el listado pero no se pueden tocar en el recorrido.',
      href: `${base}/units?q=${encodeURIComponent('sin:poligono')}`,
    });
  } else {
    issues.push({ id: 'geometry', level: 'ok', title: 'Todas las unidades tienen polígono', detail: '', href: `${base}/units` });
  }

  if (h.publicUnitsWithoutCurrentPrice > 0) {
    issues.push({
      id: 'price',
      level: 'warn',
      title: `${h.publicUnitsWithoutCurrentPrice} unidad(es) sin precio público vigente`,
      detail: 'Se publican con el precio en blanco; a veces es a propósito (vendidas, bloqueadas).',
      href: `${base}/units?q=${encodeURIComponent('sin:precio')}`,
    });
  } else {
    issues.push({ id: 'price', level: 'ok', title: 'Precios vigentes cargados', detail: '', href: `${base}/units` });
  }

  if (!h.hasAuthorizedDomains) {
    issues.push({
      id: 'domains',
      level: 'warn',
      title: 'Sin dominios autorizados',
      detail: 'Cualquier sitio podría embeber el recorrido.',
      href: `${base}/publish`,
    });
  } else {
    issues.push({ id: 'domains', level: 'ok', title: 'Dominios autorizados configurados', detail: '', href: `${base}/publish` });
  }

  return issues;
}

export function worstLevel(issues: readonly HealthIssue[]): HealthLevel {
  if (issues.some((i) => i.level === 'block')) return 'block';
  if (issues.some((i) => i.level === 'warn')) return 'warn';
  return 'ok';
}

export function canPublishProject(issues: readonly HealthIssue[]): boolean {
  return !issues.some((i) => i.level === 'block');
}

export const LEVEL_COLOR: Record<HealthLevel, string> = {
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  block: 'var(--danger)',
};

export const LEVEL_GLYPH: Record<HealthLevel, string> = {
  ok: '✓',
  warn: '!',
  block: '✕',
};
