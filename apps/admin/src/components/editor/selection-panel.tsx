'use client';

/**
 * Panel derecho: qué está seleccionado y qué se puede hacer con eso.
 *
 * Muestra el aviso de auto-intersección como AVISO y no como bloqueo: un
 * polígono en moño se dibuja igual y hay que poder verlo para arreglarlo, no
 * quedarse trabado sin entender por qué el editor no deja seguir.
 */
import { STATUS_TOKENS, UNIT_STATUSES, type UnitStatus } from '@r360/core';
import type { UnitRow } from '@/lib/data/types.ts';
import type { DraftHotspot } from '@/lib/editor/state.ts';

export function SelectionPanel({
  unit,
  hotspot,
  selfIntersects,
  onDuplicate,
  onDelete,
  onFocus,
  onStatus,
  onUnassign,
  canDuplicate,
}: {
  unit: UnitRow | null;
  hotspot: DraftHotspot | null;
  selfIntersects: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
  onFocus: () => void;
  onStatus: (status: UnitStatus) => void;
  onUnassign: () => void;
  canDuplicate: boolean;
}) {
  return (
    <aside className="ed-selection">
      <div className="ed-head">Selección</div>

      {!unit && !hotspot && (
        <p className="ed-empty">
          Elegí una unidad en la lista de la izquierda y dibujá su polígono. Con <span className="ed-kbd">n</span> saltás
          a la siguiente que todavía no tiene.
        </p>
      )}

      {unit && (
        <>
          <div className="ed-field">
            <div className="ed-field__label">Unidad</div>
            <div className="ed-field__value" style={{ fontWeight: 600 }}>
              {unit.code}
            </div>
            <div style={{ color: 'var(--ed-faint)', fontSize: 11 }}>
              {[unit.groupCode, unit.typeName].filter(Boolean).join(' · ') || '—'}
            </div>
          </div>

          <div className="ed-field">
            <div className="ed-field__label">Estado</div>
            <div className="ed-statuses">
              {UNIT_STATUSES.map((status, i) => (
                <button
                  key={status}
                  type="button"
                  className="ed-btn"
                  data-on={unit.status === status}
                  onClick={() => onStatus(status)}
                  title={`${STATUS_TOKENS[status].label} — tecla ${i + 1}`}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: `var(--st-${status})`,
                      flex: 'none',
                    }}
                  />
                  {STATUS_TOKENS[status].label}
                </button>
              ))}
            </div>
          </div>

          {unit.areaTotalM2 !== null && (
            <div className="ed-field">
              <div className="ed-field__label">Superficie</div>
              <div className="ed-field__value tnum">{unit.areaTotalM2} m²</div>
            </div>
          )}
        </>
      )}

      {hotspot && (
        <>
          <div className="ed-field">
            <div className="ed-field__label">Polígono</div>
            <div className="ed-field__value tnum">{hotspot.ring.length} vértices</div>
            {hotspot.unitCode === null && (
              <div style={{ color: '#f07ac8', fontSize: 11, marginTop: 2 }}>Sin unidad asignada</div>
            )}
          </div>

          {selfIntersects && (
            <div className="ed-warn">
              El contorno se cruza consigo mismo. Se va a dibujar igual, pero el relleno queda partido: revisá el orden
              de los vértices.
            </div>
          )}

          <div className="ed-field">
            <div className="ed-row ed-row--wrap">
              <button
                type="button"
                className="ed-btn"
                onClick={onDuplicate}
                disabled={!canDuplicate}
                title={
                  canDuplicate
                    ? 'Copia el polígono y lo asigna a la siguiente unidad sin polígono del mismo grupo (⌘D)'
                    : 'No queda ninguna unidad sin polígono a la que asignar la copia'
                }
              >
                Duplicar <span className="ed-kbd">⌘D</span>
              </button>
              <button type="button" className="ed-btn" onClick={onFocus} title="Centrar la vista en el polígono (f)">
                Centrar <span className="ed-kbd">f</span>
              </button>
            </div>
            <div className="ed-row ed-row--wrap" style={{ marginTop: 6 }}>
              {hotspot.unitCode && (
                <button type="button" className="ed-btn" onClick={onUnassign} title="Deja el polígono sin unidad">
                  Desasignar
                </button>
              )}
              <button type="button" className="ed-btn" data-variant="danger" onClick={onDelete}>
                Borrar <span className="ed-kbd">⌫</span>
              </button>
            </div>
          </div>
        </>
      )}

      {unit && !hotspot && (
        <div className="ed-field">
          <p style={{ color: 'var(--ed-faint)', fontSize: 11, lineHeight: 1.5, margin: 0 }}>
            <b style={{ color: 'var(--ed-fg)' }}>{unit.code}</b> todavía no tiene polígono en esta escena. Apretá{' '}
            <span className="ed-kbd">d</span> y hacé click en cada esquina; <span className="ed-kbd">Enter</span> lo
            cierra y queda asignado.
          </p>
        </div>
      )}
    </aside>
  );
}
