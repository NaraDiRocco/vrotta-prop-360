'use client';

import { STATUS_TOKENS, UNIT_STATUSES, type UnitStatus } from '@r360/core';
import { forwardRef, useEffect, useState } from 'react';
import { StatusDot } from '@/components/status.tsx';
import type { StatusCounts, UnitTypeRow } from '@/lib/data/types.ts';
import type { TableState } from '@/lib/units/url-state.ts';

const SYNTAX_HELP = [
  ['estado:reservado', 'un estado (o varios: estado:reservado,vendido)'],
  ['m2>300', 'superficie; también m2>=, m2<, m2<='],
  ['precio>150.000', 'precio vigente'],
  ['grupo:B2 · tipo:duplex', 'por código'],
  ['sin:poligono · sin:precio', 'lo que falta'],
  ['con:poligono', 'lo que ya está'],
];

export const SearchInput = forwardRef<HTMLInputElement, {
  value: string;
  onChange: (value: string) => void;
}>(function SearchInput({ value, onChange }, ref) {
  const [draft, setDraft] = useState(value);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => setDraft(value), [value]);

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 460 }}>
      <input
        ref={ref}
        className="r-input"
        value={draft}
        placeholder="Buscar   m2>300  estado:reservado  sin:poligono"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onChange(draft);
          if (e.key === 'Escape') {
            setDraft('');
            onChange('');
            e.currentTarget.blur();
          }
        }}
        onBlur={() => onChange(draft)}
        onFocus={() => setHelpOpen(true)}
        aria-label="Buscar unidades"
        style={{ paddingRight: 26 }}
      />
      <button
        type="button"
        onClick={() => setHelpOpen((v) => !v)}
        title="Sintaxis de búsqueda"
        style={{ position: 'absolute', right: 6, top: 5, color: 'var(--fg-faint)', fontSize: 11 }}
      >
        ?
      </button>
      {helpOpen && (
        <div
          onMouseLeave={() => setHelpOpen(false)}
          style={{
            position: 'absolute',
            top: 32,
            left: 0,
            zIndex: 20,
            background: 'var(--bg)',
            border: '1px solid var(--border-strong)',
            borderRadius: 6,
            padding: 8,
            minWidth: 320,
            boxShadow: '0 8px 24px rgb(0 0 0 / 0.12)',
          }}
        >
          {SYNTAX_HELP.map(([syntax, help]) => (
            <div key={syntax} style={{ display: 'flex', gap: 8, fontSize: 11, padding: '2px 0' }}>
              <code style={{ color: 'var(--accent)', minWidth: 150 }}>{syntax}</code>
              <span style={{ color: 'var(--fg-muted)' }}>{help}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export function FilterBar({
  state,
  counts,
  types,
  warnings,
  onPatch,
  searchRef,
}: {
  state: TableState;
  counts: StatusCounts;
  types: readonly UnitTypeRow[];
  warnings: readonly string[];
  onPatch: (patch: Partial<TableState>) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
}) {
  function toggleStatus(status: UnitStatus) {
    const next = state.statuses.includes(status)
      ? state.statuses.filter((s) => s !== status)
      : [...state.statuses, status];
    onPatch({ statuses: next, page: 1 });
  }

  const dirty =
    state.q !== '' ||
    state.statuses.length > 0 ||
    state.groupIds.length > 0 ||
    state.unitTypeIds.length > 0 ||
    state.m2Min !== null ||
    state.m2Max !== null;

  return (
    <div style={{ borderBottom: '1px solid var(--border)', padding: '6px 8px', display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <SearchInput ref={searchRef} value={state.q} onChange={(q) => onPatch({ q, page: 1 })} />

        <select
          className="r-input"
          style={{ width: 'auto' }}
          value={state.unitTypeIds[0] ?? ''}
          onChange={(e) => onPatch({ unitTypeIds: e.target.value ? [e.target.value] : [], page: 1 })}
          aria-label="Tipo de unidad"
        >
          <option value="">Todos los tipos</option>
          {types.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>m²</span>
          <input
            className="r-input tnum"
            style={{ width: 62 }}
            inputMode="decimal"
            placeholder="mín"
            defaultValue={state.m2Min ?? ''}
            onBlur={(e) => onPatch({ m2Min: e.target.value === '' ? null : Number(e.target.value), page: 1 })}
            aria-label="Superficie mínima"
          />
          <span style={{ color: 'var(--fg-faint)' }}>–</span>
          <input
            className="r-input tnum"
            style={{ width: 62 }}
            inputMode="decimal"
            placeholder="máx"
            defaultValue={state.m2Max ?? ''}
            onBlur={(e) => onPatch({ m2Max: e.target.value === '' ? null : Number(e.target.value), page: 1 })}
            aria-label="Superficie máxima"
          />
        </div>

        {dirty && (
          <button
            type="button"
            className="r-btn"
            data-variant="ghost"
            onClick={() =>
              onPatch({ q: '', statuses: [], groupIds: [], unitTypeIds: [], m2Min: null, m2Max: null, page: 1 })
            }
          >
            Limpiar
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        {UNIT_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            className="r-chip"
            data-on={state.statuses.includes(status)}
            onClick={() => toggleStatus(status)}
            title={`Filtrar por ${STATUS_TOKENS[status].label}`}
          >
            <StatusDot status={status} size={7} />
            {STATUS_TOKENS[status].label}
            <span className="tnum" style={{ color: 'var(--fg-muted)' }}>
              {counts[status]}
            </span>
          </button>
        ))}
      </div>

      {warnings.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--warn)' }}>{warnings.join(' ')}</div>
      )}
    </div>
  );
}
