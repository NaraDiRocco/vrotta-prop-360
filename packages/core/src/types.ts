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

/**
 * De dónde salió una imagen (plan de experiencia, §5.1: "la honestidad como
 * diferenciador"). Tres y sólo tres valores — no se agregan más sin volver a
 * ese documento:
 *  - `foto`: fotografía o video real del predio. Lleva `capturedAt`.
 *  - `render`: imagen del proyecto arquitectónico (renders, masterplan).
 *  - `ia`: recreación generada con IA sobre una foto real (mobiliario,
 *    paisajismo). Nunca es portada ni miniatura fuera de su slider (§3.1).
 */
export type ProcedenciaKind = 'foto' | 'render' | 'ia';

export interface Procedencia {
  kind: ProcedenciaKind;
  /**
   * Sólo para `kind: 'foto'`. Fecha de captura (`YYYY-MM-DD`), leída del
   * EXIF `DateTimeOriginal` del archivo original — NUNCA escrita a mano: la
   * fecha es la prueba de que es una foto y no un render (§5.1, "la fecha
   * en la chapa de foto no es decoración: fecha = prueba").
   */
  capturedAt?: string;
  /** Sólo para `kind: 'ia'`: el `id` (en `photoTour`) de la foto real de base. */
  basedOn?: string;
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
  /**
   * Chapa de procedencia de la escena (plan §5.1). Campo OPCIONAL y aditivo:
   * una escena sin `procedencia` sigue siendo válida y el visor de hoy no la
   * lee. Hoy la emite `build_tour.py` para el masterplan y los renders
   * (siempre `{ kind: 'render' }`) — ninguna escena panorámica real existe
   * todavía (ver README, "Qué falta pedirle al cliente").
   */
  procedencia?: Procedencia;
  sort: number;
  /**
   * Sólo para `kind: 'video'` (Tramo 4, decisión 15 de `build_tour.py`).
   * Campos OPCIONALES y aditivos: una escena sin ellos sigue siendo válida.
   *  - `poster`: el cuadro de apertura, para no mostrar un rectángulo negro
   *    mientras el archivo no cargó (mismo problema que resuelve el thumb
   *    del masterplan, ver `build_tour.py::convert_masterplan`).
   *  - `mobileUrl`: versión liviana (menor bitrate/resolución) que el visor
   *    sirve en pantallas angostas vía `<source media>`; `source.url` sigue
   *    siendo la versión de escritorio. Sin `mobileUrl` el visor sirve
   *    `source.url` en cualquier pantalla.
   */
  poster?: { url: string; width: number; height: number };
  mobileUrl?: string;
}

/**
 * Una foto (o recreación) curada del recorrido narrativo del plan de
 * experiencia (Tramo 1 y Tramo 2, `docs/06-BENCHMARK/5-EXPERIENCIA-BALEIA.md`
 * §1 y §3.2) — no es una `Scene` navegable: es material de la secuencia con
 * sentido ("paseo por la unidad") y de los deslizadores antes/después.
 */
export interface PhotoTourItem {
  id: string;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  procedencia: Procedencia;
  /** Caption tal como está escrita en el plan de experiencia (texto exacto, no resumido). */
  caption?: string;
  /** Rótulo de ambiente para la tira del paseo (Tramo 2, Mitad B): "Living", "Cocina", "La vista", etc. */
  ambiente?: string;
  /**
   * true si la imagen NO puede usarse como portada, miniatura ni imagen de
   * vista previa (OG) fuera de su contexto original — hoy sólo las
   * recreaciones de IA (plan §3.1: "la imagen de IA no existe fuera del
   * slider").
   */
  restricted?: boolean;
}

/** Un deslizador antes/después (plan §1 Tramo 2, mecánica en §3.1). */
export interface BeforeAfterPair {
  id: string;
  /** "Hoy · foto real". */
  before: PhotoTourItem;
  /** "Recreación IA sobre la foto" — SIEMPRE `restricted: true`. */
  after: PhotoTourItem;
  label?: string;
}

/**
 * Material narrativo curado del recorrido (plan de experiencia): las fotos
 * reales en su orden con sentido y los pares antes/después. Campo OPCIONAL y
 * aditivo en `TourManifest` — sin `photoTour` el visor de hoy sigue
 * funcionando exactamente igual; es la capa de datos que el Tramo 1 y el
 * Tramo 2 de la experiencia van a consumir.
 */
export interface PhotoTour {
  items: PhotoTourItem[];
  pairs?: BeforeAfterPair[];
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
  /** Ver `PhotoTour`. Ausente = el visor no dibuja el recorrido narrativo de fotos. */
  photoTour?: PhotoTour;
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
