/**
 * Deslizador antes/después — foto real vs. recreación con mobiliario
 * generada por IA sobre esa misma foto (plan `docs/06-BENCHMARK/
 * 5-EXPERIENCIA-BALEIA.md` §3.1).
 *
 * Pieza autónoma: no importa nada de `ui.ts`/`nav.ts`/`main.ts`/
 * `floorplan.ts` ni sabe que existen. Quien la monte le pasa un contenedor
 * y las dos imágenes; el componente hace todo lo demás y no asume layout
 * de página, Leaflet, PSV ni el resto del visor. Su único supuesto externo
 * es `document.body` para la pantalla completa (ver `openFullscreen`).
 *
 * Como en `plan-orientation.ts`, la aritmética del gesto está separada del
 * DOM para poder probarla con `node --test` sin navegador: todo lo que
 * decide "¿esto es arrastre horizontal o scroll vertical?", "¿fue un toque
 * o un arrastre?", "¿dónde queda el divisor?" son funciones puras en la
 * primera mitad del archivo. La segunda mitad es la capa fina de DOM que
 * las conecta a eventos de puntero/teclado reales.
 *
 * ## La regla de honestidad (parte del contrato del componente)
 *
 * La imagen de IA **no existe fuera de este slider** (spec §3.1 y §5.1):
 * no es miniatura, no es portada, no se comparte sola. La API está armada
 * para que violar eso sea difícil por accidente:
 *
 *  - `BeforeAfterHandle` no tiene ningún getter que devuelva la URL de la
 *    imagen de IA. La única URL que expone es `previewImageSrc`, y esa
 *    siempre es la foto real — es la que hay que usar si se comparte el
 *    tramo (spec: "si se comparte el tramo, la imagen de vista previa es
 *    la foto real").
 *  - Los rótulos ("Hoy · foto real" / "Recreación IA sobre la foto") son
 *    fijos, no parámetros: quien integra el componente no puede rotularlos
 *    mal ni quitarlos.
 *  - Si en algún momento hace falta la URL de la imagen de IA para algo
 *    que no sea este slider (portada, compartir, galería), la respuesta es
 *    "no", no un método nuevo. No le agregues un getter "por conveniencia".
 *
 * ## La semántica de `pct` (única, para todo el archivo)
 *
 * `pct` es SIEMPRE la posición del divisor medida desde la izquierda, y la
 * imagen de IA vive a la DERECHA del divisor (así quedan los rótulos: "Hoy ·
 * foto real" a la izquierda, "Recreación IA" a la derecha, fijos, spec
 * §3.1). Consecuencia directa, la que se invirtió y motivó este arreglo:
 *
 *  - `pct = 0`   → el divisor está pegado a la izquierda → NADA de la caja
 *    queda a la izquierda del divisor → se ve la IA completa (la foto real
 *    queda 100% tapada debajo).
 *  - `pct = 50`  → mitad foto real (izquierda), mitad IA (derecha).
 *  - `pct = 100` → el divisor está pegado a la derecha → toda la caja queda
 *    a la izquierda del divisor → se ve la foto real completa (la IA queda
 *    recortada a nada por el `clip-path`, ver `beforeafter.css`).
 *
 * Esta es la ÚNICA fuente de verdad: `labelOpacity` (atenúa el rótulo del
 * lado que el `pct` actual deja tapado/recortado), `toggleTarget`, el valor
 * inicial del divisor y el barrido automático tienen que estar de acuerdo
 * con esta tabla. El estado inicial y de reposo seguro es `pct = 100`
 * (foto real completa): es lo que se ve si el barrido de bienvenida no
 * llega a correr por algún motivo (pestaña en segundo plano al cargar,
 * `IntersectionObserver` que no dispara, error temprano), y mostrar la foto
 * real por defecto es la lectura correcta de la regla de honestidad de
 * arriba — nunca la imagen inventada por defecto.
 */

// El import de la hoja de estilos es DINÁMICO y guardado con `typeof
// document`, no estático como en `floorplan.ts`/`ui.ts`. Motivo: este
// archivo lo importa también `beforeafter.test.ts` para probar la
// aritmética pura bajo `node --test` (sin Vite ni DOM), y Node no tiene
// loader para `.css` — un `import './beforeafter.css'` estático rompería
// TODOS los tests con sólo abrir el archivo, aunque el test nunca toque el
// DOM. Como `document` no existe en ese entorno, el `if` nunca entra ahí y
// el import dinámico ni se intenta resolver; en el navegador (con Vite)
// entra siempre y Vite lo resuelve como cualquier otro import de CSS.
if (typeof document !== 'undefined') {
  void import('./beforeafter.css');
}

