'use client';

/**
 * El editor completo: lista de unidades, lienzo, panel de selección y barra de
 * estado, con el teclado como interfaz principal.
 *
 * La mecánica es UNIDAD PRIMERO. Se elige la unidad y se dibuja su polígono; al
 * cerrarlo la asignación ya está hecha, sin ningún paso de emparejamiento
 * posterior. `n` salta a la siguiente unidad sin polígono, ignorando las
 * completas, y el modo dibujo se mantiene: se puede recorrer un loteo entero de
 * 640 lotes sin usar el mouse para navegar.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { STATUS_TOKENS, type UnitStatus } from '@r360/core';
import type { GroupRow, SceneRow, UnitRow } from '@/lib/data/types.ts';
import { SAVE_LABEL } from '@/lib/editor/autosave.ts';
import { ringAreaApprox, selfIntersects } from '@/lib/editor/geom.ts';
import type { HotspotRow, Pt } from '@/lib/editor/records.ts';
import { resolveSceneImage } from '@/lib/editor/scene-image.ts';
import { findSnap, type SnapHit, type SnapTarget } from '@/lib/editor/snap.ts';
import { codesWithPolygon, hotspotsOf, type DraftHotspot, type ImportOp } from '@/lib/editor/state.ts';
import { buildUnitsModel, nextWithoutPolygon, nextWithoutPolygonInGroup, neighbour } from '@/lib/editor/units.ts';
import type { PolyStatus } from '@/lib/editor/style.ts';
import type { CanvasApi, RenderPoly } from './canvas.ts';
import { EditOverlay } from './edit-overlay.tsx';
import { HelpOverlay } from './help-overlay.tsx';
import { ImportDialog } from './import-dialog.tsx';
import { SelectionPanel } from './selection-panel.tsx';
import { UnitsPanel } from './units-panel.tsx';
import { useEditor } from './use-editor.ts';
import './editor.css';

/**
 * Los dos lienzos se cargan SOLO en el navegador.
 *
 * Photo Sphere Viewer y Leaflet tocan `window` en la carga del módulo, y Next
 * renderiza los componentes de cliente también en el servidor: con un import
 * normal, la primera respuesta del editor es un 500. `ssr: false` también evita
 * mandar al navegador el lienzo que esta escena no usa.
 */
const PanoCanvas = dynamic(() => import('./pano-canvas.tsx').then((m) => m.PanoCanvas), {
  ssr: false,
  loading: () => <CanvasLoading />,
});
const PlanCanvas = dynamic(() => import('./plan-canvas.tsx').then((m) => m.PlanCanvas), {
  ssr: false,
  loading: () => <CanvasLoading />,
});

function CanvasLoading() {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--ed-faint)' }}>
      Cargando la escena…
    </div>
  );
}

export interface EditorScreenProps {
  tenant: string;
  projectSlug: string;
  projectId: string;
  scene: SceneRow;
  units: UnitRow[];
  groups: GroupRow[];
  /** Hotspots de TODAS las escenas del proyecto (para el indicador ◐). */
  allHotspots: HotspotRow[];
}

const MODE_KEYS: Record<string, 'select' | 'draw' | 'edit'> = { v: 'select', d: 'draw', a: 'edit' };
const STATUS_KEYS: Record<string, UnitStatus> = {
  '1': 'disponible',
  '2': 'reservado',
  '3': 'vendido',
  '4': 'bloqueado',
  '5': 'no_disponible',
};

