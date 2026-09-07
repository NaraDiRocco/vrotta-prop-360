/**
 * Field: label + control + hint + error, un solo lugar en vez de los tres
 * `Field` locales de hoy (`unit-sheet.tsx`, `lead-detail.tsx`,
 * `onboarding/shared.tsx`). No envuelve el control en una capa nueva: le
 * inyecta `id`/`aria-describedby`/`aria-invalid`/`required` por
 * `cloneElement`, así el hijo sigue siendo el `<input>`/`<select>` real
 * (ningún wrapper intermedio que un test o un lector de pantalla tenga que
 * atravesar).
 *
 * `hint` usa `--fg-muted`, no `--fg-faint`: es texto informativo (formato
 * esperado, unidad), y la regla del sistema reserva `--fg-faint` para
 * placeholder y decoración (criterio 0.5 del plan).
 */
import { cloneElement, useId, type ReactElement } from 'react';

type FieldControlProps = {
  id?: string;
  required?: boolean;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
};

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactElement<FieldControlProps>;
}

export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const reactId = useId();
  const hintId = hint ? `${reactId}-hint` : undefined;
  const errorId = error ? `${reactId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const control = cloneElement(children, {
    id: children.props.id ?? reactId,
    required,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
  });

  return (
    <div className={['r-field', className].filter(Boolean).join(' ')}>
      <label htmlFor={control.props.id} className="r-field__label">
        {label}
        {required && (
          <span aria-hidden="true" className="r-field__required">
            {' '}
            *
          </span>
        )}
      </label>
      {control}
      {/* El hint desaparece cuando hay error: dos líneas auxiliares a la vez
          compiten por la misma atención y el error es lo urgente. */}
      {hint && !error && (
        <span id={hintId} className="r-field__hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} role="alert" className="r-field__error">
          {error}
        </span>
      )}
    </div>
  );
}
