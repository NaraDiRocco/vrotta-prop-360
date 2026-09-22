import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetMockDb } from '@/lib/data/mock.ts';
import { baleiaProjectId, withMockActor } from '@/test/mock-actor.ts';
import { GET, POST } from './route.ts';

function postRequest(body: unknown = {}) {
  return new NextRequest('http://test/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Emitir un link de material es tarea de Administrador o Vrotta
 * (`canShareMaterialLink` excluye explícitamente al Gestor): ver el
 * comentario largo en `route.ts`.
 */
describe('material/links', () => {
  const ctx = { params: Promise.resolve({ project: baleiaProjectId() }) };

  beforeEach(() => resetMockDb());
  afterEach(() => resetMockDb());

  describe('POST', () => {
    it('rechaza a un Gestor (editor) con 403', async () => {
      const res = await withMockActor('editor', () => POST(postRequest(), ctx));
      expect(res.status).toBe(403);
    });

    it('deja pasar a un Administrador (owner)', async () => {
      const res = await withMockActor('owner', () => POST(postRequest(), ctx));
      expect(res.status).toBe(201);
    });

    it('deja pasar a un miembro de plataforma', async () => {
      const res = await withMockActor('platform_admin', () => POST(postRequest(), ctx));
      expect(res.status).toBe(201);
    });
  });

  describe('GET', () => {
    // No se toca: ver links es `canViewMaterial`, universal (ver el comentario en `route.ts`).
    it('un Gestor (editor) puede seguir listando los links', async () => {
      const res = await withMockActor('editor', () => GET(new NextRequest('http://test/api'), ctx));
      expect(res.status).toBe(200);
    });
  });
});
