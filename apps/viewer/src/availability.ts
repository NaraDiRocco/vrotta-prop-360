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

export class AvailabilityPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private controller: AbortController | null = null;
  private current: AvailabilityFile | null;
  private readonly opts: Required<Pick<PollerOptions, 'intervalMs'>> & PollerOptions;

  constructor(opts: PollerOptions) {
    this.opts = { intervalMs: 60_000, ...opts };
    this.current = opts.initial;
  }

  get value(): AvailabilityFile | null {
    return this.current;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.refresh(), this.opts.intervalMs);
    // Al volver de segundo plano el dato puede tener minutos: refrescar ya.
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.controller?.abort();
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private onVisibility = (): void => {
    if (document.visibilityState === 'visible') void this.refresh();
  };

  async refresh(): Promise<AvailabilityChange[]> {
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
