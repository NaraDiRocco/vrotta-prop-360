/**
 * Pill/Badge: reemplaza las cinco formas de chip no interactivo de hoy
 * (estado de lead, chip de requisito, "v1 público", MOCK, chip de estado de
 * unidad en la tabla). `Pill` es el genérico con tono de interfaz;
 * `StatusPill` y `LeadStatusPill` son las dos variantes con vocabulario
 * propio (comercial de unidad vs. de lead — ver el comentario de por qué no
 * comparten fuente en `src/lib/leads/status.ts`).
 */
import type { ReactNode } from 'react';
import { STATUS_TOKENS, type UnitStatus } from '@r360/core';
import { statusVar } from '@/components/status.tsx';
import { LEAD_STATUS_TOKENS, type LeadStatus } from '@/lib/leads/status.ts';

export type PillTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' | 'faint';

export interface PillProps {
  tone?: PillTone;
  children: ReactNode;
  className?: string;
}

export function Pill({ tone = 'neutral', children, className }: PillProps) {
  return (
    <span className={['r-pill', className].filter(Boolean).join(' ')} data-tone={tone}>
      {children}
    </span>
  );
}

/** Estado de UNIDAD: el color sale de `STATUS_TOKENS` (@r360/core), nunca de un hex propio acá. */
export function StatusPill({ status }: { status: UnitStatus }) {
  return (
    <Pill tone="neutral">
      <span className="r-dot" style={{ background: statusVar(status) }} aria-hidden />
      {STATUS_TOKENS[status].label}
    </Pill>
  );
}

/** Estado de LEAD: vocabulario propio del panel (`lib/leads/status.ts`), no el de unidad. */
export function LeadStatusPill({ status }: { status: LeadStatus }) {
  const token = LEAD_STATUS_TOKENS[status];
  return <Pill tone={token.tone}>{token.label}</Pill>;
}