// ---------------------------------------------------------------------------
// Parte 1 — aritmética pura del gesto y del divisor. Sin DOM, sin `window`
// salvo `Math`. Se prueba en `beforeafter.test.ts`.
// ---------------------------------------------------------------------------

/** Paso de teclado (spec: "teclas ← → mueven el divisor 5%"). */
export const ARROW_KEY_STEP = 5;

/** Umbral de movimiento, en px, antes de decidir si el gesto es horizontal o vertical. */
export const AXIS_DECIDE_PX = 6;

/** Ventana de doble toque: separación máxima en tiempo y distancia entre dos toques. */
export const DOUBLE_TAP_MAX_DELAY_MS = 300;
export const DOUBLE_TAP_MAX_DIST_PX = 32;

/**
 * `pct` de arranque y de reposo seguro: foto real completa (ver la tabla de
 * semántica en la cabecera del archivo). Exportada — no hardcodeada dos
 * veces en el constructor y en los tests — precisamente porque es el
 * número que hay que poder verificar: si alguna vez alguien la cambia sin
 * leer la cabecera, que lo note un test, no un visitante viendo la imagen
 * de IA como default.
 */
export const SAFE_DEFAULT_PCT = 100;

/** Divisor siempre entre 0 y 100. NaN (rect roto, medida inválida) cae al medio. */
export function clampPercent(pct: number): number {
  if (Number.isNaN(pct)) return 50;
  return Math.min(100, Math.max(0, pct));
}

/** `clientX` de un puntero → porcentaje sobre el ancho de la caja del slider. */
export function percentFromClientX(clientX: number, rect: { left: number; width: number }): number {
  if (rect.width <= 0) return 50;
  return clampPercent(((clientX - rect.left) / rect.width) * 100);
}

export type GestureAxis = 'horizontal' | 'vertical' | 'undecided';

/**
 * Decide si un gesto es el arrastre del divisor o el scroll de la página
 * (spec: "si el gesto arranca con más componente vertical que horizontal,
 * es scroll"). Por debajo de `thresholdPx` en ambos ejes no hay información
 * suficiente todavía — un temblor de 1px no es ni una cosa ni la otra, y
 * decidir ahí "vertical" por default frenaría arrastres horizontales lentos
 * apenas empiezan.
 *
 * En un empate exacto (mismo desplazamiento en los dos ejes) gana el scroll:
 * la regla pide "MÁS horizontal que vertical" para robar el gesto, así que
 * la duda se resuelve a favor de no romper el scroll de nadie.
 */
export function axisFromDelta(dx: number, dy: number, thresholdPx: number = AXIS_DECIDE_PX): GestureAxis {
  if (Math.abs(dx) < thresholdPx && Math.abs(dy) < thresholdPx) return 'undecided';
  return Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
}

/**
 * Toque simple (sin arrastre): a qué porcentaje saltar (spec: "alterna
 * entre 0% y 100%"). Se decide por dónde está el divisor ahora, no por un
 * flag de estado aparte: con la semántica de `pct` de la cabecera del
 * archivo (0 = IA completa, 100 = foto real completa), si ya se ve más IA
 * que foto (`pct < 50`) vuelve a la foto real completa (100), y viceversa.
 * Justo en el medio (donde deja al visitante el barrido automático, que
 * ahora arranca en 100 y baja hasta acá) el primer toque manda a 0, o sea
 * muestra la IA completa — es lo nuevo que todavía no vio. Esta función no
 * se tocó al corregir la inversión de `labelOpacity`: ya estaba de acuerdo
 * con la tabla de la cabecera, se verificó a mano contra los tres casos
 * (0, 50, 100).
 */
export function toggleTarget(currentPct: number): number {
  return currentPct < 50 ? 100 : 0;
}

export interface TapPoint {
  x: number;
  y: number;
}

