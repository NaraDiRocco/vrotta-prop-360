import { describe, expect, it } from 'vitest';
import { telHref, waHref } from './contact.ts';

describe('telHref', () => {
  it('arma un link tel: con el número tal cual', () => {
    expect(telHref('+598 99 123 456')).toBe('tel:+598 99 123 456');
  });

  it('recorta espacios en los extremos', () => {
    expect(telHref('  099123456  ')).toBe('tel:099123456');
  });
});

describe('waHref', () => {
  it('deja sólo dígitos para wa.me', () => {
    expect(waHref('+598 99 123 456')).toBe('https://wa.me/59899123456');
  });

  it('devuelve null si no quedan dígitos', () => {
    expect(waHref('sin teléfono')).toBeNull();
  });
});
