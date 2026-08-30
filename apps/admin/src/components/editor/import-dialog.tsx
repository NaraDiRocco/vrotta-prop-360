'use client';

/**
 * Importación de GeoJSON en tres pasos: archivo → mapeo → conflictos.
 *
 * La pantalla de conflictos es el punto entero de este diálogo. Un GeoJSON de
 * agrimensor nunca calza perfecto contra el listado de ventas, y el error caro
 * no es el ruidoso sino el silencioso: 400 polígonos que entran asignados a la
 * unidad de al lado y nadie se entera hasta que un cliente pregunta por el lote
 * que no es. Por eso los cuatro grupos se muestran siempre, con su acción a la
 * vista, y los tres que no son «coinciden y están libres» arrancan en «omitir».
 */
import { useCallback, useMemo, useState } from 'react';
import { buildCodeIndex } from '@/lib/editor/codes.ts';
import {
  ACTION_LABEL,
  GROUP_ACTIONS,
  GROUP_LABEL,
  assignRowUnit,
  buildImportOps,
  classifyFeatures,
  parseGeoJson,
  readCode,
  setGroupAction,
  setRowAction,
  suggestCodeProperty,
  summarize,
  type ImportAction,
  type ImportGroup,
  type ImportRow,
  type ParsedGeoJson,
} from '@/lib/editor/geojson-import.ts';
import type { GeomSpace } from '@/lib/editor/records.ts';
import type { ImportOp } from '@/lib/editor/state.ts';

const GROUP_ORDER: ImportGroup[] = ['match_free', 'match_taken', 'no_unit', 'no_code'];

