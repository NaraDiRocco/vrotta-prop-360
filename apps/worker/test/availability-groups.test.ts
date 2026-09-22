import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AvailabilityFile } from '@r360/core';

/**
 * `generate_availability_json` (supabase/migrations/0025_availability_groups.sql)
 * contra un Postgres de verdad.
 *
 * Por qué no se puede probar esto con un fake, como el resto de la suite: lo
 * que se está probando ES la función SQL — la agregación del estado "más
 * disponible" por grupo y, sobre todo, la AUSENCIA de entrada para un grupo
 * sin unidades. Esa ausencia no es un detalle: es lo que hace que el visor
 * dibuje los bloques 4 y 5 de Baleia con la regla dura (gris, sin chip) en
 * vez de inventarles un estado. Un test que la simule en TypeScript no
 * prueba nada.
 *
 * Mismo criterio que supabase/tests/rls: si no hay un Supabase local
 * levantado, la suite se SALTA entera con un mensaje explícito en vez de
 * fallar — la falta de Docker no debe tumbarle `pnpm test` a nadie — y no
 * corre jamás contra nada que no sea 127.0.0.1/localhost.
 */

const PROD_HOST = '179.199.142.5';
const API_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54921';
/**
 * Clave demo de service_role del CLI de Supabase: idéntica en cualquier
 * instalación local, nunca secreta. Es la misma que usa el harness de RLS
 * (supabase/tests/rls/lib/env.ts).
 */
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

