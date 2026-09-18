/**
 * El brochure, DENTRO del recorrido.
 *
 * Son imágenes, una por página, y no un PDF embebido: en el navegador del
 * teléfono un `<iframe>` con un PDF adentro es poco confiable —en iOS suele
 * quedar en blanco o mostrar sólo la primera hoja— y además saca al visitante
 * del recorrido al abrirse en el lector del sistema.
 *
 * Se pasa con el dedo, en horizontal, con el mismo gesto que la serie de
 * fachadas del riel: `scroll-snap` nativo, sin JS de arrastre. El contador y
 * las flechas son ayudas, no el único camino.
 */

export interface BrochureHandle {
  close(): void;
}

export interface BrochureOptions {
  container: HTMLElement;
  /** Las páginas, ya resueltas contra el `base` del visor. */
  pages: string[];
  /** Se llama al cerrar, para que quien lo abrió recupere el foco. */
  onClose?: () => void;
}

export function mountBrochure(opts: BrochureOptions): BrochureHandle {
  const el = document.createElement('div');
  el.className = 'r360-brochure';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Brochure del proyecto');

  const tira = document.createElement('div');
  tira.className = 'r360-brochure__tira';

  opts.pages.forEach((url, i) => {
    const fig = document.createElement('figure');
    fig.className = 'r360-brochure__hoja';
    const img = document.createElement('img');
    // La primera se pide ya; el resto cuando se acercan. Son 23 páginas: si
    // se pidieran todas juntas, la primera tardaría por culpa de las otras.
    img.loading = i === 0 ? 'eager' : 'lazy';
    img.decoding = 'async';
    img.src = url;
    img.alt = `Brochure, página ${i + 1} de ${opts.pages.length}`;
    fig.appendChild(img);
    tira.appendChild(fig);
  });

  const cerrar = document.createElement('button');
  cerrar.type = 'button';
  cerrar.className = 'r360-close r360-brochure__close';
  cerrar.textContent = '×';
  cerrar.setAttribute('aria-label', 'Cerrar el brochure');

  const cuenta = document.createElement('p');
  cuenta.className = 'r360-brochure__cuenta';
  cuenta.setAttribute('aria-live', 'polite');

  const nav = (dir: -1 | 1): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `r360-brochure__nav r360-brochure__nav--${dir === -1 ? 'prev' : 'next'}`;
    b.textContent = dir === -1 ? '‹' : '›';
    b.setAttribute('aria-label', dir === -1 ? 'Página anterior' : 'Página siguiente');
    b.addEventListener('click', () => {
      tira.scrollBy({ left: dir * tira.clientWidth, behavior: 'smooth' });
    });
    return b;
  };
  const prev = nav(-1);
  const next = nav(1);

  const pintarCuenta = (): void => {
    const i = tira.clientWidth ? Math.round(tira.scrollLeft / tira.clientWidth) : 0;
    const actual = Math.min(opts.pages.length, Math.max(1, i + 1));
    cuenta.textContent = `${actual} / ${opts.pages.length}`;
    prev.disabled = actual === 1;
    next.disabled = actual === opts.pages.length;
  };
  tira.addEventListener('scroll', pintarCuenta, { passive: true });

  el.append(tira, cerrar, cuenta, prev, next);
  opts.container.appendChild(el);
  // Un cuadro para que el navegador ya tenga medidas y el contador arranque
  // en "1 / 23" y no en vacío.
  requestAnimationFrame(pintarCuenta);

  const handle: BrochureHandle = {
    close() {
      el.remove();
      document.removeEventListener('keydown', onKey);
      opts.onClose?.();
    },
  };

  // Escape cierra, y las flechas del teclado pasan de página: el brochure
  // también se mira desde una computadora.
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') { e.preventDefault(); handle.close(); }
    else if (e.key === 'ArrowRight') next.click();
    else if (e.key === 'ArrowLeft') prev.click();
  };
  document.addEventListener('keydown', onKey);
  cerrar.addEventListener('click', () => handle.close());

  cerrar.focus();
  return handle;
}
