import { describe, expect, test } from 'vitest';
import {
  applyAction,
  codesWithPolygon,
  createState,
  hotspotForUnit,
  hotspotsOf,
  type Action,
  type EditorState,
} from './state.ts';
import { canRedo, canUndo, emptyHistory, pushEntry, redo, txnAdd, txnEntry, txnStart, undo, undoLabel } from './history.ts';
import type { Pt } from './records.ts';

const SQUARE: Pt[] = [
  [0, 0],
  [0.1, 0],
  [0.1, 0.1],
  [0, 0.1],
];

function base(): EditorState {
  return createState({ sceneId: 's1', space: 'sph', hotspots: [] });
}

/** Aplica una secuencia acumulando en el historial, como hace el hook. */
function run(state: EditorState, actions: Action[]) {
  let s = state;
  let h = emptyHistory();
  for (const a of actions) {
    const r = applyAction(s, a);
    s = r.state;
    if (r.changed) h = pushEntry(h, { label: r.label, patches: r.patches, inverse: r.inverse, persists: r.persists });
  }
  return { state: s, history: h };
}

describe('reducer — dibujo', () => {
  test('la unidad se elige primero y el polígono queda asignado al cerrarlo', () => {
    const { state } = run(base(), [
      { type: 'selectUnit', code: 'B2-A' },
      { type: 'setMode', mode: 'draw' },
      ...SQUARE.map<Action>((p) => ({ type: 'addVertex', point: p })),
      { type: 'closeDraw', id: 'h1' },
    ]);
    const h = hotspotForUnit(state, 'B2-A');
    expect(h?.id).toBe('h1');
    expect(h?.ring).toHaveLength(4);
    // No hay paso de emparejamiento posterior: la asignación ya está hecha.
    expect(state.drawing).toBeNull();
    expect(state.selectedHotspotId).toBe('h1');
  });

  test('sigue en modo dibujo tras cerrar, para encadenar con `n`', () => {
    const { state } = run(base(), [
      { type: 'selectUnit', code: 'B2-A' },
      { type: 'setMode', mode: 'draw' },
      ...SQUARE.map<Action>((p) => ({ type: 'addVertex', point: p })),
      { type: 'closeDraw', id: 'h1' },
    ]);
    expect(state.mode).toBe('draw');
  });

  test('no cierra un polígono de menos de 3 vértices', () => {
    const { state } = run(base(), [
      { type: 'setMode', mode: 'draw' },
      { type: 'addVertex', point: [0, 0] },
      { type: 'addVertex', point: [0.1, 0] },
      { type: 'closeDraw', id: 'h1' },
    ]);
    expect(hotspotsOf(state)).toHaveLength(0);
    expect(state.drawing).toHaveLength(2);
  });

  test('backspace borra el último vértice y Esc cancela el trazo entero', () => {
    const drawn = run(base(), [
      { type: 'setMode', mode: 'draw' },
      ...SQUARE.map<Action>((p) => ({ type: 'addVertex', point: p })),
      { type: 'popVertex' },
    ]);
    expect(drawn.state.drawing).toHaveLength(3);
    const cancelled = applyAction(drawn.state, { type: 'cancelDraw' });
    expect(cancelled.state.drawing).toBeNull();
    expect(cancelled.state.mode).toBe('select');
  });

  test('cambiar de unidad descarta el trazo a medias', () => {
    const { state } = run(base(), [
      { type: 'selectUnit', code: 'B2-A' },
      { type: 'setMode', mode: 'draw' },
      { type: 'addVertex', point: [0, 0] },
      { type: 'addVertex', point: [0.1, 0] },
      { type: 'selectUnit', code: 'B2-B' },
    ]);
    expect(state.drawing).toBeNull();
  });
});

describe('reducer — vértices', () => {
  const withSquare = () =>
    run(base(), [
      { type: 'selectUnit', code: 'B2-A' },
      { type: 'setMode', mode: 'draw' },
      ...SQUARE.map<Action>((p) => ({ type: 'addVertex', point: p })),
      { type: 'closeDraw', id: 'h1' },
    ]).state;

  test('insertar vértice lo mete después del índice indicado', () => {
    const s = applyAction(withSquare(), { type: 'insertVertex', id: 'h1', index: 0, point: [0.05, 0] }).state;
    const ring = s.byId['h1']!.ring;
    expect(ring).toHaveLength(5);
    expect(ring[1]).toEqual([0.05, 0]);
  });

  test('borrar vértice funciona hasta el mínimo de 3 y ahí se planta', () => {
    let s = applyAction(withSquare(), { type: 'deleteVertex', id: 'h1', index: 3 }).state;
    expect(s.byId['h1']!.ring).toHaveLength(3);
    const blocked = applyAction(s, { type: 'deleteVertex', id: 'h1', index: 0 });
    expect(blocked.changed).toBe(false);
    expect(blocked.state.byId['h1']!.ring).toHaveLength(3);
    s = blocked.state;
    expect(hotspotsOf(s)).toHaveLength(1);
  });

  test('mover vértice fuera de rango no hace nada', () => {
    const r = applyAction(withSquare(), { type: 'moveVertex', id: 'h1', index: 9, point: [1, 1] });
    expect(r.changed).toBe(false);
  });

  test('trasladar el polígono corre todos los vértices por igual', () => {
    const s = applyAction(withSquare(), { type: 'translate', id: 'h1', dx: 0.5, dy: -0.2 }).state;
    const ring = s.byId['h1']!.ring;
    expect(ring[0]![0]).toBeCloseTo(0.5, 10);
    expect(ring[0]![1]).toBeCloseTo(-0.2, 10);
    expect(ring[2]![0]).toBeCloseTo(0.6, 10);
  });
});

