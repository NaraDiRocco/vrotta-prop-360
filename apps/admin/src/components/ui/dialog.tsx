'use client';

/**
 * Dialog sobre `<dialog>` nativo. `showModal()` da gratis, en un browser
 * real, lo que hoy falta en los 4 `role="dialog"` sueltos de la app: `Tab`
 * no sale del diálogo, `Esc` lo cierra, `aria-modal` queda seteado solo, y
 * nada detrás queda focuseable/clickeable mientras está abierto. Es el
 * reemplazo de los ocho `window.confirm` — esta ola entrega la herramienta;
 * las olas siguientes la conectan en cada pantalla.
 *
 * Además del comportamiento nativo, este componente hace su PROPIA gestión
 * de foco (guardar quién estaba enfocado, mover el foco adentro al abrir,
 * atrapar Tab/Shift+Tab, devolver el foco al cerrar) por dos razones:
 * primero, es lo correcto igual (algunos motores viejos o casos raros no
 * atrapan perfecto); segundo — y esto es lo que lo hace *verificable* — el
 * atrapado nativo de `<dialog>` no está implementado en jsdom (issue abierto
 * de larga data en el proyecto), así que sin esta capa el test "Dialog
 * atrapa foco y cierra con Esc" no podría existir. La capa propia corre en
 * cualquier entorno, browser real o jsdom, con el mismo código.
 */
import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';

export interface DialogProps {
  open: boolean;
  /** Se llama al cerrar por cualquier vía: Esc, click afuera, o que el padre baje `open`. */
  onClose: () => void;
  /** id del elemento que hace de título — `aria-labelledby` para que el lector diga cuál diálogo es. */
  labelledBy: string;
  children: ReactNode;
  className?: string;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

export function Dialog({ open, onClose, labelledBy, children, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Sincroniza el elemento imperativo con el estado declarativo del padre,
  // y hace la parte de foco que `<dialog>` no puede garantizar sola en todos
  // los entornos: guardar/mover/devolver.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) {
      previouslyFocused.current = document.activeElement as HTMLElement | null;
      node.showModal();
      const first = focusableElements(node)[0];
      first?.focus();
    }
    if (!open && node.open) {
      node.close();
    }
    if (!open) {
      previouslyFocused.current?.focus();
    }
  }, [open]);

  // El evento nativo `close` cubre TODAS las formas de cerrar: Esc (que
  // primero dispara `cancel`, cancelable, y después `close`), y una llamada
  // directa a `.close()`. Escucharlo acá es lo que garantiza que el padre
  // nunca quede con `open=true` mientras el <dialog> ya se cerró solo.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const handleClose = () => onClose();
    node.addEventListener('close', handleClose);
    return () => node.removeEventListener('close', handleClose);
  }, [onClose]);

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === ref.current) onClose();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    // Cierre explícito con Esc: en un browser real `<dialog>` ya lo hace
    // solo (dispara `cancel` + `close`, que arriba llama a `onClose`); acá
    // se refuerza para no depender de eso en entornos que no lo implementan
    // (jsdom) y para no dejar dos caminos de cierre divergentes.
    if (event.key === 'Escape') {
      event.preventDefault();
      ref.current?.close();
      return;
    }
    if (event.key !== 'Tab') return;
    const node = ref.current;
    if (!node) return;
    const focusable = focusableElements(node);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;
    // Atrapa el foco: en el último elemento, Tab vuelve al primero; en el
    // primero, Shift+Tab va al último. Cualquier otra combinación sigue el
    // recorrido normal del navegador dentro del diálogo.
    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    }
  }

  return (
    <dialog
      ref={ref}
      className={['r-dialog', className].filter(Boolean).join(' ')}
      aria-labelledby={labelledBy}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      {/* Un click en el contenido no debe burbujear hasta el <dialog> y
          disparar el cierre por backdrop. */}
      <div onClick={(event) => event.stopPropagation()}>{children}</div>
    </dialog>
  );
}