/** ¿El toque en `currPt`/`currTimeMs` es el segundo de un doble toque respecto de `prevPt`/`prevTimeMs`? */
export function isDoubleTap(
  prevTimeMs: number,
  currTimeMs: number,
  prevPt: TapPoint,
  currPt: TapPoint,
  maxDelayMs: number = DOUBLE_TAP_MAX_DELAY_MS,
  maxDistPx: number = DOUBLE_TAP_MAX_DIST_PX,
): boolean {
  const dt = currTimeMs - prevTimeMs;
  if (dt < 0 || dt > maxDelayMs) return false;
  const dist = Math.hypot(currPt.x - prevPt.x, currPt.y - prevPt.y);
  return dist <= maxDistPx;
}

/** ArrowLeft/ArrowRight → delta de divisor; cualquier otra tecla no le incumbe al slider. */
export function arrowKeyDelta(key: string): number | null {
  if (key === 'ArrowLeft') return -ARROW_KEY_STEP;
  if (key === 'ArrowRight') return ARROW_KEY_STEP;
  return null;
}

export type ImageSide = 'real' | 'ia';

const LABEL_ATTENUATED = 0.35;
/** A partir de qué % de cobertura de UN lado se atenúa el rótulo del OTRO. */
const LABEL_ATTENUATE_AT = 85;

/**
 * Opacidad del rótulo fijo de cada lado (spec: "el rótulo del lado que
 * queda tapado se atenúa"). No sigue el divisor px a px — a mitad de
 * camino los dos rótulos siguen siendo ciertos, porque las dos imágenes
 * conviven en pantalla — sólo se atenúa el rótulo de un lado cuando ese
 * lado quedó prácticamente tapado del todo por el otro (85%+), que es
 * cuando el rótulo deja de describir lo que se ve debajo.
 *
 * Ojo con la dirección (acá es donde se invirtió antes): con la semántica
 * de `pct` de la cabecera del archivo, la foto real queda tapada cuando
 * `pct` es BAJO (la IA cubre todo, ver tabla), y la IA queda tapada/
 * recortada a nada cuando `pct` es ALTO. Es lo contrario de "atenuar el
 * rótulo del lado cuyo número de `pct` es alto", que es el error que se
 * coló la primera vez.
 */
export function labelOpacity(pct: number, side: ImageSide): number {
  const p = clampPercent(pct);
  if (side === 'real') return p <= 100 - LABEL_ATTENUATE_AT ? LABEL_ATTENUATED : 1;
  return p >= LABEL_ATTENUATE_AT ? LABEL_ATTENUATED : 1;
}

/** Curva del barrido automático y de las animaciones de toque: entra y sale suave, sin golpe. */
export function easeInOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/**
 * Valor interpolado de una animación de `from` a `to` en `durationMs`, al
 * cabo de `elapsedMs`. Con duración 0 (o negativa) salta directo al final:
 * así el mismo camino de código sirve para "animado" y para "instantáneo"
 * (`prefers-reduced-motion`) sin un `if` aparte en quien llama.
 */
export function valueAt(
  elapsedMs: number,
  durationMs: number,
  from: number,
  to: number,
  easing: (t: number) => number = easeInOutCubic,
): number {
  if (durationMs <= 0) return to;
  const t = Math.min(1, Math.max(0, elapsedMs / durationMs));
  return from + (to - from) * easing(t);
}

/** Punto en pantalla, para las cuentas del pinch-zoom de la pantalla completa. */
export interface Point2 {
  x: number;
  y: number;
}

