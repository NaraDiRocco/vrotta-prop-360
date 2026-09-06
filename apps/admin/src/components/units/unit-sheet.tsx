'use client';

import { STATUS_TOKENS, UNIT_STATUSES } from '@r360/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { StatusDot } from '@/components/status.tsx';
import type { Actor, UnitPriceInput, GroupRow, UnitPatch, UnitRow, UnitTypeRow } from '@/lib/data/types.ts';
import type { UnitDetailResponse } from '@/lib/units/api-types.ts';
import { normalizeAttrSchema, validateAttrValue } from '@/lib/units/attrs.ts';
import { canEditPrices, canEditStructure, canEditUnitAttributes } from '@/lib/roles.ts';

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
  actor,
  onClose,
  onEdit,
}: {
  projectId: string;
  unit: UnitRow;
  groups: readonly GroupRow[];
  types: readonly UnitTypeRow[];
  actor: Actor;
  onClose: () => void;
  onEdit: (unit: UnitRow, patch: UnitPatch) => void;
}) {
  const [tab, setTab] = useState<Tab>('detalle');
  const queryClient = useQueryClient();
  // Código, grupo y tipo son estructura: los arma Vrotta a partir del
  // material. m²/atributos y precio los edita también la inmobiliaria
  // (Administrador y Gestor) — la fila exacta de la tabla de permisos.
  const editaEstructura = canEditStructure(actor);
  const editaAtributos = canEditUnitAttributes(actor);
  const editaPrecio = canEditPrices(actor);

  // Entra con un pequeño desplazamiento + fade (§7.4.2): sin esto el panel de
  // 420px "aparece de golpe" y el ojo pierde de dónde vino. 140ms, nada más
  // — más y estorba al operar rápido. Se apaga con reduced-motion.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const detailKey = ['unit-detail', projectId, unit.id] as const;
  const detail = useQuery<UnitDetailResponse>({
    queryKey: detailKey,
    queryFn: async () => {
      const response = await fetch(`/api/p/${projectId}/units/${unit.id}`);
      if (!response.ok) throw new Error('No pude leer el detalle');
      return (await response.json()) as UnitDetailResponse;
    },
  });

  const [priceDraft, setPriceDraft] = useState<{ amount: string; currency: string; visibility: UnitPriceInput['visibility'] }>({
    amount: unit.price ? String(unit.price.amount) : '',
    currency: unit.price?.currency ?? 'USD',
    visibility: unit.price && unit.price.visibility !== 'private' ? unit.price.visibility : 'public',
  });
  useEffect(() => {
    setPriceDraft({
      amount: unit.price ? String(unit.price.amount) : '',
      currency: unit.price?.currency ?? 'USD',
      visibility: unit.price && unit.price.visibility !== 'private' ? unit.price.visibility : 'public',
    });
  }, [unit.id, unit.price]);

  const savePrice = useMutation({
    mutationFn: async (input: UnitPriceInput) => {
      const response = await fetch(`/api/p/${projectId}/units/${unit.id}/price`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'No se pudo guardar el precio');
      }
      return response.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: detailKey });
      void queryClient.invalidateQueries({ queryKey: ['units', projectId] });
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
        boxShadow: 'var(--shadow-overlay)',
        opacity: reducedMotion || entered ? 1 : 0,
        transform: reducedMotion || entered ? 'translateX(0)' : 'translateX(8px)',
        transition: reducedMotion ? undefined : 'opacity 140ms ease-out, transform 140ms ease-out',
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

            {/* Grupo y tipo son estructura: los arma Vrotta a partir del
                material. La inmobiliaria los ve, no los toca — mismo trigger
                `units_tenant_update_guard` que ya lo frena en la base. */}
            <Field label="Grupo">
              {editaEstructura ? (
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
              ) : (
                <span>{unit.groupCode ?? '—'}</span>
              )}
            </Field>

            <Field label="Tipo">
              {editaEstructura ? (
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
              ) : (
                <span>{unit.typeName ?? '—'}</span>
              )}
            </Field>

            <Field label="Superficie total (m²)">
              {editaAtributos ? (
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
              ) : (
                <span className="tnum">{unit.areaTotalM2 ?? '—'}</span>
              )}
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
            {Object.entries(schema.properties).map(([key, prop]) =>
              editaAtributos ? (
                <AttrField
                  key={`${unit.id}-${key}`}
                  attrKey={key}
                  prop={prop}
                  value={unit.attrs[key]}
                  onCommit={(value) => onEdit(unit, { attrs: { ...unit.attrs, [key]: value } })}
                />
              ) : (
                <Field key={`${unit.id}-${key}`} label={prop.title ?? key}>
                  <span>{fmtAttrValue(unit.attrs[key])}</span>
                </Field>
              ),
            )}
          </div>
        )}

        {tab === 'precios' && (
          <div style={{ display: 'grid', gap: 12 }}>
            {editaPrecio && (
              <form
                style={{ display: 'grid', gap: 8, border: '1px solid var(--border)', borderRadius: 7, padding: 10 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  const amount = Number(priceDraft.amount.replace(',', '.'));
                  if (!Number.isFinite(amount) || amount < 0) return;
                  savePrice.mutate({ amount, currency: priceDraft.currency, visibility: priceDraft.visibility });
                }}
              >
                <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)' }}>Cargar precio nuevo</h3>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Field label="Monto">
                    <input
                      className="r-input tnum"
                      inputMode="decimal"
                      value={priceDraft.amount}
                      onChange={(e) => setPriceDraft((p) => ({ ...p, amount: e.target.value }))}
                    />
                  </Field>
                  <Field label="Moneda">
                    <select
                      className="r-input"
                      value={priceDraft.currency}
                      onChange={(e) => setPriceDraft((p) => ({ ...p, currency: e.target.value }))}
                    >
                      {['USD', 'UYU', 'ARS'].map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Visibilidad">
                  <select
                    className="r-input"
                    value={priceDraft.visibility}
                    onChange={(e) =>
                      setPriceDraft((p) => ({ ...p, visibility: e.target.value as UnitPriceInput['visibility'] }))
                    }
                  >
                    <option value="public">Pública — se ve en el recorrido</option>
                    <option value="on_request">A pedido — el recorrido dice "consultar"</option>
                  </select>
                </Field>
                <button type="submit" className="r-btn" data-variant="primary" disabled={savePrice.isPending}>
                  {savePrice.isPending ? 'Guardando…' : 'Guardar precio'}
                </button>
                {savePrice.isError && (
                  <span style={{ fontSize: 11, color: 'var(--danger)' }}>
                    {savePrice.error instanceof Error ? savePrice.error.message : 'No se pudo guardar'}
                  </span>
                )}
              </form>
            )}

            <div>
              <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 6 }}>Historial</h3>
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

/** Misma lógica de `fmtAttr` de la tabla, para la vista de sólo lectura. */
function fmtAttrValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'sí' : 'no';
  return String(value);
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
