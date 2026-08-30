'use client';

/**
 * Superposición de edición: tiradores de vértice, puntos medios, agarre de
 * movimiento, línea elástica del trazo en curso e indicador de imantado.
 *
 * Va por encima del lienzo pero con `pointer-events: none`, y sólo los
 * tiradores reactivan el puntero. Así, arrastrar sobre la panorámica la rota
 * (que es lo que uno espera) y arrastrar sobre un vértice lo mueve, sin que el
 * visor vea nunca ese gesto: el `stopPropagation` del `pointerdown` del tirador
 * es lo que evita que la vista gire mientras se ajusta un vértice.
 *
 * Es la MISMA superposición para la panorámica y para el plano. Lo único que
 * cambia es de dónde sale `toScreen`.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { deltaBetween, midpoints } from '@/lib/editor/geom.ts';
import type { GeomSpace, Pt } from '@/lib/editor/records.ts';
import type { SnapHit } from '@/lib/editor/snap.ts';
import type { EditorMode } from '@/lib/editor/state.ts';
import type { CanvasApi, ScreenPoint } from './canvas.ts';

export interface OverlayProps {
  api: CanvasApi | null;
  /** Se incrementa con cada cambio de vista para reproyectar los tiradores. */
  version: number;
  space: GeomSpace;
  mode: EditorMode;
  drawing: readonly Pt[] | null;
  ring: readonly Pt[] | null;
  selectedVertex: number | null;
  /** Posición del puntero en coordenadas de escena, para la línea elástica. */
  cursor: Pt | null;
  /** Aplica el imantado y cuenta si hubo enganche (para dibujar el anillo). */
  snap: (p: Pt) => { point: Pt; hit: SnapHit | null };
  onVertexDragStart: () => void;
  onVertexDrag: (index: number, point: Pt) => void;
  onInsertVertex: (afterIndex: number, point: Pt) => void;
  onTranslateStart: () => void;
  onTranslate: (dx: number, dy: number) => void;
  onDragEnd: () => void;
  onSelectVertex: (index: number | null) => void;
}

type Drag =
  | { kind: 'vertex'; index: number }
  | { kind: 'move'; last: Pt }
  | null;

