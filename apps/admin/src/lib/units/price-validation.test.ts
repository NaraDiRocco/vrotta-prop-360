import { describe, expect, it } from 'vitest';
import { validatePriceInput } from './price-validation.ts';

describe('validatePriceInput', () => {
  it('acepta un precio válido', () => {
    const result = validatePriceInput({ amount: 125000, currency: 'USD', visibility: 'public' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ amount: 125000, currency: 'USD', visibility: 'public' });
  });

  it('rechaza un cuerpo que no es un objeto', () => {
    const result = validatePriceInput(null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('body');
  });

  it('rechaza un monto negativo', () => {
    const result = validatePriceInput({ amount: -1, currency: 'USD', visibility: 'public' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('amount');
  });

  it('rechaza un monto que no es un número', () => {
    const result = validatePriceInput({ amount: '125000', currency: 'USD', visibility: 'public' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('amount');
  });

  it('rechaza una moneda fuera del catálogo', () => {
    const result = validatePriceInput({ amount: 100, currency: 'EUR', visibility: 'public' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('currency');
  });

  it('rechaza visibilidad "private": ese formulario no la ofrece', () => {
    const result = validatePriceInput({ amount: 100, currency: 'USD', visibility: 'private' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('visibility');
  });

  it('rechaza una visibilidad inventada', () => {
    const result = validatePriceInput({ amount: 100, currency: 'USD', visibility: 'secreto' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('visibility');
  });
});
