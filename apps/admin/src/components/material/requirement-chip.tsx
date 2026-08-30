import { REQUIREMENT_LABEL, type MaterialRequirement } from './types.ts';

/**
 * Chip de requisito. Usa los semánticos de INTERFAZ (--ui-*), no
 * STATUS_TOKENS: esto no es un estado comercial de unidad, es una prioridad
 * de producción. Obligatorio = bloquea, así que toma el tono de atención.
 */
const TONE: Record<MaterialRequirement, { fg: string; bg: string; border: string }> = {
  obligatorio: { fg: 'var(--ui-danger)', bg: 'var(--ui-danger-bg)', border: 'var(--ui-danger-border)' },
  recomendado: { fg: 'var(--ui-warn)', bg: 'var(--ui-warn-bg)', border: 'var(--ui-warn-border)' },
  opcional: { fg: 'var(--fg-muted)', bg: 'var(--bg-subtle)', border: 'var(--border)' },
};

export function RequirementChip({ requisito }: { requisito: MaterialRequirement }) {
  const tone = TONE[requisito];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 20,
        padding: '0 7px',
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 600,
        color: tone.fg,
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        whiteSpace: 'nowrap',
        flex: 'none',
      }}
    >
      {REQUIREMENT_LABEL[requisito]}
    </span>
  );
}
