#!/usr/bin/env node
/**
 * Carga el material real de Baleia (Dacal Bienes Raíces) al SaaS local.
 *
 * Sube los archivos de `tools/baleia/material/` y `tools/baleia/out/` al
 * bucket `material` de Supabase Storage, crea las filas de `material_files`
 * asociadas al ítem del catálogo que corresponde (ver
 * `apps/admin/src/lib/material/catalog.ts` para los ids reales) y marca el
 * estado honesto de cada ítem en `project_material`.
 *
 * Idempotente: antes de subir un archivo revisa si ya existe una fila de
 * `material_files` con el mismo project_id + item_id + filename. Si existe,
 * no lo vuelve a subir ni a insertar. El upsert de `project_material` usa la
 * unique constraint (project_id, item_id), así que correrlo dos veces no
 * duplica ni rompe nada.
 *
 * Uso: node scripts/seed-baleia-material.mjs
 * (Requiere Supabase local corriendo — ver apps/admin/.env.local)
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

// ── Config: leída de apps/admin/.env.local (Supabase local) ────────────────
function loadEnvLocal() {
  const envPath = path.join(REPO_ROOT, 'apps/admin/.env.local');
  const out = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

const env = loadEnvLocal();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_KEY en apps/admin/.env.local');
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PROJECT_ID = 'a0000000-0000-0000-0000-000000000002'; // Baleia (Dacal Bienes Raíces)
const BUCKET = 'material';
const MATERIAL_DIR = path.join(REPO_ROOT, 'tools/baleia/material');
const OUT_DIR = path.join(REPO_ROOT, 'tools/baleia/out');

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.csv': 'text/csv',
};

function mimeFor(filename) {
  const ext = path.extname(filename).toLowerCase();
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

// ── Qué se sube y a qué ítem del catálogo va cada cosa ──────────────────────
// (ids tomados literal de apps/admin/src/lib/material/catalog.ts, no inventados)
const FILES = [
  // Renders exteriores: 7 renders a nivel de calle/jardín del complejo, no hay
  // tomas aéreas (van al ítem `renders-aereos`, que queda pendiente).
  { itemId: 'renders-exteriores', file: path.join(MATERIAL_DIR, 'renders/complejo1-v2.jpg') },
  { itemId: 'renders-exteriores', file: path.join(MATERIAL_DIR, 'renders/complejo2.jpg') },
  { itemId: 'renders-exteriores', file: path.join(MATERIAL_DIR, 'renders/complejo3.jpg') },
  { itemId: 'renders-exteriores', file: path.join(MATERIAL_DIR, 'renders/complejo4.jpg') },
  { itemId: 'renders-exteriores', file: path.join(MATERIAL_DIR, 'renders/complejo5.jpg') },
  { itemId: 'renders-exteriores', file: path.join(MATERIAL_DIR, 'renders/back-acceso-v2.jpg') },
  { itemId: 'renders-exteriores', file: path.join(MATERIAL_DIR, 'renders/back-amenities-v2.jpg') },

  // Plantas por tipología: 9 archivos.
  { itemId: 'plantas-tipologia', file: path.join(MATERIAL_DIR, 'plantas/b3-udye.png') },
  { itemId: 'plantas-tipologia', file: path.join(MATERIAL_DIR, 'plantas/b3-ufyg.png') },
  { itemId: 'plantas-tipologia', file: path.join(MATERIAL_DIR, 'plantas/unidad-a-vf.png') },
  { itemId: 'plantas-tipologia', file: path.join(MATERIAL_DIR, 'plantas/unidad-b-vf.png') },
  { itemId: 'plantas-tipologia', file: path.join(MATERIAL_DIR, 'plantas/unidad-c-vf.png') },
  { itemId: 'plantas-tipologia', file: path.join(MATERIAL_DIR, 'plantas/unidad-d-vf.png') },
  { itemId: 'plantas-tipologia', file: path.join(MATERIAL_DIR, 'plantas/unidad-e-vf.png') },
  { itemId: 'plantas-tipologia', file: path.join(MATERIAL_DIR, 'plantas/unidades-fyg-vf.png') },
  { itemId: 'plantas-tipologia', file: path.join(MATERIAL_DIR, 'plantas/unidades-hei-vf.png') },

  // Masterplan / plano general: el brief pide vectorial, esto es raster.
  { itemId: 'plano-masterplan', file: path.join(MATERIAL_DIR, 'planos/masterplan-v3.png') },
  { itemId: 'plano-masterplan', file: path.join(MATERIAL_DIR, 'planos/plano.jpg') },

  // Listado de unidades: las 20 unidades verificadas contra el brochure.
  { itemId: 'listado-unidades', file: path.join(OUT_DIR, 'baleia_unidades.csv') },

  // Brochure comercial (37 páginas): es texto y copy del proyecto/tipologías/
  // amenities, no material gráfico técnico ni panorámicas — va a `textos-copy`
  // como fuente para redactar los textos por sección que pide ese ítem.
  { itemId: 'textos-copy', file: path.join(MATERIAL_DIR, 'docs/brochure-v6.pdf') },
];

// ── Estado honesto de cada ítem del catálogo para Baleia ────────────────────
const STATES = [
  {
    itemId: 'plano-masterplan',
    status: 'recibido',
    notes:
      'Tenemos masterplan-v3.png y plano.jpg, ambos raster. El brief pide vectorial (DWG/DXF/AI/PDF vectorial con capas); esto alcanza para armar el mapa de navegación pero conviene pedir el archivo fuente vectorial al estudio de arquitectura si se necesita precisión geométrica.',
  },
  {
    itemId: 'plantas-tipologia',
    status: 'recibido',
    notes:
      '9 plantas en PNG (b3-udye, b3-ufyg, unidad-a a unidad-e, unidades-fyg, unidades-hei). Resolución real 1000-1174px en el lado mayor, por debajo del mínimo de 2000px que pide el brief: sirven para referencia pero conviene pedir los archivos fuente (Illustrator/AutoCAD) antes de usarlas en piezas grandes.',
  },
  {
    itemId: 'cortes-vistas-tecnicas',
    status: 'pendiente',
    notes: 'No se recibieron cortes ni vistas técnicas. El terreno tiene desnivel (está en el punto más alto del Camino a la Ballena), así que vale la pena pedirlo.',
  },
  {
    itemId: 'renders-exteriores',
    status: 'recibido',
    notes:
      '7 renders a nivel de calle/jardín del complejo (acceso, amenities, 5 vistas del conjunto). Resolución real hasta 1945×1477px, por debajo del mínimo recomendado de 3000px en el lado mayor que pide el brief: alcanzan para la galería pero conviene pedir los originales en mayor resolución al renderista antes de usarlos como piezas grandes o de portada.',
  },
  {
    itemId: 'renders-interiores',
    status: 'pendiente',
    notes: 'No se recibieron renders de interiores de ninguna tipología.',
  },
  {
    itemId: 'renders-aereos',
    status: 'pendiente',
    notes: 'Los 7 renders recibidos son todos a nivel de calle/jardín; no hay ninguna toma aérea ni de drone del conjunto o del lote.',
  },
  {
    itemId: 'panoramicas-360',
    status: 'pendiente',
    notes: 'No se recibió ninguna panorámica 360° equirectangular. Es obligatorio y es la pieza central del recorrido: falta coordinar su producción (por render, dado que el proyecto está en pozo).',
  },
  {
    itemId: 'video-institucional',
    status: 'pendiente',
    notes: null,
  },
  {
    itemId: 'fotografia-obra',
    status: 'pendiente',
    notes: 'No aplica todavía: el proyecto está en pozo, no hay obra construida para fotografiar.',
  },
  {
    itemId: 'listado-unidades',
    status: 'recibido',
    notes:
      '20 unidades verificadas contra el brochure (tools/baleia/out/baleia_unidades.csv). Faltan precio, estado comercial, dormitorios y orientación para la mayoría de las unidades: alcanza para activar la navegación pero no el estado comercial en vivo.',
  },
  {
    itemId: 'logo-vectorial',
    status: 'pendiente',
    notes: 'No se recibió el logo en vectorial. El nombre del proyecto aparece en los renders (cartel "Baleia — Punta Ballena") pero eso no reemplaza el archivo de marca.',
  },
  {
    itemId: 'manual-de-marca',
    status: 'pendiente',
    notes: null,
  },
  {
    itemId: 'textos-copy',
    status: 'recibido',
    notes:
      'Brochure comercial completo (37 páginas, brochure-v6.pdf) con la descripción del proyecto y copy de marketing. No son los textos ya recortados por sección (bienvenida / tipología / amenity) que pide el ítem: sirven como fuente para redactarlos, falta el trabajo de extracción y adaptación.',
  },
  {
    itemId: 'disclaimers-legales',
    status: 'pendiente',
    notes: 'Falta que el equipo legal o la inmobiliaria provea los disclaimers y la leyenda de matrícula/registro si aplica.',
  },
  {
    itemId: 'contactos-proveedores',
    status: 'pendiente',
    notes: null,
  },
  {
    itemId: 'ubicacion-coordenadas',
    status: 'pendiente',
    notes: 'El brochure ubica el proyecto en "Camino a la Ballena, Punta Ballena, Maldonado" pero no da coordenadas GPS exactas; falta relevarlas en el kickoff.',
  },
  {
    itemId: 'poligono-geojson',
    status: 'pendiente',
    notes: null,
  },
];

async function ensureFileUploaded({ itemId, file }) {
  if (!existsSync(file)) throw new Error(`No existe el archivo: ${file}`);
  const filename = path.basename(file);

  const { data: existing, error: selErr } = await supabase
    .from('material_files')
    .select('id')
    .eq('project_id', PROJECT_ID)
    .eq('item_id', itemId)
    .eq('filename', filename)
    .maybeSingle();
  if (selErr) throw new Error(`Error consultando material_files (${filename}): ${selErr.message}`);

  if (existing) {
    console.log(`  = ${itemId} / ${filename} ya está cargado (id=${existing.id}), se omite`);
    return;
  }

  const bytes = readFileSync(file);
  const ext = path.extname(filename).toLowerCase();
  const storagePath = `${PROJECT_ID}/${itemId}/${randomUUID()}${ext}`;
  const mime = mimeFor(filename);

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (upErr) throw new Error(`Error subiendo ${filename} a storage: ${upErr.message}`);

  const { error: insErr } = await supabase.from('material_files').insert({
    project_id: PROJECT_ID,
    item_id: itemId,
    storage_path: storagePath,
    filename,
    size_bytes: bytes.byteLength,
    mime,
    uploaded_via: 'panel',
  });
  if (insErr) throw new Error(`Error insertando fila material_files (${filename}): ${insErr.message}`);

  console.log(`  + ${itemId} / ${filename} (${(bytes.byteLength / 1024).toFixed(0)} KB)`);
}

async function upsertState({ itemId, status, notes }) {
  const { error } = await supabase
    .from('project_material')
    .upsert(
      { project_id: PROJECT_ID, item_id: itemId, status, notes, updated_at: new Date().toISOString() },
      { onConflict: 'project_id,item_id' },
    );
  if (error) throw new Error(`Error actualizando project_material (${itemId}): ${error.message}`);
  console.log(`  · ${itemId} -> ${status}`);
}

async function main() {
  console.log(`Cargando material de Baleia (project_id=${PROJECT_ID})`);

  console.log('\nArchivos:');
  for (const f of FILES) {
    await ensureFileUploaded(f);
  }

  console.log('\nEstados:');
  for (const s of STATES) {
    await upsertState(s);
  }

  console.log('\nListo.');
}

main().catch((err) => {
  console.error('\nFalló la carga:', err.message);
  process.exit(1);
});
