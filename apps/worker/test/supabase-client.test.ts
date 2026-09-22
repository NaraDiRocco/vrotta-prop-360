import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSupabaseClient } from '../src/lib/supabase.ts';

/**
 * Estos tests existen por un bug real: un `insert` que SI escribio la fila se
 * reportaba como fallido porque el cliente intentaba parsear un cuerpo vacio.
 * La publicacion quedaba registrada en la base y la etapa decia FALLO.
 */
const cfg = { url: 'https://supabase.local', serviceKey: 'clave-de-prueba' };

function responderCon(status: number, cuerpo: string) {
  return vi.fn(async () =>
    new Response(cuerpo === '' ? null : cuerpo, {
      status,
      headers: cuerpo === '' ? {} : { 'Content-Type': 'application/json' },
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('cliente de Supabase — respuestas sin cuerpo', () => {
  it('un insert con return=minimal contesta 201 y cuerpo vacio, y NO debe fallar', async () => {
    vi.stubGlobal('fetch', responderCon(201, ''));
    const db = createSupabaseClient(cfg);
    await expect(db.insert('publications', [{ version: 1 }])).resolves.toBeUndefined();
  });

  it('un update contesta 204 y tampoco debe fallar', async () => {
    vi.stubGlobal('fetch', responderCon(204, ''));
    const db = createSupabaseClient(cfg);
    await expect(db.update('units', 'id=eq.1', { status: 'vendido' })).resolves.toBeUndefined();
  });

  it('cuando sí hay cuerpo, se parsea como antes', async () => {
    vi.stubGlobal('fetch', responderCon(200, '[{"id":"abc"}]'));
    const db = createSupabaseClient(cfg);
    await expect(db.select('projects', 'select=id')).resolves.toEqual([{ id: 'abc' }]);
  });

  it('un error sigue siendo un error, con su estado', async () => {
    vi.stubGlobal('fetch', responderCon(409, '{"message":"duplicada"}'));
    const db = createSupabaseClient(cfg);
    await expect(db.insert('publications', [{}])).rejects.toMatchObject({ status: 409 });
  });
});
