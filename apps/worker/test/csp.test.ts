import { describe, it, expect } from 'vitest';
import { buildFrameAncestorsCsp, getTenantConfig, type KvLike } from '../src/lib/csp.ts';

function fakeKv(store: Record<string, unknown>): KvLike {
  return {
    async get(key) {
      return store[key] ?? null;
    },
  };
}

describe('csp / frame-ancestors', () => {
  it("tenant inexistente -> 'none'", async () => {
    const kv = fakeKv({});
    const config = await getTenantConfig(kv, 'no-existe');
    expect(config).toBeNull();
    expect(buildFrameAncestorsCsp(config)).toBe("frame-ancestors 'none'");
  });

  it("tenant inactivo -> 'none' aunque tenga ancestros configurados", async () => {
    const kv = fakeKv({
      'tenant:acme': { active: false, allowedAncestors: ['https://acme.com'] },
    });
    const config = await getTenantConfig(kv, 'acme');
    expect(buildFrameAncestorsCsp(config)).toBe("frame-ancestors 'none'");
  });

  it('tenant activo con ancestros -> los lista', async () => {
    const kv = fakeKv({
      'tenant:acme': { active: true, allowedAncestors: ['https://acme.com', 'https://www.acme.com'] },
    });
    const config = await getTenantConfig(kv, 'acme');
    expect(buildFrameAncestorsCsp(config)).toBe('frame-ancestors https://acme.com https://www.acme.com');
  });

  it("tenant activo sin ancestros configurados -> 'none' (fail closed)", async () => {
    const kv = fakeKv({ 'tenant:acme': { active: true, allowedAncestors: [] } });
    const config = await getTenantConfig(kv, 'acme');
    expect(buildFrameAncestorsCsp(config)).toBe("frame-ancestors 'none'");
  });

  it('config malformada en KV se trata como tenant inexistente', async () => {
    const kv = fakeKv({ 'tenant:acme': { active: true } }); // sin allowedAncestors
    const config = await getTenantConfig(kv, 'acme');
    expect(config).toBeNull();
  });
});
