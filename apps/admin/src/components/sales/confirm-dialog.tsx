'use client';

import { useEffect, useRef } from 'react';

/**
 * Confirmación propia para reemplazar `window.confirm` en el shell de
 * ventas: en el celular un `confirm()` se dibuja como alerta del sistema
 * operativo, no como parte del producto, y no se puede tematizar.
 *
 * `<dialog>` nativo da foco atrapado y cierre con Esc gratis (`showModal`).
 * Usa la clase `.r-dialog` que ya reservó la Ola 1.A en `globals.css` para
 * el `Dialog` compartido de `components/ui/`: cuando ese componente exista,
 * este archivo se puede borrar y reemplazar por `<Dialog>` sin tocar el
 * resto del shell de ventas (que sólo necesita `open`/`onConfirm`/`onCancel`).
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="r-dialog"
      // Esc y click en el backdrop nativo disparan `cancel`, no `close`: hay
      // que escuchar los dos para que "cancelar" siempre limpie el estado.
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClose={onCancel}
      style={{ padding: 16, width: 'min(320px, calc(100vw - 32px))' }}
    >
      <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 6 }}>{title}</h2>
      {description && (
        <p style={{ fontSize: '0.875rem', color: 'var(--fg-muted)', marginBottom: 14 }}>{description}</p>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="r-btn"
          style={{ minHeight: 44, minWidth: 44 }}
          onClick={onCancel}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className="r-btn"
          data-variant="primary"
          style={{ minHeight: 44, minWidth: 44 }}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
