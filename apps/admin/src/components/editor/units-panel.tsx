'use client';

/**
 * Panel izquierdo: el trabajo pendiente.
 *
 * El filtro «solo sin polígono» viene ENCENDIDO por defecto porque ese es el
 * modo de trabajo real: se abre el editor para completar lo que falta, no para
 * contemplar lo hecho. La barra de progreso, en cambio, siempre mide contra el
 * total del proyecto — si el denominador se moviera con el filtro, no habría
 * forma de saber cuánto falta de verdad.
 */
import { useEffect, useRef } from 'react';
import { STATUS_TOKENS } from '@r360/core';
import { GEOM_GLYPH, SELECTED_GLYPH, type UnitsModel } from '@/lib/editor/units.ts';

export function UnitsPanel({
  model,
  selected,
  onlyWithout,
  search,
  onSelect,
  onToggleOnlyWithout,
  onSearch,
}: {
  model: UnitsModel;
  selected: string | null;
  onlyWithout: boolean;
  search: string;
  onSelect: (code: string) => void;
  onToggleOnlyWithout: () => void;
  onSearch: (value: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // La navegación es con teclado (`n`/`p`/`j`/`k`): si la unidad seleccionada
  // se sale de la vista, el operador pierde el hilo de dónde está.
  useEffect(() => {
    if (!selected) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-code="${CSS.escape(selected)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const pct = model.total === 0 ? 0 : (model.withPolygon / model.total) * 100;
  const done = model.withPolygon === model.total && model.total > 0;

  return (
    <aside className="ed-units">
      <div className="ed-head">Unidades</div>

      <div className="ed-sub">
        <label className="ed-check">
          <input type="checkbox" checked={onlyWithout} onChange={onToggleOnlyWithout} />
          solo sin polígono
        </label>
      </div>

      <div className="ed-sub">
        <input
          className="ed-input"
          placeholder="Filtrar por código…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          // El editor entero escucha el teclado; mientras se escribe acá los
          // atajos de una tecla tienen que quedarse quietos.
          data-editor-input="true"
        />
      </div>

      <div className="ed-progress">
        <span className="tnum">
          {model.withPolygon}/{model.total}
        </span>
        <div className="ed-bar">
          <span style={{ width: `${pct}%`, background: done ? 'var(--ed-ok)' : 'var(--ed-accent)' }} />
        </div>
        <span style={{ color: 'var(--ed-faint)' }}>{Math.round(pct)} %</span>
      </div>

      <div className="ed-tree" ref={listRef}>
        {model.groups.length === 0 && (
          <p className="ed-empty">
            {onlyWithout
              ? 'No queda ninguna unidad sin polígono en esta escena. Destildá «solo sin polígono» para revisar las hechas.'
              : 'Este proyecto no tiene unidades cargadas.'}
          </p>
        )}

        {model.groups.map((group) => (
          <div key={group.id}>
            <div className="ed-group" title={`${group.name}: ${group.withPolygon} de ${group.total} con polígono`}>
              <b>{group.code}</b>
              <span className="ed-group__count">
                {group.withPolygon}/{group.total}
              </span>
            </div>
            {group.units.map(({ unit, geom }) => {
              const isSelected = unit.code === selected;
              return (
                <button
                  key={unit.id}
                  type="button"
                  className="ed-unit"
                  data-code={unit.code}
                  data-selected={isSelected}
                  onClick={() => onSelect(unit.code)}
                  title={`${unit.code} · ${STATUS_TOKENS[unit.status].label} · ${GLYPH_TITLE[geom]}`}
                >
                  <span
                    className="ed-unit__glyph"
                    style={{ color: `var(--st-${unit.status})` }}
                    aria-hidden
                  >
                    {isSelected ? SELECTED_GLYPH : GEOM_GLYPH[geom]}
                  </span>
                  <span className="ed-unit__code">{unit.code}</span>
                  {unit.areaTotalM2 !== null && (
                    <span className="ed-unit__m2 tnum">{Math.round(unit.areaTotalM2)} m²</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}

const GLYPH_TITLE = {
  none: 'sin polígono en ninguna escena',
  other: 'tiene polígono en otra escena',
  here: 'tiene polígono en esta escena',
} as const;