if (API_URL.includes(PROD_HOST) || !/^https?:\/\/(127\.0\.0\.1|localhost)([:/]|$)/.test(API_URL)) {
  throw new Error(
    `SUPABASE_URL = "${API_URL}" no es local. Este test crea y borra datos de prueba: ` +
      'no corre contra ningún destino que no sea un `supabase start` en 127.0.0.1.',
  );
}

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} en ${path}: ${await res.text()}`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

async function insertar<T>(tabla: string, fila: Record<string, unknown>): Promise<T> {
  const [row] = await rest<T[]>(tabla, { method: 'POST', body: JSON.stringify([fila]) });
  if (!row) throw new Error(`el insert en ${tabla} no devolvió fila`);
  return row;
}

async function alcanzable(): Promise<boolean> {
  try {
    return (await fetch(`${API_URL}/rest/v1/`, { headers: { apikey: SERVICE_KEY } })).ok;
  } catch {
    return false;
  }
}

const hayBase = await alcanzable();
if (!hayBase) {
  // eslint-disable-next-line no-console
  console.warn(
    `\n[availability-groups] Saltando la suite: no hay Supabase local en ${API_URL}.\n` +
      '  Requiere `supabase start` (Docker). Ver supabase/README.md.\n',
  );
}

// Sufijo único por corrida: si una corrida anterior murió sin limpiar, la
// siguiente no choca contra unique(slug).
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

describe.skipIf(!hayBase)('generate_availability_json: estado de los grupos (0025)', () => {
  let tenantId: string;
  let projectId: string;
  let disponibilidad: AvailabilityFile['units'];

  beforeAll(async () => {
    tenantId = (await insertar<{ id: string }>('tenants', { slug: `av-${RUN}`, name: 'Availability Test' })).id;
    projectId = (
      await insertar<{ id: string }>('projects', {
        tenant_id: tenantId,
        slug: `av-${RUN}`,
        name: 'Proyecto Availability',
        kind: 'complejo',
      })
    ).id;

    const grupo = (kind: string, code: string, status: string | null = null) =>
      insertar<{ id: string }>('groups', { project_id: projectId, kind, code, status });

    const mezclado = await grupo('bloque', 'MIX');
    const todoProximamente = await grupo('bloque', 'PROX');
    await grupo('bloque', 'VACIO'); // a propósito: sin una sola unidad y sin status
    // Los dos casos de `groups.status` declarado (0026): con unidades, para
    // ver que gana sobre la derivación; y sin unidades, que es el caso real
    // del Bloque 1 de Baleia (fecha pública de "próximamente" y cero
    // unidades cargadas porque todavía no se lanzó).
    const declarado = await grupo('bloque', 'DECL', 'proximamente');
    await grupo('bloque', 'SOLODECL', 'proximamente');

    const unidad = (groupId: string | null, code: string, status: string) =>
      insertar<{ id: string }>('units', { project_id: projectId, group_id: groupId, code, status });

    // Bloque MIX: una vendida, una disponible, una próximamente. El "más
    // disponible" de los tres es `disponible` (order 1 en STATUS_TOKENS).
    const conPrecio = await unidad(mezclado.id, 'MIX-1', 'disponible');
    await unidad(mezclado.id, 'MIX-2', 'vendido');
    await unidad(mezclado.id, 'MIX-3', 'proximamente');
    // Bloque PROX: todas próximamente, así que el bloque también.
    await unidad(todoProximamente.id, 'PROX-1', 'proximamente');
    await unidad(todoProximamente.id, 'PROX-2', 'proximamente');
    // Bloque DECL: declara "proximamente" pero sus unidades están
    // disponibles. El bloque tiene que decir lo declarado y las unidades lo
    // suyo: son dos datos distintos, no uno derivado del otro.
    const bajoDeclarado = await unidad(declarado.id, 'DECL-1', 'disponible');
    // Una unidad suelta, sin grupo: no puede romper la agregación.
    await unidad(null, 'SUELTA', 'reservado');

    await insertar('unit_prices', { unit_id: conPrecio.id, amount: 250000, currency: 'USD', visibility: 'public' });
    await insertar('unit_prices', {
      unit_id: bajoDeclarado.id,
      amount: 99000,
      currency: 'USD',
      visibility: 'public',
    });

    const generado = await rest<AvailabilityFile>('rpc/generate_availability_json', {
      method: 'POST',
      body: JSON.stringify({ p_project_id: projectId }),
    });
    disponibilidad = generado.units;
  });

  afterAll(async () => {
    if (tenantId) {
      // El borrado del tenant arrastra proyecto, grupos, unidades y precios
      // por las FK en cascada (0003/0004/0005).
      await rest(`tenants?id=eq.${tenantId}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    }
  });

  it('un grupo sin status declarado y SIN unidades no genera entrada', () => {
    // La ausencia es la regla dura: sin ningún dato comercial —ni declarado
    // ni derivable—, el visor pinta el polígono gris y avisa por consola, en
    // vez de mostrar un estado que nadie declaró. Es el caso de los Bloques
    // 4 y 5 de Baleia. Inventar la entrada acá cambiaría la cara del plano.
    expect('VACIO' in disponibilidad).toBe(false);
  });

  it('un status declarado en el grupo gana sobre lo que digan sus unidades', () => {
    // DECL declara "proximamente" y su única unidad está "disponible". Que
    // un bloque esté próximamente es un dato comercial del bloque, no una
    // consecuencia de lo que haya adentro.
    expect(disponibilidad.DECL!.s).toBe('proximamente');
  });

  it('un grupo con status declarado genera entrada aunque no tenga ninguna unidad', () => {
    // El caso del Bloque 1 de Baleia: no tiene unidades cargadas justamente
    // porque todavía no se lanzó, pero el brochure ya dice "PRÓXIMAMENTE".
    // Sin esto caía en la regla dura y el plano lo rotulaba "Etapa futura".
    expect(disponibilidad.SOLODECL).toEqual({ s: 'proximamente', p: null });
  });

  it('un status declarado en el grupo no toca las entradas de sus unidades', () => {
    // Cada unidad sigue publicando su propio estado y su propio precio: lo
    // declarado en el bloque es un dato aparte, no se propaga hacia abajo.
    expect(disponibilidad['DECL-1']).toEqual({ s: 'disponible', p: { a: 99000, c: 'USD' } });
  });

  it('sin status declarado y con unidades, el estado se deriva de ellas', () => {
    // Los dos grupos derivados (status null en la base) siguen funcionando
    // igual que antes de que existiera la columna: la precedencia sólo se
    // activa cuando alguien declaró algo.
    expect(disponibilidad.MIX!.s).toBe('disponible');
    expect(disponibilidad.PROX!.s).toBe('proximamente');
  });

  it('el estado de un grupo es el MÁS DISPONIBLE de sus unidades, no el más frecuente', () => {
    // MIX tiene dos unidades no vendibles y una disponible: para quien mira
    // el plano, ese bloque tiene algo para vender.
    expect(disponibilidad.MIX!.s).toBe('disponible');
  });

  it('si todas sus unidades son próximamente, el grupo también', () => {
    expect(disponibilidad.PROX!.s).toBe('proximamente');
  });

  it('un grupo nunca lleva precio, aunque alguna de sus unidades tenga precio público', () => {
    expect(disponibilidad.MIX!.p).toBeNull();
    expect(disponibilidad.PROX!.p).toBeNull();
  });

  it('las unidades siguen saliendo como antes, con su estado y su precio público', () => {
    expect(disponibilidad['MIX-1']).toEqual({ s: 'disponible', p: { a: 250000, c: 'USD' } });
    expect(disponibilidad['MIX-2']).toEqual({ s: 'vendido', p: null });
    expect(disponibilidad['PROX-1']).toEqual({ s: 'proximamente', p: null });
  });

  it('una unidad sin grupo no aporta ninguna entrada de grupo', () => {
    expect(disponibilidad.SUELTA).toEqual({ s: 'reservado', p: null });
    // La foto completa: 7 unidades + los 4 grupos que tienen algo que decir
    // (MIX y PROX derivados, DECL y SOLODECL declarados). VACIO no está.
    expect(Object.keys(disponibilidad).sort()).toEqual(
      [
        'DECL',
        'DECL-1',
        'MIX',
        'MIX-1',
        'MIX-2',
        'MIX-3',
        'PROX',
        'PROX-1',
        'PROX-2',
        'SOLODECL',
        'SUELTA',
      ].sort(),
    );
  });
});
