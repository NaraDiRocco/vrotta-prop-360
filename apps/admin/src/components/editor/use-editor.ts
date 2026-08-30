'use client';

/**
 * Une el reducer puro, el historial y el guardado.
 *
 * Todo lo que decide algo vive en `lib/editor/` y está testeado sin navegador;
 * acá sólo está el cableado: React, temporizadores, `beforeunload` e
 * IndexedDB. Si algo de esto necesita una decisión, la decisión va allá.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Autosaver, type SaveState } from '@/lib/editor/autosave.ts';
import {
  canRedo as histCanRedo,
  canUndo as histCanUndo,
  emptyHistory,
  pushEntry,
  redo as histRedo,
  redoLabel as histRedoLabel,
  txnAdd,
  txnEntry,
  txnStart,
  undo as histUndo,
  undoLabel as histUndoLabel,
  type History,
  type Txn,
} from '@/lib/editor/history.ts';
import { clearDraft, draftDiffers, loadDraft, saveDraft, type DraftSnapshot } from '@/lib/editor/persist.ts';
import { polygonKindFor, type GeomSpace, type HotspotRow } from '@/lib/editor/records.ts';
import {
  applyAction,
  createState,
  hotspotsOf,
  type Action,
  type DraftHotspot,
  type EditorState,
} from '@/lib/editor/state.ts';

export interface UseEditorOptions {
  projectId: string;
  sceneId: string;
  space: GeomSpace;
  initial: DraftHotspot[];
}

export interface EditorApi {
  state: EditorState;
  dispatch: (action: Action) => void;
  /** Abre una transacción: todo lo que se despache hasta `endTxn` es UN paso. */
  beginTxn: (label: string) => void;
  endTxn: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  saveState: SaveState;
  save: () => Promise<void>;
  toast: string | null;
  notify: (message: string) => void;
  recovery: DraftSnapshot | null;
  acceptRecovery: () => void;
  dismissRecovery: () => void;
}

export function rowsOf(state: EditorState, sceneId: string): HotspotRow[] {
  const kind = polygonKindFor(state.space);
  return hotspotsOf(state).map((h) => ({
    id: h.id,
    sceneId,
    unitCode: h.unitCode,
    geometryKind: kind,
    geometry: h.ring,
    anchor: null,
    label: h.label,
    zIndex: h.zIndex,
  }));
}

