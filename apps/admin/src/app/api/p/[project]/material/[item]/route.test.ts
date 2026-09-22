import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetMockDb } from '@/lib/data/mock.ts';
import { baleiaProjectId, withMockActor } from '@/test/mock-actor.ts';
import { PATCH } from './route.ts';

const ITEM_ID = 'plano-masterplan';

function patchRequest(body: unknown) {
  return new NextRequest('http://test/api', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Aprobar material (o marcarlo "no aplica") es criterio de Vrotta
 * (`canApproveMaterial`): ver el comentario largo en `route.ts`. El caso que
 * encontró la auditoría era exactamente este: un cliente auto-aprobándose su
 * propio material.
 */
describe('material/[item] PATCH', () => {
  const ctx = { params: Promise.resolve({ project: baleiaProjectId(), item: ITEM_ID }) };

  beforeEach(() => resetMockDb());
  afterEach(() => resetMockDb());

  it('rechaza a un Gestor (editor) que intenta auto-aprobarse el material', async () => {
    const res = await withMockActor('editor', () => PATCH(patchRequest({ status: 'aprobado' }), ctx));
    expect(res.status).toBe(403);
  });

  it('rechaza a un Administrador (owner) con 403', async () => {
    const res = await withMockActor('owner', () => PATCH(patchRequest({ status: 'aprobado' }), ctx));
    expect(res.status).toBe(403);
  });

  it('deja pasar a un miembro de plataforma (Vrotta Operador)', async () => {
    const res = await withMockActor('platform_operator', () => PATCH(patchRequest({ status: 'aprobado' }), ctx));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('aprobado');
  });
});
