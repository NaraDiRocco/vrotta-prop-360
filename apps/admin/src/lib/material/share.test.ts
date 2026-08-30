import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHARE_TTL_DAYS,
  MAX_SHARE_TTL_DAYS,
  expiresAtFromDays,
  generateShareToken,
  isShareLinkUsable,
  isShareTokenShaped,
  shareLinkState,
  validateTtlDays,
} from './share.ts';
import { MAX_FILE_BYTES, extensionOf, sanitizeFilename, storagePathFor, validateUpload } from './uploads.ts';
import type { MaterialShareLinkRow } from './types.ts';

const PROJECT = '11111111-1111-4111-8111-111111111111';

function link(patch: Partial<MaterialShareLinkRow> = {}): MaterialShareLinkRow {
  return {
    id: 'l1',
    token: generateShareToken(),
    label: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    expiresAt: null,
    revokedAt: null,
    ...patch,
  };
}

describe('tokens de link compartible', () => {
  it('genera tokens con prefijo y 128 bits de aleatoriedad', () => {
    const token = generateShareToken();
    expect(token).toMatch(/^ml_[0-9a-f]{32}$/);
    expect(isShareTokenShaped(token)).toBe(true);
  });

  it('no repite tokens', () => {
    const tokens = new Set(Array.from({ length: 500 }, generateShareToken));
    expect(tokens.size).toBe(500);
  });

  it('rechaza formas de token que no emitimos nosotros', () => {
    for (const bad of ['', 'ml_', 'ml_xyz', 'pv_0123456789abcdef0123456789abcdef', '0123456789abcdef0123456789abcdef', 'ml_0123456789ABCDEF0123456789abcdef']) {
      expect(isShareTokenShaped(bad), bad).toBe(false);
    }
  });
});

describe('vigencia del link', () => {
  const ahora = new Date('2026-06-01T12:00:00.000Z');

  it('un link nuevo sin vencimiento está activo', () => {
    expect(shareLinkState(link(), ahora)).toBe('activo');
    expect(isShareLinkUsable(link(), ahora)).toBe(true);
  });

  it('vence exactamente en expires_at, no un instante después', () => {
    const justo = link({ expiresAt: ahora.toISOString() });
    expect(shareLinkState(justo, ahora)).toBe('vencido');
    const unSegundoDespues = link({ expiresAt: new Date(ahora.getTime() + 1000).toISOString() });
    expect(shareLinkState(unSegundoDespues, ahora)).toBe('activo');
  });

  it('la revocación gana sobre cualquier vencimiento futuro', () => {
    const revocado = link({
      revokedAt: '2026-05-01T00:00:00.000Z',
      expiresAt: '2027-01-01T00:00:00.000Z',
    });
    expect(shareLinkState(revocado, ahora)).toBe('revocado');
    expect(isShareLinkUsable(revocado, ahora)).toBe(false);
  });

  it('un link vencido no sirve, igual que uno revocado', () => {
    const vencido = link({ expiresAt: '2026-01-01T00:00:00.000Z' });
    expect(isShareLinkUsable(vencido, ahora)).toBe(false);
  });

  it('el TTL por defecto son 30 días', () => {
    const expira = Date.parse(expiresAtFromDays(DEFAULT_SHARE_TTL_DAYS, ahora));
    expect(expira - ahora.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('valida el TTL que llega por API', () => {
    expect(validateTtlDays(30)).toBeNull();
    expect(validateTtlDays(1)).toBeNull();
    expect(validateTtlDays(MAX_SHARE_TTL_DAYS)).toBeNull();
    expect(validateTtlDays(0)).not.toBeNull();
    expect(validateTtlDays(-5)).not.toBeNull();
    expect(validateTtlDays(MAX_SHARE_TTL_DAYS + 1)).not.toBeNull();
    expect(validateTtlDays(1.5)).not.toBeNull();
    expect(validateTtlDays('30')).not.toBeNull();
    expect(validateTtlDays(Number.NaN)).not.toBeNull();
  });
});

describe('validación de archivos', () => {
  it('acepta una panorámica en PNG y rechaza el mismo archivo en .exe', () => {
    expect(validateUpload({ itemId: 'panoramicas-360', filename: 'pano.png', sizeBytes: 1000, mime: 'image/png' })).toBeNull();
    expect(validateUpload({ itemId: 'panoramicas-360', filename: 'pano.exe', sizeBytes: 1000, mime: 'image/png' })).not.toBeNull();
  });

  it('rechaza un ítem que es dato y no archivo', () => {
    const rejection = validateUpload({ itemId: 'contactos-proveedores', filename: 'x.pdf', sizeBytes: 10, mime: 'application/pdf' });
    expect(rejection?.field).toBe('itemId');
  });

  it('rechaza ítems desconocidos: el item_id llega por la URL pública', () => {
    expect(validateUpload({ itemId: '../../etc/passwd', filename: 'x.pdf', sizeBytes: 10, mime: 'application/pdf' })?.field).toBe('itemId');
  });

  it('rechaza archivos vacíos y los que superan el máximo', () => {
    expect(validateUpload({ itemId: 'plano-masterplan', filename: 'a.pdf', sizeBytes: 0, mime: 'application/pdf' })?.field).toBe('file');
    expect(
      validateUpload({ itemId: 'plano-masterplan', filename: 'a.pdf', sizeBytes: MAX_FILE_BYTES + 1, mime: 'application/pdf' })?.field,
    ).toBe('size');
  });

  it('rechaza archivos sin extensión', () => {
    expect(validateUpload({ itemId: 'plano-masterplan', filename: 'plano', sizeBytes: 10, mime: 'application/pdf' })?.field).toBe('filename');
  });
});

describe('nombres y rutas de storage', () => {
  it('sanea nombres con travesía de directorios', () => {
    expect(sanitizeFilename('../../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('C:\\Users\\x\\plano final.pdf')).toBe('plano-final.pdf');
    expect(sanitizeFilename('.hidden')).toBe('hidden');
    expect(sanitizeFilename('')).toBe('archivo');
  });

  it('corta nombres larguísimos', () => {
    expect(sanitizeFilename(`${'a'.repeat(400)}.pdf`).length).toBeLessThanOrEqual(120);
  });

  it('lee la extensión en minúscula y no confunde una ruta con punto', () => {
    expect(extensionOf('PANO.PNG')).toBe('.png');
    expect(extensionOf('carpeta.vieja/archivo')).toBe('');
    expect(extensionOf('.gitignore')).toBe('');
  });

  it('la ruta siempre arranca con el project_id y nunca con el nombre del cliente', () => {
    const path = storagePathFor(PROJECT, 'plano-masterplan', '../../otro-proyecto/plano.pdf');
    expect(path.startsWith(`${PROJECT}/plano-masterplan/`)).toBe(true);
    expect(path).not.toContain('..');
    expect(path.endsWith('.pdf')).toBe(true);
  });

  it('dos subidas del mismo nombre no se pisan', () => {
    const a = storagePathFor(PROJECT, 'plano-masterplan', 'plano.pdf');
    const b = storagePathFor(PROJECT, 'plano-masterplan', 'plano.pdf');
    expect(a).not.toBe(b);
  });
});
