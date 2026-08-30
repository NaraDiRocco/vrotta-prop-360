/**
 * De qué imagen dibuja el editor.
 *
 * El `source` de una escena es un `Record<string, unknown>` porque cambia según
 * el tipo: una panorámica publicada trae un cubemap teselado (`base`,
 * `faceSize`, `tileSize`, `levels`), y un plano trae `url`/`width`/`height`.
 * El editor necesita SIEMPRE algo que se pueda montar, así que acá se resuelve
 * en un solo lugar en vez de repartir `if` por los canvas.
 *
 * En modo mock las escenas del seed apuntan a rutas de un bucket que no existe:
 * se cae a las imágenes de demostración de `public/editor-demo/` para que el
 * editor se pueda usar y verificar de punta a punta sin backend.
 */
import type { SceneKind } from '@r360/core';
import type { SceneRow } from '../data/types.ts';
import { spaceOf, type GeomSpace } from './records.ts';

export interface SceneImage {
  kind: SceneKind;
  space: GeomSpace;
  /** Equirectangular para panorámica; imagen del plano para floorplan/map. */
  url: string;
  width: number;
  height: number;
  /** true si se está usando la imagen de demostración y no la real. */
  isFallback: boolean;
}

const DEMO_PANO = { url: '/editor-demo/pano.png', width: 2048, height: 1024 };
const DEMO_PLAN = { url: '/editor-demo/baleia-masterplan.jpg', width: 3000, height: 740 };

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

export function resolveSceneImage(scene: SceneRow): SceneImage {
  const space = spaceOf(scene.kind);
  const src = scene.source ?? {};

  const url = str(src['url']) ?? str(src['panorama']) ?? str(src['image']);
  // `/mock/...` son rutas de relleno del seed: el archivo no existe y montarlas
  // daría una imagen rota en vez de un editor usable.
  if (url && !url.startsWith('/mock/')) {
    const width = num(src['width']) ?? (space === 'sph' ? DEMO_PANO.width : DEMO_PLAN.width);
    const height = num(src['height']) ?? (space === 'sph' ? DEMO_PANO.height : DEMO_PLAN.height);
    return { kind: scene.kind, space, url, width, height, isFallback: false };
  }

  const demo = space === 'sph' ? DEMO_PANO : DEMO_PLAN;
  return { kind: scene.kind, space, ...demo, isFallback: true };
}

/**
 * ¿Se puede editar esta escena? El `video` no tiene geometría que dibujar y
 * conviene decirlo en la pantalla, no fallar montando un canvas vacío.
 */
export function isEditableScene(kind: SceneKind): boolean {
  return kind === 'panorama' || kind === 'floorplan' || kind === 'map';
}
