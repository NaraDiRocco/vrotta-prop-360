'use client';

/**
 * Toast global. Hoy sólo existe dentro de `units-screen.tsx` (y otro,
 * separado, en el editor): leads, equipo, material, escenas y publicar no
 * tienen forma de avisar "esto falló" salvo tragarse el error. Se monta una
 * sola vez en `QueryProvider` (raíz de la app) y cualquier componente cliente
 * pide `useToast()` para mostrar uno.
 *
 * Un solo toast a la vez a propósito: dos avisos superpuestos compiten por
 * la misma esquina y por la misma atención. El que llega reemplaza al
 * anterior (mismo criterio que ya tenía `units-screen`).
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export type ToastTone = 'ok' | 'error';

export interface ToastInput {
  text: string;
  tone?: ToastTone;
  /** Si viene, el toast se comporta como un aviso de "Deshacer" (fondo invertido, botón de acción). */
  onUndo?: () => void;
  undoLabel?: string;
  /** ms visible; default 4s (6s si tiene Deshacer, para dar tiempo a reaccionar). */
  duration?: number;
}

interface ToastState extends ToastInput {
  id: number;
}

interface ToastContextValue {
  show: (input: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const idRef = useRef(0);

  const show = useCallback((input: ToastInput) => {
    idRef.current += 1;
    setToast({ tone: 'ok', ...input, id: idRef.current });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const duration = toast.duration ?? (toast.onUndo ? 6000 : 4000);
    const timer = setTimeout(() => {
      // Sólo se cierra a sí mismo: si mientras tanto llegó un toast nuevo
      // (id distinto), este timer no lo debe pisar.
      setToast((current) => (current?.id === toast.id ? null : current));
    }, duration);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && (
        <div role="status" className="r-toast" data-tone={toast.onUndo ? 'undo' : toast.tone}>
          <span>{toast.text}</span>
          {toast.onUndo && (
            <button
              type="button"
              className="r-toast__undo"
              onClick={() => {
                toast.onUndo?.();
                setToast(null);
              }}
            >
              {toast.undoLabel ?? 'Deshacer'}
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}

/** Lanza toasts desde cualquier componente cliente descendiente de `QueryProvider`. */
export function useToast(): ToastContextValue['show'] {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast() se usa dentro de <ToastProvider> (montado en QueryProvider).');
  }
  return ctx.show;
}
