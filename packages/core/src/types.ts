import type { UnitStatus } from './status.ts';
import type { Sph, Px } from './geometry.ts';

export type ProjectKind = 'loteo' | 'edificio' | 'complejo' | 'mixto';
export type SceneKind = 'panorama' | 'floorplan' | 'map' | 'video';
export type GeometryKind = 'polygon_sph' | 'polygon_px' | 'point_sph' | 'point_px';
export type PriceVisibility = 'public' | 'on_request' | 'private';

/** Nivel intermedio de la jerarquía: manzana, bloque, torre, piso, etapa. */
export interface Group {
  id: string;
  parentId: string | null;
  kind: string;
  code: string;
  name?: string;
  sort: number;
}

export interface UnitType {
  id: string;
  code: string;
  name: string;
  /** JSON Schema de los atributos variables de este tipo. */
  attrSchema: Record<string, unknown>;
}

export interface Unit {
  id: string;
  groupId: string | null;
  unitTypeId: string | null;
  code: string;
  status: UnitStatus;
  areaTotalM2?: number | null;
  attrs: Record<string, unknown>;
  sort: number;
}

export interface TiledSource {
  /** Base relativa dentro de la versión publicada. */
  base: string;
  faceSize: number;
  tileSize: number;
  levels: number;
  format: 'webp' | 'jpg';
}

export interface Scene {
  id: string;
  slug: string;
  kind: SceneKind;
  name: string;
  source: TiledSource | { url: string; width: number; height: number };
  initialView?: { yaw: number; pitch: number; fov: number };
  /** Desfase del norte, en radianes, para brújula y minimapa. */
  northOffset?: number;
  sort: number;
}

export interface Hotspot {
  id: string;
  sceneId: string;
  unitCode: string | null;
  geometryKind: GeometryKind;
  /** polygon_sph → Sph[] · polygon_px → Px[] (normalizados 0..1). */
  geometry: Sph[] | Px[];
  anchor?: Sph | Px;
  action?:
    | { kind: 'unit' }
    | { kind: 'goto'; sceneSlug: string }
    | { kind: 'url'; href: string };
  zIndex?: number;
  label?: string | null;
}

/**
 * tour.json — artefacto INMUTABLE por versión.
 * Contiene geometría y datos NO sensibles. Nunca precio ni estado.
 */
export interface TourManifest {
  schema: 1;
  project: string;
  version: number;
  tenant: string;
  theme?: { states?: Partial<Record<UnitStatus, { base: string; fill: number }>> };
  availabilityUrl: string;
  start: string;
  scenes: Scene[];
  hotspots: Hotspot[];
  units: Record<
    string,
    {
      label?: string;
      groupCode?: string | null;
      typeCode?: string | null;
      areaTotalM2?: number | null;
      attrs?: Record<string, unknown>;
      media?: string[];
    }
  >;
}

/**
 * availability.json — lo ÚNICO comercial que llega al navegador anónimo.
 * `p` viaja en null cuando la visibilidad del precio no es pública: el precio
 * no sale del backend si el cliente no quiere.
 */
export interface AvailabilityFile {
  v: number;
  generated_at: string;
  units: Record<string, { s: UnitStatus; p: { a: number; c: string } | null }>;
}
