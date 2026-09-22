/**
 * Tokens de embed: HMAC-SHA256 sobre un payload JSON compacto, firmado con
 * Web Crypto (`crypto.subtle`) — sin librerías externas, corre igual en
 * Workers y en Node/vitest.
 *
 * Formato: `base64url(payload).base64url(firma)`. La firma cubre exactamente
 * los bytes del payload serializado (no se re-serializa nada del lado de
 * verify, para evitar problemas de canonicalización de JSON).
 *
 * Rotación de secreto: cada token lleva `kid`. `verify` recibe un mapa
 * `kid -> secreto` (en prod, hoy sólo hay un secreto activo en
 * EMBED_HMAC_SECRET bajo un kid fijo; el mapa deja la puerta abierta a tener
 * dos secretos vivos mientras se rota uno).
 *
 * Revocación: independiente del TTL. Se corta por tenant escribiendo en KV
 * `revoked:{tenant}` un timestamp `revokedAt` (epoch ms) — todo token con
 * `iat` anterior a ese valor deja de ser válido al instante, sin esperar a
 * que expire. También se puede revocar por `kid` puntual.
 */

export interface EmbedTokenPayload {
  tenant: string;
  project: string;
  version: number;
  /** issued at, epoch seconds */
  iat: number;
  /** expiry, epoch seconds */
  exp: number;
  /** key id, para rotación de secreto */
  kid: string;
}

export type VerifyFailureReason =
  | 'malformed'
  | 'bad_signature'
  | 'expired'
  | 'unknown_kid'
  | 'revoked';

export type VerifyResult =
  | { valid: true; payload: EmbedTokenPayload }
  | { valid: false; reason: VerifyFailureReason };

export interface RevocationState {
  /** Todo token con iat < revokedAt para este tenant es inválido. */
  revokedAt?: number;
  /** kids puntuales revocados, independientemente del iat. */
  revokedKids?: string[];
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// `CryptoKey` no es un tipo global sin `lib: "dom"` (que este Worker no usa,
// ver tsconfig.json) ni @cloudflare/workers-types (que ya no se usa desde que
// corre en Node - ver env.ts). @types/node expone el mismo tipo, pero
// namespaced bajo `webcrypto`: el `crypto` global de Node es justo
// `webcrypto.Crypto`, así que esto sigue siendo el resultado real de
// `crypto.subtle.importKey`, no un tipo distinto.
async function hmacKey(secret: string): Promise<import('node:crypto').webcrypto.CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function hmacSign(secret: string, data: Uint8Array): Promise<Uint8Array> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, data);
  return new Uint8Array(sig);
}

/** Comparación en tiempo constante — no cortar en el primer byte distinto. */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    const av = i < a.length ? a[i]! : 0;
    const bv = i < b.length ? b[i]! : 0;
    diff |= av ^ bv;
  }
  return diff === 0;
}

/**
 * Misma comparación en tiempo constante, pero para strings (p.ej. un bearer
 * token contra un secreto de entorno) — se reusa acá en vez de reimplementar
 * el mismo cuidado en cada lugar que compara un secreto.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  return constantTimeEqual(new TextEncoder().encode(a), new TextEncoder().encode(b));
}

export async function signEmbedToken(
  payload: EmbedTokenPayload,
  secret: string,
): Promise<string> {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const sig = await hmacSign(secret, payloadBytes);
  return `${toBase64Url(payloadBytes)}.${toBase64Url(sig)}`;
}

export interface VerifyOptions {
  /** kid -> secreto activo. */
  secrets: Record<string, string>;
  /** epoch seconds "ahora" — inyectable para tests. */
  now?: number;
  revocation?: RevocationState;
}

export async function verifyEmbedToken(token: string, opts: VerifyOptions): Promise<VerifyResult> {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { valid: false, reason: 'malformed' };

  let payloadBytes: Uint8Array;
  let sigBytes: Uint8Array;
  let payload: EmbedTokenPayload;
  try {
    payloadBytes = fromBase64Url(parts[0]);
    sigBytes = fromBase64Url(parts[1]);
    payload = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return { valid: false, reason: 'malformed' };
  }

  if (
    typeof payload.tenant !== 'string' ||
    typeof payload.project !== 'string' ||
    typeof payload.version !== 'number' ||
    typeof payload.iat !== 'number' ||
    typeof payload.exp !== 'number' ||
    typeof payload.kid !== 'string'
  ) {
    return { valid: false, reason: 'malformed' };
  }

  const secret = opts.secrets[payload.kid];
  if (!secret) return { valid: false, reason: 'unknown_kid' };

  const expectedSig = await hmacSign(secret, payloadBytes);
  if (!constantTimeEqual(expectedSig, sigBytes)) {
    return { valid: false, reason: 'bad_signature' };
  }

  // La revocación se chequea DESPUÉS de validar la firma (no confiamos en un
  // payload no verificado), pero ANTES que nada dependa de la vigencia normal.
  const revocation = opts.revocation;
  if (revocation?.revokedKids?.includes(payload.kid)) {
    return { valid: false, reason: 'revoked' };
  }
  if (revocation?.revokedAt !== undefined && payload.iat < revocation.revokedAt) {
    return { valid: false, reason: 'revoked' };
  }

  if (payload.exp <= now) {
    return { valid: false, reason: 'expired' };
  }

  return { valid: true, payload };
}

const REVOCATION_KEY = (tenant: string) => `revoked:${tenant}`;

export interface KvGetSet {
  get(key: string, opts?: { type?: 'json' | 'text' }): Promise<unknown>;
  put(key: string, value: string): Promise<void>;
}

export async function loadRevocationState(kv: KvGetSet, tenant: string): Promise<RevocationState> {
  const raw = await kv.get(REVOCATION_KEY(tenant), { type: 'json' });
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Partial<RevocationState>;
  return { revokedAt: r.revokedAt, revokedKids: r.revokedKids };
}

/** Revoca todo token emitido hasta ahora para un tenant, al instante. */
export async function revokeTenantTokensNow(kv: KvGetSet, tenant: string): Promise<void> {
  const state = await loadRevocationState(kv, tenant);
  const next: RevocationState = { ...state, revokedAt: Math.floor(Date.now() / 1000) };
  await kv.put(REVOCATION_KEY(tenant), JSON.stringify(next));
}
