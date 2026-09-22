import { describe, expect, it } from 'vitest';
import { createUploadRateLimitCounter, withinUploadRateLimit } from './rate-limit.ts';

describe('withinUploadRateLimit', () => {
  it('deja pasar hasta el límite y corta el siguiente', () => {
    const counter = createUploadRateLimitCounter();
    const now = Date.now();
    for (let i = 0; i < 3; i++) {
      expect(withinUploadRateLimit('tok_a', now, 3, 600, counter)).toBe(true);
    }
    expect(withinUploadRateLimit('tok_a', now, 3, 600, counter)).toBe(false);
  });

  it('tokens distintos no comparten contador', () => {
    const counter = createUploadRateLimitCounter();
    const now = Date.now();
    for (let i = 0; i < 3; i++) expect(withinUploadRateLimit('tok_a', now, 3, 600, counter)).toBe(true);
    // El token B arranca en cero, no hereda el conteo del A.
    expect(withinUploadRateLimit('tok_b', now, 3, 600, counter)).toBe(true);
  });

  it('una vez que pasa la ventana, el contador se reinicia solo', () => {
    const counter = createUploadRateLimitCounter();
    const now = Date.now();
    for (let i = 0; i < 3; i++) expect(withinUploadRateLimit('tok_a', now, 3, 600, counter)).toBe(true);
    expect(withinUploadRateLimit('tok_a', now, 3, 600, counter)).toBe(false);
    // 10 minutos después, ventana nueva: la clave cambia de índice.
    const later = now + 600_000;
    expect(withinUploadRateLimit('tok_a', later, 3, 600, counter)).toBe(true);
  });

  it('poda la ventana anterior del mismo token al avanzar de ventana', () => {
    const counter = createUploadRateLimitCounter();
    withinUploadRateLimit('tok_a', 0, 3, 600, counter);
    expect(counter.get('tok_a:0')).toBe(1);

    withinUploadRateLimit('tok_a', 600_000, 3, 600, counter);
    expect(counter.get('tok_a:0')).toBeUndefined();
    expect(counter.get('tok_a:1')).toBe(1);
  });

  it('usa el contador global por default, así que dos llamadas sin contador propio comparten estado', () => {
    const now = Date.now();
    const token = `tok_default_${now}`; // token único para no chocar con otros tests del proceso
    for (let i = 0; i < 30; i++) {
      expect(withinUploadRateLimit(token, now)).toBe(true);
    }
    expect(withinUploadRateLimit(token, now)).toBe(false);
  });
});
