/**
 * Pinch-zoom + arrastre sobre una imagen suelta, sin Leaflet.
 *
 * Vivía duplicado en `ui.ts` (la planta de la unidad en el lightbox) y en
 * `tour-rail.ts` (la foto a pantalla completa del recorrido). Las dos copias
 * hacían exactamente lo mismo y no se podían unificar mientras la clase
 * estuviera adentro de `ui.ts`: ese archivo no la exportaba y además importa
 * `tour-rail.ts`, así que importarla desde ahí habría cerrado un ciclo de
 * módulos. Sacarla a su propio archivo rompe el ciclo — este módulo no
 * importa a nadie — y deja una sola implementación para las dos capas.
 *
 * No necesita geometría: una planta o una foto son una imagen suelta, alcanza
 * con poder agrandarla y recorrerla con el dedo (plan §4).
 */

export interface Punto {
  x: number;
  y: number;
}

const distancia = (a: Punto, b: Punto): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Nunca más chico que el tamaño natural ni más grande que 4×: pasado eso se ve el pixel. */
export const ESCALA_MIN = 1;
export const ESCALA_MAX = 4;

/** Debajo de este acercamiento se considera "sin acercar" (el dedo nunca deja un 1,000 exacto). */
export const ESCALA_EPSILON = 1.02;

export function limitarEscala(s: number): number {
  return Math.max(ESCALA_MIN, Math.min(ESCALA_MAX, s));
}

export class PinchZoom {
  private escala = 1;
  private x = 0;
  private y = 0;
  private readonly punteros = new Map<number, Punto>();
  private ultimaDist = 0;
  private arrastre: { x: number; y: number; ox: number; oy: number } | null = null;

  constructor(
    private readonly stage: HTMLElement,
    private readonly img: HTMLElement,
  ) {
    stage.addEventListener('pointerdown', this.onDown);
    stage.addEventListener('pointermove', this.onMove);
    stage.addEventListener('pointerup', this.onUp);
    stage.addEventListener('pointercancel', this.onUp);
    stage.addEventListener('dblclick', this.onDblClick);
  }

  /** Sin acercar: recién ahí el gesto horizontal significa "la foto siguiente". */
  get sinAcercar(): boolean {
    return this.escala <= ESCALA_EPSILON;
  }

  reset(): void {
    this.escala = 1;
    this.x = 0;
    this.y = 0;
    this.apply();
  }

  destroy(): void {
    this.stage.removeEventListener('pointerdown', this.onDown);
    this.stage.removeEventListener('pointermove', this.onMove);
    this.stage.removeEventListener('pointerup', this.onUp);
    this.stage.removeEventListener('pointercancel', this.onUp);
    this.stage.removeEventListener('dblclick', this.onDblClick);
  }

  private apply(): void {
    this.img.style.transform = `translate(${this.x}px, ${this.y}px) scale(${this.escala})`;
  }

  private onDown = (e: PointerEvent): void => {
    try {
      this.stage.setPointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
    this.punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.punteros.size === 1) {
      this.arrastre = { x: e.clientX, y: e.clientY, ox: this.x, oy: this.y };
    } else if (this.punteros.size === 2) {
      this.arrastre = null;
      const [a, b] = [...this.punteros.values()];
      this.ultimaDist = distancia(a!, b!);
    }
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.punteros.has(e.pointerId)) return;
    this.punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.punteros.size === 2) {
      const [a, b] = [...this.punteros.values()];
      const d = distancia(a!, b!);
      if (this.ultimaDist > 0) this.escala = limitarEscala(this.escala * (d / this.ultimaDist));
      this.ultimaDist = d;
      this.apply();
    } else if (this.punteros.size === 1 && this.arrastre && this.escala > 1) {
      this.x = this.arrastre.ox + (e.clientX - this.arrastre.x);
      this.y = this.arrastre.oy + (e.clientY - this.arrastre.y);
      this.apply();
    }
  };

  private onUp = (e: PointerEvent): void => {
    this.punteros.delete(e.pointerId);
    if (this.punteros.size < 2) this.ultimaDist = 0;
    if (this.punteros.size === 1) {
      const [p] = [...this.punteros.values()];
      this.arrastre = { x: p!.x, y: p!.y, ox: this.x, oy: this.y };
    }
    if (this.punteros.size === 0) {
      this.arrastre = null;
      if (this.escala < ESCALA_EPSILON) this.reset();
    }
  };

  private onDblClick = (): void => {
    this.escala = this.escala > 1 ? 1 : 2.5;
    this.x = 0;
    this.y = 0;
    this.apply();
  };
}
