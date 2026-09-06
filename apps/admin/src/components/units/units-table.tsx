'use client';

import { STATUS_TOKENS, UNIT_STATUSES, type UnitStatus } from '@r360/core';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StatusDot } from '@/components/status.tsx';
import type { Actor, UnitPatch, UnitRow } from '@/lib/data/types.ts';
import type { SortKey } from '@/lib/units/query.ts';
import { canEditUnitAttributes } from '@/lib/roles.ts';

export const ROW_HEIGHT = 32;

/**
 * `field` acota la opacidad de "guardando" a la celda que cambió — apagar la
 * fila entera esconde también lo que no se tocó (§6.2). `reason` viaja al
 * `title` de la fila fallida para que el motivo del rollback no quede oculto.
 */
export interface RowState {
  kind: 'pending' | 'failed';
  field?: string;
  reason?: string;
}

export interface AttrColumn {
  key: string;
  title: string;
}

export interface UnitsTableProps {
  rows: UnitRow[];
  actor: Actor;
  attrColumns: AttrColumn[];
  isSelected: (code: string) => boolean;
  onToggle: (code: string, shiftKey: boolean) => void;
  cursor: number;
  onCursor: (index: number) => void;
  onOpen: (code: string) => void;
  onEdit: (unit: UnitRow, patch: UnitPatch) => void;
  rowStates: Record<string, RowState | undefined>;
  sort: SortKey;
  dir: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
  loading: boolean;
  /** true mientras se refetchea con datos previos en pantalla (§7.2). */
  fetching?: boolean;
  onClearFilters?: () => void;
}

function fmtM2(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('es-UY', { maximumFractionDigits: 2 });
}

