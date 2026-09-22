import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getRepo } from '@/lib/data/index.ts';
import { resetMockDb } from '@/lib/data/mock.ts';
import { baleiaProjectId, withMockActor } from '@/test/mock-actor.ts';
import { DELETE } from './route.ts';

/**
 * Revocar un link de material es tarea de Administrador o Vrotta
 * (`canShareMaterialLink`): ver el comentario largo en `route.ts`.
 */
describe('material/links/[link] DELETE', () => {
  beforeEach(() => resetMockDb());
  afterEach(() => resetMockDb());

  it('rechaza a un Gestor (editor) con 403 antes de mirar si el link existe', async () => {
    const ctx = { params: Promise.resolve({ project: baleiaProjectId(), link: 'link-inexistente' }) };
    const res = await withMockActor('editor', () => DELETE(new NextRequest('http://test/api'), ctx));
    expect(res.status).toBe(403);
  });

  it('deja pasar a un Administrador (owner)', async () => {
    const link = await getRepo().createMaterialShareLink(baleiaProjectId(), { label: null, expiresAt: null });
    const ctx = { params: Promise.resolve({ project: baleiaProjectId(), link: link.id }) };
    const res = await withMockActor('owner', () => DELETE(new NextRequest('http://test/api'), ctx));
    expect(res.status).toBe(204);
  });

  it('deja pasar a un miembro de plataforma', async () => {
    const link = await getRepo().createMaterialShareLink(baleiaProjectId(), { label: null, expiresAt: null });
    const ctx = { params: Promise.resolve({ project: baleiaProjectId(), link: link.id }) };
    const res = await withMockActor('platform_admin', () => DELETE(new NextRequest('http://test/api'), ctx));
    expect(res.status).toBe(204);
  });
});
