'use client';

import { useMemo, useRef, useState } from 'react';
import { UNIT_STATUSES, type UnitStatus } from '@r360/core';
import {
  buildImportPlan,
  CSV_FIELD_LABEL,
  detectMapping,
  parseCsv,
  type CsvField,
  type CsvMapping,
} from '@/lib/onboarding/csv.ts';
import type { GroupRow, UnitTypeRow } from '@/lib/data/types.ts';
import type { CreateUnitsResponse } from '@/app/api/p/create/units/route.ts';
import { FIELD_HINT, FIELD_LABEL, STATUS_LABEL } from './shared.tsx';

const FIELD_ORDER: CsvField[] = [
  'code',
  'typeCode',
  'groupCode',
  'status',
  'areaTotalM2',
  'areaCoveredM2',
  'price',
  'currency',
  'priceVisibility',
  'financing',
  'orientation',
  'notes',
];

/**
 * Importación desde CSV.
 *
 * Todo el parseo, el mapeo y la validación corren en el navegador para que la
 * vista previa sea instantánea sobre archivos de miles de filas — y VUELVEN a
 * correr en el servidor sobre el mismo código antes de escribir. La preview
 * no es la autoridad: es la misma función.
 *
 * Con un solo error de fila el botón de importar queda apagado. No hay
 * "importar igual y ver qué pasa": una carga a medias es peor que ninguna.
 */
export function CsvImport({
  tenantSlug,
  projectId,
  groups,
  types,
  onDone,
}: {
  tenantSlug: string;
  projectId: string;
  groups: GroupRow[];
  types: UnitTypeRow[];
  onDone: (message: string) => void;
}) {
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [mapping, setMapping] = useState<CsvMapping | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<UnitStatus>('disponible');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const headers = useMemo(() => (csv.length > 0 ? (parseCsv(csv)[0] ?? []).map((h) => h.trim()) : []), [csv]);
  const autoMapping = useMemo(() => (headers.length > 0 ? detectMapping(headers) : null), [headers]);
  const effective = mapping ?? autoMapping;

  const plan = useMemo(() => {
    if (csv.length === 0) return null;
    return buildImportPlan(csv, {
      ...(effective ? { mapping: effective } : {}),
      defaultStatus,
      existingGroupCodes: groups.map((g) => g.code),
      existingTypeCodes: types.map((t) => t.code),
    });
  }, [csv, effective, defaultStatus, groups, types]);

  async function load(file: File) {
    setError(null);
    setFileName(file.name);
    setMapping(null);
    setCsv(await file.text());
  }

  async function commit() {
    if (!plan || plan.issues.length > 0) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/p/create/units', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: 'csv',
          tenantSlug,
          projectId,
          csv,
          ...(effective ? { mapping: effective } : {}),
          defaultStatus,
          createMissingGroups: true,
          groupKind: 'grupo',
        }),
      });
      const payload = (await response.json()) as CreateUnitsResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'No pude importar el archivo.');
      const result = payload.result;
      const parts = [`${result?.created ?? 0} unidad(es) importadas`];
      if ((result?.groupsCreated ?? 0) > 0) parts.push(`${result?.groupsCreated} grupo(s) creados`);
      if ((result?.typesCreated ?? 0) > 0) parts.push(`${result?.typesCreated} tipo(s) creados`);
      if ((result?.pricesCreated ?? 0) > 0) parts.push(`${result?.pricesCreated} precio(s)`);
      if ((result?.skipped.length ?? 0) > 0) parts.push(`${result?.skipped.length} omitidas (ya existían)`);
      onDone(`${parts.join(' · ')}.`);
      setCsv('');
      setFileName(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pude importar el archivo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void load(file);
          }}
        />
        <button type="button" className="r-btn" onClick={() => inputRef.current?.click()}>
          Elegir archivo…
        </button>
        <span style={FIELD_HINT}>
          {fileName ?? 'Formato de docs/03-PLANTILLAS-CSV/plantilla-en-blanco.csv (o cualquier planilla con encabezados reconocibles).'}
        </span>
        {csv.length > 0 && (
          <button
            type="button"
            className="r-btn"
            data-variant="ghost"
            onClick={() => {
              setCsv('');
              setFileName(null);
              setMapping(null);
            }}
          >
            Descartar
          </button>
        )}
      </div>

      {plan && (
        <>
          <MappingTable
            headers={headers}
            mapping={effective}
            auto={autoMapping}
            onChange={(field, index) => {
              const base = effective ?? detectMapping(headers);
              setMapping({ ...base, [field]: index });
            }}
          />

          <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
            <div style={{ display: 'grid', gap: 3 }}>
              <label htmlFor="csv-default-status" style={FIELD_LABEL}>
                Estado para las filas sin estado
              </label>
              <select
                id="csv-default-status"
                className="r-input"
                style={{ width: 160 }}
                value={defaultStatus}
                onChange={(e) => setDefaultStatus(e.target.value as UnitStatus)}
              >
                {UNIT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ ...FIELD_HINT, paddingBottom: 6 }}>
              {plan.totalRows} fila(s) leídas · {plan.units.length} válidas
              {plan.missingGroups.length > 0 && ` · se crearán ${plan.missingGroups.length} grupo(s)`}
              {plan.missingTypes.length > 0 && ` · se crearán ${plan.missingTypes.length} tipo(s)`}
            </div>
          </div>

          {plan.issues.length > 0 ? (
            <IssueReport issues={plan.issues} />
          ) : (
            <RowPreview plan={plan} />
          )}
        </>
      )}

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      {plan && (
        <div>
          <button
            type="button"
            className="r-btn"
            data-variant="primary"
            disabled={busy || plan.issues.length > 0 || plan.units.length === 0}
            title={plan.issues.length > 0 ? 'Corregí los errores del archivo primero.' : undefined}
            onClick={commit}
          >
            {busy ? 'Importando…' : `Importar ${plan.units.length} unidad(es)`}
          </button>
        </div>
      )}
    </div>
  );
}

