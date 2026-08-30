/**
 * Historial de deshacer/rehacer sobre PatchSets de immer.
 *
 * Cada entrada tiene una etiqueta legible ("Mover vértice", "Importar 400
 * polígonos") porque el operador tiene que poder ver QUÉ va a deshacer antes de
 * apretar, no descubrirlo después.
 *
 * Lo importante son las TRANSACCIONES. Un arrastre de vértice emite una acción
 * por frame; sin agrupar, deshacer una vez movería el vértice un píxel y harían
 * falta ochenta ⌘Z para volver al estado anterior al arrastre. `txnStart` /
 * `txnAdd` / `txnEntry` juntan todo lo que pasa entre el pointerdown y el
 * pointerup en un único paso deshacible.
 */
import type { Patch } from 'immer';
import { applyPatchList, patchesTouchData, type EditorState } from './state.ts';

export interface HistoryEntry {
  label: string;
  patches: Patch[];
  inverse: Patch[];
  /** true si el paso toca datos persistidos (y no sólo selección o modo). */
  persists: boolean;
}

export interface History {
  past: HistoryEntry[];
  future: HistoryEntry[];
  limit: number;
}

export const HISTORY_LIMIT = 200;

export function emptyHistory(limit = HISTORY_LIMIT): History {
  return { past: [], future: [], limit };
}

/** Apila un paso. Cualquier cosa nueva invalida la rama de rehacer. */
export function pushEntry(h: History, entry: HistoryEntry): History {
  const past = [...h.past, entry];
  if (past.length > h.limit) past.splice(0, past.length - h.limit);
  return { past, future: [], limit: h.limit };
}

export function canUndo(h: History): boolean {
  return h.past.length > 0;
}

export function canRedo(h: History): boolean {
  return h.future.length > 0;
}

export function undoLabel(h: History): string | null {
  return h.past[h.past.length - 1]?.label ?? null;
}

export function redoLabel(h: History): string | null {
  return h.future[h.future.length - 1]?.label ?? null;
}

export interface StepResult {
  state: EditorState;
  history: History;
  entry: HistoryEntry;
}

export function undo(state: EditorState, h: History): StepResult | null {
  const entry = h.past[h.past.length - 1];
  if (!entry) return null;
  return {
    state: applyPatchList(state, entry.inverse),
    history: { past: h.past.slice(0, -1), future: [...h.future, entry], limit: h.limit },
    entry,
  };
}

export function redo(state: EditorState, h: History): StepResult | null {
  const entry = h.future[h.future.length - 1];
  if (!entry) return null;
  return {
    state: applyPatchList(state, entry.patches),
    history: { past: [...h.past, entry], future: h.future.slice(0, -1), limit: h.limit },
    entry,
  };
}

/* ── transacciones ─────────────────────────────────────────────────────── */

export interface Txn {
  label: string;
  patches: Patch[];
  inverse: Patch[];
}

export function txnStart(label: string): Txn {
  return { label, patches: [], inverse: [] };
}

/**
 * Acumula un paso dentro de la transacción.
 *
 * Los directos se concatenan en orden; los INVERSOS se anteponen, porque
 * deshacer una secuencia es aplicar sus inversos del último al primero.
 */
export function txnAdd(t: Txn, patches: readonly Patch[], inverse: readonly Patch[]): Txn {
  return {
    label: t.label,
    patches: [...t.patches, ...patches],
    inverse: [...inverse, ...t.inverse],
  };
}

/** Cierra la transacción. Devuelve null si no pasó nada (un click sin arrastre). */
export function txnEntry(t: Txn): HistoryEntry | null {
  if (t.patches.length === 0) return null;
  return {
    label: t.label,
    patches: t.patches,
    inverse: t.inverse,
    persists: patchesTouchData(t.patches),
  };
}
