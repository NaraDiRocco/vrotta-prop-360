/**
 * Refresco de disponibilidad.
 *
 * `tour.json` es inmutable por versión; lo único que cambia en caliente es
 * `availability.json`. Por eso el refresco NUNCA recrea marcadores: sólo
 * hace `updateMarker` de los que efectivamente cambiaron de estado. Recrear
 * 600 polígonos cada 60 s tira el framerate y además rompe el hover del
 * usuario justo mientras está mirando un lote.
 */
import type { AvailabilityFile, UnitStatus } from '@r360/core';

export interface AvailabilityChange {
  unitCode: string;
  from: UnitStatus | null;
  to: UnitStatus;
}

export type AvailabilityListener = (
  next: AvailabilityFile,
  changes: AvailabilityChange[],
) => void;

export interface PollerOptions {
  url: string;
  initial: AvailabilityFile | null;
  /** Por defecto 60 s. */
  intervalMs?: number;
  onUpdate: AvailabilityListener;
  onError?: (err: unknown) => void;
}

export async function fetchAvailability(url: string, signal?: AbortSignal): Promise<AvailabilityFile> {
  const res = await fetch(url, { cache: 'no-store', signal });
  if (!res.ok) throw new Error(`availability ${res.status} ${res.statusText}`);
  const json = (await res.json()) as AvailabilityFile;
  if (!json || typeof json !== 'object' || typeof json.units !== 'object') {
    throw new Error('availability.json malformado: falta `units`');
  }
  return json;
}

/** Diferencia por unidad. Sólo devuelve las que cambiaron de estado. */
export function diffAvailability(
  prev: AvailabilityFile | null,
  next: AvailabilityFile,
): AvailabilityChange[] {
  const out: AvailabilityChange[] = [];
  for (const [code, entry] of Object.entries(next.units)) {
    const before = prev?.units[code]?.s ?? null;
    if (before !== entry.s) out.push({ unitCode: code, from: before, to: entry.s });
  }
  // Una unidad que desaparece del archivo también es un cambio: hay que
  // repintarla con el fallback, no dejarla con el color viejo (que sería
  // mentirle al visitante).
  if (prev) {
    for (const code of Object.keys(prev.units)) {
      if (!(code in next.units)) {
        out.push({ unitCode: code, from: prev.units[code]!.s, to: 'no_disponible' });
      }
    }
  }
  return out;
}

/**
 * Piso entre dos refrescos, sin importar quién los pida (el timer o
 * `visibilitychange`). Existe por I5 (auditoría de rendimiento): con el
 * intervalo en 60 s se midieron 102 pedidos a `availability.json` en diez
 * minutos de navegación — muchos más que los ~10 que el timer solo
 * explicaría. La causa es `visibilitychange`: cada vez que la pestaña pierde
 * y recupera el foco (cambiar de app, abrir el selector de fotos del
 * teléfono, o —en las pruebas— cambiar de pestaña del navegador) el
 * visitante puede volver en segundos, y cada vuelta pedía el archivo de
 * nuevo. El piso no le quita el propósito a `visibilitychange` (volver de
 * MINUTOS en segundo plano sigue refrescando al toque): sólo colapsa las
 * vueltas de menos de `MIN_GAP_MS` en una sola descarga.
 */
const MIN_GAP_MS = 15_000;

export class AvailabilityPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private controller: AbortController | null = null;
  private current: AvailabilityFile | null;
  private readonly opts: Required<Pick<PollerOptions, 'intervalMs'>> & PollerOptions;
  /** `Date.now()` del último refresco EMPEZADO (con éxito o no). */
  private lastFetchAt = 0;
  /** El refresco en curso, si hay uno: una segunda llamada se le engancha
   *  en vez de disparar otro `fetch` en paralelo (timer y `visibilitychange`
   *  pueden pedirlo casi al mismo tiempo). */
  private inFlight: Promise<AvailabilityChange[]> | null = null;

  constructor(opts: PollerOptions) {
    this.opts = { intervalMs: 60_000, ...opts };
    this.current = opts.initial;
  }

  get value(): AvailabilityFile | null {
    return this.current;
  }

  /**
   * Idempotente a propósito: si algo llama a `start()` dos veces sobre la
   * MISMA instancia (un remontaje que no pasó por `stop()`, por ejemplo)
   * seguía habiendo un solo timer — pero además nunca sumaba un segundo
   * listener de `visibilitychange`, así que esta guarda no cambia
   * comportamiento, sólo lo deja explícito y probado.
   */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.refresh(), this.opts.intervalMs);
    // Al volver de segundo plano el dato puede tener minutos: refrescar ya
    // (sujeto al piso de `MIN_GAP_MS` de más abajo).
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /** Limpia timer, listener y cualquier fetch en curso — para que un
   *  `mountViewer` que se desmonta no deje nada vivo detrás. */
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.controller?.abort();
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private onVisibility = (): void => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - this.lastFetchAt < MIN_GAP_MS) return; // ver MIN_GAP_MS
    void this.refresh();
  };

  refresh(): Promise<AvailabilityChange[]> {
    // Una descarga a la vez: si ya hay una en curso, todo el que la pida
    // mientras tanto recibe la MISMA promesa en vez de sumar otro `fetch`.
    if (this.inFlight) return this.inFlight;
    const p = this.doRefresh().finally(() => {
      this.inFlight = null;
    });
    this.inFlight = p;
    return p;
  }

  private async doRefresh(): Promise<AvailabilityChange[]> {
    this.lastFetchAt = Date.now();
    this.controller?.abort();
    this.controller = new AbortController();
    try {
      const next = await fetchAvailability(this.opts.url, this.controller.signal);
      // `v` monótono: si el CDN sirve una copia vieja, no pisamos lo bueno.
      if (this.current && typeof next.v === 'number' && next.v < this.current.v) return [];
      const changes = diffAvailability(this.current, next);
      this.current = next;
      if (changes.length) this.opts.onUpdate(next, changes);
      return changes;
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return [];
      // Fallar el refresco no puede romper el visor: se sigue mostrando el
      // último dato bueno y se reintenta en el próximo tick.
      console.warn('[r360] No se pudo refrescar availability.json:', err);
      this.opts.onError?.(err);
      return [];
    }
  }
}
