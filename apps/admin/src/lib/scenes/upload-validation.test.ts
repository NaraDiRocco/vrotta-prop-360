import { describe, expect, it } from 'vitest';
import { MIN_PANORAMA_WIDTH, validateSceneUpload } from './upload-validation.ts';

describe('validateSceneUpload', () => {
  it('acepta un panorama equirectangular 2:1 de resolución suficiente', () => {
    const result = validateSceneUpload({
      kind: 'panorama',
      file: { name: 'a.jpg', size: 5 * 1024 * 1024, type: 'image/jpeg' },
      dimensions: { width: 8192, height: 4096 },
    });
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('rechaza un panorama 16:9 con el detalle de la relación detectada', () => {
    const result = validateSceneUpload({
      kind: 'panorama',
      file: { name: 'a.jpg', size: 1024, type: 'image/jpeg' },
      dimensions: { width: 3840, height: 2160 },
    });
    expect(result.ok).toBe(false);
    const aspect = result.issues.find((i) => i.code === 'aspecto');
    expect(aspect?.message).toContain('16:9');
  });

  it('rechaza resolución insuficiente con el mínimo requerido en el mensaje', () => {
    const result = validateSceneUpload({
      kind: 'panorama',
      file: { name: 'a.jpg', size: 1024, type: 'image/jpeg' },
      dimensions: { width: 2048, height: 1024 },
    });
    expect(result.ok).toBe(false);
    const res = result.issues.find((i) => i.code === 'resolucion');
    expect(res?.message).toContain('2048px');
    expect(res?.message).toContain(String(MIN_PANORAMA_WIDTH));
  });

  it('rechaza un formato no soportado', () => {
    const result = validateSceneUpload({
      kind: 'panorama',
      file: { name: 'a.gif', size: 1024, type: 'image/gif' },
      dimensions: { width: 8192, height: 4096 },
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'formato')).toBe(true);
  });

  it('rechaza un archivo demasiado grande', () => {
    const result = validateSceneUpload({
      kind: 'panorama',
      file: { name: 'a.jpg', size: 500 * 1024 * 1024, type: 'image/jpeg' },
      dimensions: { width: 8192, height: 4096 },
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'tamano')).toBe(true);
  });

  it('acepta un plano sin exigir 2:1', () => {
    const result = validateSceneUpload({
      kind: 'floorplan',
      file: { name: 'plano.png', size: 1024, type: 'image/png' },
      dimensions: { width: 2000, height: 1500 },
    });
    expect(result.ok).toBe(true);
  });

  it('no exige dimensiones para video', () => {
    const result = validateSceneUpload({
      kind: 'video',
      file: { name: 'v.mp4', size: 1024, type: 'video/mp4' },
    });
    expect(result.ok).toBe(true);
  });

  it('acumula varios issues a la vez', () => {
    const result = validateSceneUpload({
      kind: 'panorama',
      file: { name: 'a.gif', size: 500 * 1024 * 1024, type: 'image/gif' },
      dimensions: { width: 1000, height: 900 },
    });
    expect(result.issues.length).toBeGreaterThanOrEqual(3);
  });
});
