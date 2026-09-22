import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetMockDb } from '@/lib/data/mock.ts';
import { baleiaProjectId, withMockActor } from '@/test/mock-actor.ts';
import { POST } from './route.ts';

// Job del seed de Baleia (`J(1)` en mock.ts).
const JOB_ID = 'a0000000-0000-0000-0005-000000000001';

/** La cola de procesamiento es tarea de Vrotta (`canManageScenes`): ver `../../../route.ts`. */
describe('scenes/jobs/[job]/cancel POST', () => {
  const ctx = { params: Promise.resolve({ project: baleiaProjectId(), job: JOB_ID }) };

  beforeEach(() => resetMockDb());
  afterEach(() => resetMockDb());

  it('rechaza a un Gestor (editor) con 403', async () => {
    const res = await withMockActor('editor', () => POST(new NextRequest('http://test/api'), ctx));
    expect(res.status).toBe(403);
  });

  it('deja pasar a un miembro de plataforma', async () => {
    const res = await withMockActor('platform_admin', () => POST(new NextRequest('http://test/api'), ctx));
    expect(res.status).toBe(200);
  });
});
