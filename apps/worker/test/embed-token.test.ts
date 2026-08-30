import { describe, it, expect } from 'vitest';
import { signEmbedToken, verifyEmbedToken, type EmbedTokenPayload } from '../src/lib/embed-token.ts';

const SECRET = 'test-secret-do-not-use-in-prod';
const SECRETS = { v1: SECRET };

function payload(overrides: Partial<EmbedTokenPayload> = {}): EmbedTokenPayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    tenant: 'acme',
    project: 'torre-norte',
    version: 3,
    iat: now,
    exp: now + 300,
    kid: 'v1',
    ...overrides,
  };
}

describe('embed-token', () => {
  it('acepta una firma válida', async () => {
    const p = payload();
    const token = await signEmbedToken(p, SECRET);
    const result = await verifyEmbedToken(token, { secrets: SECRETS });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload).toEqual(p);
    }
  });

  it('rechaza una firma alterada (payload tocado)', async () => {
    const p = payload();
    const token = await signEmbedToken(p, SECRET);
    const [payloadPart, sigPart] = token.split('.');
    // Alteramos el payload firmado: cambiamos el tenant sin re-firmar.
    const tamperedPayload = Buffer.from(JSON.stringify({ ...p, tenant: 'evil' })).toString('base64url');
    const tampered = `${tamperedPayload}.${sigPart}`;
    void payloadPart;
    const result = await verifyEmbedToken(tampered, { secrets: SECRETS });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('bad_signature');
  });

  it('rechaza una firma con bytes alterados', async () => {
    const p = payload();
    const token = await signEmbedToken(p, SECRET);
    const [payloadPart, sigPart] = token.split('.');
    // Flipeamos un carácter que no esté en la cola de padding del base64url,
    // para garantizar que decodifique a bytes distintos.
    const idx = Math.floor(sigPart!.length / 2);
    const flippedChar = sigPart![idx] === 'A' ? 'B' : 'A';
    const flipped = sigPart!.slice(0, idx) + flippedChar + sigPart!.slice(idx + 1);
    const result = await verifyEmbedToken(`${payloadPart}.${flipped}`, { secrets: SECRETS });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('bad_signature');
  });

  it('rechaza un token expirado', async () => {
    const now = Math.floor(Date.now() / 1000);
    const p = payload({ iat: now - 1000, exp: now - 10 });
    const token = await signEmbedToken(p, SECRET);
    const result = await verifyEmbedToken(token, { secrets: SECRETS, now });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('expired');
  });

  it('acepta justo antes de expirar y rechaza justo al expirar', async () => {
    const p = payload({ exp: 1000 });
    const token = await signEmbedToken(p, SECRET);
    const ok = await verifyEmbedToken(token, { secrets: SECRETS, now: 999 });
    expect(ok.valid).toBe(true);
    const expired = await verifyEmbedToken(token, { secrets: SECRETS, now: 1000 });
    expect(expired.valid).toBe(false);
  });

  it('rechaza un token revocado por tenant (revokedAt) aunque no haya expirado', async () => {
    const now = Math.floor(Date.now() / 1000);
    const p = payload({ iat: now - 100, exp: now + 1000 });
    const token = await signEmbedToken(p, SECRET);
    const result = await verifyEmbedToken(token, {
      secrets: SECRETS,
      now,
      revocation: { revokedAt: now - 50 }, // revocado después de emitido
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('revoked');
  });

  it('un token emitido DESPUÉS de la revocación sigue siendo válido', async () => {
    const now = Math.floor(Date.now() / 1000);
    const p = payload({ iat: now - 10, exp: now + 1000 });
    const token = await signEmbedToken(p, SECRET);
    const result = await verifyEmbedToken(token, {
      secrets: SECRETS,
      now,
      revocation: { revokedAt: now - 50 }, // revocación quedó antes del iat
    });
    expect(result.valid).toBe(true);
  });

  it('rechaza un kid revocado puntualmente', async () => {
    const p = payload({ kid: 'v1' });
    const token = await signEmbedToken(p, SECRET);
    const result = await verifyEmbedToken(token, {
      secrets: SECRETS,
      revocation: { revokedKids: ['v1'] },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('revoked');
  });

  it('rechaza un kid desconocido (secreto no configurado)', async () => {
    const p = payload({ kid: 'v9-no-existe' });
    const token = await signEmbedToken(p, SECRET);
    const result = await verifyEmbedToken(token, { secrets: SECRETS });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('unknown_kid');
  });

  it('rechaza tokens con formato inválido', async () => {
    for (const bad of ['', 'no-dot', 'a.b.c', 'a.']) {
      const result = await verifyEmbedToken(bad, { secrets: SECRETS });
      expect(result.valid).toBe(false);
    }
  });

  it('tenant activo pero con kid distinto por rotación sigue verificando con el mapa de secretos', async () => {
    const p = payload({ kid: 'v2' });
    const token = await signEmbedToken(p, 'otro-secreto');
    const result = await verifyEmbedToken(token, {
      secrets: { v1: SECRET, v2: 'otro-secreto' },
    });
    expect(result.valid).toBe(true);
  });
});