export function EditorScreen(props: EditorScreenProps) {
  const { projectId, scene, units, groups, allHotspots, tenant, projectSlug } = props;
  const router = useRouter();
  const image = useMemo(() => resolveSceneImage(scene), [scene]);

  const initial = useMemo<DraftHotspot[]>(
    () =>
      allHotspots
        .filter((h) => h.sceneId === scene.id)
        .map((h) => ({ id: h.id, unitCode: h.unitCode, ring: h.geometry, label: h.label, zIndex: h.zIndex })),
    [allHotspots, scene.id],
  );

  /** Códigos con polígono en OTRA escena: alimenta el ◐ del panel izquierdo. */
  const codesElsewhere = useMemo(() => {
    const set = new Set<string>();
    for (const h of allHotspots) if (h.sceneId !== scene.id && h.unitCode) set.add(h.unitCode);
    return set;
  }, [allHotspots, scene.id]);

  const ed = useEditor({ projectId, sceneId: scene.id, space: image.space, initial });
  const { state, dispatch } = ed;

  const [api, setApi] = useState<CanvasApi | null>(null);
  const [version, setVersion] = useState(0);
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [search, setSearch] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [panning, setPanning] = useState(false);
  const [statusRow, setStatusRow] = useState<Record<string, UnitStatus>>({});
  // ⌥ sostenido desactiva el imantado momentáneamente. Va en una ref porque lo
  // lee el manejador de arrastre, que corre fuera del ciclo de render.
  const altRef = useRef(false);

  const bumpView = useCallback(() => setVersion((v) => v + 1), []);

  /* ── datos derivados ─────────────────────────────────────────────────── */

  const unitsWithLive = useMemo(
    () => units.map((u) => (statusRow[u.id] ? { ...u, status: statusRow[u.id]! } : u)),
    [units, statusRow],
  );

  const codesHere = useMemo(() => codesWithPolygon(state), [state]);
  const codesAnywhere = useMemo(() => new Set([...codesHere, ...codesElsewhere]), [codesHere, codesElsewhere]);

  const model = useMemo(
    () =>
      buildUnitsModel(unitsWithLive, groups, codesHere, codesAnywhere, {
        onlyWithout: state.onlyWithoutPolygon,
        search,
      }),
    [unitsWithLive, groups, codesHere, codesAnywhere, state.onlyWithoutPolygon, search],
  );

  const unitByCode = useMemo(() => new Map(unitsWithLive.map((u) => [u.code, u])), [unitsWithLive]);
  const selectedUnit = state.selectedUnitCode ? unitByCode.get(state.selectedUnitCode) ?? null : null;
  const selectedHotspot = state.selectedHotspotId ? state.byId[state.selectedHotspotId] ?? null : null;

  /**
   * Los polígonos se dibujan de mayor a menor superficie.
   *
   * En un plano, el perímetro del terreno cubre a todos los lotes; si se
   * dibujara al final, cada click caería sobre él y no habría forma de
   * seleccionar un lote con el mouse. Ordenar por tamaño deja siempre arriba al
   * más chico, que es el que uno quiso clickear.
   */
  const polygons = useMemo<RenderPoly[]>(
    () =>
      hotspotsOf(state)
        .map((h) => ({
          id: h.id,
          ring: h.ring,
          status: statusFor(h, unitByCode),
          label: h.unitCode ?? h.label,
          selected: h.id === state.selectedHotspotId,
          area: ringAreaApprox(state.space, h.ring),
        }))
        .sort((a, b) => b.area - a.area)
        .map(({ area: _area, ...poly }) => poly),
    [state, unitByCode],
  );

  const snapTargets = useMemo<SnapTarget[]>(
    () => hotspotsOf(state).map((h) => ({ id: h.id, ring: h.ring })),
    [state],
  );

  /* ── imantado ────────────────────────────────────────────────────────── */

  const snap = useCallback(
    (p: Pt, excludeId: string | null): { point: Pt; hit: SnapHit | null } => {
      const hit = findSnap(p, snapTargets, {
        space: state.space,
        toleranceDeg: state.snapToleranceDeg,
        enabled: state.snapEnabled && !altRef.current,
        excludeId,
      });
      return { point: hit?.point ?? p, hit };
    },
    [snapTargets, state.snapEnabled, state.snapToleranceDeg, state.space],
  );

  const snapForOverlay = useCallback(
    (p: Pt) => snap(p, state.selectedHotspotId),
    [snap, state.selectedHotspotId],
  );

  /* ── acciones ────────────────────────────────────────────────────────── */

  const focusSelection = useCallback(() => {
    const ring = selectedHotspot?.ring;
    if (ring && ring.length > 0) api?.focus(ring);
  }, [api, selectedHotspot]);

  const selectUnit = useCallback(
    (code: string | null) => {
      dispatch({ type: 'selectUnit', code });
      if (!code) return;
      // Si la unidad ya tiene polígono, se lo centra: es lo que uno quiere al
      // saltar a una unidad hecha para revisarla.
      const existing = hotspotsOf(state).find((h) => h.unitCode === code);
      if (existing) api?.focus(existing.ring);
    },
    [api, dispatch, state],
  );

  const jump = useCallback(
    (direction: 1 | -1) => {
      const code = nextWithoutPolygon(model.ordered, codesHere, state.selectedUnitCode, direction);
      if (!code) {
        ed.notify('No queda ninguna unidad sin polígono en esta escena.');
        return;
      }
      selectUnit(code);
    },
    [codesHere, ed, model.ordered, selectUnit, state.selectedUnitCode],
  );

  const duplicate = useCallback(() => {
    const source = selectedHotspot;
    if (!source) {
      ed.notify('No hay ningún polígono seleccionado para duplicar.');
      return;
    }
    const target = nextWithoutPolygonInGroup(unitsWithLive, codesHere, source.unitCode ?? state.selectedUnitCode);
    if (!target) {
      ed.notify('No queda ninguna unidad sin polígono a la que asignar la copia.');
      return;
    }
    // El desplazamiento es del ancho del propio polígono: la copia cae al lado,
    // no encima, que es donde va el lote siguiente de una misma fila.
    const [dx, dy] = offsetFor(source.ring);
    dispatch({
      type: 'duplicate',
      id: source.id,
      newId: newId('dup'),
      unitCode: target,
      dx,
      dy,
    });
    ed.notify(`Duplicado en ${target} — arrastrá ✥ para ubicarlo`);
  }, [codesHere, dispatch, ed, selectedHotspot, state.selectedUnitCode, unitsWithLive]);

  const removeSelection = useCallback(() => {
    if (state.mode === 'edit' && state.selectedVertex !== null && state.selectedHotspotId) {
      dispatch({ type: 'deleteVertex', id: state.selectedHotspotId, index: state.selectedVertex });
      return;
    }
    if (state.selectedHotspotId) dispatch({ type: 'deleteHotspot', id: state.selectedHotspotId });
  }, [dispatch, state.mode, state.selectedHotspotId, state.selectedVertex]);

  const setStatus = useCallback(
    async (status: UnitStatus) => {
      const unit = selectedUnit;
      if (!unit) return;
      // Optimista: el estado se ve al toque y se revierte si el servidor
      // rechaza. Cambiar de estado mientras se dibuja no puede frenar la mano.
      const before = unit.status;
      setStatusRow((r) => ({ ...r, [unit.id]: status }));
      try {
        const res = await fetch(`/api/p/${encodeURIComponent(projectId)}/units/${encodeURIComponent(unit.id)}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        if (!res.ok) throw new Error(String(res.status));
        ed.notify(`${unit.code} → ${STATUS_TOKENS[status].label}`);
      } catch {
        setStatusRow((r) => ({ ...r, [unit.id]: before }));
        ed.notify(`No se pudo cambiar el estado de ${unit.code}`);
      }
    },
    [ed, projectId, selectedUnit],
  );

  const applyImport = useCallback(
    (ops: ImportOp[], label: string) => {
      setShowImport(false);
      if (ops.length === 0) return;
      dispatch({ type: 'importHotspots', ops, label });
      ed.notify(`${label} — ⌘Z lo revierte entero`);
    },
    [dispatch, ed],
  );

  /* ── lienzo ──────────────────────────────────────────────────────────── */

  const onPick = useCallback(
    (point: Pt, hotspotId: string | null) => {
      if (state.mode === 'draw') {
        dispatch({ type: 'addVertex', point: snap(point, null).point });
        return;
      }
      if (hotspotId) {
        dispatch({ type: 'selectHotspot', id: hotspotId });
        return;
      }
      if (state.mode === 'select') dispatch({ type: 'selectHotspot', id: null });
    },
    [dispatch, snap, state.mode],
  );

  const onCommit = useCallback(() => {
    if (state.mode !== 'draw') return;
    closeRing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.mode, state.drawing]);

  const closeRing = useCallback(() => {
    if (!state.drawing || state.drawing.length < 3) {
      ed.notify('Un polígono necesita al menos 3 vértices.');
      return;
    }
    dispatch({ type: 'closeDraw', id: newId('hs') });
    if (state.selectedUnitCode) {
      // El flujo entero: cerrar y saltar al siguiente pendiente sin soltar el
      // teclado. Sin esto habría que volver a la lista con el mouse en cada lote.
      const next = nextWithoutPolygon(model.ordered, new Set([...codesHere, state.selectedUnitCode]), state.selectedUnitCode);
      if (next) dispatch({ type: 'selectUnit', code: next });
      else ed.notify('Escena completa: todas las unidades tienen polígono.');
    }
  }, [codesHere, dispatch, ed, model.ordered, state.drawing, state.selectedUnitCode]);

  const onCanvasPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!api || state.mode !== 'draw') return;
      const p = api.fromClient(e.clientX, e.clientY);
      setCursor(p ? snap(p, null).point : null);
    },
    [api, snap, state.mode],
  );

  /* ── teclado ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      // Mientras se escribe en un campo, las teclas sueltas son texto.
      if (target?.closest('[data-editor-input="true"], input, textarea, select')) {
        if (e.key === 'Escape') target.blur();
        return;
      }
      if (e.key === 'Alt') altRef.current = true;

      const meta = e.metaKey || e.ctrlKey;
      if (meta) {
        const key = e.key.toLowerCase();
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) ed.redo();
          else ed.undo();
          return;
        }
        if (key === 's') {
          e.preventDefault();
          void ed.save();
          ed.notify('Guardado forzado');
          return;
        }
        if (key === 'd') {
          e.preventDefault();
          duplicate();
          return;
        }
        if (key === 'i') {
          e.preventDefault();
          setShowImport(true);
          return;
        }
        return;
      }

      if (e.key === ' ' && !e.repeat) {
        setPanning(true);
        return;
      }
      if (e.key === 'Escape') {
        if (showHelp) setShowHelp(false);
        else if (showImport) setShowImport(false);
        else dispatch({ type: 'cancelDraw' });
        return;
      }
      if (showHelp || showImport) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        closeRing();
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        if (state.mode === 'draw' && state.drawing && state.drawing.length > 0) dispatch({ type: 'popVertex' });
        else removeSelection();
        return;
      }
      if (e.key === '?') {
        setShowHelp(true);
        return;
      }

      const key = e.key.toLowerCase();
      if (MODE_KEYS[key]) {
        dispatch({ type: 'setMode', mode: MODE_KEYS[key]! });
        return;
      }
      if (key === 'n') return jump(1);
      if (key === 'p') return jump(-1);
      if (key === 'j' || key === 'k') {
        const code = neighbour(model.ordered, state.selectedUnitCode, key === 'j' ? 1 : -1);
        if (code) selectUnit(code);
        return;
      }
      if (key === 'f') return focusSelection();
      if (key === 's') return dispatch({ type: 'toggleSnap' });
      if (key === 'l') return dispatch({ type: 'toggleLabels' });
      if (STATUS_KEYS[key]) {
        void setStatus(STATUS_KEYS[key]!);
        return;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') altRef.current = false;
      if (e.key === ' ') setPanning(false);
    };

    /*
     * En FASE DE CAPTURA, no de burbujeo.
     *
     * Este editor se opera con el teclado, y abajo hay dos bibliotecas con vida
     * propia (Photo Sphere Viewer y Leaflet) más el navegador. Escuchando al
     * final de la cadena, cualquiera de ellas puede quedarse con un atajo antes
     * que nosotros y el síntoma es una tecla que "a veces no anda". Capturando
     * primero, el editor decide siempre — y el filtro de arriba es el que le
     * devuelve las teclas a los campos de texto cuando corresponde.
     */
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, [
    closeRing,
    dispatch,
    duplicate,
    ed,
    focusSelection,
    jump,
    model.ordered,
    removeSelection,
    selectUnit,
    setStatus,
    showHelp,
    showImport,
    state.drawing,
    state.mode,
    state.selectedUnitCode,
  ]);

  /* ── render ──────────────────────────────────────────────────────────── */

  const hotspotIdByUnitCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of hotspotsOf(state)) if (h.unitCode) map.set(h.unitCode, h.id);
    return map;
  }, [state]);

  const broken = selectedHotspot ? selfIntersects(state.space, selectedHotspot.ring) : false;
  const canDuplicate =
    selectedHotspot !== null &&
    nextWithoutPolygonInGroup(unitsWithLive, codesHere, selectedHotspot.unitCode ?? state.selectedUnitCode) !== null;

  return (
    <div className="ed">
      <UnitsPanel
        model={model}
        selected={state.selectedUnitCode}
        onlyWithout={state.onlyWithoutPolygon}
        search={search}
        onSelect={selectUnit}
        onToggleOnlyWithout={() => dispatch({ type: 'toggleOnlyWithout' })}
        onSearch={setSearch}
      />

      <div
        className="ed-canvas"
        onPointerMove={onCanvasPointerMove}
        style={{ cursor: state.mode === 'draw' ? 'crosshair' : panning ? 'grab' : 'default' }}
      >
        {image.space === 'sph' ? (
          <PanoCanvas
            url={image.url}
            polygons={polygons}
            showLabels={state.showLabels}
            drawing={state.mode === 'draw'}
            onReady={setApi}
            onViewChange={bumpView}
            onPick={onPick}
            onCommit={onCommit}
          />
        ) : (
          <PlanCanvas
            url={image.url}
            width={image.width}
            height={image.height}
            polygons={polygons}
            showLabels={state.showLabels}
            drawing={state.mode === 'draw'}
            onReady={setApi}
            onViewChange={bumpView}
            onPick={onPick}
            onCommit={onCommit}
          />
        )}

        <EditOverlay
          api={api}
          version={version}
          space={state.space}
          mode={state.mode}
          drawing={state.drawing}
          ring={selectedHotspot?.ring ?? null}
          selectedVertex={state.selectedVertex}
          cursor={cursor}
          snap={snapForOverlay}
          onVertexDragStart={() => ed.beginTxn('Mover vértice')}
          onVertexDrag={(index, point) => {
            if (state.selectedHotspotId) dispatch({ type: 'moveVertex', id: state.selectedHotspotId, index, point });
          }}
          onInsertVertex={(afterIndex, point) => {
            if (state.selectedHotspotId)
              dispatch({ type: 'insertVertex', id: state.selectedHotspotId, index: afterIndex, point });
          }}
          onTranslateStart={() => ed.beginTxn('Mover polígono')}
          onTranslate={(dx, dy) => {
            if (state.selectedHotspotId) dispatch({ type: 'translate', id: state.selectedHotspotId, dx, dy });
          }}
          onDragEnd={ed.endTxn}
          onSelectVertex={(index) => dispatch({ type: 'selectVertex', index })}
        />

        <div className="ed-modes">
          {(['select', 'draw', 'edit'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className="ed-btn"
              data-on={state.mode === mode}
              onClick={() => dispatch({ type: 'setMode', mode })}
              title={MODE_TITLE[mode]}
            >
              {MODE_LABEL[mode]} <span className="ed-kbd">{MODE_KEY[mode]}</span>
            </button>
          ))}
          <span style={{ width: 8 }} />
          <button type="button" className="ed-btn" onClick={() => setShowImport(true)} title="Importar GeoJSON (⌘I)">
            Importar
          </button>
          <button type="button" className="ed-btn" onClick={() => setShowHelp(true)} title="Atajos (?)">
            ?
          </button>
          <button
            type="button"
            className="ed-btn"
            onClick={() => {
              void ed.save().then(() => router.push(`/t/${tenant}/p/${projectSlug}/scenes`));
            }}
            title="Guardar y volver a la lista de escenas"
          >
            Salir
          </button>
        </div>

        {image.isFallback && (
          <div className="ed-banner" style={{ top: 44 }}>
            Esta escena no tiene imagen publicada: se está dibujando sobre la imagen de demostración.
          </div>
        )}

        {ed.recovery && (
          <div className="ed-banner">
            <span>
              Hay un borrador local sin guardar ({ed.recovery.hotspots.length} polígonos
              {ed.recovery.lastLabel ? `, último paso: ${ed.recovery.lastLabel}` : ''}).
            </span>
            <button type="button" className="ed-btn" data-variant="primary" onClick={ed.acceptRecovery}>
              Recuperar
            </button>
            <button type="button" className="ed-btn" onClick={ed.dismissRecovery}>
              Descartar
            </button>
          </div>
        )}

        {ed.toast && <div className="ed-toast">{ed.toast}</div>}
      </div>

      <SelectionPanel
        unit={selectedUnit}
        hotspot={selectedHotspot}
        selfIntersects={broken}
        canDuplicate={canDuplicate}
        onDuplicate={duplicate}
        onDelete={removeSelection}
        onFocus={focusSelection}
        onStatus={(s) => void setStatus(s)}
        onUnassign={() => {
          if (state.selectedHotspotId) dispatch({ type: 'assign', id: state.selectedHotspotId, unitCode: null });
        }}
      />

      <div className="ed-status">
        <span>
          <b>{scene.name}</b> · {scene.kind}
        </span>
        <span>
          modo <b>{MODE_LABEL[state.mode]}</b>
          {panning ? ' (desplazando)' : ''}
        </span>
        <span>
          {state.mode === 'draw'
            ? `${state.drawing?.length ?? 0} vértices en curso`
            : selectedHotspot
              ? `${selectedHotspot.ring.length} vértices`
              : '—'}
        </span>
        <span>
          snap{' '}
          <b style={{ color: state.snapEnabled && !altRef.current ? 'var(--ed-ok)' : 'var(--ed-faint)' }}>
            {state.snapEnabled ? `${state.snapToleranceDeg}°` : 'off'}
          </b>
        </span>
        <span>zoom {api ? api.zoomLabel() : '—'}</span>
        <span className="ed-status__spacer" />
        {ed.undoLabel && <span style={{ color: 'var(--ed-faint)' }}>⌘Z: {ed.undoLabel}</span>}
        <span>
          <b style={{ color: SAVE_COLOR[ed.saveState] }}>{SAVE_LABEL[ed.saveState]}</b>
        </span>
      </div>

      {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}
      {showImport && (
        <ImportDialog
          space={state.space}
          unitCodes={units.map((u) => u.code)}
          hotspotIdByUnitCode={hotspotIdByUnitCode}
          onCancel={() => setShowImport(false)}
          onApply={applyImport}
        />
      )}
    </div>
  );
}

const MODE_LABEL = { select: 'seleccionar', draw: 'dibujar', edit: 'vértices' } as const;
const MODE_KEY = { select: 'v', draw: 'd', edit: 'a' } as const;
const MODE_TITLE = {
  select: 'Seleccionar polígonos (v)',
  draw: 'Dibujar: click agrega vértice, Enter cierra (d)',
  edit: 'Editar vértices del polígono seleccionado (a)',
} as const;

const SAVE_COLOR: Record<string, string> = {
  clean: 'var(--ed-faint)',
  dirty: 'var(--ed-warn)',
  saving: 'var(--ed-accent)',
  saved: 'var(--ed-ok)',
  error: '#ff9d9d',
};

/**
 * Color del polígono. Un hotspot sin unidad NO se pinta como "no disponible":
 * se pinta con el color de alerta del editor, para que no se publique un
 * polígono huérfano creyendo que es un lote bloqueado.
 */
function statusFor(h: DraftHotspot, unitByCode: ReadonlyMap<string, UnitRow>): PolyStatus {
  if (!h.unitCode) return 'unassigned';
  return unitByCode.get(h.unitCode)?.status ?? 'unassigned';
}

/** Desplazamiento del duplicado: un ancho hacia la derecha del propio polígono. */
function offsetFor(ring: readonly Pt[]): [number, number] {
  let minX = Infinity;
  let maxX = -Infinity;
  for (const [x] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  const width = Number.isFinite(maxX - minX) ? maxX - minX : 0;
  return [width > 0 ? width * 1.05 : 0.02, 0];
}

let counter = 0;
function newId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}
