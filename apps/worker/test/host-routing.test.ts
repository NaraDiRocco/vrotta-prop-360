import { describe, it, expect } from 'vitest';
import {
  normalizeHost,
  classifyHost,
  createHostResolutionCache,
  HostResolutionCache,
  resolveProjectForHost,
  type HostClassification,
} from '../src/lib/host-routing.ts';
import { createSupabaseClient } from '../src/lib/supabase.ts';

/**
 * Fake mínimo de createSupabaseClient, mismo criterio que `fakeDb` en
 * publish-manifest-settings.test.ts: sólo implementa `select` (lo único que
 * usa host-routing.ts), filtrando "a mano" los `eq.` de la query string —
 * no pega a Supabase de verdad. `calls` queda expuesto para poder afirmar
 * cuántas veces (y con qué) se consultó "la base", que es justo lo que
 * necesitamos para probar que la caché evita pegarle de nuevo y que un host
 * inválido nunca la toca.
 */
function fakeDb(tables: {
  tenants?: Array<{ id: string; slug: string }>;
  projects?: Array<{ id: string; slug: string; tenant_id: string; subdomain?: string | null }>;
  project_domains?: Array<{ project_id: string; tenant_id: string; domain: string; status: string }>;
}) {
  const data: Record<string, unknown[]> = {
    tenants: tables.tenants ?? [],
    projects: tables.projects ?? [],
    project_domains: tables.project_domains ?? [],
  };
  const calls: Array<{ table: string; query: string }> = [];

  const client = {
    select: async (table: string, query = '') => {
      calls.push({ table, query });
      const rows = (data[table] ?? []) as Array<Record<string, unknown>>;
      const params = new URLSearchParams(query);
      return rows.filter((row) => {
        for (const [key, value] of params) {
          if (key === 'select' || key === 'order') continue;
          if (!value.startsWith('eq.')) continue;
          if (String(row[key]) !== value.slice(3)) return false;
        }
        return true;
      });
    },
    insert: async () => undefined,
    update: async () => undefined,
    rpc: async () => undefined,
  } as unknown as ReturnType<typeof createSupabaseClient>;

  return { client, calls };
}

const SUBDOMAIN: Extract<HostClassification, { kind: 'subdomain' }> = { kind: 'subdomain', label: 'torres' };
const CUSTOM = (host: string): Extract<HostClassification, { kind: 'custom' }> => ({ kind: 'custom', host });

describe('normalizeHost', () => {
  it('baja a minúsculas y saca el puerto', () => {
    expect(normalizeHost('Milomas.COM:8443')).toBe('milomas.com');
  });

  it('rechaza host vacío, undefined o null', () => {
    expect(normalizeHost('')).toBeNull();
    expect(normalizeHost(undefined)).toBeNull();
    expect(normalizeHost(null)).toBeNull();
  });

  it('rechaza caracteres fuera de [a-z0-9.-] (espacios, guion bajo, barra, @)', () => {
    expect(normalizeHost('mi dominio.com')).toBeNull();
    expect(normalizeHost('mi_dominio.com')).toBeNull();
    expect(normalizeHost('milomas.com/evil')).toBeNull();
    expect(normalizeHost('user@milomas.com')).toBeNull();
  });

  it('rechaza dos puntos seguidos (label vacío)', () => {
    expect(normalizeHost('milomas..com')).toBeNull();
  });

  it('rechaza un host que empieza o termina en guion o punto', () => {
    expect(normalizeHost('-milomas.com')).toBeNull();
    expect(normalizeHost('milomas-.com')).toBeNull();
    expect(normalizeHost('.milomas.com')).toBeNull();
    expect(normalizeHost('milomas.com.')).toBeNull();
  });

  it('rechaza un host demasiado largo (> 253 caracteres)', () => {
    const label = 'a'.repeat(60);
    const tooLong = `${label}.${label}.${label}.${label}.${label}.com`;
    expect(tooLong.length).toBeGreaterThan(253);
    expect(normalizeHost(tooLong)).toBeNull();
  });

  it('acepta un hostname simple sin puerto', () => {
    expect(normalizeHost('milomas.com')).toBe('milomas.com');
  });
});

describe('classifyHost', () => {
  const cfg = { platformHost: 'app.r360.io', pagesDomain: 'pages.r360.io' };

  it('host exactamente igual al de la plataforma -> platform', () => {
    expect(classifyHost('app.r360.io', cfg)).toEqual({ kind: 'platform' });
  });

  it('{label}.{pagesDomain} con un solo label -> subdomain', () => {
    expect(classifyHost('torres-del-lago.pages.r360.io', cfg)).toEqual({
      kind: 'subdomain',
      label: 'torres-del-lago',
    });
  });

  it('{a}.{b}.{pagesDomain} (label compuesto) -> custom, no subdomain', () => {
    expect(classifyHost('a.b.pages.r360.io', cfg)).toEqual({
      kind: 'custom',
      host: 'a.b.pages.r360.io',
    });
  });

  it('cualquier otro host -> custom', () => {
    expect(classifyHost('milomas.com', cfg)).toEqual({ kind: 'custom', host: 'milomas.com' });
  });

  it('el propio pagesDomain sin label (apex) -> custom, no subdomain vacío', () => {
    expect(classifyHost('pages.r360.io', cfg)).toEqual({ kind: 'custom', host: 'pages.r360.io' });
  });
});

