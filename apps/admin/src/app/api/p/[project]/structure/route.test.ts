import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetMockDb } from '@/lib/data/mock.ts';
import { baleiaProjectId, withMockActor } from '@/test/mock-actor.ts';
import { POST } from './route.ts';

function postRequest(body: unknown) {
  return new NextRequest('http://test/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Editar estructura es tarea de Vrotta (`canEditStructure`): ver el comentario largo en `route.ts`. */
describe('structure POST', () => {
  const ctx = { params: Promise.resolve({ project: baleiaProjectId() }) };

  beforeEach(() => resetMockDb());
  afterEach(() => resetMockDb());

  it('rechaza a un Gestor (editor) con 403, incluso en dryRun', async () => {
    const res = await withMockActor('editor', () => POST(postRequest({ kind: 'groups', groups: [] }), ctx));
    expect(res.status).toBe(403);
  });

  it('rechaza a un Administrador (owner) con 403', async () => {
    const res = await withMockActor('owner', () => POST(postRequest({ kind: 'groups', groups: [] }), ctx));
    expect(res.status).toBe(403);
  });

  it('deja pasar a un miembro de plataforma', async () => {
    const res = await withMockActor('platform_admin', () => POST(postRequest({ kind: 'groups', groups: [] }), ctx));
    expect(res.status).toBe(200);
  });
});
