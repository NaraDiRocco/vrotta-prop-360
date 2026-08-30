/**
 * Autosave con debounce y flush forzado.
 *
 * Guardar en cada vértice sería una escritura cada 200 ms mientras se dibuja.
 * Guardar sólo al salir pierde trabajo. El compromiso es debounce de 800 ms —
 * más largo que la pausa entre dos clicks del mismo polígono, más corto que la
 * pausa entre dos polígonos — con FLUSH forzado en los momentos en que perder
 * algo sería inaceptable: cambiar de unidad, cambiar de modo, perder el foco,
 * cerrar la pestaña y ⌘S.
 *
 * `flush()` espera al guardado en curso antes de disparar el siguiente, así dos
 * escrituras nunca se pisan y la última en llegar es siempre la última en el
 * tiempo (el problema clásico del autosave: la respuesta vieja pisa a la nueva).
 */

export type SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'error';

export interface SaverOptions<T> {
  delayMs?: number;
  save: (payload: T) => Promise<void>;
  onStateChange?: (state: SaveState, error?: Error) => void;
}

export const AUTOSAVE_DELAY_MS = 800;

export class Autosaver<T> {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: T | null = null;
  private hasPending = false;
  private inFlight: Promise<void> | null = null;
  private state: SaveState = 'clean';
  private readonly delayMs: number;

  constructor(private readonly opts: SaverOptions<T>) {
    this.delayMs = opts.delayMs ?? AUTOSAVE_DELAY_MS;
  }

  get saveState(): SaveState {
    return this.state;
  }

  get isDirty(): boolean {
    return this.hasPending || this.state === 'saving';
  }

  /** Marca sucio y reprograma el debounce. */
  schedule(payload: T): void {
    this.pending = payload;
    this.hasPending = true;
    this.setState('dirty');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.delayMs);
  }

  /** Guarda ya. Resuelve cuando el guardado terminó (o falló). */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.inFlight) await this.inFlight.catch(() => undefined);
    if (!this.hasPending || this.pending === null) return;

    const payload = this.pending;
    this.hasPending = false;
    this.pending = null;
    this.setState('saving');

    this.inFlight = this.opts
      .save(payload)
      .then(() => {
        this.setState(this.hasPending ? 'dirty' : 'saved');
      })
      .catch((err: unknown) => {
        // El payload vuelve a la cola: un error de red no puede tragarse el
        // trabajo, y el siguiente flush lo reintenta con el estado más nuevo.
        if (!this.hasPending) {
          this.pending = payload;
          this.hasPending = true;
        }
        this.setState('error', err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        this.inFlight = null;
      });

    await this.inFlight;
  }

  /** Corta el debounce sin guardar. Sólo al desmontar. */
  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private setState(state: SaveState, error?: Error): void {
    this.state = state;
    this.opts.onStateChange?.(state, error);
  }
}

export const SAVE_LABEL: Record<SaveState, string> = {
  clean: 'Sin cambios',
  dirty: 'Sin guardar',
  saving: 'Guardando…',
  saved: 'Guardado',
  error: 'Error al guardar',
};