/** Distancia entre dos dedos (para el pinch). */
export function distanceBetween(a: Point2, b: Point2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Límites del zoom en pantalla completa: no menos de 1x (tamaño normal) ni más de 4x. */
export function clampScale(scale: number, min = 1, max = 4): number {
  return Math.min(max, Math.max(min, scale));
}

// ---------------------------------------------------------------------------
// Parte 2 — capa de DOM. Traduce eventos reales a las funciones de arriba.
// ---------------------------------------------------------------------------

/** Rótulos fijos — a propósito NO son parámetros, ver la regla de honestidad arriba. */
const LABEL_REAL = 'Hoy · foto real';
const LABEL_IA = 'Recreación IA sobre la foto';

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export interface BeforeAfterImageSpec {
  src: string;
  /** Texto alternativo para lectores de pantalla — describe la foto, no repite el rótulo fijo. */
  alt: string;
}

export interface BeforeAfterOptions {
  /** Contenedor donde se monta el slider. El componente crea su propio DOM adentro. */
  container: HTMLElement;
  /**
   * Foto real, el "antes". Es la única de las dos imágenes que puede
   * usarse fuera de este componente (miniatura, portada, compartir) — por
   * eso `BeforeAfterHandle.previewImageSrc` siempre devuelve esta URL.
   */
  real: BeforeAfterImageSpec;
  /**
   * Recreación con IA, el "después". Ver la regla de honestidad en la
   * cabecera del archivo: esta URL no sale del componente por ningún otro
   * camino que no sea pintarla adentro del slider.
   */
  ia: BeforeAfterImageSpec;
  /**
   * Relación de aspecto real del par de fotos (no la de la caja en
   * pantalla — eso lo decide el componente, ver §3.1: el par 2:3 entra
   * entero en el teléfono, el 4:3 se recorta al centro y ofrece "Ver
   * completo").
   */
  aspect: '2:3' | '4:3';
}

export interface BeforeAfterHandle {
  /** Nodo raíz, ya insertado en `container`. */
  readonly el: HTMLElement;
  /**
   * URL a usar como miniatura, portada o vista previa de "compartir" de
   * este tramo. Siempre la foto real — nunca la de IA. Es la única forma
   * que da esta API de sacar una URL de imagen hacia afuera, a propósito.
   */
  readonly previewImageSrc: string;
  /** Posición actual del divisor, 0-100. */
  readonly dividerPercent: number;
  /**
   * Mueve el divisor de forma instantánea (sin la animación de 400ms del
   * toque). Para restaurar un estado guardado, no para repetir el barrido
   * de bienvenida — ese es automático y de una sola vez por diseño.
   */
  setDividerPercent(pct: number): void;
  /** Abre la pantalla completa con pinch-zoom (spec: botón "Ver completo"). */
  openFullscreen(): void;
  /** Saca todos los listeners y borra el DOM montado (incluida la pantalla completa, si estaba abierta). */
  destroy(): void;
}

/**
 * Controla el arrastre/toque/teclado de UN divisor sobre una caja dada.
 * Se usa dos veces: una para el slider inline, otra para el de pantalla
 * completa (que además tiene pinch-zoom encima, en `FullscreenPinch`).
 *
 * `isPrimary` (Pointer Events) filtra el dedo "principal": en pantalla
 * completa, si un segundo dedo se suma para pellizcar, no queremos que
 * también mueva el divisor — el pellizco lo toma `FullscreenPinch` aparte.
 * Es una simplificación consciente: mover el divisor CON dos dedos a la
 * vez durante un pellizco no está contemplado, y no lo pide la spec.
 */
class DividerController {
  // Nota: los campos de esta clase se declaran a mano (no como parámetros
  // `private readonly x` del constructor) porque `beforeafter.test.ts` la
  // importa a través de `beforeafter.ts` bajo `node --test
  // --experimental-strip-types`, que sólo BORRA anotaciones de tipo — no
  // transforma código. Los parámetros con modificador de acceso son una
  // transformación de TypeScript (generan el `this.x = x`), no una simple
  // anotación, así que ese loader los rechaza. Mismo motivo en
  // `FullscreenPinch` y `BeforeAfterSlider` más abajo.
  private readonly box: HTMLElement; // define el 0%..100% (getBoundingClientRect)
  private readonly surface: HTMLElement; // capta el gesto: puede ser todo el slider
  private readonly handle: HTMLElement; // foco de teclado + rol de slider
  private readonly onChange: (pct: number) => void;
  private pct: number;
  private gesture: { pointerId: number; startX: number; startY: number; axis: GestureAxis; moved: boolean } | null =
    null;
  private lastTap: { time: number; x: number; y: number } | null = null;
  private tapTimer: ReturnType<typeof setTimeout> | null = null;
  private raf: number | null = null;

  constructor(box: HTMLElement, surface: HTMLElement, handle: HTMLElement, onChange: (pct: number) => void, initialPct: number) {
    this.box = box;
    this.surface = surface;
    this.handle = handle;
    this.onChange = onChange;
    this.pct = clampPercent(initialPct);
    this.surface.addEventListener('pointerdown', this.onPointerDown);
    this.handle.addEventListener('keydown', this.onKeyDown);
  }

  get value(): number {
    return this.pct;
  }

  /** Mueve el divisor ya, sin animar ni interrumpir gestos ajenos a este controlador. */
  set(pct: number): void {
    this.pct = clampPercent(pct);
    this.onChange(this.pct);
  }

  /** Anima de la posición actual a `target` en `durationMs` (0 = instantáneo). Respeta reduced-motion. */
  animateTo(target: number, durationMs: number): void {
    this.stopAnimation();
    const to = clampPercent(target);
    if (durationMs <= 0 || prefersReducedMotion()) {
      this.set(to);
      return;
    }
    const from = this.pct;
    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      this.set(valueAt(elapsed, durationMs, from, to));
      this.raf = elapsed < durationMs ? requestAnimationFrame(step) : null;
    };
    this.raf = requestAnimationFrame(step);
  }

  stopAnimation(): void {
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
  }

  destroy(): void {
    this.stopAnimation();
    if (this.tapTimer !== null) clearTimeout(this.tapTimer);
    this.surface.removeEventListener('pointerdown', this.onPointerDown);
    this.handle.removeEventListener('keydown', this.onKeyDown);
    this.releaseGesture();
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!e.isPrimary) return; // el pellizco de pantalla completa usa el segundo dedo, no éste
    if ((e.target as HTMLElement | null)?.closest('button')) return; // no robarle el toque a "Ver completo"
    this.stopAnimation();
    this.gesture = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, axis: 'undecided', moved: false };
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
  };

  private onPointerMove = (e: PointerEvent): void => {
    const g = this.gesture;
    if (!g || e.pointerId !== g.pointerId) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (g.axis === 'undecided') {
      const axis = axisFromDelta(dx, dy);
      if (axis === 'undecided') return;
      if (axis === 'vertical') {
        // Es scroll de la página: soltamos el gesto sin tocar más nada
        // (no hacemos preventDefault en ningún momento, así el scroll
        // nativo sigue el gesto que ya empezó).
        this.releaseGesture();
        return;
      }
      g.axis = 'horizontal';
    }
    g.moved = true;
    e.preventDefault();
    this.set(percentFromClientX(e.clientX, this.box.getBoundingClientRect()));
  };

  private onPointerUp = (e: PointerEvent): void => {
    const g = this.gesture;
    if (!g || e.pointerId !== g.pointerId) return;
    const wasDrag = g.axis === 'horizontal' && g.moved;
    this.releaseGesture();
    if (!wasDrag) this.handleTap(e.clientX, e.clientY);
  };

  private releaseGesture(): void {
    this.gesture = null;
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
  }

  private handleTap(x: number, y: number): void {
    const now = performance.now();
    const last = this.lastTap;
    this.lastTap = { time: now, x, y };
    if (last && isDoubleTap(last.time, now, last, { x, y })) {
      // Doble toque: cancela el toque simple que estaba por dispararse
      // (ver el setTimeout de abajo) y vuelve derecho al medio.
      if (this.tapTimer !== null) {
        clearTimeout(this.tapTimer);
        this.tapTimer = null;
      }
      this.lastTap = null;
      this.animateTo(50, 250);
      return;
    }
    // Toque simple: se espera la ventana de doble toque antes de actuar.
    // Sin esta espera, un doble toque real se ve primero saltar a 0/100 y
    // enseguida volver a 50 — un parpadeo que no pidió nadie.
    this.tapTimer = setTimeout(() => {
      this.tapTimer = null;
      this.animateTo(toggleTarget(this.pct), 400);
    }, DOUBLE_TAP_MAX_DELAY_MS);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const delta = arrowKeyDelta(e.key);
    if (delta === null) return;
    e.preventDefault();
    this.stopAnimation();
    this.set(this.pct + delta);
  };
}

