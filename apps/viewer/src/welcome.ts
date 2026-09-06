/**
 * La bienvenida: los primeros ocho segundos (spec §2).
 *
 * **100% fotografía real.** Hay dos videos de 10 s generados con IA que
 * quedan muy bien, pero la geometría del conjunto que hacen "crecer" no es la
 * del masterplan: abrir un recorrido cuyo argumento es "esto ya existe" con
 * una versión inventada del proyecto es contradecirse en el segundo uno. Así
 * que la apertura son dos fotos del 2 de septiembre de 2026 y nada más.
 *
 * Presupuesto: dos miniaturas (~35 KB) de entrada y dos fotos completas
 * (~720 KB) detrás. Menos de 1 MB antes del primer toque, con las dos fotos
 * ya en el cache del navegador para cuando el visitante entre al recorrido.
 *
 * Anti-requisitos que se mantienen del plan anterior: cero puerta, cero
 * cuenta regresiva, cero autoplay al recorrido, cero audio. Si el visitante
 * no toca nada, el loop sigue y no pasa nada más.
 */
import './welcome.css';
import { TRAMOS, chapaFor, type TramoId } from './tour-rail.model.ts';
import type { PhotoTourItem } from '@r360/core';
import { escapeHtml } from './polygons.ts';

export interface WelcomeOptions {
  container: HTMLElement;
  /** Título grande: "El Bloque 2 ya está construido." */
  headline: string;
  hero: PhotoTourItem;
  segunda: PhotoTourItem | null;
  /** Resuelve una URL relativa al `tour.json`. */
  resolve: (url: string) => string;
  onStart: (tramo: TramoId) => void;
  onPlan: () => void;
}

const CROSSFADE_MS = 5000;

export interface WelcomeHandle {
  close(): void;
}

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function mountWelcome(opts: WelcomeOptions): WelcomeHandle {
  const el = document.createElement('div');
  el.className = 'r360-welcome';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Bienvenida al recorrido');

  const fotos = [opts.hero, opts.segunda].filter((f): f is PhotoTourItem => !!f);
  const stage = document.createElement('div');
  stage.className = 'r360-welcome__stage';
  const capas = fotos.map((f, i) => {
    const fig = document.createElement('figure');
    fig.className = 'r360-welcome__shot';
    fig.style.backgroundImage = `url("${opts.resolve(f.thumbUrl)}")`;
    if (i === 0) fig.classList.add('is-on');
    if (!reducedMotion()) fig.classList.add('is-pushin');
    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    // La primera se pide ya; la segunda espera al primer paint para no
    // competir por el ancho de banda de la que se está mirando.
    if (i === 0) img.src = opts.resolve(f.url);
    else requestAnimationFrame(() => setTimeout(() => { img.src = opts.resolve(f.url); }, 300));
    const on = () => img.classList.add('is-on');
    img.addEventListener('load', on, { once: true });
    // Foto ya cacheada: el `load` puede no volver a dispararse y la
    // bienvenida se quedaría en negro sobre la miniatura.
    if (img.complete && img.naturalWidth > 0) on();
    fig.appendChild(img);
    stage.appendChild(fig);
    return { fig, item: f };
  });

  const info = document.createElement('div');
  info.className = 'r360-welcome__info';
  const chapa = chapaFor(opts.hero.procedencia);
  info.innerHTML =
    `<h1>${escapeHtml(opts.headline)}</h1>` +
    (chapa ? `<p class="r360-welcome__chapa">${escapeHtml(chapa.text)}</p>` : '');

  const acciones = document.createElement('div');
  acciones.className = 'r360-welcome__acciones';
  const empezar = document.createElement('button');
  empezar.type = 'button';
  empezar.className = 'r360-welcome__start';
  empezar.textContent = 'Empezar el recorrido';
  const alPlano = document.createElement('button');
  alPlano.type = 'button';
  alPlano.className = 'r360-welcome__link';
  alPlano.textContent = 'Ir directo al plano';
  acciones.append(empezar, alPlano);

  // El riel completo, con los nombres: el visitante sabe cuánto dura esto
  // antes de entrar (y puede entrar por donde quiera).
  const riel = document.createElement('div');
  riel.className = 'r360-welcome__riel';
  riel.setAttribute('aria-label', 'Los seis tramos del recorrido');
  riel.innerHTML = TRAMOS.map(
    (t, i) =>
      `<button type="button" data-tramo="${t.id}" aria-label="Empezar en el tramo ${i + 1}: ${escapeHtml(t.short)}">
         <i aria-hidden="true"></i><span>${escapeHtml(t.short)}</span>
       </button>`,
  ).join('');

  el.append(stage, info, acciones, riel);
  opts.container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-on'));

  let timer: ReturnType<typeof setInterval> | null = null;
  let visible = 0;
  if (capas.length > 1 && !reducedMotion()) {
    timer = setInterval(() => {
      capas[visible]!.fig.classList.remove('is-on');
      visible = (visible + 1) % capas.length;
      capas[visible]!.fig.classList.add('is-on');
      const cap = capas[visible]!.item.caption;
      const h1 = info.querySelector('h1');
      if (visible > 0 && cap && h1) h1.textContent = cap;
      else if (h1) h1.textContent = opts.headline;
    }, CROSSFADE_MS);
  }

  const handle: WelcomeHandle = {
    close() {
      if (timer) clearInterval(timer);
      timer = null;
      el.classList.remove('is-on');
      window.setTimeout(() => el.remove(), reducedMotion() ? 0 : 320);
    },
  };

  empezar.addEventListener('click', () => { handle.close(); opts.onStart('llegada'); });
  alPlano.addEventListener('click', () => { handle.close(); opts.onPlan(); });
  riel.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-tramo]');
    if (!btn?.dataset.tramo) return;
    handle.close();
    opts.onStart(btn.dataset.tramo as TramoId);
  });
  empezar.focus({ preventScroll: true });

  return handle;
}
