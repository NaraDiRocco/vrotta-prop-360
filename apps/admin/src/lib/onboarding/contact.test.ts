import { describe, expect, it } from 'vitest';
import { buildContactLinks } from './contact.ts';

describe('buildContactLinks', () => {
  it('no devuelve nada si no hay ninguna variable configurada', () => {
    expect(buildContactLinks({})).toEqual([]);
  });

  it('arma un mailto con asunto cuando hay email', () => {
    const links = buildContactLinks({ email: 'hola@vrotta.com' });
    expect(links).toHaveLength(1);
    expect(links[0]?.href).toBe('mailto:hola@vrotta.com?subject=Acceso%20a%20Vrotta%20Prop%20360');
  });

  it('limpia el número de WhatsApp a solo dígitos', () => {
    const links = buildContactLinks({ whatsapp: '+598 99 123 456' });
    expect(links).toHaveLength(1);
    expect(links[0]?.href).toBe('https://wa.me/59899123456');
  });

  it('prioriza el email primero cuando están las dos', () => {
    const links = buildContactLinks({ email: 'hola@vrotta.com', whatsapp: '59899123456' });
    expect(links.map((l) => l.href)).toEqual([
      'mailto:hola@vrotta.com?subject=Acceso%20a%20Vrotta%20Prop%20360',
      'https://wa.me/59899123456',
    ]);
  });

  it('ignora un email vacío o solo espacios', () => {
    expect(buildContactLinks({ email: '   ' })).toEqual([]);
  });

  it('ignora un whatsapp sin ningún dígito', () => {
    expect(buildContactLinks({ whatsapp: '---' })).toEqual([]);
  });
});
