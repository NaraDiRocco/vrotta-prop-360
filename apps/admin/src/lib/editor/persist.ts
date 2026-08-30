/**
 * Copia local del estado sucio, en IndexedDB.
 *
 * El autosave cubre el caso normal; esto cubre el anormal. Media hora
 * dibujando un loteo y una pestaña que se muere (o un Wi-Fi que se corta justo
 * en el debounce) no puede costar el trabajo. Al abrir el editor, si hay un
 * borrador más nuevo que lo guardado, se ofrece recuperarlo.
 *
 * localStorage no sirve: 600 polígonos densificados pasan holgadamente los 5 MB
 * y además serializar en el hilo principal a cada rato es justo lo que no se
 * quiere mientras se arrastra un vértice.
 */
import type { DraftHotspot } from './state.ts';

const DB_NAME = 'r360-editor';
const STORE = 'drafts';
const DB_VERSION = 1;

export interface DraftSnapshot {
  key: string;
  projectId: string;
  sceneId: string;
  hotspots: DraftHotspot[];
  savedAt: number;
  /** Etiqueta del último paso, para poder decirle al operador qué se recupera. */
  lastLabel: string | null;
}

export function draftKey(projectId: string, sceneId: string): string {
  return `${projectId}::${sceneId}`;
}

function available(): boolean {
  return typeof indexedDB !== 'undefined';
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!available()) return Promise.reject(new Error('IndexedDB no disponible'));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('No se pudo abrir IndexedDB'));
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error ?? new Error('Error de IndexedDB'));
      }),
  );
}

/**
 * Guarda el borrador. Nunca lanza: si IndexedDB no está (modo privado, cuota
 * llena, navegador raro), el editor sigue funcionando con el autosave normal y
 * lo único que se pierde es la red de contención.
 */
export async function saveDraft(snapshot: Omit<DraftSnapshot, 'key' | 'savedAt'>): Promise<boolean> {
  if (!available()) return false;
  try {
    const record: DraftSnapshot = {
      ...snapshot,
      key: draftKey(snapshot.projectId, snapshot.sceneId),
      savedAt: Date.now(),
    };
    await tx<IDBValidKey>('readwrite', (s) => s.put(record));
    return true;
  } catch {
    return false;
  }
}

export async function loadDraft(projectId: string, sceneId: string): Promise<DraftSnapshot | null> {
  if (!available()) return null;
  try {
    const found = await tx<DraftSnapshot | undefined>('readonly', (s) => s.get(draftKey(projectId, sceneId)));
    return found ?? null;
  } catch {
    return null;
  }
}

export async function clearDraft(projectId: string, sceneId: string): Promise<void> {
  if (!available()) return;
  try {
    await tx<undefined>('readwrite', (s) => s.delete(draftKey(projectId, sceneId)));
  } catch {
    /* sin red de contención, pero el editor sigue */
  }
}

/**
 * ¿Vale la pena ofrecer la recuperación? Sólo si el borrador difiere de lo que
 * vino del servidor. Preguntar "¿recuperás?" cuando no hay nada que recuperar
 * enseña a apretar "no" sin leer, y el día que importa también se aprieta "no".
 */
export function draftDiffers(draft: readonly DraftHotspot[], server: readonly DraftHotspot[]): boolean {
  if (draft.length !== server.length) return true;
  const byId = new Map(server.map((h) => [h.id, h]));
  for (const d of draft) {
    const s = byId.get(d.id);
    if (!s) return true;
    if (s.unitCode !== d.unitCode || s.label !== d.label) return true;
    if (s.ring.length !== d.ring.length) return true;
    for (let i = 0; i < d.ring.length; i += 1) {
      const a = d.ring[i]!;
      const b = s.ring[i]!;
      if (Math.abs(a[0] - b[0]) > 1e-9 || Math.abs(a[1] - b[1]) > 1e-9) return true;
    }
  }
  return false;
}
