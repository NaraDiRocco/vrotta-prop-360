'use client';

/**
 * ConfirmDialog: el reemplazo puntual de los ocho `window.confirm` (Vendido
 * masivo, borrar lead, equipo ×2, `admin/team`, sales-units,
 * structure-editor). Título + consecuencia + botón peligroso a la derecha,
 * como pide el plan — el botón de acción principal siempre es el último en
 * el DOM para que Tab llegue a "Cancelar" primero (menos daño si alguien
 * confirma sin querer con Enter apurado).
 */
import { useId } from 'react';
import { Dialog } from './dialog.tsx';
import { Button } from './button.tsx';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** La consecuencia concreta: "Esto va a marcar 12 unidades como vendidas.", no "¿Estás seguro?". */
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** El botón de confirmar es rojo/danger; si no, es el primario normal. */
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  return (
    <Dialog open={open} onClose={onCancel} labelledBy={titleId}>
      <h2 id={titleId} className="r-dialog__title">
        {title}
      </h2>
      {description && <p className="r-dialog__desc">{description}</p>}
      <div className="r-dialog__actions">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
