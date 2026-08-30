import { describe, it, expect } from 'vitest';
import { checkHotlink } from '../src/lib/hotlink.ts';

function headers(map: Record<string, string>) {
  return { get: (name: string) => map[name] ?? null };
}

const ALLOWED_HOSTS = ['viewer.r360.io', 'cdn.r360.io'];

describe('hotlink', () => {
  it('Sec-Fetch-Site: cross-site se bloquea', () => {
    const d = checkHotlink(headers({ 'Sec-Fetch-Site': 'cross-site' }), { allowedHosts: ALLOWED_HOSTS });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('cross_site');
  });

  it('Sec-Fetch-Site: same-site se permite', () => {
    const d = checkHotlink(headers({ 'Sec-Fetch-Site': 'same-site' }), { allowedHosts: ALLOWED_HOSTS });
    expect(d.allowed).toBe(true);
  });

  it('Sec-Fetch-Site: same-origin se permite', () => {
    const d = checkHotlink(headers({ 'Sec-Fetch-Site': 'same-origin' }), { allowedHosts: ALLOWED_HOSTS });
    expect(d.allowed).toBe(true);
  });

  it('Sec-Fetch-Site: none (navegación directa) se permite', () => {
    const d = checkHotlink(headers({ 'Sec-Fetch-Site': 'none' }), { allowedHosts: ALLOWED_HOSTS });
    expect(d.allowed).toBe(true);
    expect(d.reason).toBe('direct_navigation');
  });

  it('sin Sec-Fetch-Site, con Referer permitido -> permite', () => {
    const d = checkHotlink(headers({ Referer: 'https://cdn.r360.io/embed/acme' }), {
      allowedHosts: ALLOWED_HOSTS,
    });
    expect(d.allowed).toBe(true);
    expect(d.reason).toBe('referer_allowed');
  });

  it('sin Sec-Fetch-Site, con Referer NO permitido -> bloquea', () => {
    const d = checkHotlink(headers({ Referer: 'https://evil.example/steal-tiles' }), {
      allowedHosts: ALLOWED_HOSTS,
    });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('referer_denied');
  });

  it('sin Sec-Fetch-Site y sin Referer -> permite (no penaliza falta de señal)', () => {
    const d = checkHotlink(headers({}), { allowedHosts: ALLOWED_HOSTS });
    expect(d.allowed).toBe(true);
    expect(d.reason).toBe('no_site_no_signal');
  });

  it('Referer malformado se trata como no coincidente -> bloquea', () => {
    const d = checkHotlink(headers({ Referer: 'no-es-una-url' }), { allowedHosts: ALLOWED_HOSTS });
    expect(d.allowed).toBe(false);
  });

  it('Sec-Fetch-Site tiene prioridad sobre un Referer que diría lo contrario', () => {
    const d = checkHotlink(
      headers({ 'Sec-Fetch-Site': 'cross-site', Referer: 'https://cdn.r360.io/embed/acme' }),
      { allowedHosts: ALLOWED_HOSTS },
    );
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('cross_site');
  });
});
