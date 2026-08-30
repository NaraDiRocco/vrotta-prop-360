import { MockRepo } from './mock-repo.ts';
import { isMockMode, type Repo } from './repo.ts';
import { SupabaseRepo } from './supabase-repo.ts';

let cached: Repo | null = null;

/**
 * Único punto de entrada al backend. `NEXT_PUBLIC_R360_MOCK=1` (default)
 * devuelve el repo en memoria con el seed de Baleia; `0` habla con Supabase.
 */
export function getRepo(): Repo {
  if (!cached) cached = isMockMode() ? new MockRepo() : new SupabaseRepo();
  return cached;
}

export * from './types.ts';
export { isMockMode } from './repo.ts';
export type { Repo, Structure } from './repo.ts';