/**
 * Pinch-zoom de dos dedos sobre el "stage" que envuelve las DOS imágenes
 * (la real y la máscara de IA encima). Es la pieza que hace que el zoom
 * quede sincronizado entre las dos: no hay dos lógicas de zoom que
 * coordinar, hay UNA transformación CSS aplicada a un contenedor que las
 * tiene adentro a ambas. Si el zoom de cada imagen se manejara por
 * separado, mantenerlas alineadas cuadro a cuadro sería frágil; acá es
 * imposible que se desalineen porque comparten la misma matriz de
 * transformación.
 */
class FullscreenPinch {
  private readonly stage: HTMLElement;
  private scale = 1;
  private x = 0;
  private y = 0;
  private readonly pointers = new Map<number, Point2>();
  private lastDist = 0;
  private pan: { x: number; y: number; ox: number; oy: number } | null = null;

  constructor(stage: HTMLElement) {
    this.stage = stage;
    stage.addEventListener('pointerdown', this.onDown);
    stage.addEventListener('pointermove', this.onMove);
    stage.addEventListener('pointerup', this.onUp);
    stage.addEventListener('pointercancel', this.onUp);
    stage.addEventListener('dblclick', this.onDblClick);
  }

  destroy(): void {
    this.stage.removeEventListener('pointerdown', this.onDown);
    this.stage.removeEventListener('pointermove', this.onMove);
    this.stage.removeEventListener('pointerup', this.onUp);
    this.stage.removeEventListener('pointercancel', this.onUp);
    this.stage.removeEventListener('dblclick', this.onDblClick);
  }

