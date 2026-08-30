import type { CSSProperties } from 'react';
import { STATUS_TOKENS, type UnitStatus } from '@r360/core';

/** Rótulos de estado, tomados del contrato compartido para que no diverjan. */
export const STATUS_LABEL: Record<UnitStatus, string> = {
  disponible: STATUS_TOKENS.disponible.label,
  reservado: STATUS_TOKENS.reservado.label,
  vendido: STATUS_TOKENS.vendido.label,
  bloqueado: STATUS_TOKENS.bloqueado.label,
  no_disponible: STATUS_TOKENS.no_disponible.label,
};

export const FIELD_LABEL: CSSProperties = { fontSize: 11, color: 'var(--fg-muted)' };
export const FIELD_HINT: CSSProperties = { fontSize: 11, color: 'var(--fg-faint)' };
export const PANEL: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 7,
  padding: 10,
  background: 'var(--bg)',
};
