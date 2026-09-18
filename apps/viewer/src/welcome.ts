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
import {
  WELCOME_LUGAR,
  esVistaDePunta,
  puntaAnclaje,
  type TramoId,
} from './tour-rail.model.ts';
import { MARCA_SVG, montarMarca } from './tour-rail.ts';
import type { PhotoTourItem } from '@r360/core';
import { escapeHtml } from './polygons.ts';

export interface WelcomeOptions {
  container: HTMLElement;
  /** Título grande: "El Bloque 2 ya está construido." */
  headline: string;
  /**
   * Nombre del proyecto, para el `alt` del logo y como respaldo en texto.
   * Opcional: quien monta la bienvenida hoy (`ui.ts`) todavía no lo pasa y
   * este pase no puede tocar ese archivo; sin él la marca es el logo y el
   * lugar, que es lo que la auditoría pedía.
   */
  project?: string;
  /** Ruta del logo relativa al `tour.json` (ver `marcaPath` en `tour-rail.ts`). */
  logo?: string;
  hero: PhotoTourItem;
  segunda: PhotoTourItem | null;
  /** Resuelve una URL relativa al `tour.json`. */
  resolve: (url: string) => string;
  onStart: (tramo: TramoId) => void;
  /** Abre el brochure dentro del recorrido. Sin esto no se dibuja el enlace:
   *  un botón que no abre nada es peor que no tenerlo. */
  onBrochure?: (() => void) | null;
}

const CROSSFADE_MS = 5000;

/**
 * Quién comercializa y desarrolla, al pie de la portada.
 *
 * Los archivos salieron de la contratapa del brochure, donde ya están en
 * blanco: se les recuperó el canal alfa desde la luminancia (venían blancos
 * sobre negro plano) y se recortó el margen. Viven en `public/marca/` y
 * también en `tools/baleia/material/marca/`, que es el material del proyecto.
 *
 * Está acá y no en el `tour.json` porque el manifiesto todavía no tiene un
 * campo para socios comerciales. Cuando el visor sirva a más de un proyecto,
 * esto tiene que venir de ahí y no de una constante.
 */
const PARTNERS: ReadonlyArray<{ id: string; src: string; alt: string }> = [
  // `BASE_URL` y no `/`: publicado en un subdirectorio —GitHub Pages sirve
  // bajo `/<repositorio>/`— una ruta absoluta al dominio apunta afuera del
  // sitio y los dos logos salen rotos.
  { id: 'dacal', src: `${import.meta.env.BASE_URL}marca/dacal-blanco.png`, alt: 'Dacal Bienes Raíces' },
  { id: 'caetano', src: `${import.meta.env.BASE_URL}marca/caetano-blanco.png`, alt: 'Caetano Negocios Inmobiliarios' },
];

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
    // La segunda foto entra YA ACERCADA al skyline (auditoría §4, Idea 2): en
    // 375 px de ancho, la península era una franja gris de pocos píxeles. El
    // archivo tiene 2000 px, así que el acercamiento sale de la imagen que ya
    // está cargada y no cuesta un byte.
    if (esVistaDePunta(f)) {
      fig.classList.add('is-punta');
      const ancla = puntaAnclaje(f.id);
      // El acercamiento se centra en el horizonte MEDIDO de esa foto: si se
      // centrara en el medio de la imagen, la pantalla se llenaría de cielo.
      if (ancla) fig.style.setProperty('--r360-punta-horizonte', `${(ancla.horizonte * 100).toFixed(1)}%`);
    }
    else if (!reducedMotion()) fig.classList.add('is-pushin');
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

  // Marca y lugar: el que llega desde un anuncio no sabía dónde estaba
  // parado — en toda la bienvenida no aparecía ni el logo ni "Punta Ballena"
  // (auditoría §1 y §2.8).
  const marca = document.createElement('div');
  marca.className = 'r360-welcome__marca';
  marca.innerHTML = `<span>${escapeHtml(WELCOME_LUGAR)}</span>`;
  // El logo antes del lugar; si el archivo no está, queda el lugar solo.
  montarMarca(marca, opts.resolve(opts.logo ?? MARCA_SVG), opts.project ?? '');

  // Sólo el titular: la portada no lleva nada debajo. El sello de "foto real"
  // vive en el recorrido, donde cada escena puede acreditarse sola.
  const info = document.createElement('div');
  info.className = 'r360-welcome__info';
  info.innerHTML = `<h1>${escapeHtml(opts.headline)}</h1>`;

  const acciones = document.createElement('div');
  acciones.className = 'r360-welcome__acciones';
  const empezar = document.createElement('button');
  empezar.type = 'button';
  empezar.className = 'r360-welcome__start';
  empezar.textContent = 'Empezar el recorrido';
  // El brochure se abre DENTRO del recorrido, encima de la portada, no en una
  // pestaña aparte. Si el manifiesto no trae páginas, no se dibuja el enlace.
  const alBrochure = document.createElement('button');
  alBrochure.type = 'button';
  alBrochure.className = 'r360-welcome__link';
  alBrochure.textContent = 'Ver brochure';
  acciones.append(empezar);
  if (opts.onBrochure) {
    acciones.append(alBrochure);
    alBrochure.addEventListener('click', () => opts.onBrochure?.());
  }

  // Al pie, quién comercializa y desarrolla, como en la contratapa del
  // brochure. Antes acá iba el riel con los seis tramos: en la portada
  // adelantaba el índice del recorrido antes de que el visitante decidiera
  // entrar, y el recorrido ya se navega solo una vez adentro.
  const socios = document.createElement('div');
  socios.className = 'r360-welcome__socios';
  socios.innerHTML =
    `<p>Comercializa y desarrolla</p>` +
    PARTNERS.map(
      (p) => `<img src="${p.src}" alt="${escapeHtml(p.alt)}" data-marca="${p.id}" loading="lazy" decoding="async">`,
    ).join('');

  el.append(stage, marca, info, acciones, socios);
  opts.container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-on'));

  let timer: ReturnType<typeof setInterval> | null = null;
  let visible = 0;
  if (capas.length > 1 && !reducedMotion()) {
    timer = setInterval(() => {
      capas[visible]!.fig.classList.remove('is-on');
      visible = (visible + 1) % capas.length;
      capas[visible]!.fig.classList.add('is-on');
      // Solo cruza las fotos: el titular no cambia. La portada tiene tres
      // cosas y ninguna depende de que foto se este viendo.
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
  // El brochure se abre encima, sin cerrar la portada: al cerrarlo, se vuelve.
  empezar.focus({ preventScroll: true });

  return handle;
}
