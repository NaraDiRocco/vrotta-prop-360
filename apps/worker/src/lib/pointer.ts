/**
 * Puntero de versión activa por (tenant, proyecto), en TENANTS_KV.
 *
 * Clave: `ptr:{tenant}:{project}` → JSON { version, history }.
 * `history` guarda las últimas versiones activas (más reciente al final) para
 * que /api/rollback pueda volver atrás sin tener que ir a buscar a otro lado
 * "cuál era la anterior".
 */
export interface VersionPointer {
  version: number;
  history: number[];
}

const PTR_KEY = (tenant: string, project: string) => `ptr:${tenant}:${project}`;
const MAX_HISTORY = 20;

export interface PointerKv {
  get(key: string, opts?: { type?: 'json' | 'text' }): Promise<unknown>;
  put(key: string, value: string): Promise<void>;
}

export async function getActivePointer(
  kv: PointerKv,
  tenant: string,
  project: string,
): Promise<VersionPointer | null> {
  const raw = await kv.get(PTR_KEY(tenant, project), { type: 'json' });
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<VersionPointer>;
  if (typeof p.version !== 'number') return null;
  return { version: p.version, history: Array.isArray(p.history) ? p.history : [] };
}

/** Mueve el puntero a una nueva versión publicada. Se llama recién al final de /api/publish. */
export async function setActivePointer(
  kv: PointerKv,
  tenant: string,
  project: string,
  version: number,
): Promise<VersionPointer> {
  const current = await getActivePointer(kv, tenant, project);
  const history = [...(current?.history ?? []), ...(current ? [current.version] : [])].slice(
    -MAX_HISTORY,
  );
  const next: VersionPointer = { version, history };
  await kv.put(PTR_KEY(tenant, project), JSON.stringify(next));
  return next;
}

/** Revierte el puntero a una versión anterior (debe estar en la lista de publicadas). */
export async function rollbackPointer(
  kv: PointerKv,
  tenant: string,
  project: string,
  toVersion: number,
): Promise<VersionPointer> {
  const current = await getActivePointer(kv, tenant, project);
  const history = current
    ? [...current.history, current.version].filter((v) => v !== toVersion).slice(-MAX_HISTORY)
    : [];
  const next: VersionPointer = { version: toVersion, history };
  await kv.put(PTR_KEY(tenant, project), JSON.stringify(next));
  return next;
}
