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

/**
 * Encuadre inicial de un lienzo (ya girado o no) en coordenadas de Leaflet
 * `CRS.Simple` (idea 4 de la auditoría de experiencia).
 *
 * `fitBounds` sobre el lienzo entero encaja AMBOS lados (ancho y alto): con
 * un lienzo girado de Baleia (1960×7945, casi 1:4) eso fuerza un zoom tan
 * chico para que entre el alto completo que el ancho queda en ~120px sobre
 * un teléfono de 375 — se ve la franja pero no se lee nada (medido).
 *
 * Encuadrar al ANCHO en cambio deja el lienzo a su ancho real de pantalla y
 * el resto se recorre con el pulgar hacia abajo — el mismo sentido en que
 * baja el terreno (B1 arriba, amenities abajo, ver `toLatLng`). Por eso el
 * `centerLat` no es el centro del lienzo: se ancla arriba, así el primer
 * cuadro que ve el visitante es el tope del plano, no el medio.
 *
 * En `L.CRS.Simple` una unidad del lienzo mide `2^zoom` píxeles de pantalla
 * (ver `L.CRS.Simple.scale`), así que alcanza con la aritmética de acá —
 * sin Leaflet ni DOM — para fijar zoom y centro.
 */
export interface PlanView {
  /** Zoom de Leaflet (fraccionario) al que el ancho del lienzo llena `boxW`. */
  zoom: number;
  /** Latitud del centro inicial: el borde superior de la vista cae en `canvasH` (el tope del lienzo). */
  centerLat: number;
  /** Longitud del centro inicial: el medio del ancho. */
  centerLng: number;
}

/**
 * Devuelve `null` si alguna medida es inválida (mismo criterio que
 * `shouldRotate`): el llamador conserva entonces el `fitBounds` de siempre.
 */
export function fitWidthView(canvasW: number, canvasH: number, boxW: number, boxH: number): PlanView | null {
  if (canvasW <= 0 || canvasH <= 0 || boxW <= 0 || boxH <= 0) return null;
  const scale = boxW / canvasW;
  const zoom = Math.log2(scale);
  const viewportH = boxH / scale;
  const centerLat = canvasH - viewportH / 2;
  return { zoom, centerLat, centerLng: canvasW / 2 };
}

/**
 * ¿Es este elemento "chrome" fijo del borde inferior (leyenda, barra de
 * pestañas), o un contenedor de pantalla completa que también resulta
 * `fixed`/`absolute` y también toca el borde inferior (`.r360-plan`,
 * `.r360-ui`, `.r360-units-mount`: los tres a los 812px enteros del
 * viewport)? Un contenedor no es una barra: ocupa casi toda la pantalla. El
 * chrome real que este cálculo busca (leyenda de estados, pestañas) es
 * angosto. El umbral de la mitad del viewport separa ambos casos con margen
 * de sobra para cualquier tamaño real de esas barras.
 */
export function isBottomChromeRect(rect: { top: number; bottom: number; height: number }, viewportH: number): boolean {
  if (rect.height >= viewportH * 0.5) return false;
  return rect.bottom >= viewportH - 2;
}

/** Alto del chrome inferior a partir de los rects candidatos ya filtrados por posición/visibilidad. */
export function legendOffsetFrom(rects: readonly { top: number; bottom: number; height: number }[], viewportH: number): number {
  let topMost = viewportH;
  for (const r of rects) {
    if (!isBottomChromeRect(r, viewportH)) continue;
    if (r.top < topMost) topMost = r.top;
  }
  return Math.max(0, viewportH - topMost);
}