export function useEditor({ projectId, sceneId, space, initial }: UseEditorOptions): EditorApi {
  const [state, setState] = useState<EditorState>(() => createState({ sceneId, space, hotspots: initial }));
  const [history, setHistory] = useState<History>(() => emptyHistory());
  const [saveState, setSaveState] = useState<SaveState>('clean');
  const [toast, setToast] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<DraftSnapshot | null>(null);

  // Los manejadores de teclado y de puntero se registran una sola vez y viven
  // toda la sesión; sin la ref leerían el estado de su primer render.
  const stateRef = useRef(state);
  stateRef.current = state;
  const txnRef = useRef<Txn | null>(null);
  const lastLabelRef = useRef<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  /* ── guardado ────────────────────────────────────────────────────────── */

  const saver = useMemo(
    () =>
      new Autosaver<HotspotRow[]>({
        onStateChange: (s) => setSaveState(s),
        save: async (hotspots) => {
          const res = await fetch(`/api/p/${encodeURIComponent(projectId)}/hotspots`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sceneId, hotspots }),
          });
          if (!res.ok) throw new Error(`El servidor respondió ${res.status}`);
          // Confirmado en el servidor: la copia local ya no hace falta y
          // dejarla haría que la próxima apertura ofrezca recuperar algo viejo.
          await clearDraft(projectId, sceneId);
        },
      }),
    [projectId, sceneId],
  );

  useEffect(() => () => saver.dispose(), [saver]);

  const markDirty = useCallback(
    (next: EditorState, label: string) => {
      const hotspots = rowsOf(next, sceneId);
      saver.schedule(hotspots);
      void saveDraft({ projectId, sceneId, hotspots: hotspotsOf(next), lastLabel: label });
    },
    [projectId, saver, sceneId],
  );

  const save = useCallback(async () => {
    await saver.flush();
  }, [saver]);

  /* ── despacho ────────────────────────────────────────────────────────── */

  const dispatch = useCallback(
    (action: Action) => {
      const current = stateRef.current;
      const result = applyAction(current, action);
      if (!result.changed) return;

      stateRef.current = result.state;
      setState(result.state);
      lastLabelRef.current = result.label;

      if (txnRef.current) {
        txnRef.current = txnAdd(txnRef.current, result.patches, result.inverse);
      } else if (result.undoable) {
        setHistory((h) =>
          pushEntry(h, {
            label: result.label,
            patches: result.patches,
            inverse: result.inverse,
            persists: result.persists,
          }),
        );
      }
      if (result.persists) markDirty(result.state, result.label);
    },
    [markDirty],
  );

  const beginTxn = useCallback((label: string) => {
    // Un begin sin end previo (pointerup perdido, por ejemplo al salir de la
    // ventana arrastrando) cierra el anterior en vez de tragárselo.
    if (txnRef.current) {
      const entry = txnEntry(txnRef.current);
      if (entry) setHistory((h) => pushEntry(h, entry));
    }
    txnRef.current = txnStart(label);
  }, []);

  const endTxn = useCallback(() => {
    const txn = txnRef.current;
    txnRef.current = null;
    if (!txn) return;
    const entry = txnEntry(txn);
    if (entry) setHistory((h) => pushEntry(h, entry));
  }, []);

  /* ── deshacer / rehacer ──────────────────────────────────────────────── */

  const step = useCallback(
    (direction: 'undo' | 'redo') => {
      const fn = direction === 'undo' ? histUndo : histRedo;
      setHistory((h) => {
        const result = fn(stateRef.current, h);
        if (!result) return h;
        stateRef.current = result.state;
        setState(result.state);
        notify(`${direction === 'undo' ? 'Deshecho' : 'Rehecho'}: ${result.entry.label}`);
        if (result.entry.persists) markDirty(result.state, result.entry.label);
        return result.history;
      });
    },
    [markDirty, notify],
  );

  const undo = useCallback(() => step('undo'), [step]);
  const redo = useCallback(() => step('redo'), [step]);

  /* ── flush en los momentos que importan ──────────────────────────────── */

  useEffect(() => {
    const onBlur = () => void saver.flush();
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!saver.isDirty) return;
      // No se puede esperar a una promesa acá; el navegador da la oportunidad
      // de avisar y la copia de IndexedDB ya está escrita, así que nada se
      // pierde aunque el usuario confirme la salida.
      void saver.flush();
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('blur', onBlur);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [saver]);

  // Cambiar de unidad o de modo cierra el trabajo anterior: son las dos
  // fronteras naturales, y perder lo de antes por un debounce a medio camino
  // sería incomprensible.
  useEffect(() => {
    void saver.flush();
  }, [saver, state.selectedUnitCode, state.mode]);

  /* ── recuperación tras un cierre inesperado ──────────────────────────── */

  useEffect(() => {
    let cancelled = false;
    void loadDraft(projectId, sceneId).then((draft) => {
      if (cancelled || !draft) return;
      if (draftDiffers(draft.hotspots, initial)) setRecovery(draft);
      else void clearDraft(projectId, sceneId);
    });
    return () => {
      cancelled = true;
    };
    // Sólo al montar: el borrador se consulta una vez, contra lo que trajo el
    // servidor. Volver a consultarlo después compararía contra lo ya editado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const acceptRecovery = useCallback(() => {
    const draft = recovery;
    if (!draft) return;
    const next = createState({ sceneId, space, hotspots: draft.hotspots });
    stateRef.current = next;
    setState(next);
    setHistory(emptyHistory());
    setRecovery(null);
    markDirty(next, 'Recuperar borrador');
    notify(`Borrador recuperado (${draft.hotspots.length} polígonos)`);
  }, [markDirty, notify, recovery, sceneId, space]);

  const dismissRecovery = useCallback(() => {
    setRecovery(null);
    void clearDraft(projectId, sceneId);
  }, [projectId, sceneId]);

  return {
    state,
    dispatch,
    beginTxn,
    endTxn,
    undo,
    redo,
    canUndo: histCanUndo(history),
    canRedo: histCanRedo(history),
    undoLabel: histUndoLabel(history),
    redoLabel: histRedoLabel(history),
    saveState,
    save,
    toast,
    notify,
    recovery,
    acceptRecovery,
    dismissRecovery,
  };
}
