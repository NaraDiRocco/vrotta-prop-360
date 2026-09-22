import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetMockDb } from '@/lib/data/mock.ts';
import { baleiaProjectId, withMockActor } from '@/test/mock-actor.ts';
import { GET, POST } from './route.ts';

/**
 * Emitir/listar tokens de preview es tarea de Vrotta (`canIssuePreviewTokens`):
 * ver el comentario largo en `route.ts`. Estos tests fijan el hueco que
 * encontró la auditoría (un Gestor podía generar un link público al
 * recorrido en borrador) y confirman que un miembro de plataforma sigue
 * pudiendo hacerlo.
 */
describe('publish/preview-tokens', () => {
  const ctx = { params: Promise.resolve({ project: baleiaProjectId() }) };

  beforeEach(() => resetMockDb());
  afterEach(() => resetMockDb());

  describe('GET', () => {
    it('rechaza a un Gestor (editor) con 403', async () => {
      const res = await withMockActor('editor', () => GET(new NextRequest('http://test/api'), ctx));
      expect(res.status).toBe(403);
    });

    it('rechaza a un Administrador (owner) con 403', async () => {
      const res = await withMockActor('owner', () => GET(new NextRequest('http://test/api'), ctx));
      expect(res.status).toBe(403);
    });

    it('deja pasar a un miembro de plataforma', async () => {
      const res = await withMockActor('platform_admin', () => GET(new NextRequest('http://test/api'), ctx));
      expect(res.status).toBe(200);
    });
  });

  describe('POST', () => {
    function postRequest(body: unknown) {
      return new NextRequest('http://test/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    it('rechaza a un Gestor (editor) con 403 y no crea el token', async () => {
      // El seed ya trae un token de ejemplo (`pv_baleia_demo_1`): lo que importa
      // es que el rechazo no sume uno nuevo, no que la lista quede vacía.
      const before = await withMockActor('platform_admin', () => GET(new NextRequest('http://test/api'), ctx));
      const beforeCount = ((await before.json()) as unknown[]).length;

      const res = await withMockActor('editor', () => POST(postRequest({ ttlMinutes: 60 }), ctx));
      expect(res.status).toBe(403);

      const after = await withMockActor('platform_admin', () => GET(new NextRequest('http://test/api'), ctx));
      expect(((await after.json()) as unknown[]).length).toBe(beforeCount);
    });

    it('deja pasar a un miembro de plataforma (Vrotta Operador)', async () => {
      const res = await withMockActor('platform_operator', () => POST(postRequest({ ttlMinutes: 60 }), ctx));
      expect(res.status).toBe(201);
    });
  });
});
