'use client';

import { useMemo, useState } from 'react';
import { UNIT_STATUSES, type UnitStatus } from '@r360/core';
import { checkPattern, patternVariables } from '@/lib/onboarding/codes.ts';
import type { GroupRow, UnitTypeRow } from '@/lib/data/types.ts';
import type { CreateUnitsResponse } from '@/app/api/p/create/units/route.ts';
import { STATUS_LABEL } from './shared.tsx';

/**
 * Generador masivo por patrón.
 *
 * La vista previa se recalcula en cada tecleo y muestra los 3 primeros y los
 * 2 últimos códigos, con el total. Es la única defensa contra el error caro
 * de este flujo: crear 640 unidades con un código mal armado y tener que
 * borrarlas una por una. Nada se crea hasta que el operador ve la lista.
 */
export function UnitGenerator({
  tenantSlug,
  projectId,
  groups,
  types,
  initialPattern,
  onDone,
}: {
  tenantSlug: string;
  projectId: string;
  groups: GroupRow[];
  types: UnitTypeRow[];
  initialPattern: string;
  onDone: (message: string) => void;
}) {
  const [pattern, setPattern] = useState(initialPattern);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [groupCode, setGroupCode] = useState<string>(groups[0]?.code ?? '');
  const [typeCode, setTypeCode] = useState<string>(types[0]?.code ?? '');
  const [status, setStatus] = useState<UnitStatus>('disponible');
  const [area, setArea] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const names = useMemo(() => patternVariables(pattern), [pattern]);
  const check = useMemo(() => checkPattern(pattern, vars), [pattern, vars]);
  const preview = check.preview;

  async function create() {
    if (!check.plan) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/p/create/units', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: 'pattern',
          tenantSlug,
          projectId,
          pattern,
          vars,
          groupCode: groupCode || null,
          typeCode: typeCode || null,
          status,
          areaTotalM2: area.trim().length > 0 ? Number(area) : null,
        }),
      });
      const payload = (await response.json()) as CreateUnitsResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'No pude crear las unidades.');
      const result = payload.result;
      const skipped = result?.skipped.length ?? 0;
      onDone(
        `${result?.created ?? 0} unidad(es) creadas` +
          (skipped > 0 ? ` · ${skipped} omitidas por código repetido` : '') +
          '.',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pude crear las unidades.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <label htmlFor="gen-pattern" style={LABEL}>
          Patrón de código
        </label>
        <input
          id="gen-pattern"
          className="r-input"
          style={{ fontFamily: 'var(--font-mono)' }}
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          spellCheck={false}
        />
        <p style={HINT}>
          <code>{'{01..48}'}</code> rango numérico · <code>{'{A..K}'}</code> letras ·{' '}
          <code>{'{manzana}'}</code> variable. Ejemplos: <code>M{'{manzana}'}-L{'{01..48}'}</code>,{' '}
          <code>T{'{torre}'}-{'{piso}'}{'{A..D}'}</code>, <code>B{'{bloque}'}-{'{A..K}'}</code>.
        </p>
      </div>

      {names.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {names.map((name) => (
            <div key={name} style={{ display: 'grid', gap: 3 }}>
              <label htmlFor={`var-${name}`} style={LABEL}>
                {`{${name}}`}
              </label>
              <input
                id={`var-${name}`}
                className="r-input"
                style={{ width: 90, fontFamily: 'var(--font-mono)' }}
                value={vars[name] ?? ''}
                onChange={(e) => setVars((prev) => ({ ...prev, [name]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Select label="Grupo" value={groupCode} onChange={setGroupCode} width={170}>
          <option value="">— sin grupo —</option>
          {groups.map((g) => (
            <option key={g.id} value={g.code}>
              {g.code}
              {g.name ? ` · ${g.name}` : ''}
            </option>
          ))}
        </Select>

        <Select label="Tipo por defecto" value={typeCode} onChange={setTypeCode} width={160}>
          <option value="">— sin tipo —</option>
          {types.map((t) => (
            <option key={t.id} value={t.code}>
              {t.name}
            </option>
          ))}
        </Select>

        <Select label="Estado" value={status} onChange={(v) => setStatus(v as UnitStatus)} width={140}>
          {UNIT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>

        <div style={{ display: 'grid', gap: 3 }}>
          <label htmlFor="gen-area" style={LABEL}>
            Superficie por defecto (m²)
          </label>
          <input
            id="gen-area"
            className="r-input tnum"
            style={{ width: 120 }}
            inputMode="decimal"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="—"
          />
        </div>
      </div>

      <Preview check={check} />

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      <div>
        <button
          type="button"
          className="r-btn"
          data-variant="primary"
          disabled={busy || !preview || preview.total === 0}
          onClick={create}
        >
          {busy ? 'Creando…' : `Crear ${preview?.total ?? 0} unidad(es)`}
        </button>
      </div>
    </div>
  );
}

function Preview({ check }: { check: ReturnType<typeof checkPattern> }) {
  if (check.error) {
    return (
      <div style={{ ...BOX, borderColor: 'var(--danger)', color: 'var(--danger)' }}>{check.error}</div>
    );
  }
  const preview = check.preview;
  if (!preview) return null;
  return (
    <div style={BOX}>
      <div style={{ ...LABEL, marginBottom: 5 }}>
        Vista previa — <span className="tnum">{preview.total}</span> código(s)
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        {preview.head.map((code) => (
          <span key={code} style={CHIP}>
            {code}
          </span>
        ))}
        {preview.elided && <span style={{ color: 'var(--fg-faint)', alignSelf: 'center' }}>…</span>}
        {preview.tail.map((code) => (
          <span key={code} style={CHIP}>
            {code}
          </span>
        ))}
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  width,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  width: number;
  children: React.ReactNode;
}) {
  const id = `sel-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div style={{ display: 'grid', gap: 3 }}>
      <label htmlFor={id} style={LABEL}>
        {label}
      </label>
      <select id={id} className="r-input" style={{ width }} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </div>
  );
}

const LABEL: React.CSSProperties = { fontSize: 11, color: 'var(--fg-muted)' };
const HINT: React.CSSProperties = { fontSize: 11, color: 'var(--fg-faint)' };
const BOX: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '7px 9px',
  background: 'var(--bg-subtle)',
};
const CHIP: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '1px 5px',
  background: 'var(--bg)',
};
