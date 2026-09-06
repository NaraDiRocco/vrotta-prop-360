import { describe, expect, it } from 'vitest';
import { translateAuthError } from './errors.ts';

describe('translateAuthError', () => {
  it('traduce credenciales inválidas', () => {
    expect(translateAuthError('Invalid login credentials')).toBe('Correo o contraseña incorrectos.');
  });

  it('traduce el mínimo de caracteres con el número que vino en el mensaje', () => {
    expect(translateAuthError('Password should be at least 6 characters.')).toBe(
      'La contraseña tiene que tener al menos 6 caracteres.',
    );
  });

  it('traduce el rate limit con la espera exacta', () => {
    expect(
      translateAuthError('For security purposes, you can only request this after 23 seconds.'),
    ).toBe('Por seguridad, esperá 23 segundos antes de volver a pedirlo.');
  });

  it('traduce usuario ya registrado', () => {
    expect(translateAuthError('User already registered')).toContain('Ya existe una cuenta');
  });

  it('deja pasar un mensaje que no reconoce', () => {
    expect(translateAuthError('Something totally unexpected happened')).toBe(
      'Something totally unexpected happened',
    );
  });
});
