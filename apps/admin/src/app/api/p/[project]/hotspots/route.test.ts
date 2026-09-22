import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetMockDb } from '@/lib/data/mock.ts';
import { baleiaProjectId, withMockActor } from '@/test/mock-actor.ts';
import { GET, PUT } from './route.ts';

const SCENE_ID = 'a0000000-0000-0000-0004-000000000001';

function putRequest(body: unknown) {
  return new NextRequest('http://test/api', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Dibujar hotspots es tarea de Vrotta (`canEditHotspots`): ver el comentario largo en `route.ts`. */
describe('hotspots', () => {
  const ctx = { params: Promise.resolve({ project: baleiaProjectId() }) };

  beforeEach(() => resetMockDb());
  afterEach(() => resetMockDb());

  describe('GET', () => {
    it('rechaza a un Gestor (editor) con 403', async () => {
      const res = await withMockActor('editor', () => GET(new NextRequest('http://test/api'), ctx));
      expect(res.status).toBe(403);
    });

    it('deja pasar a un miembro de plataforma', async () => {
      const res = await withMockActor('platform_admin', () => GET(new NextRequest('http://test/api'), ctx));
      expect(res.status).toBe(200);
    });
  });

  describe('PUT', () => {
    it('rechaza a un Administrador (owner) con 403', async () => {
      const res = await withMockActor('owner', () => PUT(putRequest({ sceneId: SCENE_ID, hotspots: [] }), ctx));
      expect(res.status).toBe(403);
    });

    it('deja pasar a un miembro de plataforma', async () => {
      const res = await withMockActor('platform_admin', () => PUT(putRequest({ sceneId: SCENE_ID, hotspots: [] }), ctx));
      expect(res.status).toBe(200);
    });
  });
});
