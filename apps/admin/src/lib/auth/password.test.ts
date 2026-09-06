import { describe, expect, it } from 'vitest';
import { checkNewPassword, checkPassword, MIN_PASSWORD_LENGTH } from './password.ts';

describe('checkPassword', () => {
  it('rechaza una contraseña más corta que el mínimo', () => {
    const result = checkPassword('abc123');
    expect(result.ok).toBe(false);
    expect(result.error).toContain(`${MIN_PASSWORD_LENGTH}`);
  });

  it('rechaza una contraseña sin letras', () => {
    const result = checkPassword('12345678');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('letra');
  });

  it('rechaza una contraseña sin números', () => {
    const result = checkPassword('abcdefgh');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('número');
  });

  it('acepta una contraseña que combina letras y números', () => {
    const result = checkPassword('abcd1234');
    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
  });
});

describe('checkNewPassword', () => {
  it('rechaza si la contraseña de base es inválida, antes de mirar la confirmación', () => {
    const result = checkNewPassword('corta1', 'corta1');
    expect(result.ok).toBe(false);
    expect(result.error).toContain(`${MIN_PASSWORD_LENGTH}`);
  });

  it('rechaza si no coincide con la confirmación', () => {
    const result = checkNewPassword('abcd1234', 'abcd1235');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Las contraseñas no coinciden.');
  });

  it('acepta cuando la contraseña es válida y coincide', () => {
    const result = checkNewPassword('abcd1234', 'abcd1234');
    expect(result.ok).toBe(true);
  });
});
