/**
 * Estado del editor y su reducer.
 *
 * Todo cambio pasa por `applyAction`, que devuelve el estado nuevo JUNTO con
 * los parches de immer y sus inversos. El historial no guarda copias del estado
 * (con 600 polígonos serían megabytes por paso) sino esos parches: deshacer es
 * aplicar el inverso.
 *
 * El reducer es puro y determinista a propósito — los ids nuevos los provee
 * quien llama, no `crypto.randomUUID()` acá adentro. Así el mismo test corre
 * dos veces y da lo mismo.
 */
import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer';
import { clampPoint, deltaBetween, insertVertexAfter, removeVertexAt, ringCenter, translateRing, MIN_RING } from './geom.ts';
import type { GeomSpace, Pt } from './records.ts';

enablePatches();

export type EditorMode = 'select' | 'draw' | 'edit';

export interface DraftHotspot {
  id: string;
  unitCode: string | null;
  ring: Pt[];
  label: string | null;
  zIndex: number;
}

export interface EditorState {
  space: GeomSpace;
  sceneId: string;
  byId: Record<string, DraftHotspot>;
  /** Orden de dibujo y de recorrido. El último es el de arriba. */
  order: string[];
  mode: EditorMode;
  /** La unidad manda: se elige primero y el polígono que se dibuje es suyo. */
  selectedUnitCode: string | null;
  selectedHotspotId: string | null;
  selectedVertex: number | null;
  /** Anillo en curso mientras se dibuja. null = no se está dibujando. */
  drawing: Pt[] | null;
  snapEnabled: boolean;
  snapToleranceDeg: number;
  showLabels: boolean;
  /** Modo de trabajo por defecto: la lista muestra sólo lo que falta. */
  onlyWithoutPolygon: boolean;
}

export interface ImportOp {
  id: string;
  unitCode: string | null;
  ring: Pt[];
  label: string | null;
  /** Id de un hotspot existente que este reemplaza. */
  replaces: string | null;
}

export type Action =
  | { type: 'selectUnit'; code: string | null }
  | { type: 'selectHotspot'; id: string | null }
  | { type: 'selectVertex'; index: number | null }
  | { type: 'setMode'; mode: EditorMode }
  | { type: 'addVertex'; point: Pt }
  | { type: 'popVertex' }
  | { type: 'cancelDraw' }
  | { type: 'closeDraw'; id: string }
  | { type: 'moveVertex'; id: string; index: number; point: Pt }
  | { type: 'insertVertex'; id: string; index: number; point: Pt }
  | { type: 'deleteVertex'; id: string; index: number }
  | { type: 'translate'; id: string; dx: number; dy: number }
  | { type: 'setRing'; id: string; ring: Pt[] }
  | { type: 'assign'; id: string; unitCode: string | null }
  | { type: 'setLabel'; id: string; label: string | null }
  | { type: 'deleteHotspot'; id: string }
  | { type: 'duplicate'; id: string; newId: string; unitCode: string | null; dx: number; dy: number }
  | { type: 'importHotspots'; ops: ImportOp[]; label?: string }
  | { type: 'toggleSnap' }
  | { type: 'setSnapTolerance'; deg: number }
  | { type: 'toggleLabels' }
  | { type: 'toggleOnlyWithout' };

export function createState(init: {
  sceneId: string;
  space: GeomSpace;
  hotspots: readonly DraftHotspot[];
}): EditorState {
  const byId: Record<string, DraftHotspot> = {};
  const order: string[] = [];
  for (const h of init.hotspots) {
    byId[h.id] = { ...h, ring: [...h.ring] };
    order.push(h.id);
  }
  return {
    space: init.space,
    sceneId: init.sceneId,
    byId,
    order,
    mode: 'select',
    selectedUnitCode: null,
    selectedHotspotId: null,
    selectedVertex: null,
    drawing: null,
    snapEnabled: true,
    snapToleranceDeg: 2,
    showLabels: true,
    onlyWithoutPolygon: true,
  };
}

/* ── consultas ─────────────────────────────────────────────────────────── */

export function hotspotsOf(state: EditorState): DraftHotspot[] {
  return state.order.map((id) => state.byId[id]).filter((h): h is DraftHotspot => h !== undefined);
}

export function hotspotForUnit(state: EditorState, unitCode: string | null): DraftHotspot | null {
  if (!unitCode) return null;
  for (const id of state.order) {
    const h = state.byId[id];
    if (h && h.unitCode === unitCode) return h;
  }
  return null;
}

/** Códigos con polígono en ESTA escena. Alimenta el indicador ● del panel. */
export function codesWithPolygon(state: EditorState): Set<string> {
  const out = new Set<string>();
  for (const id of state.order) {
    const h = state.byId[id];
    if (h?.unitCode) out.add(h.unitCode);
  }
  return out;
}

