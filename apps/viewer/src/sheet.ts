/**
 * Hoja inferior arrastrable, de una o varias alturas ("snap points").
 *
 * Generaliza lo que el plan pide en dos lugares distintos: la ficha de
 * unidad (tres alturas: asomada/media/completa) y la galería/lista de
 * unidades (una sola altura, pero con el mismo gesto de cerrar arrastrando
 * hacia abajo). Un solo mecanismo, tres usos.
 *
 * No decide CUÁNDO abrirse ni qué mostrar — eso es de quien la monta
 * (`ui.ts`). Sólo sabe de arrastre, alturas y el gesto de cierre.
 *
 * En escritorio (`.r360-panel` sin la clase `.r360-sheet`, o mismo elemento
 * pero fuera del breakpoint móvil) el arrastre se desactiva solo: no hay
 * pulgar que alcance un asa en una columna lateral de escritorio.
 */

export interface SnapPoint {
  /** Nombre corto para el atributo `data-height` (lo usa el CSS). */
  name: string;
  /** Fracción de `innerHeight`, ascendente. */
  ratio: number;
}

export interface SheetOptions {
  el: HTMLElement;
  handle: HTMLElement;
  /** Alturas posibles, de más chica a más grande. Al menos una. */
  snaps: readonly SnapPoint[];
  /** Se llama cuando el visitante arrastra por debajo de la más chica. */
  onClose: () => void;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export class Sheet {
  private index = 0;
  private dragging = false;
  private startY = 0;
  private startPx = 0;
  private readonly mobileQuery = window.matchMedia('(max-width: 640px)');

  constructor(private readonly opts: SheetOptions) {
    this.opts.handle.addEventListener('pointerdown', this.onPointerDown);
  }

  get heightName(): string {
    return this.opts.snaps[this.index]?.name ?? this.opts.snaps[0]!.name;
  }

  get isOpen(): boolean {
    return !this.opts.el.hidden;
  }

  /** Abre en el snap `index` (0 = el más chico, el "peek"). */
  open(index = 0): void {
    this.index = clamp(index, 0, this.opts.snaps.length - 1);
    this.opts.el.hidden = false;
    this.opts.el.style.height = '';
    this.opts.el.dataset.height = this.heightName;
  }

  /** Cambia de altura sin cerrar (p. ej. "Ver planta grande" pasa a `full`). */
  setHeight(index: number): void {
    if (this.opts.el.hidden) return;
    this.index = clamp(index, 0, this.opts.snaps.length - 1);
    this.opts.el.style.height = '';
    this.opts.el.dataset.height = this.heightName;
  }

  close(): void {
    this.opts.el.dataset.height = 'closed';
    this.opts.el.style.height = '';
    const el = this.opts.el;
    if (prefersReducedMotion()) {
      el.hidden = true;
      return;
    }
    // La transición de `height` la maneja el CSS (`data-height="closed"` =
    // 0). `hidden` recién se aplica al terminar, si no el contenido
    // desaparece de un salto antes de que la animación se vea.
    window.setTimeout(() => { el.hidden = true; }, 240);
  }

  destroy(): void {
    this.opts.handle.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.mobileQuery.matches) return; // el arrastre es un gesto móvil
    this.dragging = true;
    this.startY = e.clientY;
    this.startPx = this.opts.el.getBoundingClientRect().height;
    this.opts.el.classList.add('r360-sheet--dragging');
    try { this.opts.handle.setPointerCapture(e.pointerId); } catch { /* no-op */ }
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    const dy = e.clientY - this.startY;
    const px = clamp(this.startPx - dy, 0, window.innerHeight);
    this.opts.el.style.height = `${px}px`;
  };

  private onPointerUp = (): void => {
    if (!this.dragging) return;
    this.dragging = false;
    this.opts.el.classList.remove('r360-sheet--dragging');
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);

    const ratio = this.opts.el.getBoundingClientRect().height / window.innerHeight;
    this.opts.el.style.height = '';
    const first = this.opts.snaps[0]!.ratio;
    if (ratio < first * 0.55) {
      this.close();
      this.opts.onClose();
      return;
    }
    let bestI = 0;
    let bestD = Infinity;
    this.opts.snaps.forEach((s, i) => {
      const d = Math.abs(s.ratio - ratio);
      if (d < bestD) { bestD = d; bestI = i; }
    });
    this.index = bestI;
    this.opts.el.dataset.height = this.heightName;
  };
}
