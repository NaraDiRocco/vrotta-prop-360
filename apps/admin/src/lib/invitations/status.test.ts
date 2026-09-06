import { describe, expect, it } from 'vitest';
import { invitationStatus } from './status.ts';

const FUTURE = new Date(Date.now() + 60_000).toISOString();
const PAST = new Date(Date.now() - 60_000).toISOString();

describe('invitationStatus', () => {
  it('revocada gana sobre cualquier otra condición', () => {
    expect(invitationStatus({ acceptedAt: null, revokedAt: PAST, expiresAt: FUTURE })).toBe('revocada');
    expect(invitationStatus({ acceptedAt: FUTURE, revokedAt: PAST, expiresAt: FUTURE })).toBe('revocada');
  });

  it('aceptada si no está revocada y tiene accepted_at', () => {
    expect(invitationStatus({ acceptedAt: PAST, revokedAt: null, expiresAt: FUTURE })).toBe('aceptada');
  });

  it('vencida si no está aceptada ni revocada y ya pasó expires_at', () => {
    expect(invitationStatus({ acceptedAt: null, revokedAt: null, expiresAt: PAST })).toBe('vencida');
  });

  it('pendiente en el caso normal', () => {
    expect(invitationStatus({ acceptedAt: null, revokedAt: null, expiresAt: FUTURE })).toBe('pendiente');
  });
});
