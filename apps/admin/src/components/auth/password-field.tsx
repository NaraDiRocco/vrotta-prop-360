'use client';

import { useId, useState, type ChangeEventHandler } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/**
 * Campo de contraseña con "mostrar/ocultar" (`Eye`/`EyeOff`, `aria-pressed`
 * — hoy ninguna de las dos pantallas con contraseña lo tiene). Sólo
 * presentación: el valor y el cambio los sigue manejando el formulario que
 * la usa, exactamente como el `<input>` que reemplaza.
 */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
  autoFocus,
  labelExtra,
}: {
  id: string;
  label: string;
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  placeholder?: string;
  hint?: string;
  autoFocus?: boolean;
  /** Link a la derecha del label, p. ej. "¿La olvidaste?" en login. */
  labelExtra?: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const hintId = useId();

  return (
    <div className="auth-field">
      <div className="auth-field-label-row">
        <label htmlFor={id} className="auth-field-label">
          {label}
        </label>
        {labelExtra}
      </div>
      <div className="auth-password-wrap">
        <input
          id={id}
          className="r-input"
          type={visible ? 'text' : 'password'}
          required
          autoFocus={autoFocus}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          aria-describedby={hint ? hintId : undefined}
        />
        <button
          type="button"
          className="auth-password-toggle"
          aria-pressed={visible}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? (
            <EyeOff size={16} aria-hidden focusable="false" />
          ) : (
            <Eye size={16} aria-hidden focusable="false" />
          )}
        </button>
      </div>
      {hint && (
        <span id={hintId} className="auth-field-hint">
          {hint}
        </span>
      )}
    </div>
  );
}
