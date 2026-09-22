import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetMockDb } from '@/lib/data/mock.ts';
import { baleiaProjectId, withMockActor } from '@/test/mock-actor.ts';
import { DELETE, PATCH } from './route.ts';

// Escena del seed de Baleia (`SC(1)` en mock.ts).
const SCENE_ID = 'a0000000-0000-0000-0004-000000000001';

/** Gestionar escenas es tarea de Vrotta (`canManageScenes`): ver `../route.ts`. */
describe('scenes/[scene]', () => {
  const ctx = { params: Promise.resolve({ project: baleiaProjectId(), scene: SCENE_ID }) };

  beforeEach(() => resetMockDb());
  afterEach(() => resetMockDb());

  describe('PATCH', () => {
    function patchRequest(body: unknown) {
      return new NextRequest('http://test/api', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    it('rechaza a un Gestor (editor) con 403', async () => {
      const res = await withMockActor('editor', () => PATCH(patchRequest({ name: 'Renombrada' }), ctx));
      expect(res.status).toBe(403);
    });

    it('deja pasar a un miembro de plataforma', async () => {
      const res = await withMockActor('platform_admin', () => PATCH(patchRequest({ name: 'Renombrada' }), ctx));
      expect(res.status).toBe(200);
    });
  });

  describe('DELETE', () => {
    it('rechaza a un Administrador (owner) con 403', async () => {
      const res = await withMockActor('owner', () => DELETE(new NextRequest('http://test/api'), ctx));
      expect(res.status).toBe(403);
    });

    it('deja pasar a un miembro de plataforma', async () => {
      const res = await withMockActor('platform_admin', () => DELETE(new NextRequest('http://test/api'), ctx));
      expect(res.status).toBe(200);
    });
  });
});
