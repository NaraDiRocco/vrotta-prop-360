/**
 * Adaptador de tiles de cubemap: traduce nuestro `TiledSource`
 * (packages/core/src/types.ts, generado por packages/pipeline/pano_pipeline/tiles.py)
 * a la configuración que espera `@photo-sphere-viewer/cubemap-tiles-adapter`.
 *
 * ---------------------------------------------------------------------------
 * CONVENCIÓN DE NOMBRES DE CARA (la parte que muerde si no se documenta)
 * ---------------------------------------------------------------------------
 * Pipeline (py360convert, ver FACE_KEY_TO_NAME en tiles.py):
 *   front · right · back · left · up · down
 *
 * PSV (@photo-sphere-viewer/cubemap-adapter, tipo `Cubemap`):
 *   front · right · back · left · top · bottom
 *
 * `front/right/back/left` coinciden textualmente. Sólo difieren dos:
 * `up` (pipeline) ↔ `top` (PSV) y `down` (pipeline) ↔ `bottom` (PSV).
 * Se traduce explícitamente con FACE_TO_PSV/PSV_TO_FACE en vez de asumir
 * que ambos vocabularios están sincronizados: si PSV renombra su tipo
 * `Cubemap` en una versión futura, esto rompe acá con un error de tipos
 * en vez de servir un tile equivocado en silencio.
 *
 * ---------------------------------------------------------------------------
 * NIVELES Y nbTiles
 * ---------------------------------------------------------------------------
 * `tiles.json` trae `faceSize` (resolución del nivel más alto) y `levels`
 * (cantidad de niveles). El tamaño de cada nivel se obtiene reduciendo a la
 * mitad desde `faceSize`, exactamente como hace
 * `build_face_pyramid_jobs` en tiles.py (`computeLevelSizes` de abajo es la
 * misma cuenta, en JS). `CubemapTilesAdapter` exige que `nbTiles` sea
 * potencia de 2 y ≤ 16: eso vale mientras `faceSize` sea múltiplo de
 * `tileSize` en potencias de 2, que es el caso normal del pipeline (probado
 * con `pano-make-test` + `pano-run`, ver README de verificación).
 *
 * El adaptador ordena `panorama.levels` por `faceSize` ascendente y usa esa
 * posición como índice `level` al llamar a `tileUrl`. Como ya construimos
 * `levels` en orden ascendente (nivel 0 = más chico, igual que las carpetas
 * `{cara}/0/`, `{cara}/1/`, ... del pipeline), el índice que llega a
 * `tileUrl` coincide 1:1 con el nombre de carpeta de nivel en disco.
 */
import type { TiledSource } from '@r360/core';

export type PsvCubeFace = 'left' | 'front' | 'right' | 'back' | 'top' | 'bottom';

const FACE_TO_PSV: Record<string, PsvCubeFace> = {
  front: 'front',
  right: 'right',
  back: 'back',
  left: 'left',
  up: 'top',
  down: 'bottom',
};

const PSV_TO_FACE: Record<PsvCubeFace, string> = {
  front: 'front',
  right: 'right',
  back: 'back',
  left: 'left',
  top: 'up',
  bottom: 'down',
};

// Se exporta por si algún llamador necesita ir en la otra dirección
// (p.ej. debug/tests) sin duplicar la tabla.
export { FACE_TO_PSV };

/**
 * Replica el cálculo de tamaños por nivel de
 * packages/pipeline/pano_pipeline/tiles.py::build_face_pyramid_jobs:
 * arranca en `faceSize` y va a la mitad (entera, con piso en 1) `levels`
 * veces, después invierte para que el índice 0 sea el nivel más chico.
 */
export function computeLevelSizes(faceSize: number, levels: number): number[] {
  const sizes: number[] = [];
  let size = faceSize;
  for (let i = 0; i < levels; i++) {
    sizes.push(size);
    size = Math.max(1, Math.floor(size / 2));
  }
  return sizes.reverse();
}

export interface CubemapLevelSpec {
  faceSize: number;
  nbTiles: number;
}

export interface CubemapTilesPanoramaConfig {
  faceSize: number;
  levels: CubemapLevelSpec[];
  tileUrl: (face: PsvCubeFace, col: number, row: number, level: number) => string | null;
}

/**
 * Construye la config de `CubemapTilesAdapter` a partir de un `TiledSource`.
 *
 * @param source     `Scene.source` cuando `'base' in source` (ver `isTiled`
 *                    en scenes.ts).
 * @param resolveUrl  Resuelve una ruta relativa al `base` de la escena en una
 *                    URL absoluta/servible (p.ej. contra la URL de `tour.json`).
 *                    Se inyecta en vez de asumir `location.href` para que el
 *                    módulo sea testeable sin DOM.
 */
export function tiledSourceToPsvPanorama(
  source: TiledSource,
  resolveUrl: (path: string) => string,
): CubemapTilesPanoramaConfig {
  const base = source.base.replace(/\/$/, '');
  const ext = source.format === 'webp' ? 'webp' : 'jpg';
  const sizes = computeLevelSizes(source.faceSize, source.levels);
  const levels: CubemapLevelSpec[] = sizes.map((faceSize) => ({
    faceSize,
    nbTiles: Math.max(1, Math.ceil(faceSize / source.tileSize)),
  }));

  return {
    faceSize: source.faceSize,
    levels,
    tileUrl: (psvFace, col, row, level) => {
      const face = PSV_TO_FACE[psvFace];
      if (!face) return null;
      return resolveUrl(`${base}/${face}/${level}/${row}_${col}.${ext}`);
    },
  };
}