export function ImportDialog({
  space,
  unitCodes,
  hotspotIdByUnitCode,
  onCancel,
  onApply,
}: {
  space: GeomSpace;
  unitCodes: readonly string[];
  hotspotIdByUnitCode: ReadonlyMap<string, string>;
  onCancel: () => void;
  onApply: (ops: ImportOp[], label: string) => void;
}) {
  const [parsed, setParsed] = useState<ParsedGeoJson | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [codeProperty, setCodeProperty] = useState<string | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const index = useMemo(() => buildCodeIndex(unitCodes), [unitCodes]);

  const reclassify = useCallback(
    (doc: ParsedGeoJson, property: string | null) => {
      setCodeProperty(property);
      setRows(classifyFeatures(doc.features, property, unitCodes, hotspotIdByUnitCode, space));
    },
    [hotspotIdByUnitCode, space, unitCodes],
  );

  const onFile = useCallback(
    async (file: File) => {
      setError(null);
      try {
        const doc = parseGeoJson(await file.text(), space);
        if (doc.features.length === 0) {
          setError('El archivo no tiene ningún polígono utilizable.');
          return;
        }
        setParsed(doc);
        setFileName(file.name);
        reclassify(doc, suggestCodeProperty(doc.features, index));
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [index, reclassify, space],
  );

  const summary = useMemo(() => summarize(rows), [rows]);
  const step = parsed === null ? 1 : 2;

  const apply = useCallback(() => {
    if (!parsed) return;
    const stamp = Date.now().toString(36);
    const ops = buildImportOps(rows, parsed.features, (i) => `imp-${stamp}-${i}`);
    onApply(ops, `Importar ${ops.length} polígonos de ${fileName || 'GeoJSON'}`);
  }, [fileName, onApply, parsed, rows]);

  return (
    <div className="ed-modal-bg" role="presentation">
      <div className="ed-modal">
        <div className="ed-modal__head">
          Importar GeoJSON
          <div className="ed-steps" style={{ marginLeft: 12 }}>
            <span data-on={step === 1}>1 · archivo</span>
            <span>›</span>
            <span data-on={step === 2}>2 · mapeo y conflictos</span>
          </div>
          <button type="button" className="ed-btn" style={{ marginLeft: 'auto' }} onClick={onCancel}>
            Cancelar
          </button>
        </div>

        <div className="ed-modal__body">
          {error && <div className="ed-warn">{error}</div>}

          {!parsed && (
            <div style={{ padding: '18px 4px' }}>
              <p style={{ color: 'var(--ed-muted)', fontSize: 12, lineHeight: 1.6, marginTop: 0 }}>
                {space === 'px' ? (
                  <>
                    Se esperan coordenadas <b>normalizadas 0..1</b> sobre el master del plano — es lo que produce el
                    pipeline de <code>tools/</code>.
                  </>
                ) : (
                  <>
                    Se esperan coordenadas <b>lon/lat en grados</b>, que se convierten a los radianes de la esfera.
                  </>
                )}
              </p>
              <input
                type="file"
                accept=".geojson,.json,application/geo+json,application/json"
                data-editor-input="true"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onFile(file);
                }}
              />
            </div>
          )}

          {parsed && (
            <>
              <div className="ed-row" style={{ marginBottom: 10 }}>
                <span style={{ color: 'var(--ed-muted)', fontSize: 11 }}>
                  <b style={{ color: 'var(--ed-fg)' }}>{fileName}</b> · {parsed.features.length} polígonos
                </span>
                <span style={{ marginLeft: 12, color: 'var(--ed-muted)', fontSize: 11 }}>Código en la propiedad:</span>
                <select
                  className="ed-input"
                  style={{ width: 180 }}
                  data-editor-input="true"
                  value={codeProperty ?? ''}
                  onChange={(e) => reclassify(parsed, e.target.value || null)}
                >
                  <option value="">— ninguna —</option>
                  {parsed.propertyKeys.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>

              {parsed.warnings.map((w) => (
                <div className="ed-warn" key={w}>
                  {w}
                </div>
              ))}

              {GROUP_ORDER.map((group) => {
                const groupRows = rows.filter((r) => r.group === group);
                return (
                  <div className="ed-groupbox" key={group}>
                    <div className="ed-groupbox__head">
                      <b>{GROUP_LABEL[group]}</b>
                      <span style={{ color: 'var(--ed-faint)' }}>{groupRows.length}</span>
                      {groupRows.length > 0 && (
                        <div className="ed-row" style={{ marginLeft: 'auto' }}>
                          {GROUP_ACTIONS[group].map((action) => (
                            <button
                              key={action}
                              type="button"
                              className="ed-btn"
                              data-on={groupRows.every((r) => r.action === action)}
                              onClick={() => setRows(setGroupAction(rows, group, action))}
                            >
                              {ACTION_LABEL[action]}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {groupRows.length > 0 && (
                      <div className="ed-groupbox__scroll">
                        <table className="ed-table">
                          <thead>
                            <tr>
                              <th style={{ width: 130 }}>Código en el archivo</th>
                              <th style={{ width: 130 }}>Unidad</th>
                              <th style={{ width: 70 }}>Vértices</th>
                              <th>Nota</th>
                              <th style={{ width: 190 }}>Acción</th>
                            </tr>
                          </thead>
                          <tbody>
                            {groupRows.map((row) => (
                              <tr key={row.featureIndex}>
                                <td>{row.rawCode ?? <i style={{ color: 'var(--ed-faint)' }}>— sin código —</i>}</td>
                                <td>
                                  {group === 'no_unit' || group === 'no_code' ? (
                                    <select
                                      className="ed-input"
                                      data-editor-input="true"
                                      value={row.unitCode ?? ''}
                                      onChange={(e) =>
                                        setRows(
                                          assignRowUnit(
                                            rows,
                                            row.featureIndex,
                                            e.target.value || null,
                                            hotspotIdByUnitCode,
                                          ),
                                        )
                                      }
                                    >
                                      <option value="">— sin unidad —</option>
                                      {unitCodes.map((c) => (
                                        <option key={c} value={c}>
                                          {c}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    row.unitCode
                                  )}
                                </td>
                                <td className="tnum">{row.vertices}</td>
                                <td style={{ color: 'var(--ed-faint)', whiteSpace: 'normal' }}>
                                  {noteFor(row)}
                                </td>
                                <td>
                                  <select
                                    className="ed-input"
                                    data-editor-input="true"
                                    value={row.action}
                                    onChange={(e) =>
                                      setRows(setRowAction(rows, row.featureIndex, e.target.value as ImportAction))
                                    }
                                  >
                                    {GROUP_ACTIONS[row.group].map((a) => (
                                      <option key={a} value={a}>
                                        {ACTION_LABEL[a]}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="ed-modal__foot">
          <span style={{ fontSize: 11, color: 'var(--ed-muted)' }}>
            {parsed
              ? `${summary.willImport} a importar · ${summary.willReplace} a reemplazar · ${summary.unassigned} sin unidad · ${summary.willSkip} omitidos`
              : 'Elegí un archivo .geojson'}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ed-faint)' }}>
            Todo entra como un solo paso: <span className="ed-kbd">⌘Z</span> lo revierte entero.
          </span>
          <button
            type="button"
            className="ed-btn"
            data-variant="primary"
            disabled={!parsed || summary.willImport + summary.willReplace + summary.unassigned === 0}
            onClick={apply}
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}

function noteFor(row: ImportRow): string {
  const parts: string[] = [];
  if (row.matchKind === 'normalized') parts.push('emparejado por código normalizado');
  if (row.matchKind === 'ambiguous') parts.push(`ambiguo: ${row.candidates.join(', ')}`);
  if (row.group === 'match_taken') parts.push('la unidad ya tiene polígono en esta escena');
  if (row.selfIntersects) parts.push('el contorno se cruza consigo mismo');
  return parts.join(' · ');
}

export { readCode };