function MappingTable({
  headers,
  mapping,
  auto,
  onChange,
}: {
  headers: string[];
  mapping: CsvMapping | null;
  auto: CsvMapping | null;
  onChange: (field: CsvField, index: number) => void;
}) {
  if (!mapping) return null;
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden' }}>
      <div style={{ ...FIELD_LABEL, padding: '6px 9px', background: 'var(--bg-subtle)', fontWeight: 600 }}>
        Mapeo de columnas — detectado automáticamente, editable
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 6, padding: 9 }}>
        {FIELD_ORDER.map((field) => {
          const index = mapping[field];
          const detected = auto?.[field] === index && index !== -1;
          return (
            <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span style={{ flex: 1, minWidth: 0, color: index === -1 ? 'var(--fg-faint)' : 'var(--fg)' }}>
                {CSV_FIELD_LABEL[field]}
                {field === 'code' && <span style={{ color: 'var(--danger)' }}> *</span>}
              </span>
              <select
                className="r-input"
                style={{ width: 150, height: 24, borderColor: detected ? 'var(--ok)' : undefined }}
                value={String(index)}
                onChange={(e) => onChange(field, Number(e.target.value))}
              >
                <option value="-1">— ninguna —</option>
                {headers.map((header, i) => (
                  <option key={`${header}-${i}`} value={String(i)}>
                    {header || `(col ${i + 1})`}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function IssueReport({ issues }: { issues: { line: number; field: string; message: string; value: string }[] }) {
  const shown = issues.slice(0, 50);
  return (
    <div style={{ border: '1px solid var(--danger)', borderRadius: 7, overflow: 'hidden' }}>
      <div
        style={{
          padding: '6px 9px',
          background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
          color: 'var(--danger)',
          fontWeight: 600,
          fontSize: 12,
        }}
      >
        {issues.length} error(es). No se va a escribir nada hasta corregirlos.
      </div>
      <div style={{ maxHeight: 240, overflow: 'auto' }}>
        <table className="r-table">
          <thead>
            <tr>
              <th className="r-th" style={{ width: 60 }}>
                Línea
              </th>
              <th className="r-th" style={{ width: 150 }}>
                Columna
              </th>
              <th className="r-th">Problema</th>
              <th className="r-th" style={{ width: 140 }}>
                Valor
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((issue, i) => (
              <tr key={`${issue.line}-${issue.field}-${i}`} className="r-row">
                <td className="r-td num">{issue.line}</td>
                <td className="r-td">{issue.field}</td>
                <td className="r-td" style={{ whiteSpace: 'normal' }}>
                  {issue.message}
                </td>
                <td className="r-td" style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-muted)' }}>
                  {issue.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {issues.length > shown.length && (
        <div style={{ ...FIELD_HINT, padding: '5px 9px' }}>… y {issues.length - shown.length} más.</div>
      )}
    </div>
  );
}

function RowPreview({ plan }: { plan: NonNullable<ReturnType<typeof buildImportPlan>> }) {
  const rows = plan.units.slice(0, 8);
  if (rows.length === 0) return null;
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden' }}>
      <table className="r-table">
        <thead>
          <tr>
            <th className="r-th">Código</th>
            <th className="r-th">Grupo</th>
            <th className="r-th">Tipo</th>
            <th className="r-th">Estado</th>
            <th className="r-th" style={{ textAlign: 'right' }}>
              m² total
            </th>
            <th className="r-th" style={{ textAlign: 'right' }}>
              Precio
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((unit) => (
            <tr key={unit.code} className="r-row">
              <td className="r-td" style={{ fontFamily: 'var(--font-mono)' }}>
                {unit.code}
              </td>
              <td className="r-td">{unit.groupCode ?? '—'}</td>
              <td className="r-td">{unit.typeName ?? '—'}</td>
              <td className="r-td">{STATUS_LABEL[unit.status]}</td>
              <td className="r-td num" style={{ textAlign: 'right' }}>
                {unit.areaTotalM2 ?? '—'}
              </td>
              <td className="r-td num" style={{ textAlign: 'right' }}>
                {unit.price ? `${unit.price.amount.toLocaleString('es')} ${unit.price.currency}` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {plan.units.length > rows.length && (
        <div style={{ ...FIELD_HINT, padding: '5px 9px' }}>
          … y {plan.units.length - rows.length} fila(s) más.
        </div>
      )}
    </div>
  );
}