  private apply(): void {
    this.stage.style.setProperty('--ba-scale', String(this.scale));
    this.stage.style.setProperty('--ba-tx', `${this.x}px`);
    this.stage.style.setProperty('--ba-ty', `${this.y}px`);
  }

  private onDown = (e: PointerEvent): void => {
    if (this.pointers.size >= 2 && !this.pointers.has(e.pointerId)) return;
    try {
      this.stage.setPointerCapture(e.pointerId);
    } catch {
      /* no-op: algunos entornos de test no implementan pointer capture */
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      this.pan = null;
      const [a, b] = [...this.pointers.values()];
      this.lastDist = distanceBetween(a!, b!);
    }
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = distanceBetween(a!, b!);
      if (this.lastDist > 0) this.scale = clampScale(this.scale * (d / this.lastDist));
      this.lastDist = d;
      this.apply();
    } else if (this.pointers.size === 1 && this.scale > 1) {
      const p = [...this.pointers.values()][0]!;
      if (!this.pan) this.pan = { x: p.x, y: p.y, ox: this.x, oy: this.y };
      this.x = this.pan.ox + (p.x - this.pan.x);
      this.y = this.pan.oy + (p.y - this.pan.y);
      this.apply();
    }
  };

  private onUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    this.pan = null;
    if (this.pointers.size < 2) this.lastDist = 0;
    if (this.pointers.size === 0 && this.scale < 1.02) {
      // Volvió casi al tamaño normal: encaja del todo, sin dejarlo "casi 1x".
      this.scale = 1;
      this.x = 0;
      this.y = 0;
      this.apply();
    }
  };

  private onDblClick = (): void => {
    this.scale = this.scale > 1 ? 1 : 2.5;
    this.x = 0;
    this.y = 0;
    this.apply();
  };
}

/** Arma la pareja de imágenes (real + máscara de IA) sobre un `stage` nuevo. Se usa inline y en pantalla completa. */
function buildComparisonStage(opts: BeforeAfterOptions): { stage: HTMLDivElement } {
  const stage = document.createElement('div');
  stage.className = 'r360-ba__stage';

  const realImg = document.createElement('img');
  realImg.className = 'r360-ba__img';
  realImg.src = opts.real.src;
  realImg.alt = opts.real.alt;
  realImg.draggable = false;

  const iaImg = document.createElement('img');
  iaImg.className = 'r360-ba__img r360-ba__after';
  iaImg.src = opts.ia.src;
  iaImg.alt = opts.ia.alt;
  iaImg.draggable = false;

  stage.append(realImg, iaImg);
  return { stage };
}

function buildHandle(): HTMLDivElement {
  const handle = document.createElement('div');
  handle.className = 'r360-ba__handle';
  handle.setAttribute('role', 'slider');
  handle.tabIndex = 0;
  handle.setAttribute('aria-label', 'Divisor de comparación antes y después');
  handle.setAttribute('aria-valuemin', '0');
  handle.setAttribute('aria-valuemax', '100');
  handle.setAttribute('aria-orientation', 'horizontal');
  const left = document.createElement('span');
  left.setAttribute('aria-hidden', 'true');
  left.textContent = '‹';
  const right = document.createElement('span');
  right.setAttribute('aria-hidden', 'true');
  right.textContent = '›';
  handle.append(left, right);
  return handle;
}

