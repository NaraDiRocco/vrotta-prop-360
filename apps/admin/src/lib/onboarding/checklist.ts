/**
 * Checklist de arranque de un proyecto.
 *
 * No es lo mismo que `lib/health.ts`: aquél dice "¿esto se puede publicar?"
 * y se queda para siempre; éste dice "¿por dónde sigo?" y desaparece cuando
 * el proyecto arrancó. Ambos leen la MISMA vista `project_health`, así que no
 * pueden contradecirse.
 *
 * Los pasos van en el orden real del trabajo: sin estructura no hay dónde
 * colgar unidades, sin unidades no hay qué dibujar, sin escena no hay dónde
 * dibujarlo.
 */
import type { HealthRow, ProjectRow } from '../data/types.ts';

export type StartupStepId =
  | 'structure'
  | 'units'
  | 'scenes'
  | 'polygons'
  | 'prices'
  | 'domains'
  | 'publish';

export interface StartupStep {
  id: StartupStepId;
  title: string;
  /** Qué falta, con el número en la mano. Vacío cuando está hecho. */
  detail: string;
  done: boolean;
  /** Pantalla que resuelve el paso, ya filtrada. */
  href: string;
  /** Rótulo del enlace. */
  action: string;
  /** Se puede saltear sin que el recorrido quede roto. */
  optional: boolean;
}

export interface StartupChecklist {
  steps: StartupStep[];
  done: number;
  total: number;
  complete: boolean;
  /** Primer paso pendiente: el que hay que hacer ahora. */
  next: StartupStep | null;
}

export interface StartupInput {
  tenant: string;
  project: Pick<ProjectRow, 'slug' | 'publishedVersion'>;
  health: HealthRow;
  /** Cuántos grupos tiene el proyecto (la vista de salud no los cuenta). */
  groupCount: number;
}

export function startupChecklist({ tenant, project, health, groupCount }: StartupInput): StartupChecklist {
  const base = `/t/${tenant}/p/${project.slug}`;
  const units = health.unitsTotal;

  const steps: StartupStep[] = [
    {
      id: 'structure',
      title: 'Estructura',
      detail: groupCount > 0 ? '' : 'Todavía no hay manzanas, bloques ni torres donde colgar las unidades.',
      done: groupCount > 0,
      href: `${base}/structure`,
      action: 'Definir',
      optional: false,
    },
    {
      id: 'units',
      title: 'Unidades',
      detail: units > 0 ? '' : 'Generalas por patrón o importá el CSV del cliente.',
      done: units > 0,
      href: `/t/${tenant}/p/new?project=${encodeURIComponent(project.slug)}&panel=units`,
      action: 'Cargar',
      optional: false,
    },
    {
      id: 'scenes',
      title: 'Escenas',
      detail: health.scenesTotal === 0
        ? 'Subí al menos un panorama o masterplan.'
        : health.hasInitialScene
          ? ''
          : 'Hay escenas pero ninguna marcada como punto de entrada.',
      done: health.scenesTotal > 0 && health.hasInitialScene,
      href: `${base}/scenes`,
      action: 'Subir',
      optional: false,
    },
    {
      id: 'polygons',
      title: 'Polígonos',
      detail:
        units === 0
          ? 'Primero cargá unidades.'
          : health.unitsWithoutGeometry > 0
            ? `${health.unitsWithoutGeometry} de ${units} unidades no se pueden tocar en el recorrido.`
            : '',
      done: units > 0 && health.unitsWithoutGeometry === 0,
      href: `${base}/units?q=${encodeURIComponent('sin:poligono')}`,
      action: 'Dibujar',
      optional: false,
    },
    {
      id: 'prices',
      title: 'Precios',
      detail:
        health.publicUnitsWithoutCurrentPrice > 0
          ? `${health.publicUnitsWithoutCurrentPrice} unidad(es) sin precio público vigente.`
          : '',
      done: units > 0 && health.publicUnitsWithoutCurrentPrice === 0,
      href: `${base}/units?q=${encodeURIComponent('sin:precio')}`,
      action: 'Cargar',
      optional: true,
    },
    {
      id: 'domains',
      title: 'Dominios',
      detail: health.hasAuthorizedDomains ? '' : 'Sin dominios autorizados cualquier sitio puede embeber el recorrido.',
      done: health.hasAuthorizedDomains,
      href: `${base}/publish`,
      action: 'Autorizar',
      optional: true,
    },
    {
      id: 'publish',
      title: 'Publicar',
      detail: project.publishedVersion > 0 ? '' : 'El recorrido todavía no está en vivo.',
      done: project.publishedVersion > 0,
      href: `${base}/publish`,
      action: 'Publicar',
      optional: false,
    },
  ];

  const done = steps.filter((s) => s.done).length;
  return {
    steps,
    done,
    total: steps.length,
    complete: done === steps.length,
    next: steps.find((s) => !s.done) ?? null,
  };
}

/** Clave de localStorage del "descartar" — por proyecto, no global. */
export function dismissKey(projectId: string): string {
  return `r360.onboarding.dismissed.${projectId}`;
}
