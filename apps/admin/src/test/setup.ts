/**
 * Setup global de vitest. Este archivo se carga para TODOS los tests, no
 * sólo los de componentes (el entorno por default sigue siendo 'node' — ver
 * vitest.config.ts — y sólo los `.test.tsx` que lo necesitan piden
 * `@vitest-environment jsdom` puntualmente). Por eso todo acá adentro es
 * un no-op bajo 'node': sin `document`, no hay nada que parchear.
 *
 * Bajo jsdom hace dos cosas: (1) suma los matchers de jest-dom
 * (`toBeInTheDocument`, `toHaveFocus`, etc.) y registra `cleanup()` de
 * Testing Library después de cada test (sin `test.globals: true` en
 * vitest.config.ts no hay un `afterEach` global del que colgarse solo, y
 * sin esto cada `render()` dejaría su árbol montado para el test
 * siguiente); y (2) parchea `HTMLDialogElement.showModal()`/`.close()`, que
 * jsdom todavía no implementa (issue de larga data del propio proyecto
 * jsdom) — sin esto, cualquier test que monte `ui/dialog.tsx` rompe con
 * "showModal is not a function" antes de llegar a probar nada nuestro. El
 * polyfill es deliberadamente mínimo: sólo el atributo `open` y el evento
 * `close`, que es todo lo que `Dialog` consume. NO intenta simular el foco
 * atrapado nativo del browser — ESE comportamiento lo prueba el test contra
 * la gestión de foco propia de `Dialog` (ver el comentario grande en
 * dialog.tsx), no contra esto.
 */
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// `cleanup()` toca `document`: bajo el entorno 'node' (la mayoría de los
// tests, lib/** puro) no existe, así que sólo se registra el trabajo real
// cuando hay DOM. Importar los módulos de arriba es inofensivo en los dos
// entornos (sólo agregan matchers/funciones); llamarlos no lo es.
afterEach(() => {
  if (typeof document !== 'undefined') cleanup();
});

if (typeof HTMLDialogElement !== 'undefined' && typeof HTMLDialogElement.prototype.showModal !== 'function') {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}
