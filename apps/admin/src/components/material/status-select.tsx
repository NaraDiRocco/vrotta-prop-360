import { STATUS_LABEL, type MaterialStatus } from './types.ts';

const ORDER: MaterialStatus[] = ['pendiente', 'solicitado', 'recibido', 'aprobado', 'no_aplica'];

/** Color de texto por estado — semánticos de interfaz, densidad de una fila de 32px. */
const COLOR: Record<MaterialStatus, string> = {
  pendiente: 'var(--fg-muted)',
  solicitado: 'var(--ui-warn)',
  recibido: 'var(--accent)',
  aprobado: 'var(--ui-ok)',
  no_aplica: 'var(--fg-faint)',
};

export function StatusSelect({
  value,
  onChange,
  disabled,
}: {
  value: MaterialStatus;
  onChange: (next: MaterialStatus) => void;
  disabled?: boolean;
}) {
  return (
    <select
      className="r-input"
      value={value}
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.value as MaterialStatus)}
      style={{
        width: 118,
        height: 24,
        padding: '0 6px',
        fontSize: 11,
        fontWeight: 600,
        color: COLOR[value],
        flex: 'none',
      }}
    >
      {ORDER.map((s) => (
        <option key={s} value={s} style={{ color: 'var(--fg)' }}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}