describe('HostResolutionCache', () => {
  it('respeta el TTL: hit antes de vencer, miss después', () => {
    const cache = new HostResolutionCache(500, 60_000);
    const now = 1_000_000;
    cache.set('milomas.com', { tenantSlug: 'acme', projectSlug: 'milomas' }, now);

    expect(cache.get('milomas.com', now + 59_999)).toEqual({
      hit: true,
      value: { tenantSlug: 'acme', projectSlug: 'milomas' },
    });
    expect(cache.get('milomas.com', now + 60_000)).toEqual({ hit: false });
  });

  it('cachea también los negativos (host no encontrado)', () => {
    const cache = new HostResolutionCache(500, 60_000);
    const now = 0;
    cache.set('no-existe.com', null, now);
    expect(cache.get('no-existe.com', now + 1000)).toEqual({ hit: true, value: null });
  });

  it('respeta el tope de entradas, desalojando la más vieja', () => {
    const cache = new HostResolutionCache(3, 60_000);
    const now = 0;
    cache.set('a.com', null, now);
    cache.set('b.com', null, now);
    cache.set('c.com', null, now);
    expect(cache.size).toBe(3);

    // Una cuarta entrada empuja el tope: se desaloja la más vieja (a.com).
    cache.set('d.com', null, now);
    expect(cache.size).toBe(3);
    expect(cache.get('a.com', now)).toEqual({ hit: false });
    expect(cache.get('d.com', now)).toEqual({ hit: true, value: null });
  });

  it('un `get` no hace crecer la caché ni cuenta como entrada nueva', () => {
    const cache = new HostResolutionCache(2, 60_000);
    const now = 0;
    cache.set('a.com', null, now);
    cache.set('b.com', null, now);
    void cache.get('a.com', now);
    expect(cache.size).toBe(2);
  });

  it('createHostResolutionCache() arranca vacía', () => {
    const cache = createHostResolutionCache();
    expect(cache.size).toBe(0);
  });
});

describe('resolveProjectForHost', () => {
  it('subdominio válido resuelve al (tenant_slug, project_slug) correcto', async () => {
    const { client } = fakeDb({
      tenants: [{ id: 'tenant-1', slug: 'acme' }],
      projects: [{ id: 'proj-1', slug: 'torres-del-lago', tenant_id: 'tenant-1', subdomain: 'torres' }],
    });
    const cache = createHostResolutionCache();

    const resolved = await resolveProjectForHost(client, 'torres.pages.r360.io', SUBDOMAIN, cache);
    expect(resolved).toEqual({ tenantSlug: 'acme', projectSlug: 'torres-del-lago' });
  });

  it('dominio propio con status verified resuelve', async () => {
    const { client } = fakeDb({
      tenants: [{ id: 'tenant-2', slug: 'cliente-x' }],
      projects: [{ id: 'proj-2', slug: 'milomas', tenant_id: 'tenant-2' }],
      project_domains: [{ project_id: 'proj-2', tenant_id: 'tenant-2', domain: 'milomas.com', status: 'verified' }],
    });
    const cache = createHostResolutionCache();

    const resolved = await resolveProjectForHost(client, 'milomas.com', CUSTOM('milomas.com'), cache);
    expect(resolved).toEqual({ tenantSlug: 'cliente-x', projectSlug: 'milomas' });
  });

  it('dominio propio con status pending NO resuelve', async () => {
    const { client } = fakeDb({
      tenants: [{ id: 'tenant-2', slug: 'cliente-x' }],
      projects: [{ id: 'proj-2', slug: 'milomas', tenant_id: 'tenant-2' }],
      project_domains: [{ project_id: 'proj-2', tenant_id: 'tenant-2', domain: 'milomas.com', status: 'pending' }],
    });
    const cache = createHostResolutionCache();

    const resolved = await resolveProjectForHost(client, 'milomas.com', CUSTOM('milomas.com'), cache);
    expect(resolved).toBeNull();
  });

  it('dominio propio con status failed tampoco resuelve', async () => {
    const { client } = fakeDb({
      project_domains: [{ project_id: 'proj-2', tenant_id: 'tenant-2', domain: 'milomas.com', status: 'failed' }],
    });
    const cache = createHostResolutionCache();

    const resolved = await resolveProjectForHost(client, 'milomas.com', CUSTOM('milomas.com'), cache);
    expect(resolved).toBeNull();
  });

  it('host desconocido (sin fila que matchee) -> null', async () => {
    const { client } = fakeDb({});
    const cache = createHostResolutionCache();

    const resolved = await resolveProjectForHost(client, 'nadie-me-registro.com', CUSTOM('nadie-me-registro.com'), cache);
    expect(resolved).toBeNull();
  });

  it('usa la caché: la segunda resolución del mismo host no vuelve a consultar la base', async () => {
    const { client, calls } = fakeDb({
      tenants: [{ id: 'tenant-1', slug: 'acme' }],
      projects: [{ id: 'proj-1', slug: 'torres-del-lago', tenant_id: 'tenant-1', subdomain: 'torres' }],
    });
    const cache = createHostResolutionCache();

    await resolveProjectForHost(client, 'torres.pages.r360.io', SUBDOMAIN, cache);
    const callsAfterFirst = calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    await resolveProjectForHost(client, 'torres.pages.r360.io', SUBDOMAIN, cache);
    expect(calls.length).toBe(callsAfterFirst); // ninguna consulta nueva: vino de la caché.
  });
});
