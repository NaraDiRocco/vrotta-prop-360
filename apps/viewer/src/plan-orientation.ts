/**
 * Orientación del plano en pantalla.
 *
 * Un masterplan de loteo es apaisado (Baleia: 7945×1960, casi 4:1) y un
 * teléfono es vertical. Encuadrándolo entero manda el ancho, así que el plano
 * queda en una franja de ~93px de alto sobre 812 disponibles: usa el 11% de
 * la pantalla y no se lee nada. Girado 90° manda el alto y ocupa los 812px
 * completos — 4,7x más superficie útil, medido.
 *
 * Está separado del renderer para poder probarlo sin Leaflet ni navegador:
 * es aritmética, y la aritmética se verifica con tests, no mirando.
 */
import type { Px } from '@r360/core';

/** Relación mínima del plano para que girar valga la pena. */
export const MIN_PLAN_ASPECT = 1.8;
/** Cuán vertical tiene que ser la pantalla para justificar el giro. */
export const MIN_SCREEN_ASPECT = 1.2;

/**
 * Sólo se gira cuando el desencuentro es grande: un plano casi cuadrado no
 * gana nada, y girar por poco margen desorienta más de lo que suma.
 */
export function shouldRotate(imgW: number, imgH: number, boxW: number, boxH: number): boolean {
  if (imgW <= 0 || imgH <= 0 || boxW <= 0 || boxH <= 0) return false;
  return imgW / imgH >= MIN_PLAN_ASPECT && boxH / boxW >= MIN_SCREEN_ASPECT;
}

/** Lados del lienzo una vez aplicada (o no) la rotación. */
export function canvasSize(imgW: number, imgH: number, rotated: boolean): { w: number; h: number } {
  return rotated ? { w: imgH, h: imgW } : { w: imgW, h: imgH };
}

/**
 * Punto normalizado (0..1) → coordenadas de Leaflet con `CRS.Simple`, donde
 * la latitud es el alto y crece hacia arriba.
 *
 * Girado 90° en sentido horario, el punto (px, py) pasa a (1 - py, px) y el
 * lienzo intercambia sus lados. Verificado con las cuatro esquinas en los
 * tests: arriba-izquierda va a arriba-derecha, y así.
 */
export function toLatLng(p: Px, imgW: number, imgH: number, rotated: boolean): [number, number] {
  const [px, py] = p;
  return rotated ? [(1 - px) * imgW, (1 - py) * imgH] : [(1 - py) * imgH, px * imgW];
}

/** Superficie que ocupa el plano encuadrado entero, para comparar variantes. */
export function fittedArea(imgW: number, imgH: number, boxW: number, boxH: number): number {
  const scale = Math.min(boxW / imgW, boxH / imgH);
  return imgW * scale * (imgH * scale);
}