function buildLabels(): { real: HTMLSpanElement; ia: HTMLSpanElement } {
  const real = document.createElement('span');
  real.className = 'r360-ba__label r360-ba__label--before';
  real.textContent = LABEL_REAL;
  const ia = document.createElement('span');
  ia.className = 'r360-ba__label r360-ba__label--after';
  ia.textContent = LABEL_IA;
  return { real, ia };
}

/**
 * Deslizador antes/después. `new BeforeAfterSlider(opts)` monta el DOM
 * dentro de `opts.container` y devuelve el handle público (ver
 * `BeforeAfterHandle`) a través de sus propios miembros — la clase ES el
 * handle, no hace falta un objeto aparte.
 */
export class BeforeAfterSlider implements BeforeAfterHandle {
  readonly el: HTMLDivElement;
  private readonly opts: BeforeAfterOptions;
  private readonly divider: DividerController;
  private readonly labelReal: HTMLSpanElement;
  private readonly labelIa: HTMLSpanElement;
  private readonly handleEl: HTMLDivElement;
  private readonly fullscreenEl: HTMLDivElement;
  private readonly fullscreenStage: HTMLDivElement;
  private fullscreenDivider: DividerController | null = null;
  private fullscreenPinch: FullscreenPinch | null = null;
  private visibilityObserver: IntersectionObserver | null = null;
  private sweptOnce = false;

  constructor(opts: BeforeAfterOptions) {
    this.opts = opts;
    const el = document.createElement('div');
    el.className = 'r360-ba';
    el.setAttribute('role', 'group');
    el.setAttribute('aria-roledescription', 'comparador antes y después');
    el.setAttribute('aria-label', `${LABEL_REAL} / ${LABEL_IA}`);
    // El par 2:3 entra entero (misma relación de la foto); el 4:3 se
    // muestra recortado al centro en un marco vertical y usa "Ver
    // completo" para verse entero (spec §3.1). El recorte es sólo la caja
    // en pantalla — la imagen real nunca se toca.
    el.style.aspectRatio = opts.aspect === '2:3' ? '2 / 3' : '3 / 4';

    const { stage } = buildComparisonStage(opts);
    const { real, ia } = buildLabels();
    const handle = buildHandle();
    const line = document.createElement('div');
    line.className = 'r360-ba__line';

    const fullBtn = document.createElement('button');
    fullBtn.type = 'button';
    fullBtn.className = 'r360-ba__full-btn';
    fullBtn.textContent = 'Ver completo';
    fullBtn.hidden = opts.aspect !== '4:3';
    fullBtn.addEventListener('click', () => this.openFullscreen());

    el.append(stage, real, ia, line, handle, fullBtn);
    opts.container.append(el);

    this.el = el;
    this.labelReal = real;
    this.labelIa = ia;
    this.handleEl = handle;

    // Arranca en 100% (foto real completa, ver la tabla de semántica de
    // `pct` en la cabecera del archivo): es el estado seguro por default.
    // El barrido automático de abajo lo lleva a 50% apenas entra en
    // pantalla (o `set(50)` de una si hay reduced-motion / no hay
    // `IntersectionObserver`). Arrancar en 100 y no en 50 es lo que hace
    // que el barrido "enseñe el gesto" en vez de aparecer ya resuelto — y
    // si el barrido no llega a correr por lo que sea (pestaña en segundo
    // plano al cargar, observer que no dispara, error temprano), lo que
    // queda a la vista es la foto real, nunca la imagen inventada por IA.
    this.divider = new DividerController(el, el, handle, (pct) => this.applyPercent(pct), SAFE_DEFAULT_PCT);
    this.applyPercent(SAFE_DEFAULT_PCT);

    // --- Pantalla completa: mismo comparador, en un overlay propio, con
    // pinch-zoom encima. Se arma una sola vez (oculto) para no repetir el
    // trabajo de montar imágenes en cada apertura.
    const overlay = document.createElement('div');
    overlay.className = 'r360-ba-fullscreen';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Comparación antes y después, pantalla completa');

    const fsBox = document.createElement('div');
    fsBox.className = 'r360-ba';
    // Acá SÍ es la relación real de la foto, sin recorte: el sentido de
    // "Ver completo" es precisamente mostrar el cuadro entero.
    fsBox.style.aspectRatio = opts.aspect === '2:3' ? '2 / 3' : '4 / 3';
    fsBox.style.width = '100%';
    fsBox.style.height = 'auto';

    const { stage: fsStage } = buildComparisonStage(opts);
    const { real: fsReal, ia: fsIa } = buildLabels();
    const fsHandle = buildHandle();
    const fsLine = document.createElement('div');
    fsLine.className = 'r360-ba__line';
    fsBox.append(fsStage, fsReal, fsIa, fsLine, fsHandle);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'r360-ba-fullscreen__close';
    closeBtn.setAttribute('aria-label', 'Cerrar pantalla completa');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => this.closeFullscreen());

