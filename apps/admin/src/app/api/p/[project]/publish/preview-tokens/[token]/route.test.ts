import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetMockDb } from '@/lib/data/mock.ts';
import { baleiaProjectId, withMockActor } from '@/test/mock-actor.ts';
import { DELETE } from './route.ts';

describe('publish/preview-tokens/[token] DELETE', () => {
  const ctx = { params: Promise.resolve({ project: baleiaProjectId(), token: 'pv_inexistente' }) };

  beforeEach(() => resetMockDb());
  afterEach(() => resetMockDb());

  it('rechaza a un Gestor (editor) con 403', async () => {
    const res = await withMockActor('editor', () => DELETE(new NextRequest('http://test/api'), ctx));
    expect(res.status).toBe(403);
  });

  it('rechaza a un Vendedor (sales) con 403', async () => {
    const res = await withMockActor('sales', () => DELETE(new NextRequest('http://test/api'), ctx));
    expect(res.status).toBe(403);
  });

  it('deja pasar a un miembro de plataforma', async () => {
    const res = await withMockActor('platform_admin', () => DELETE(new NextRequest('http://test/api'), ctx));
    expect(res.status).toBe(200);
  });
});
