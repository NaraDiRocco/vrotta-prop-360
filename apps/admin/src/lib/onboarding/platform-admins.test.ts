import { describe, expect, it } from 'vitest';
import { isPlatformAdmin, parsePlatformAdmins } from './platform-admins.ts';

describe('parsePlatformAdmins', () => {
  it('devuelve una lista vacía si la variable falta', () => {
    expect(parsePlatformAdmins(undefined)).toEqual([]);
  });

  it('devuelve una lista vacía si la variable está vacía', () => {
    expect(parsePlatformAdmins('')).toEqual([]);
  });

  it('separa por coma, recorta espacios y baja a minúsculas', () => {
    expect(parsePlatformAdmins(' Dueña@Vrotta.com , otro@vrotta.com ')).toEqual([
      'dueña@vrotta.com',
      'otro@vrotta.com',
    ]);
  });

  it('descarta entradas vacías (comas de más)', () => {
    expect(parsePlatformAdmins('a@x.com,,b@x.com,')).toEqual(['a@x.com', 'b@x.com']);
  });
});

describe('isPlatformAdmin', () => {
  it('cierra el alta si la variable no está configurada', () => {
    expect(isPlatformAdmin('dueña@vrotta.com', undefined)).toBe(false);
  });

  it('autoriza a un email de la lista sin importar mayúsculas', () => {
    expect(isPlatformAdmin('Dueña@Vrotta.com', 'dueña@vrotta.com')).toBe(true);
  });

  it('rechaza a quien no está en la lista', () => {
    expect(isPlatformAdmin('intruso@otro.com', 'dueña@vrotta.com')).toBe(false);
  });

  it('rechaza si no hay email de sesión', () => {
    expect(isPlatformAdmin(null, 'dueña@vrotta.com')).toBe(false);
    expect(isPlatformAdmin(undefined, 'dueña@vrotta.com')).toBe(false);
  });
});