    overlay.append(fsBox, closeBtn);
    this.fullscreenEl = overlay;
    this.fullscreenStage = fsStage;

    this.fullscreenDivider = new DividerController(
      fsBox,
      fsBox,
      fsHandle,
      (pct) => {
        fsBox.style.setProperty('--ba-pct', `${pct}%`);
        fsHandle.setAttribute('aria-valuenow', String(Math.round(pct)));
        fsReal.style.opacity = String(labelOpacity(pct, 'real'));
        fsIa.style.opacity = String(labelOpacity(pct, 'ia'));
      },
      50,
    );

    document.body.append(overlay);

    // --- Primer contacto: barrido de 100% a 50% en 1,2s, una sola vez, al
    // entrar en pantalla (spec §3.1). Arranca en la foto real completa y
    // revela la IA hasta la mitad: primero lo que existe, después lo que
    // se propone. `IntersectionObserver` es la forma correcta de saber
    // "entró en pantalla" sin que el componente asuma nada de cómo hace
    // scroll la página que lo contiene.
    if (prefersReducedMotion()) {
      // Con reduced-motion arranca quieto en 50%, sin barrido (spec).
      this.divider.set(50);
    } else if ('IntersectionObserver' in window) {
      this.visibilityObserver = new IntersectionObserver(
        (entries) => {
          if (this.sweptOnce) return;
          const visible = entries.some((e) => e.isIntersecting);
          if (!visible) return;
          this.sweptOnce = true;
          this.visibilityObserver?.disconnect();
          this.divider.animateTo(50, 1200);
        },
        { threshold: 0.4 },
      );
      this.visibilityObserver.observe(el);
    } else {
      // Sin IntersectionObserver disponible (entorno de test, navegador
      // muy viejo) no hay forma de saber "entró en pantalla": se arranca
      // directo en 50%, que es mejor que quedarse en 100% para siempre
      // (nunca mostraría la IA) — pero nunca peor que el default seguro de
      // 100%, porque 50% sigue mostrando la mitad de foto real.
      this.divider.set(50);
    }
  }

  get previewImageSrc(): string {
    return this.opts.real.src;
  }

  get dividerPercent(): number {
    return this.divider.value;
  }

  setDividerPercent(pct: number): void {
    this.divider.stopAnimation();
    this.divider.set(pct);
  }

  openFullscreen(): void {
    this.fullscreenEl.hidden = false;
    this.fullscreenDivider?.set(this.divider.value);
    this.fullscreenPinch?.destroy();
    this.fullscreenPinch = new FullscreenPinch(this.fullscreenStage);
    document.addEventListener('keydown', this.onFullscreenKeyDown);
  }

  closeFullscreen(): void {
    this.fullscreenEl.hidden = true;
    this.fullscreenPinch?.destroy();
    this.fullscreenPinch = null;
    document.removeEventListener('keydown', this.onFullscreenKeyDown);
  }

  destroy(): void {
    this.visibilityObserver?.disconnect();
    this.divider.destroy();
    this.fullscreenDivider?.destroy();
    this.fullscreenPinch?.destroy();
    document.removeEventListener('keydown', this.onFullscreenKeyDown);
    this.el.remove();
    this.fullscreenEl.remove();
  }

  private onFullscreenKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.closeFullscreen();
  };

  private applyPercent(pct: number): void {
    this.el.style.setProperty('--ba-pct', `${pct}%`);
    this.handleEl.setAttribute('aria-valuenow', String(Math.round(pct)));
    this.labelReal.style.opacity = String(labelOpacity(pct, 'real'));
    this.labelIa.style.opacity = String(labelOpacity(pct, 'ia'));
  }
}
