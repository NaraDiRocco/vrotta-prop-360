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
 * Datos de contacto del proyecto. Van en `tour.json` y NO en availability:
 * son dato del proyecto, no dato comercial vivo, y así cachean con el resto
 * del manifiesto.
 *
 * Campo OPCIONAL y aditivo: un manifiesto sin `contact` sigue siendo válido y
 * el visor simplemente no dibuja el CTA. Nunca un botón que no lleva a ningún
 * lado — preferimos no ofrecer el canal antes que ofrecer uno roto.
 */
export interface ContactInfo {
  /** E.164 con o sin `+`, ej. "+59891234567". El visor lo normaliza. */
  whatsapp: string;
  /** Nombre visible de quien atiende, si el proyecto lo quiere mostrar. */
  name?: string;
  /**
   * Plantilla del mensaje prellenado. Placeholders soportados:
   * `{project} {code} {label} {facts} {price} {status} {url}`.
   * Si falta, el visor arma el mensaje por defecto (español rioplatense).
   */
  messageTemplate?: string;
}

/**
 * Un tramo de la capa "Precio" (§5 del plan de experiencia): una rampa
 * secuencial de un solo tono, 3-4 tramos, donde más oscuro = más caro.
 *
 * Es un OVERRIDE opcional: sin `theme.priceBands` el visor calcula los tramos
 * por cuantiles de los precios presentes en `availability.json`. Se declara en
 * el tema para el caso en que el proyecto quiera tramos comerciales fijos
 * ("hasta 160 k") que no se muevan cada vez que se vende una unidad.
 */
export interface PriceBand {
  /** Piso del tramo, inclusive, en la moneda del precio. */
  min: number;
  /** Techo del tramo, inclusive. */
  max: number;
  /** Color del tramo. Si falta, el visor lo toma de su rampa de un solo tono. */
  color?: string;
  /** Rótulo de leyenda. Si falta, el visor lo arma con el rango real. */
  label?: string;
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
  theme?: {
    states?: Partial<Record<UnitStatus, { base: string; fill: number }>>;
    priceBands?: PriceBand[];
  };
  /** Ver `ContactInfo`. Ausente = el visor no muestra CTA de contacto. */
  contact?: ContactInfo;
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
