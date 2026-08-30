import { describe, expect, it } from 'vitest';
import type { ProjectKind } from '@r360/core';
import { MATERIAL_CATALOG, catalogByCategory, catalogFor, materialItem } from './catalog.ts';
import { publicItem } from './share.ts';
import { buildEntries, summarize, summaryFor } from './summary.ts';
import type { MaterialFileRow, MaterialStateRow } from './types.ts';

const KINDS: ProjectKind[] = ['loteo', 'edificio', 'complejo', 'mixto'];

describe('catálogo de material', () => {
  it('tiene ids únicos y estables (son la clave que se guarda en la base)', () => {
    const ids = MATERIAL_CATALOG.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('completa los campos obligatorios del brief en todos los ítems', () => {
    for (const item of MATERIAL_CATALOG) {
      expect(item.nombre.length, item.id).toBeGreaterThan(0);
      expect(item.queEs.length, item.id).toBeGreaterThan(0);
      expect(item.paraQue.length, item.id).toBeGreaterThan(0);
      expect(item.formato.length, item.id).toBeGreaterThan(0);
      expect(item.siNoLoTienen.length, item.id).toBeGreaterThan(0);
      expect(item.aplicaA.length, item.id).toBeGreaterThan(0);
    }
  });

  it('sólo declara extensiones en los ítems que aceptan archivos', () => {
    for (const item of MATERIAL_CATALOG) {
      if (!item.aceptaArchivos) expect(item.extensiones, item.id).toBeUndefined();
      else expect(item.extensiones?.length, item.id).toBeGreaterThan(0);
    }
  });

  it('usa extensiones normalizadas: minúscula y con punto', () => {
    for (const item of MATERIAL_CATALOG) {
      for (const ext of item.extensiones ?? []) expect(ext).toMatch(/^\.[a-z0-9]+$/);
    }
  });

  it('todos los tipos de proyecto reciben los 8 obligatorios del brief', () => {
    // Resumen "qué es imprescindible para arrancar": masterplan, plantas,
    // panorámicas, listado de unidades, logo, disclaimers, ubicación y contactos.
    const esperados = [
      'plano-masterplan',
      'plantas-tipologia',
      'panoramicas-360',
      'listado-unidades',
      'logo-vectorial',
      'disclaimers-legales',
      'ubicacion-coordenadas',
      'contactos-proveedores',
    ];
    for (const kind of KINDS) {
      const obligatorios = catalogFor(kind)
        .filter((i) => i.requisito === 'obligatorio')
        .map((i) => i.id);
      expect(obligatorios.sort(), kind).toEqual([...esperados].sort());
    }
  });

  it('no le pide cortes técnicos a un edificio ni mensura a un edificio', () => {
    const edificio = catalogFor('edificio').map((i) => i.id);
    expect(edificio).not.toContain('cortes-vistas-tecnicas');
    expect(edificio).not.toContain('poligono-geojson');

    const complejo = catalogFor('complejo').map((i) => i.id);
    expect(complejo).toContain('cortes-vistas-tecnicas');
    expect(complejo).toContain('poligono-geojson');
  });

  it('un ítem "recomendado" con condición explica cuándo pasa a obligatorio', () => {
    for (const item of MATERIAL_CATALOG) {
      if (item.obligatorioSi !== undefined) {
        expect(item.requisito, item.id).not.toBe('obligatorio');
        expect(item.obligatorioSi.length).toBeGreaterThan(10);
      }
    }
  });

  it('los ítems con precio de referencia también dicen quién y dónde', () => {
    // No hay dato de precio sin proveedor: si no sabemos a quién llamar, el
    // número no sirve para nada.
    for (const item of MATERIAL_CATALOG) {
      if (item.precioReferencia !== undefined) {
        expect(item.quienLoHace, item.id).toBeTruthy();
        expect(item.dondeContratarlo, item.id).toBeTruthy();
      }
    }
  });

  it('agrupa por categoría sin repetir una categoría en dos bloques', () => {
    for (const kind of KINDS) {
      const cats = catalogByCategory(kind).map((c) => c.categoria);
      expect(new Set(cats).size, kind).toBe(cats.length);
      const total = catalogByCategory(kind).reduce((n, c) => n + c.items.length, 0);
      expect(total).toBe(catalogFor(kind).length);
    }
  });

  it('resuelve un ítem por id y devuelve undefined para uno inventado', () => {
    expect(materialItem('panoramicas-360')?.nombre).toContain('Panorámicas');
    expect(materialItem('no-existe')).toBeUndefined();
  });
});

describe('proyección pública', () => {
  it('nunca filtra precios ni proveedores al link del cliente', () => {
    for (const item of MATERIAL_CATALOG) {
      const pub = publicItem(item) as unknown as Record<string, unknown>;
      expect(pub['precioReferencia'], item.id).toBeUndefined();
      expect(pub['dondeContratarlo'], item.id).toBeUndefined();
    }
  });

  it('conserva lo que el cliente necesita para conseguir el material', () => {
    const pano = publicItem(materialItem('panoramicas-360')!);
    expect(pano.formato).toContain('8192');
    expect(pano.quienLoHace).toBeTruthy();
    expect(pano.comoSeHace).toBeTruthy();
    expect(pano.siNoLoTienen).toBeTruthy();
  });
});

describe('resumen del checklist', () => {
  const file = (itemId: string): MaterialFileRow => ({
    id: `f-${itemId}`,
    itemId,
    storagePath: `p/${itemId}/x.pdf`,
    filename: 'x.pdf',
    sizeBytes: 10,
    mime: 'application/pdf',
    uploadedVia: 'link',
    uploadedByEmail: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  });

  const state = (itemId: string, status: MaterialStateRow['status']): MaterialStateRow => ({
    itemId,
    status,
    notes: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedByEmail: null,
  });

  it('un proyecto sin nada tiene todos sus obligatorios faltando', () => {
    const s = summaryFor('loteo', [], []);
    expect(s.obligatorios).toBe(8);
    expect(s.obligatoriosFaltantes).toBe(8);
    expect(s.progreso).toBe(0);
  });

  it('sólo aprobado y no_aplica cierran un obligatorio', () => {
    const states = [
      state('plano-masterplan', 'aprobado'),
      state('plantas-tipologia', 'recibido'),
      state('panoramicas-360', 'solicitado'),
      state('listado-unidades', 'no_aplica'),
    ];
    const s = summaryFor('edificio', states, []);
    expect(s.obligatoriosFaltantes).toBe(6);
    expect(s.faltantes).toContain('plantas-tipologia');
    expect(s.faltantes).not.toContain('plano-masterplan');
    expect(s.recibidosSinAprobar).toBe(1);
  });

  it('ignora estados de ítems que no aplican a ese tipo de proyecto', () => {
    const s = summaryFor('edificio', [state('cortes-vistas-tecnicas', 'aprobado')], [file('cortes-vistas-tecnicas')]);
    expect(s.total).toBe(catalogFor('edificio').length);
    expect(s.archivos).toBe(0);
  });

  it('pega los archivos a su ítem y deja el resto vacío', () => {
    const entries = buildEntries('loteo', [], [file('plano-masterplan'), file('plano-masterplan')]);
    const masterplan = entries.find((e) => e.item.id === 'plano-masterplan');
    expect(masterplan?.files).toHaveLength(2);
    expect(summarize(entries).archivos).toBe(2);
    expect(entries.every((e) => e.item.id === 'plano-masterplan' || e.files.length === 0)).toBe(true);
  });

  it('los ítems sin fila se leen como pendientes', () => {
    const entries = buildEntries('mixto', [], []);
    expect(entries.every((e) => e.status === 'pendiente')).toBe(true);
  });
});