describe('reducer — asignación', () => {
  test('una unidad no puede tener dos polígonos en la misma escena', () => {
    const s = createState({
      sceneId: 's1',
      space: 'sph',
      hotspots: [
        { id: 'a', unitCode: 'B2-A', ring: SQUARE, label: null, zIndex: 1 },
        { id: 'b', unitCode: 'B2-B', ring: SQUARE, label: null, zIndex: 1 },
      ],
    });
    const next = applyAction(s, { type: 'assign', id: 'b', unitCode: 'B2-A' }).state;
    expect(next.byId['a']!.unitCode).toBeNull();
    expect(next.byId['b']!.unitCode).toBe('B2-A');
    expect(codesWithPolygon(next)).toEqual(new Set(['B2-A']));
  });

  test('duplicar copia la geometría desplazada, asigna la unidad y queda en modo edición', () => {
    const s = createState({
      sceneId: 's1',
      space: 'sph',
      hotspots: [{ id: 'a', unitCode: 'B2-A', ring: SQUARE, label: null, zIndex: 3 }],
    });
    const next = applyAction(s, { type: 'duplicate', id: 'a', newId: 'a2', unitCode: 'B2-B', dx: 0.12, dy: 0 }).state;
    expect(next.byId['a2']!.unitCode).toBe('B2-B');
    expect(next.byId['a2']!.ring[0]![0]).toBeCloseTo(0.12, 10);
    expect(next.byId['a']!.ring[0]![0]).toBe(0); // el original no se movió
    expect(next.mode).toBe('edit');
    expect(next.selectedHotspotId).toBe('a2');
  });

  test('borrar el hotspot seleccionado limpia la selección y sale de edición', () => {
    const s = createState({
      sceneId: 's1',
      space: 'sph',
      hotspots: [{ id: 'a', unitCode: 'B2-A', ring: SQUARE, label: null, zIndex: 1 }],
    });
    const sel = applyAction(s, { type: 'selectHotspot', id: 'a' }).state;
    const edit = applyAction(sel, { type: 'setMode', mode: 'edit' }).state;
    const gone = applyAction(edit, { type: 'deleteHotspot', id: 'a' }).state;
    expect(gone.selectedHotspotId).toBeNull();
    expect(gone.mode).toBe('select');
    expect(hotspotsOf(gone)).toHaveLength(0);
  });
});

describe('qué entra al historial y qué ensucia', () => {
  test('⌘Z deshace TRABAJO, no la vista', () => {
    const s = base();
    // Cambiar de modo, de unidad o apagar etiquetas no son pasos deshacibles:
    // si lo fueran, después de apretar cuatro teclas de modo harían falta
    // cuatro ⌘Z para volver a deshacer el vértice que se movió mal.
    for (const action of [
      { type: 'setMode', mode: 'draw' },
      { type: 'toggleLabels' },
      { type: 'toggleSnap' },
      { type: 'toggleOnlyWithout' },
      { type: 'selectUnit', code: 'B2-A' },
      { type: 'selectVertex', index: 2 },
    ] as Action[]) {
      const r = applyAction(s, action);
      expect({ action: action.type, undoable: r.undoable }).toEqual({ action: action.type, undoable: false });
    }
  });

  test('el trazo en curso SÍ es deshacible aunque no se guarde', () => {
    const drawing = applyAction(base(), { type: 'addVertex', point: [0, 0] });
    expect(drawing.undoable).toBe(true);
    expect(drawing.persists).toBe(false);
  });

  test('la geometría es deshacible y además ensucia', () => {
    const s = createState({
      sceneId: 's1',
      space: 'sph',
      hotspots: [{ id: 'a', unitCode: 'B2-A', ring: SQUARE, label: null, zIndex: 1 }],
    });
    const r = applyAction(s, { type: 'moveVertex', id: 'a', index: 0, point: [0.5, 0.5] });
    expect(r.undoable).toBe(true);
    expect(r.persists).toBe(true);
  });
});

describe('persistencia del cambio', () => {
  test('los cambios de UI no marcan sucio; los de geometría sí', () => {
    const s = base();
    expect(applyAction(s, { type: 'toggleLabels' }).persists).toBe(false);
    expect(applyAction(s, { type: 'setMode', mode: 'draw' }).persists).toBe(false);
    expect(applyAction(s, { type: 'selectUnit', code: 'B2-A' }).persists).toBe(false);

    const drawn = run(s, [
      { type: 'setMode', mode: 'draw' },
      ...SQUARE.map<Action>((p) => ({ type: 'addVertex', point: p })),
    ]).state;
    expect(applyAction(drawn, { type: 'closeDraw', id: 'h1' }).persists).toBe(true);
  });
});

