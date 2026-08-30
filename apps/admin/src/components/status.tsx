/**
 * Todo lo visual de estados sale de STATUS_TOKENS de @r360/core.
 *
 * Regla dura: acá NO hay hex hardcodeado y en globals.css tampoco. Si el
 * naranja de "reservado" cambia, cambia en un archivo y lo ven el panel, el
 * editor y el visor a la vez. Es la única forma de que no diverjan.
 */
import { STATUS_TOKENS, UNIT_STATUSES, type UnitStatus } from '@r360/core';
import type { StatusCounts } from '@/lib/data/types.ts';

export function statusVar(status: UnitStatus): string {
  return `var(--st-${status})`;
}

/** Inyecta --st-<estado> y --st-<estado>-fill en :root. Va en el layout raíz. */
export function StatusStyles() {
  const css = UNIT_STATUSES.map((status) => {
    const token = STATUS_TOKENS[status];
    return `--st-${status}:${token.base};--st-${status}-fill:color-mix(in srgb, ${token.base} ${Math.round(
      token.fill * 100,
    )}%, transparent);`;
  }).join('');
  return <style dangerouslySetInnerHTML={{ __html: `:root{${css}}` }} />;
}

export function StatusDot({ status, size = 8 }: { status: UnitStatus; size?: number }) {
  return (
    <span
      className="r-dot"
      style={{ background: statusVar(status), width: size, height: size }}
      aria-hidden
    />
  );
}

export function StatusLabel({ status }: { status: UnitStatus }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <StatusDot status={status} />
      {STATUS_TOKENS[status].label}
    </span>
  );
}

/** Barra apilada por estado. El orden es el de STATUS_TOKENS.order. */
export function StatusBar({ counts, height = 6 }: { counts: StatusCounts; height?: number }) {
  const total = UNIT_STATUSES.reduce((acc, s) => acc + counts[s], 0);
  if (total === 0) return <div className="r-stack" style={{ height }} />;
  const ordered = [...UNIT_STATUSES].sort((a, b) => STATUS_TOKENS[a].order - STATUS_TOKENS[b].order);
  return (
    <div className="r-stack" style={{ height }} role="img" aria-label={summarize(counts)}>
      {ordered.map((status) =>
        counts[status] > 0 ? (
          <span
            key={status}
            style={{ width: `${(counts[status] / total) * 100}%`, background: statusVar(status) }}
            title={`${STATUS_TOKENS[status].label}: ${counts[status]}`}
          />
        ) : null,
      )}
    </div>
  );
}

export function summarize(counts: StatusCounts): string {
  return UNIT_STATUSES.filter((s) => counts[s] > 0)
    .map((s) => `${STATUS_TOKENS[s].label} ${counts[s]}`)
    .join(' · ');
}

export function statusTotal(counts: StatusCounts): number {
  return UNIT_STATUSES.reduce((acc, s) => acc + counts[s], 0);
}
