import { describe, expect, it } from 'vitest';
import { generateInvitationToken, hashInvitationToken } from './token.ts';

describe('invitation token', () => {
  it('genera tokens únicos con el prefijo esperado', () => {
    const a = generateInvitationToken();
    const b = generateInvitationToken();
    expect(a).not.toBe(b);
    expect(a.startsWith('inv_')).toBe(true);
    expect(a.length).toBeGreaterThan(40); // 32 bytes en base64url, más el prefijo
  });

  it('el hash es determinístico y en hex', () => {
    const token = 'inv_ejemplo-fijo-para-el-test';
    const h1 = hashInvitationToken(token);
    const h2 = hashInvitationToken(token);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/); // sha256 en hex: 32 bytes = 64 chars
  });

  it('tokens distintos producen hashes distintos', () => {
    expect(hashInvitationToken('a')).not.toBe(hashInvitationToken('b'));
  });

  it('nunca devuelve el token dentro del hash', () => {
    const token = 'inv_no-deberia-aparecer-esto-en-el-hash';
    expect(hashInvitationToken(token)).not.toContain(token);
  });
});
