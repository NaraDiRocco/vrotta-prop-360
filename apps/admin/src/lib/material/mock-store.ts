/**
 * Estado en memoria del material para el modo mock. Escribe de verdad sobre un
 * singleton (mismo criterio que `MockRepo`): cambiar un estado o crear un link
 * y recargar la página muestra el cambio, y se pierde al reiniciar el proceso.
 *
 * No guarda bytes: en mock la subida registra la fila del archivo y nada más,
 * porque no hay storage contra el que hablar.
 */
import type { MaterialFileRow, MaterialPatch, MaterialShareLinkRow, MaterialStateRow } from './types.ts';
import { generateShareToken } from './share.ts';

interface MaterialMockDb {
  states: Map<string, MaterialStateRow[]>;
  files: Map<string, MaterialFileRow[]>;
  links: Map<string, MaterialShareLinkRow[]>;
}

const globalRef = globalThis as typeof globalThis & { __r360MaterialMock?: MaterialMockDb };

function db(): MaterialMockDb {
  if (!globalRef.__r360MaterialMock) {
    globalRef.__r360MaterialMock = { states: new Map(), files: new Map(), links: new Map() };
  }
  return globalRef.__r360MaterialMock;
}

function listOf<T>(map: Map<string, T[]>, key: string): T[] {
  const existing = map.get(key);
  if (existing) return existing;
  const created: T[] = [];
  map.set(key, created);
  return created;
}

export function mockListStates(projectId: string): MaterialStateRow[] {
  return [...listOf(db().states, projectId)];
}

export function mockSetState(projectId: string, itemId: string, patch: MaterialPatch, email: string | null): MaterialStateRow {
  const list = listOf(db().states, projectId);
  const index = list.findIndex((s) => s.itemId === itemId);
  const previous = index >= 0 ? list[index] : undefined;
  const next: MaterialStateRow = {
    itemId,
    status: patch.status ?? previous?.status ?? 'pendiente',
    notes: patch.notes === undefined ? (previous?.notes ?? null) : patch.notes,
    updatedAt: new Date().toISOString(),
    updatedByEmail: email,
  };
  if (index >= 0) list[index] = next;
  else list.push(next);
  return next;
}

export function mockListFiles(projectId: string): MaterialFileRow[] {
  return [...listOf(db().files, projectId)];
}

export function mockAddFile(projectId: string, file: MaterialFileRow): MaterialFileRow {
  listOf(db().files, projectId).unshift(file);
  return file;
}

export function mockDeleteFile(projectId: string, fileId: string): void {
  const list = listOf(db().files, projectId);
  const index = list.findIndex((f) => f.id === fileId);
  if (index >= 0) list.splice(index, 1);
}

export function mockListLinks(projectId: string): MaterialShareLinkRow[] {
  return [...listOf(db().links, projectId)];
}

export function mockCreateLink(projectId: string, label: string | null, expiresAt: string | null): MaterialShareLinkRow {
  const link: MaterialShareLinkRow = {
    id: crypto.randomUUID(),
    token: generateShareToken(),
    label,
    createdAt: new Date().toISOString(),
    expiresAt,
    revokedAt: null,
  };
  listOf(db().links, projectId).unshift(link);
  return link;
}

export function mockRevokeLink(projectId: string, linkId: string): void {
  const list = listOf(db().links, projectId);
  const index = list.findIndex((l) => l.id === linkId);
  const link = index >= 0 ? list[index] : undefined;
  if (link && index >= 0) list[index] = { ...link, revokedAt: new Date().toISOString() };
}

/** Busca el link por token en todos los proyectos. Devuelve también el proyecto. */
export function mockFindByToken(token: string): { projectId: string; link: MaterialShareLinkRow } | null {
  for (const [projectId, links] of db().links) {
    const link = links.find((l) => l.token === token);
    if (link) return { projectId, link };
  }
  return null;
}
