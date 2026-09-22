import { mockDb } from '@/lib/data/mock.ts';

/**
 * Helper para tests de rutas API (`app/api/p/[project]/**`).
 *
 * `MockRepo.getSession()` (ver `lib/data/mock-repo.ts`) resuelve el actor de
 * la sesión mock leyendo `NEXT_PUBLIC_R360_MOCK_ACTOR` en cada llamada — no
 * al construirse. Eso alcanza para simular "esto lo pide un Gestor" vs "esto
 * lo pide Vrotta" sin mockear módulos ni levantar Supabase: alcanza con fijar
 * la variable antes de invocar el handler. `withMockActor` la restaura al
 * valor anterior aunque `fn` tire, para que un test no filtre el actor al
 * siguiente.
 */
export type MockActorName = 'platform_admin' | 'platform_operator' | 'owner' | 'editor' | 'sales';

export async function withMockActor<T>(actor: MockActorName, fn: () => Promise<T>): Promise<T> {
  const prev = process.env['NEXT_PUBLIC_R360_MOCK_ACTOR'];
  process.env['NEXT_PUBLIC_R360_MOCK_ACTOR'] = actor;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env['NEXT_PUBLIC_R360_MOCK_ACTOR'];
    else process.env['NEXT_PUBLIC_R360_MOCK_ACTOR'] = prev;
  }
}

/** Id del proyecto "Baleia" del seed, resuelto por slug para no depender de un UUID pegado a mano. */
export function baleiaProjectId(): string {
  const project = mockDb().projects.find((p) => p.slug === 'baleia');
  if (!project) throw new Error('El seed de mock.ts cambió: no encuentro el proyecto "baleia"');
  return project.id;
}
