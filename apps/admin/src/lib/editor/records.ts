/**
 * Filas de escena y hotspot tal como las devuelve el repo.
 *
 * Viven acá y no en `lib/data/types.ts` a propósito: son el contrato que el
 * editor necesita y que el repo expone, y mantenerlas en el paquete del editor
 * evita pisar el archivo de tipos compartido mientras otras pantallas se
 * construyen en paralelo. `repo.ts` las reexporta.
 */
import type { GeometryKind, Hotspot, Px, Scene, SceneKind, Sph } from '@r360/core';

/**
 * Par de coordenadas del editor. Es a la vez `Sph` ([yaw,pitch] en radianes)
 * y `Px` ([x,y] normalizado 0..1): qué significa lo dice `GeomSpace`.
 * Unificarlos deja que el reducer, el snap y el historial sean uno solo en vez
 * de dos copias que se desincronizan.
 */
export type Pt = readonly [number, number];

/** Espacio de coordenadas de una escena. `sph` = panorámica, `px` = plano. */
export type GeomSpace = 'sph' | 'px';

export interface SceneRow {
  id: string;
  projectId: string;
  slug: string;
  kind: SceneKind;
  name: string;
  /** Imagen de la escena. Para `panorama` es el equirectangular. */
  imageUrl: string;
  /** Sólo relevante en `floorplan`/`map`: tamaño del master en píxeles. */
  width: number;
  height: number;
  initialView: { yaw: number; pitch: number; fov: number } | null;
  sort: number;
}

export interface HotspotRow {
  id: string;
  sceneId: string;
  unitCode: string | null;
  geometryKind: GeometryKind;
  geometry: Pt[];
  anchor: Pt | null;
  label: string | null;
  zIndex: number;
}

/** Espacio de coordenadas que le corresponde a una escena por su tipo. */
export function spaceOf(kind: SceneKind): GeomSpace {
  return kind === 'panorama' ? 'sph' : 'px';
}

export function polygonKindFor(space: GeomSpace): GeometryKind {
  return space === 'sph' ? 'polygon_sph' : 'polygon_px';
}

/**
 * Fila → `Hotspot` de `@r360/core`, que es lo que consume el visor.
 * El editor produce exactamente esta forma; `apps/viewer/src/polygons.ts` y
 * `floorplan.ts` la dibujan sin ninguna transformación intermedia.
 */
export function toHotspot(row: HotspotRow): Hotspot {
  const geometry = row.geometry.map(([a, b]) => [a, b] as const);
  return {
    id: row.id,
    sceneId: row.sceneId,
    unitCode: row.unitCode,
    geometryKind: row.geometryKind,
    geometry: (row.geometryKind === 'polygon_px' || row.geometryKind === 'point_px'
      ? (geometry as Px[])
      : (geometry as Sph[])) as Sph[] | Px[],
    ...(row.anchor ? { anchor: row.anchor as Sph | Px } : {}),
    zIndex: row.zIndex,
    label: row.label,
  };
}

/** `SceneRow` → `Scene` del manifiesto. Sirve para previsualizar con el visor. */
export function toScene(row: SceneRow): Scene {
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    name: row.name,
    source: { url: row.imageUrl, width: row.width, height: row.height },
    ...(row.initialView ? { initialView: row.initialView } : {}),
    sort: row.sort,
  };
}
