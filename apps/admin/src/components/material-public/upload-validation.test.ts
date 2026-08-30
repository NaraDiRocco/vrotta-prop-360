import { describe, expect, it } from 'vitest';
import { MAX_MATERIAL_UPLOAD_BYTES, validateMaterialUpload } from './upload-validation.ts';

const item = { extensiones: ['pdf', 'dwg', 'ai'] };

describe('validateMaterialUpload', () => {
  it('acepta un archivo con extensión permitida y peso normal', () => {
    const result = validateMaterialUpload(item, { name: 'masterplan.pdf', size: 5 * 1024 * 1024 });
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('rechaza una extensión no listada', () => {
    const result = validateMaterialUpload(item, { name: 'masterplan.zip', size: 1024 });
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe('extension');
  });

  it('no valida extensión si el ítem no declara ninguna', () => {
    const result = validateMaterialUpload({ extensiones: undefined }, { name: 'lo-que-sea.xyz', size: 1024 });
    expect(result.ok).toBe(true);
  });

  it('rechaza un archivo vacío', () => {
    const result = validateMaterialUpload(item, { name: 'masterplan.pdf', size: 0 });
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe('vacio');
  });

  it('rechaza un archivo que excede el máximo', () => {
    const result = validateMaterialUpload(item, {
      name: 'masterplan.pdf',
      size: MAX_MATERIAL_UPLOAD_BYTES + 1,
    });
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe('tamano');
  });

  it('es insensible a mayúsculas y al punto inicial en las extensiones', () => {
    const result = validateMaterialUpload({ extensiones: ['.PDF'] }, { name: 'plano.pdf', size: 1024 });
    expect(result.ok).toBe(true);
  });

  it('acumula más de un problema a la vez', () => {
    const result = validateMaterialUpload(item, { name: 'plano.zip', size: 0 });
    expect(result.issues.map((i) => i.code).sort()).toEqual(['extension', 'vacio']);
  });
});
