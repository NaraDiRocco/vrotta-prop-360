import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetMockDb } from '@/lib/data/mock.ts';
import { baleiaProjectId, withMockActor } from '@/test/mock-actor.ts';
import { GET, POST } from './route.ts';

function postRequest(body: unknown) {
  return new NextRequest('http://test/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Gestionar escenas (subir, listar, borrar) es tarea de Vrotta
 * (`canManageScenes`): ver el comentario largo en `route.ts`.
 */
describe('scenes', () => {
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

  describe('POST', () => {
    it('rechaza a un Administrador (owner) con 403', async () => {
      const res = await withMockActor('owner', () =>
        POST(postRequest({ slug: 'nueva', kind: 'panorama', name: 'Nueva escena' }), ctx),
      );
      expect(res.status).toBe(403);
    });

    it('deja pasar a un miembro de plataforma (Vrotta Operador)', async () => {
      const res = await withMockActor('platform_operator', () =>
        POST(postRequest({ slug: 'nueva', kind: 'panorama', name: 'Nueva escena' }), ctx),
      );
      expect(res.status).toBe(201);
    });
  });
});
