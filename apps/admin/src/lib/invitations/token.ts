/**
 * Token de invitación: 32 bytes de `crypto.randomBytes`, nunca
 * `crypto.randomUUID()` (128 bits, la mitad). No es un token que viaje por
 * URL en cada request como un access token: se usa UNA vez para aceptar, así
 * que conviene que el margen de fuerza bruta sea aún más generoso que el de
 * `material_share_links` (ver `lib/material/share.ts`), porque acá lo que
 * se filtra es un ROL, no acceso a un solo proyecto.
 *
 * Sólo el HASH (sha256 en hex) se guarda en `invitations.token_hash`
 * (migración 0020): el token en claro existe nada más que en la respuesta
 * del POST que lo crea y en el link que se manda — nunca en la base. El
 * mismo algoritmo de hash lo usa la RPC `accept_invitation` (con `digest()`
 * de pgcrypto), así que hay que mantenerlos en sincro si esto cambia.
 */
import { createHash, randomBytes } from 'node:crypto';

const TOKEN_PREFIX = 'inv_';

export function generateInvitationToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString('base64url');
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
