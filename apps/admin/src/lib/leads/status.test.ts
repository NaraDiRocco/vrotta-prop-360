import { describe, expect, test } from 'vitest';
import { LEAD_STATUSES, LEAD_STATUS_TOKENS, isLeadStatus, leadStatusLabel } from './status.ts';

describe('vocabulario visual de estados de lead', () => {
  test('cada estado tiene un token completo', () => {
    for (const status of LEAD_STATUSES) {
      const token = LEAD_STATUS_TOKENS[status];
      expect(token).toBeTruthy();
      expect(typeof token.label).toBe('string');
      expect(token.label.length).toBeGreaterThan(0);
      expect(typeof token.tone).toBe('string');
      expect(typeof token.order).toBe('number');
    }
  });

  test('el plan pide un tono distinto por estado: ninguno se repite', () => {
    const tones = LEAD_STATUSES.map((status) => LEAD_STATUS_TOKENS[status].tone);
    expect(new Set(tones).size).toBe(tones.length);
  });

  test('"ganado" y "descartado" no comparten tono (hoy se ven iguales, es el bug que esto arregla)', () => {
    expect(LEAD_STATUS_TOKENS.ganado.tone).not.toBe(LEAD_STATUS_TOKENS.descartado.tone);
  });

  test('mapeo exacto del plan: nuevo=accent, calificado=warn, ganado=ok, descartado=faint', () => {
    expect(LEAD_STATUS_TOKENS.nuevo.tone).toBe('accent');
    expect(LEAD_STATUS_TOKENS.calificado.tone).toBe('warn');
    expect(LEAD_STATUS_TOKENS.ganado.tone).toBe('ok');
    expect(LEAD_STATUS_TOKENS.descartado.tone).toBe('faint');
  });

  test('el orden sigue el ciclo de vida, no el alfabético', () => {
    const ordered = [...LEAD_STATUSES].sort(
      (a, b) => LEAD_STATUS_TOKENS[a].order - LEAD_STATUS_TOKENS[b].order,
    );
    expect(ordered).toEqual(['nuevo', 'contactado', 'calificado', 'ganado', 'descartado']);
  });

  test('isLeadStatus distingue estados válidos de basura', () => {
    expect(isLeadStatus('ganado')).toBe(true);
    expect(isLeadStatus('inventado')).toBe(false);
    expect(isLeadStatus('')).toBe(false);
  });

  test('leadStatusLabel da la etiqueta legible, no el enum crudo', () => {
    expect(leadStatusLabel('contactado')).toBe('Contactado');
    expect(leadStatusLabel('contactado')).not.toBe('contactado');
  });
});
