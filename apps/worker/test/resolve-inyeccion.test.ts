import { describe, it, expect, vi } from 'vitest';
import { resolveProject } from '../src/lib/resolve.ts';
import type { SupabaseClient } from '../src/lib/supabase.ts';

/**
 * Estos tests existen por un agujero real: `tenant` y `project` llegan del
 * cuerpo de `POST /api/leads`, que es público y sin token, y esta consulta
 * sale con la clave de servicio, que ignora RLS. Un `&` sin escapar convertía
 * ese endpoint anónimo en una forma de agregar filtros arbitrarios a una
 * consulta con permisos totales.
 */
function dbEspia() {
  const consultas: { tabla: string; query: string }[] = [];
  const db = {
    select: vi.fn(async (tabla: string, query = '') => {
      consultas.push({ tabla, query });
      return tabla === 'tenants' ? [{ id: 'tenant-uuid' }] : [];
    }),
    insert: vi.fn(),
    update: vi.fn(),
    rpc: vi.fn(),
  } as unknown as SupabaseClient;
  return { db, consultas };
}

describe('resolveProject — escape de los slugs', () => {
  it('un slug con & no puede agregar parámetros a la consulta', async () => {
    const { db, consultas } = dbEspia();
    await resolveProject(db, 'baleia&limit=1&order=id.desc', 'baleia');

    const q = consultas[0]!.query;
    // El & del atacante tiene que haber quedado escapado: la consulta sigue
    // teniendo exactamente sus dos parámetros, `slug` y `select`.
    expect(q).toContain('%26limit%3D1');
    expect(q.split('&').length).toBe(2);
    expect(q).not.toContain('&limit=1');
  });

  it('un slug con un recurso embebido de PostgREST tampoco pasa', async () => {
    const { db, consultas } = dbEspia();
    await resolveProject(db, 'baleia', 'x&select=*,material_share_links(token)');

    const q = consultas[1]!.query;
    // `encodeURIComponent` no escapa paréntesis ni comas, así que el texto
    // sigue ahí — pero inerte: lo que importa es que el `&` y el `=` queden
    // escapados, porque son los que convertirían eso en un parámetro nuevo
    // de la consulta. Todo esto vive DENTRO del valor de `slug`.
    expect(q).toContain('%26select%3D');
    expect(q.split('&').map((p) => p.split('=')[0])).toEqual(['tenant_id', 'slug', 'select']);
    expect(q).not.toContain('&select=*');
  });

  it('un slug normal sigue funcionando sin cambios visibles', async () => {
    const { db, consultas } = dbEspia();
    await resolveProject(db, 'baleia', 'baleia');
    expect(consultas[0]!.query).toBe('slug=eq.baleia&select=id');
    expect(consultas[1]!.query).toContain('slug=eq.baleia');
  });
});