/* ── reducer ───────────────────────────────────────────────────────────── */

/**
 * Muta el borrador. Recibe el draft de immer tipado como `EditorState`: los
 * `Pt` son tuplas readonly y nunca se mutan in situ (siempre se reemplaza la
 * tupla entera), así que el tipo mutable no miente sobre lo que pasa acá.
 */
function mutate(s: EditorState, a: Action): void {
  switch (a.type) {
    case 'selectUnit': {
      s.selectedUnitCode = a.code;
      const existing = hotspotForUnit(s, a.code);
      s.selectedHotspotId = existing?.id ?? null;
      s.selectedVertex = null;
      // Cambiar de unidad tira el trazo a medias: es siempre un descuido, y
      // dejarlo vivo haría que el vértice siguiente cayera en la unidad nueva.
      s.drawing = null;
      if (s.mode === 'edit' && !existing) s.mode = 'select';
      return;
    }
    case 'selectHotspot': {
      s.selectedHotspotId = a.id;
      s.selectedVertex = null;
      const h = a.id ? s.byId[a.id] : undefined;
      if (h) s.selectedUnitCode = h.unitCode;
      return;
    }
    case 'selectVertex':
      s.selectedVertex = a.index;
      return;

    case 'setMode': {
      if (a.mode !== 'draw') s.drawing = null;
      if (a.mode === 'draw') s.drawing = s.drawing ?? [];
      if (a.mode === 'edit' && !s.selectedHotspotId) return;
      s.mode = a.mode;
      s.selectedVertex = null;
      return;
    }

    case 'addVertex': {
      const ring = s.drawing ?? [];
      s.drawing = [...ring, clampPoint(s.space, a.point)];
      s.mode = 'draw';
      return;
    }
    case 'popVertex': {
      if (!s.drawing || s.drawing.length === 0) return;
      s.drawing = s.drawing.slice(0, -1);
      return;
    }
    case 'cancelDraw':
      s.drawing = null;
      s.mode = 'select';
      return;

    case 'closeDraw': {
      const ring = s.drawing ?? [];
      if (ring.length < MIN_RING) return;
      s.byId[a.id] = {
        id: a.id,
        unitCode: s.selectedUnitCode,
        ring: [...ring],
        label: null,
        zIndex: 1,
      };
      s.order.push(a.id);
      s.drawing = null;
      s.selectedHotspotId = a.id;
      s.selectedVertex = null;
      // Se queda en `draw`: el flujo real es dibujar, saltar con `n` a la
      // siguiente unidad sin polígono y seguir dibujando sin tocar nada.
      return;
    }

    case 'moveVertex': {
      const h = s.byId[a.id];
      if (!h || a.index < 0 || a.index >= h.ring.length) return;
      h.ring[a.index] = clampPoint(s.space, a.point);
      return;
    }
    case 'insertVertex': {
      const h = s.byId[a.id];
      if (!h) return;
      h.ring = insertVertexAfter(h.ring, a.index, clampPoint(s.space, a.point));
      s.selectedVertex = (a.index + 1) % h.ring.length;
      return;
    }
    case 'deleteVertex': {
      const h = s.byId[a.id];
      if (!h) return;
      const next = removeVertexAt(h.ring, a.index);
      if (next.length === h.ring.length) return; // no se pudo (mínimo 3)
      h.ring = next;
      s.selectedVertex = null;
      return;
    }
    case 'translate': {
      const h = s.byId[a.id];
      if (!h) return;
      h.ring = translateRing(s.space, h.ring, a.dx, a.dy);
      return;
    }
    case 'setRing': {
      const h = s.byId[a.id];
      if (!h || a.ring.length < MIN_RING) return;
      h.ring = a.ring.map((p) => clampPoint(s.space, p));
      return;
    }

    case 'assign': {
      const h = s.byId[a.id];
      if (!h) return;
      // Una unidad, un polígono por escena: si la unidad ya tenía otro, se
      // libera. Sin esto quedan dos polígonos peleando por el mismo lote.
      if (a.unitCode) {
        for (const id of s.order) {
          const other = s.byId[id];
          if (other && other.id !== a.id && other.unitCode === a.unitCode) other.unitCode = null;
        }
      }
      h.unitCode = a.unitCode;
      return;
    }
    case 'setLabel': {
      const h = s.byId[a.id];
      if (!h) return;
      h.label = a.label;
      return;
    }

    case 'deleteHotspot': {
      if (!s.byId[a.id]) return;
      delete s.byId[a.id];
      s.order = s.order.filter((id) => id !== a.id);
      if (s.selectedHotspotId === a.id) {
        s.selectedHotspotId = null;
        s.selectedVertex = null;
        if (s.mode === 'edit') s.mode = 'select';
      }
      return;
    }

    case 'duplicate': {
      const src = s.byId[a.id];
      if (!src) return;
      if (a.unitCode) {
        for (const id of s.order) {
          const other = s.byId[id];
          if (other && other.unitCode === a.unitCode) other.unitCode = null;
        }
      }
      s.byId[a.newId] = {
        id: a.newId,
        unitCode: a.unitCode,
        ring: translateRing(s.space, src.ring, a.dx, a.dy),
        label: null,
        zIndex: src.zIndex,
      };
      s.order.push(a.newId);
      s.selectedHotspotId = a.newId;
      s.selectedUnitCode = a.unitCode ?? s.selectedUnitCode;
      s.selectedVertex = null;
      s.drawing = null;
      // Queda listo para arrastrarlo a su lugar: ese es el punto del atajo.
      s.mode = 'edit';
      return;
    }

    case 'importHotspots': {
      // Los N ops entran en UNA sola pasada de immer y por lo tanto en un solo
      // PatchSet: 400 polígonos mal mapeados se revierten con un ⌘Z.
      for (const op of a.ops) {
        if (op.replaces && s.byId[op.replaces]) {
          delete s.byId[op.replaces];
          s.order = s.order.filter((id) => id !== op.replaces);
        }
        if (op.unitCode) {
          for (const id of s.order) {
            const other = s.byId[id];
            if (other && other.unitCode === op.unitCode) other.unitCode = null;
          }
        }
        s.byId[op.id] = {
          id: op.id,
          unitCode: op.unitCode,
          ring: op.ring.map((p) => clampPoint(s.space, p)),
          label: op.label,
          zIndex: 1,
        };
        s.order.push(op.id);
      }
      return;
    }

    case 'toggleSnap':
      s.snapEnabled = !s.snapEnabled;
      return;
    case 'setSnapTolerance':
      s.snapToleranceDeg = Math.max(0.1, Math.min(20, a.deg));
      return;
    case 'toggleLabels':
      s.showLabels = !s.showLabels;
      return;
    case 'toggleOnlyWithout':
      s.onlyWithoutPolygon = !s.onlyWithoutPolygon;
      return;
  }
}

