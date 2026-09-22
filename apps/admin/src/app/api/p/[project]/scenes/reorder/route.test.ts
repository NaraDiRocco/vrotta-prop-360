import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetMockDb } from '@/lib/data/mock.ts';
import { baleiaProjectId, withMockActor } from '@/test/mock-actor.ts';
import { POST } from './route.ts';

const SCENE_ID = 'a0000000-0000-0000-0004-000000000001';

function postRequest(body: unknown) {
  return new NextRequest('http://test/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Gestionar escenas es tarea de Vrotta (`canManageScenes`): ver `../route.ts`. */
describe('scenes/reorder POST', () => {
  const ctx = { params: Promise.resolve({ project: baleiaProjectId() }) };

  beforeEach(() => resetMockDb());
  afterEach(() => resetMockDb());

  it('rechaza a un Gestor (editor) con 403', async () => {
    const res = await withMockActor('editor', () => POST(postRequest({ orderedSceneIds: [SCENE_ID] }), ctx));
    expect(res.status).toBe(403);
  });

  it('deja pasar a un miembro de plataforma', async () => {
    const res = await withMockActor('platform_admin', () => POST(postRequest({ orderedSceneIds: [SCENE_ID] }), ctx));
    expect(res.status).toBe(200);
  });
});