function fmtAttr(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'sí' : 'no';
  return String(value);
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/**
 * Tabla de unidades: filas de 32px, virtualizada, columna de código sticky.
 * TanStack Table sólo maneja el modelo de columnas — el filtrado, el orden y
 * el paginado son del servidor, y la fuente de verdad de todo eso es la URL.
 */
export function UnitsTable(props: UnitsTableProps) {
  const { rows, actor, attrColumns, isSelected, onToggle, cursor, onCursor, onOpen, onEdit, rowStates, sort, dir, onSort } =
    props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<{ code: string; field: 'status' | 'area' } | null>(null);
  const [hoveredHeader, setHoveredHeader] = useState<string | null>(null);
  // m² y atributos: Administrador y Gestor los editan, igual que Vrotta; el
  // resto de la tabla (grupo, tipo, código) es sólo lectura para la
  // inmobiliaria — eso lo garantiza el trigger `units_tenant_update_guard` en
  // la base, acá sólo se evita ofrecer un control que la base va a rechazar.
  const editaAtributos = canEditUnitAttributes(actor);

  const columns = useMemo<ColumnDef<UnitRow>[]>(() => {
    const base: ColumnDef<UnitRow>[] = [
      {
        id: 'select',
        size: 28,
        header: () => null,
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={isSelected(row.original.code)}
            onChange={() => undefined}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(row.original.code, e.shiftKey);
            }}
            aria-label={`Seleccionar ${row.original.code}`}
          />
        ),
      },
      {
        id: 'code',
        size: 108,
        header: 'Código',
        cell: ({ row }) => (
          <button
            type="button"
            className="r360-code-btn"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(row.original.code);
            }}
            title={`Abrir ${row.original.code}`}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}
          >
            {row.original.code}
          </button>
        ),
      },
      {
        id: 'status',
        size: 128,
        header: 'Estado',
        cell: ({ row }) => {
          const unit = row.original;
          if (editing?.code === unit.code && editing.field === 'status') {
            return (
              <select
                autoFocus
                className="r-input"
                style={{ height: 24 }}
                defaultValue={unit.status}
                onBlur={() => setEditing(null)}
                onChange={(e) => {
                  const next = e.target.value as UnitStatus;
                  setEditing(null);
                  if (next !== unit.status) onEdit(unit, { status: next });
                }}
              >
                {UNIT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_TOKENS[s].label}
                  </option>
                ))}
              </select>
            );
          }
          return (
            <button
              type="button"
              onDoubleClick={() => setEditing({ code: unit.code, field: 'status' })}
              title="Doble click para cambiar"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                height: 20,
                padding: '0 8px',
                borderRadius: 999,
                background: `color-mix(in srgb, var(--st-${unit.status}) 10%, transparent)`,
                color: 'var(--fg)',
              }}
            >
              <StatusDot status={unit.status} />
              {STATUS_TOKENS[unit.status].label}
            </button>
          );
        },
      },
      { id: 'group', size: 72, header: 'Grupo', cell: ({ row }) => row.original.groupCode ?? '—' },
      { id: 'type', size: 120, header: 'Tipo', cell: ({ row }) => row.original.typeName ?? '—' },
      {
        id: 'area',
        size: 84,
        header: 'm²',
        cell: ({ row }) => {
          const unit = row.original;
          if (editing?.code === unit.code && editing.field === 'area') {
            return (
              <input
                autoFocus
                className="r-input tnum"
                style={{ height: 24, textAlign: 'right' }}
                defaultValue={unit.areaTotalM2 ?? ''}
                inputMode="decimal"
                onBlur={(e) => {
                  setEditing(null);
                  const raw = e.target.value.trim();
                  const next = raw === '' ? null : Number(raw.replace(',', '.'));
                  if (next !== unit.areaTotalM2 && (next === null || Number.isFinite(next))) {
                    onEdit(unit, { areaTotalM2: next });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') {
                    e.currentTarget.value = String(unit.areaTotalM2 ?? '');
                    setEditing(null);
                  }
                }}
              />
            );
          }
          return (
            <button
              type="button"
              className="tnum"
              onDoubleClick={() => editaAtributos && setEditing({ code: unit.code, field: 'area' })}
              disabled={!editaAtributos}
              style={{ width: '100%', textAlign: 'right', cursor: editaAtributos ? 'pointer' : 'default' }}
              title={editaAtributos ? 'Doble click para editar' : undefined}
            >
              {fmtM2(unit.areaTotalM2)}
            </button>
          );
        },
      },
      {
        id: 'price',
        size: 112,
        header: 'Precio vigente',
        cell: ({ row }) => {
          const price = row.original.price;
          const isPublic = price?.visibility === 'public';
          return (
            <span
              className="tnum"
              style={{ display: 'block', textAlign: 'right' }}
              title={price ? `Visibilidad: ${price.visibility}` : 'Sin precio vigente'}
            >
              {price ? (
                <>
                  <span style={{ color: 'var(--fg-muted)' }}>{price.currency} </span>
                  <span style={{ color: isPublic ? 'var(--fg)' : 'var(--fg-muted)' }}>
                    {price.amount.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
                  </span>
                </>
              ) : (
                <span style={{ color: 'var(--fg-faint)' }}>—</span>
              )}
            </span>
          );
        },
      },
      {
        id: 'polygon',
        size: 44,
        header: '◇',
        cell: ({ row }) => (
          // Tener polígono es un dato, no un éxito: nada de verde semántico
          // acá (§6.6). El verde queda para --ui-ok y para "disponible".
          <span
            title={row.original.hasPolygon ? 'Tiene polígono' : 'Sin polígono: no se puede tocar en el recorrido'}
            style={{ color: row.original.hasPolygon ? 'var(--fg-muted)' : 'var(--fg-faint)' }}
          >
            {row.original.hasPolygon ? '◆' : '◇'}
          </span>
        ),
      },
    ];

    for (const attr of attrColumns) {
      base.push({
        id: `attr:${attr.key}`,
        size: 92,
        header: attr.title,
        cell: ({ row }) => <span>{fmtAttr(row.original.attrs[attr.key])}</span>,
      });
    }

    base.push({
      id: 'updated',
      size: 84,
      header: 'Actualizado',
      cell: ({ row }) => (
        <span className="tnum" style={{ color: 'var(--fg-muted)' }}>
          {fmtDate(row.original.updatedAt)}
        </span>
      ),
    });

    return base;
  }, [attrColumns, editaAtributos, editing, isSelected, onEdit, onOpen, onToggle]);

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    manualFiltering: true,
  });

  const modelRows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: modelRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  // j/k tiene que arrastrar el scroll: si el cursor se va de pantalla, navegar
  // a ciegas es peor que no tener atajo.
  useEffect(() => {
    if (cursor >= 0 && cursor < modelRows.length) virtualizer.scrollToIndex(cursor, { align: 'auto' });
  }, [cursor, modelRows.length, virtualizer]);

  const SORTABLE: Partial<Record<string, SortKey>> = {
    code: 'code',
    status: 'status',
    group: 'group',
    type: 'type',
    area: 'area',
    price: 'price',
    updated: 'updated',
  };

  const totalWidth = columns.reduce((acc, column) => acc + (column.size ?? 90), 0);

  const showSkeleton = props.loading && modelRows.length === 0;

  return (
    <div
      ref={scrollRef}
      style={{
        flex: 1,
        overflow: 'auto',
        position: 'relative',
        opacity: props.fetching && !showSkeleton ? 0.6 : 1,
        transition: 'opacity 100ms ease-out',
      }}
    >
      {/* Estilos acotados a esta tabla: hover del código y el punto de
         "guardando" pulsante (§6.6, §6.2). No van en globals.css a
         propósito — son detalle de esta pantalla, no del sistema. */}
      <style>{`
        .r360-code-btn:hover { color: var(--accent); }
        @keyframes r360-pulse { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
        .r360-pending-dot { animation: r360-pulse 1s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .r360-pending-dot { animation: none; } }
      `}</style>
      <div style={{ minWidth: totalWidth }}>
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 3,
            display: 'flex',
            background: 'var(--bg-subtle)',
          }}
        >
          {table.getHeaderGroups().map((headerGroup) =>
            headerGroup.headers.map((header) => {
              const sortKey = SORTABLE[header.column.id];
              const active = sortKey === sort;
              const hovered = hoveredHeader === header.column.id;
              return (
                <div
                  key={header.id}
                  className="r-th"
                  style={{
                    width: header.column.columnDef.size,
                    flex: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    position: header.column.id === 'code' ? 'sticky' : undefined,
                    left: header.column.id === 'code' ? 28 : undefined,
                    zIndex: header.column.id === 'code' ? 4 : undefined,
                    background: 'var(--bg-subtle)',
                    cursor: sortKey ? 'pointer' : 'default',
                    color: active ? 'var(--fg)' : undefined,
                  }}
                  onClick={() => sortKey && onSort(sortKey)}
                  onMouseEnter={() => sortKey && setHoveredHeader(header.column.id)}
                  onMouseLeave={() => setHoveredHeader(null)}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {active && <span style={{ marginLeft: 3 }}>{dir === 'asc' ? '↑' : '↓'}</span>}
                  {!active && sortKey && (
                    <span
                      style={{ marginLeft: 3, color: 'var(--fg-faint)', opacity: hovered ? 1 : 0 }}
                      aria-hidden
                    >
                      ↕
                    </span>
                  )}
                </div>
              );
            }),
          )}
        </div>

        {showSkeleton && (
          <div>
            {Array.from({ length: 12 }, (_, i) => (
              <div
                key={i}
                style={{ display: 'flex', alignItems: 'center', gap: 10, height: ROW_HEIGHT, padding: '0 8px' }}
              >
                <div style={{ width: 16, height: 12, borderRadius: 3, background: 'var(--bg-sunken)' }} />
                <div style={{ width: 70, height: 12, borderRadius: 3, background: 'var(--bg-sunken)' }} />
                <div style={{ width: 90, height: 12, borderRadius: 3, background: 'var(--bg-sunken)' }} />
                <div style={{ width: 50, height: 12, borderRadius: 3, background: 'var(--bg-sunken)' }} />
                <div style={{ width: 60, height: 12, borderRadius: 3, background: 'var(--bg-sunken)' }} />
              </div>
            ))}
          </div>
        )}

        {!showSkeleton && (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = modelRows[virtualRow.index];
              if (!row) return null;
              const unit = row.original;
              const state = rowStates[unit.code];
              const isPending = state?.kind === 'pending';
              const isFailed = state?.kind === 'failed';
              return (
                <div
                  key={row.id}
                  className="r-row"
                  data-selected={isSelected(unit.code)}
                  data-cursor={virtualRow.index === cursor}
                  data-failed={isFailed}
                  title={isFailed && state?.reason ? state.reason : undefined}
                  onClick={() => onCursor(virtualRow.index)}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: ROW_HEIGHT,
                    transform: `translateY(${virtualRow.start}px)`,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {row.getVisibleCells().map((cell) => {
                    const cellPending = isPending && (!state?.field || state.field === cell.column.id);
                    return (
                      <div
                        key={cell.id}
                        className="r-td"
                        style={{
                          width: cell.column.columnDef.size,
                          flex: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          height: ROW_HEIGHT,
                          position: cell.column.id === 'code' ? 'sticky' : undefined,
                          left: cell.column.id === 'code' ? 28 : undefined,
                          zIndex: cell.column.id === 'code' ? 2 : undefined,
                          background: cell.column.id === 'code' ? 'inherit' : undefined,
                          justifyContent:
                            cell.column.id === 'area' || cell.column.id === 'price' ? 'flex-end' : undefined,
                          opacity: cellPending ? 0.55 : 1,
                        }}
                      >
                        {cell.column.id === 'code' && isPending && (
                          <span
                            className="r360-pending-dot"
                            aria-hidden
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: 999,
                              background: 'var(--fg-faint)',
                              flex: 'none',
                            }}
                          />
                        )}
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {modelRows.length === 0 && !props.loading && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              padding: '48px 20px',
              color: 'var(--fg-muted)',
              textAlign: 'center',
            }}
          >
            <span style={{ fontSize: 28, color: 'var(--fg-faint)' }} aria-hidden>
              ⌕
            </span>
            <span>Ninguna unidad coincide con el filtro.</span>
            {props.onClearFilters && (
              <button type="button" className="r-btn" onClick={props.onClearFilters}>
                Limpiar filtros
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