/* ── etiquetas legibles del historial ──────────────────────────────────── */

export function labelFor(action: Action, state: EditorState): string {
  switch (action.type) {
    case 'closeDraw':
      return state.selectedUnitCode ? `Dibujar ${state.selectedUnitCode}` : 'Dibujar polígono';
    case 'moveVertex':
      return 'Mover vértice';
    case 'insertVertex':
      return 'Insertar vértice';
    case 'deleteVertex':
      return 'Borrar vértice';
    case 'translate':
      return 'Mover polígono';
    case 'setRing':
      return 'Editar polígono';
    case 'assign':
      return action.unitCode ? `Asignar a ${action.unitCode}` : 'Desasignar';
    case 'setLabel':
      return 'Cambiar etiqueta';
    case 'deleteHotspot': {
      const h = state.byId[action.id];
      return h?.unitCode ? `Borrar ${h.unitCode}` : 'Borrar polígono';
    }
    case 'duplicate':
      return action.unitCode ? `Duplicar en ${action.unitCode}` : 'Duplicar polígono';
    case 'importHotspots':
      return action.label ?? `Importar ${action.ops.length} polígonos`;
    case 'addVertex':
      return 'Agregar vértice';
    case 'popVertex':
      return 'Deshacer vértice';
    default:
      return action.type;
  }
}

/** Rutas de estado que hay que guardar. El resto es UI y no ensucia nada. */
const PERSISTED_ROOTS = new Set(['byId', 'order']);

export interface Applied {
  state: EditorState;
  patches: Patch[];
  inverse: Patch[];
  label: string;
  /** true si el cambio toca geometría o asignación (dispara el autosave). */
  persists: boolean;
  changed: boolean;
}

export function applyAction(state: EditorState, action: Action): Applied {
  const label = labelFor(action, state);
  const [next, patches, inverse] = produceWithPatches(state, (draft) => {
    mutate(draft as unknown as EditorState, action);
  });
  return {
    state: next,
    patches,
    inverse,
    label,
    changed: patches.length > 0,
    persists: patches.some((p) => PERSISTED_ROOTS.has(String(p.path[0]))),
  };
}

export function applyPatchList(state: EditorState, patches: readonly Patch[]): EditorState {
  return applyPatches(state, patches as Patch[]);
}

export function patchesTouchData(patches: readonly Patch[]): boolean {
  return patches.some((p) => PERSISTED_ROOTS.has(String(p.path[0])));
}
