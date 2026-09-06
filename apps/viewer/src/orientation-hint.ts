/**
 * El chip de orientación: el único onboarding del plano.
 *
 * "5 bloques · 20 unidades · desde USD … · Tocá un bloque": dice el tamaño de
 * lo que hay y el gesto que lo abre, y se va solo a los 5 segundos o con el
 * primer toque. Vivía en `main.ts`; salió a su propio módulo cuando el
 * arranque dejó de ser siempre el plano — ahora el recorrido guiado puede
 * abrir primero, y el chip sólo tiene sentido cuando lo que se ve ES el plano.
 */
import { formatPrice } from './polygons.ts';
import { parseHash } from './scenes.ts';
import type { AvailabilityFile, TourManifest } from '@r360/core';

// ------------------------------------------------------ chip de orientación

/**
 * "5 bloques · 20 unidades · Tocá un bloque". El único onboarding del
 * recorrido: dice el tamaño de lo que hay y el gesto que lo abre, y se va solo.
 *
 * No aparece cuando el visitante llegó por un deep link de unidad: el destino
 * ya está decidido y explicarle el mapa sería ruido sobre la ficha que acaba
 * de abrirse.
 */
export function showOrientationChip(container: HTMLElement, tour: TourManifest, availability: AvailabilityFile | null): void {
  if (parseHash(location.hash).unitCode) return;

  const start = tour.scenes.find((s) => s.slug === tour.start);
  const blocks = new Set(
    tour.hotspots.filter((h) => h.sceneId === start?.id && h.unitCode).map((h) => h.unitCode!),
  );
  // Las entradas de `units` que agrupan a otras (un bloque) no son unidades
  // vendibles: contarlas dos veces inflaría el número que le mostramos.
  const units = Object.values(tour.units).filter((u) => !Array.isArray(u.attrs?.unitCodes)).length;
  const parts: string[] = [];
  if (blocks.size) parts.push(`<b>${blocks.size}</b> bloques`);
  if (units) parts.push(`<b>${units}</b> unidades`);
  if (!parts.length) return;

  // "desde USD …" con el mínimo de los precios públicos disponibles: es lo
  // primero que un comprador quiere saber, y mostrarlo de entrada filtra a
  // favor. Si ningún precio es público, no se inventa nada y no va la línea.
  const from = cheapestAvailable(availability);
  if (from) parts.push(`desde <b>${formatPrice(from)}</b>`);
  parts.push('Tocá un bloque para ver sus unidades');

  const chip = document.createElement('div');
  chip.className = 'r360-hint';
  chip.setAttribute('role', 'status');
  chip.innerHTML = parts.join(' · ');
  container.appendChild(chip);
  requestAnimationFrame(() => chip.classList.add('is-on'));

  const dismiss = () => {
    chip.classList.remove('is-on');
    clearTimeout(timer);
    container.removeEventListener('pointerdown', dismiss);
    setTimeout(() => chip.remove(), 350);
  };
  const timer = setTimeout(dismiss, 5000);
  container.addEventListener('pointerdown', dismiss, { once: true });
}

function cheapestAvailable(availability: AvailabilityFile | null): { a: number; c: string } | null {
  let best: { a: number; c: string } | null = null;
  for (const entry of Object.values(availability?.units ?? {})) {
    if (entry.s !== 'disponible' || !entry.p) continue;
    if (!best || entry.p.a < best.a) best = entry.p;
  }
  return best;
}