describe('undo / redo', () => {
  test('deshace y rehace un dibujo completo', () => {
    const { state, history } = run(base(), [
      { type: 'selectUnit', code: 'B2-A' },
      { type: 'setMode', mode: 'draw' },
      ...SQUARE.map<Action>((p) => ({ type: 'addVertex', point: p })),
      { type: 'closeDraw', id: 'h1' },
    ]);
    expect(hotspotsOf(state)).toHaveLength(1);
    expect(undoLabel(history)).toBe('Dibujar B2-A');

    const back = undo(state, history)!;
    expect(hotspotsOf(back.state)).toHaveLength(0);
    expect(canRedo(back.history)).toBe(true);

    const fwd = redo(back.state, back.history)!;
    expect(hotspotsOf(fwd.state)).toHaveLength(1);
    expect(fwd.state.byId['h1']!.ring).toEqual(SQUARE);
  });

  test('un paso nuevo invalida la rama de rehacer', () => {
    const { state, history } = run(base(), [
      { type: 'setMode', mode: 'draw' },
      ...SQUARE.map<Action>((p) => ({ type: 'addVertex', point: p })),
      { type: 'closeDraw', id: 'h1' },
    ]);
    const back = undo(state, history)!;
    const again = applyAction(back.state, { type: 'toggleSnap' });
    const h = pushEntry(back.history, {
      label: again.label,
      patches: again.patches,
      inverse: again.inverse,
      persists: again.persists,
    });
    expect(canRedo(h)).toBe(false);
    expect(canUndo(h)).toBe(true);
  });

  test('un arrastre de vértice es UN solo paso deshacible, no uno por frame', () => {
    const start = createState({
      sceneId: 's1',
      space: 'sph',
      hotspots: [{ id: 'a', unitCode: 'B2-A', ring: SQUARE, label: null, zIndex: 1 }],
    });

    let s = start;
    let txn = txnStart('Mover vértice');
    // 40 frames de arrastre, como emite un pointermove real.
    for (let i = 1; i <= 40; i += 1) {
      const r = applyAction(s, { type: 'moveVertex', id: 'a', index: 0, point: [i * 0.001, 0] });
      s = r.state;
      txn = txnAdd(txn, r.patches, r.inverse);
    }
    const entry = txnEntry(txn)!;
    const history = pushEntry(emptyHistory(), entry);

    expect(history.past).toHaveLength(1);
    expect(history.past[0]!.label).toBe('Mover vértice');
    expect(s.byId['a']!.ring[0]![0]).toBeCloseTo(0.04, 10);

    // Un solo ⌘Z tiene que devolver el vértice a donde estaba antes del arrastre.
    const back = undo(s, history)!;
    expect(back.state.byId['a']!.ring[0]).toEqual([0, 0]);
    expect(canUndo(back.history)).toBe(false);
  });

  test('una transacción sin cambios no ensucia el historial', () => {
    expect(txnEntry(txnStart('Mover vértice'))).toBeNull();
  });

  test('el historial se acota al límite y descarta lo más viejo', () => {
    let h = emptyHistory(3);
    for (let i = 0; i < 10; i += 1) {
      h = pushEntry(h, { label: `p${i}`, patches: [], inverse: [], persists: false });
    }
    expect(h.past).toHaveLength(3);
    expect(h.past.map((e) => e.label)).toEqual(['p7', 'p8', 'p9']);
  });
});

describe('importación como un único paso', () => {
  test('400 polígonos entran y salen con un solo deshacer', () => {
    const ops = Array.from({ length: 400 }, (_, i) => ({
      id: `imp-${i}`,
      unitCode: `L-${i}`,
      ring: SQUARE,
      label: null,
      replaces: null,
    }));
    const r = applyAction(base(), { type: 'importHotspots', ops });
    expect(hotspotsOf(r.state)).toHaveLength(400);
    expect(r.label).toBe('Importar 400 polígonos');

    const history = pushEntry(emptyHistory(), {
      label: r.label,
      patches: r.patches,
      inverse: r.inverse,
      persists: r.persists,
    });
    expect(history.past).toHaveLength(1);
    const back = undo(r.state, history)!;
    expect(hotspotsOf(back.state)).toHaveLength(0);
  });

  test('`replaces` saca el polígono anterior de la unidad', () => {
    const s = createState({
      sceneId: 's1',
      space: 'px',
      hotspots: [{ id: 'viejo', unitCode: 'B2-A', ring: SQUARE, label: null, zIndex: 1 }],
    });
    const r = applyAction(s, {
      type: 'importHotspots',
      ops: [{ id: 'nuevo', unitCode: 'B2-A', ring: SQUARE, label: null, replaces: 'viejo' }],
    });
    expect(hotspotsOf(r.state).map((h) => h.id)).toEqual(['nuevo']);
    expect(hotspotForUnit(r.state, 'B2-A')?.id).toBe('nuevo');
  });
});
