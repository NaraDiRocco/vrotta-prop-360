'use client';

import { STATUS_TOKENS, UNIT_STATUSES } from '@r360/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { StatusDot } from '@/components/status.tsx';
import type { GroupRow, UnitPatch, UnitRow, UnitTypeRow } from '@/lib/data/types.ts';
import type { UnitDetailResponse } from '@/lib/units/api-types.ts';
import { normalizeAttrSchema, validateAttrValue } from '@/lib/units/attrs.ts';

type Tab = 'detalle' | 'precios' | 'historial';

/**
 * Panel lateral de 420px. Es un panel, no una página: la tabla sigue ahí atrás
 * con su filtro y su scroll intactos. Cerrar y volver no debería costar nada.
 */
export function UnitSheet({
  projectId,
  unit,
  groups,
  types,
  onClose,
  onEdit,
}: {
  projectId: string;
  unit: UnitRow;
  groups: readonly GroupRow[];
  types: readonly UnitTypeRow[];
  onClose: () => void;
  onEdit: (unit: UnitRow, patch: UnitPatch) => void;
}) {
  const [tab, setTab] = useState<Tab>('detalle');

  const detail = useQuery<UnitDetailResponse>({
    queryKey: ['unit-detail', projectId, unit.id],
    queryFn: async () => {
      const response = await fetch(`/api/p/${projectId}/units/${unit.id}`);
      if (!response.ok) throw new Error('No pude leer el detalle');
      return (await response.json()) as UnitDetailResponse;
    },
  });

  const schema = useMemo(() => {
    const type = types.find((t) => t.id === unit.unitTypeId);
    return normalizeAttrSchema(type?.attrSchema ?? {});
  }, [types, unit.unitTypeId]);

  return (
    <aside
      aria-label={`Unidad ${unit.code}`}
      style={{
        width: 420,
        flex: 'none',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 9px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 14 }}>{unit.code}</strong>
        <StatusDot status={unit.status} />
        <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{STATUS_TOKENS[unit.status].label}</span>
        <div style={{ flex: 1 }} />
        <button type="button" className="r-btn" data-variant="ghost" onClick={onClose} title="Cerrar (Esc)">
          ✕
        </button>
      </header>

      <nav style={{ display: 'flex', gap: 2, padding: '5px 7px', borderBottom: '1px solid var(--border)' }}>
        {(['detalle', 'precios', 'historial'] as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            className="r-btn"
            data-variant={tab === key ? 'primary' : 'ghost'}
            onClick={() => setTab(key)}
            style={{ textTransform: 'capitalize' }}
          >
            {key}
          </button>
        ))}
      </nav>

      <div style={{ flex: 1, overflow: 'auto', padding: 10 }}>
        {tab === 'detalle' && (
          <div style={{ display: 'grid', gap: 8 }}>
            <Field label="Estado">
              <select
                className="r-input"
                value={unit.status}
                onChange={(e) => onEdit(unit, { status: e.target.value as UnitRow['status'] })}
              >
                {UNIT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_TOKENS[status].label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Grupo">
              <select
                className="r-input"
                value={unit.groupId ?? ''}
                onChange={(e) => onEdit(unit, { groupId: e.target.value || null })}
              >
                <option value="">Sin grupo</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.code} — {group.name ?? group.kind}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Tipo">
              <select
                className="r-input"
                value={unit.unitTypeId ?? ''}
                onChange={(e) => onEdit(unit, { unitTypeId: e.target.value || null })}
              >
                <option value="">Sin tipo</option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Superficie total (m²)">
              <input
                key={`${unit.id}-area-${unit.areaTotalM2 ?? ''}`}
                className="r-input tnum"
                defaultValue={unit.areaTotalM2 ?? ''}
                inputMode="decimal"
                onBlur={(e) => {
                  const raw = e.target.value.trim();
                  const next = raw === '' ? null : Number(raw.replace(',', '.'));
                  if (next !== unit.areaTotalM2 && (next === null || Number.isFinite(next))) {
                    onEdit(unit, { areaTotalM2: next });
                  }
                }}
              />
            </Field>

            <Field label="Polígono">
              <span style={{ color: unit.hasPolygon ? 'var(--ok)' : 'var(--warn)' }}>
                {unit.hasPolygon ? 'Cargado' : 'Falta — no es clickeable en el recorrido'}
              </span>
            </Field>

            <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', marginTop: 4 }}>
              Atributos del tipo
            </h3>
            {Object.keys(schema.properties).length === 0 && (
              <p style={{ color: 'var(--fg-muted)' }}>
                Este tipo no define atributos. Se editan en Estructura.
              </p>
            )}
            {Object.entries(schema.properties).map(([key, prop]) => (
              <AttrField
                key={`${unit.id}-${key}`}
                attrKey={key}
                prop={prop}
                value={unit.attrs[key]}
                onCommit={(value) => onEdit(unit, { attrs: { ...unit.attrs, [key]: value } })}
              />
            ))}
          </div>
        )}

        {tab === 'precios' && (
          <div>
            {detail.isLoading && <p style={{ color: 'var(--fg-muted)' }}>Cargando…</p>}
            {detail.data?.prices.length === 0 && (
              <p style={{ color: 'var(--fg-muted)' }}>Sin precios cargados.</p>
            )}
            <table className="r-table">
              <tbody>
                {(detail.data?.prices ?? []).map((price) => (
                  <tr key={price.id}>
                    <td className="r-td tnum" style={{ textAlign: 'right', fontWeight: 600 }}>
                      {price.currency} {price.amount.toLocaleString('es-UY')}
                    </td>
                    <td className="r-td" style={{ color: 'var(--fg-muted)' }}>
                      {price.visibility}
                    </td>
                    <td className="r-td tnum" style={{ color: 'var(--fg-muted)' }}>
                      {price.validTo === null ? 'vigente' : `hasta ${price.validTo.slice(0, 10)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'historial' && (
          <div>
            {detail.isLoading && <p style={{ color: 'var(--fg-muted)' }}>Cargando…</p>}
            {detail.data?.log.length === 0 && (
              <p style={{ color: 'var(--fg-muted)' }}>Sin cambios de estado registrados.</p>
            )}
            <ul style={{ display: 'grid', gap: 6 }}>
              {(detail.data?.log ?? []).map((entry) => (
                <li key={entry.id} style={{ display: 'flex', gap: 7, alignItems: 'baseline' }}>
                  <span className="tnum" style={{ fontSize: 11, color: 'var(--fg-faint)', width: 118 }}>
                    {new Date(entry.changedAt).toLocaleString('es-UY')}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    {entry.fromStatus && (
                      <>
                        <StatusDot status={entry.fromStatus} size={6} />
                        <span style={{ color: 'var(--fg-faint)' }}>→</span>
                      </>
                    )}
                    <StatusDot status={entry.toStatus} size={6} />
                    {STATUS_TOKENS[entry.toStatus].label}
                  </span>
                  {entry.note && <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{entry.note}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 3 }}>
      <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{label}</span>
      {children}
    </label>
  );
}

function AttrField({
  attrKey,
  prop,
  value,
  onCommit,
}: {
  attrKey: string;
  prop: import('@/lib/units/attrs.ts').AttrPropSchema;
  value: unknown;
  onCommit: (value: unknown) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const label = prop.title ?? attrKey;

  if (prop.type === 'boolean') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type="checkbox" checked={value === true} onChange={(e) => onCommit(e.target.checked)} />
        <span>{label}</span>
      </label>
    );
  }

  if (prop.enum) {
    return (
      <Field label={label}>
        <select className="r-input" value={String(value ?? '')} onChange={(e) => onCommit(e.target.value)}>
          <option value="">—</option>
          {prop.enum.map((option) => (
            <option key={String(option)} value={String(option)}>
              {String(option)}
            </option>
          ))}
        </select>
      </Field>
    );
  }

  const numeric = prop.type === 'integer' || prop.type === 'number';
  return (
    <Field label={label}>
      <input
        className={numeric ? 'r-input tnum' : 'r-input'}
        defaultValue={value === null || value === undefined ? '' : String(value)}
        inputMode={numeric ? 'decimal' : 'text'}
        onBlur={(e) => {
          const raw = e.target.value.trim();
          const next: unknown = raw === '' ? null : numeric ? Number(raw.replace(',', '.')) : raw;
          const issues = validateAttrValue(attrKey, prop, next);
          if (issues.length > 0) {
            setError(issues[0]?.message ?? 'valor inválido');
            return;
          }
          setError(null);
          onCommit(next);
        }}
        aria-invalid={error !== null}
      />
      {error && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{error}</span>}
    </Field>
  );
}