export function EditOverlay(props: OverlayProps) {
  const { api, version, space, mode, drawing, ring, selectedVertex, cursor } = props;
  const dragRef = useRef<Drag>(null);
  const [snapHit, setSnapHit] = useState<SnapHit | null>(null);

  // `version` fuerza el recálculo cuando la cámara se mueve: las posiciones de
  // pantalla dependen de la vista, no sólo de la geometría.
  const project = useCallback(
    (p: Pt): ScreenPoint | null => (api ? api.toScreen(p) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, version],
  );

  const editing = mode === 'edit' && ring !== null && ring.length > 0;
  const vertexPoints = useMemo(() => (editing ? ring!.map(project) : []), [editing, ring, project]);
  const midPoints = useMemo(
    () => (editing ? midpoints(space, ring!).map(project) : []),
    [editing, ring, space, project],
  );
  const drawPoints = useMemo(() => (drawing ?? []).map(project), [drawing, project]);

  const pointFrom = useCallback(
    (e: React.PointerEvent | PointerEvent): Pt | null => (api ? api.fromClient(e.clientX, e.clientY) : null),
    [api],
  );

  const finish = useCallback(() => {
    dragRef.current = null;
    setSnapHit(null);
    props.onDragEnd();
  }, [props]);

  const handleMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const raw = pointFrom(e);
      if (!raw) return;

      if (drag.kind === 'vertex') {
        const { point, hit } = props.snap(raw);
        setSnapHit(hit);
        props.onVertexDrag(drag.index, point);
        return;
      }
      // Mover el polígono entero NO imanta: imantar el conjunto haría saltar
      // todos los vértices a la vez y es imposible de controlar.
      const [dx, dy] = deltaBetween(space, drag.last, raw);
      dragRef.current = { kind: 'move', last: raw };
      props.onTranslate(dx, dy);
    },
    [pointFrom, props, space],
  );

  const startVertex = useCallback(
    (index: number) => (e: React.PointerEvent<HTMLElement>) => {
      // Sin esto el visor recibe el gesto y rota la panorámica mientras se
      // arrastra el vértice.
      e.stopPropagation();
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { kind: 'vertex', index };
      props.onSelectVertex(index);
      props.onVertexDragStart();
    },
    [props],
  );

  const startMid = useCallback(
    (index: number) => (e: React.PointerEvent<HTMLElement>) => {
      e.stopPropagation();
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const raw = pointFrom(e);
      if (!raw) return;
      // Arrastrar un punto medio inserta el vértice y sigue arrastrándolo: el
      // insertar y el mover son un solo gesto y por lo tanto un solo paso.
      props.onVertexDragStart();
      props.onInsertVertex(index, props.snap(raw).point);
      dragRef.current = { kind: 'vertex', index: index + 1 };
    },
    [pointFrom, props],
  );

  const startMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      e.stopPropagation();
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const raw = pointFrom(e);
      if (!raw) return;
      dragRef.current = { kind: 'move', last: raw };
      props.onTranslateStart();
    },
    [pointFrom, props],
  );

  const center = useMemo(() => {
    if (!editing || !ring) return null;
    const pts = vertexPoints.filter((p): p is ScreenPoint => p !== null && p.visible);
    if (pts.length === 0) return null;
    return {
      x: pts.reduce((a, p) => a + p.x, 0) / pts.length,
      y: pts.reduce((a, p) => a + p.y, 0) / pts.length,
    };
  }, [editing, ring, vertexPoints]);

  const snapScreen = snapHit ? project(snapHit.point) : null;
  const cursorScreen = cursor ? project(cursor) : null;

  return (
    <div className="ed-overlay" onPointerMove={handleMove} onPointerUp={finish} onPointerCancel={finish}>
      <svg>
        {/* Trazo en curso: los segmentos ya puestos, y la línea elástica hasta
            el puntero para ver dónde caería el próximo vértice. */}
        {drawPoints.length > 1 && (
          <polyline
            points={drawPoints
              .filter((p): p is ScreenPoint => p !== null && p.visible)
              .map((p) => `${p.x},${p.y}`)
              .join(' ')}
            fill="none"
            stroke="#4c8dff"
            strokeWidth={2}
          />
        )}
        {drawPoints.length > 0 && cursorScreen?.visible && lastVisible(drawPoints) && (
          <line
            x1={lastVisible(drawPoints)!.x}
            y1={lastVisible(drawPoints)!.y}
            x2={cursorScreen.x}
            y2={cursorScreen.y}
            stroke="#4c8dff"
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
        )}
        {/* Con 3 o más vértices, la línea de cierre muestra qué polígono
            quedaría al apretar Enter. */}
        {drawPoints.length > 2 && drawPoints[0]?.visible && cursorScreen?.visible && (
          <line
            x1={cursorScreen.x}
            y1={cursorScreen.y}
            x2={drawPoints[0]!.x}
            y2={drawPoints[0]!.y}
            stroke="#4c8dff"
            strokeWidth={1}
            strokeDasharray="2 5"
            opacity={0.6}
          />
        )}
      </svg>

      {drawPoints.map((p, i) =>
        p && p.visible ? (
          <div
            key={`d${i}`}
            className="ed-handle"
            data-kind="draw"
            style={{ left: p.x, top: p.y, cursor: 'default' }}
          />
        ) : null,
      )}

      {editing &&
        midPoints.map((p, i) =>
          p && p.visible ? (
            <div
              key={`m${i}`}
              className="ed-handle"
              data-kind="mid"
              title="Arrastrar para insertar un vértice"
              style={{ left: p.x, top: p.y }}
              onPointerDown={startMid(i)}
            />
          ) : null,
        )}

      {editing &&
        vertexPoints.map((p, i) =>
          p && p.visible ? (
            <div
              key={`v${i}`}
              className="ed-handle"
              data-kind="vertex"
              data-selected={selectedVertex === i}
              style={{ left: p.x, top: p.y }}
              onPointerDown={startVertex(i)}
            />
          ) : null,
        )}

      {editing && center && (
        <div
          className="ed-handle"
          data-kind="move"
          title="Arrastrar para mover el polígono entero"
          style={{ left: center.x, top: center.y }}
          onPointerDown={startMove}
        >
          ✥
        </div>
      )}

      {snapScreen?.visible && <div className="ed-snap" style={{ left: snapScreen.x, top: snapScreen.y }} />}
    </div>
  );
}

function lastVisible(points: readonly (ScreenPoint | null)[]): ScreenPoint | null {
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const p = points[i];
    if (p && p.visible) return p;
  }
  return null;
}
