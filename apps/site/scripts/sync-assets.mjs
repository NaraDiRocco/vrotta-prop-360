// Copia el material ya optimizado de `tools/baleia/material*` a `public/media`.
// Nada se reprocesa aca: las webp ya estan generadas y curadas. Este script
// solo las trae, para que el sitio no dependa de rutas fuera de la app.
import { cp, mkdir, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../../..')
const baleia = join(repo, 'tools/baleia')
const dest = resolve(here, '../public/media')

const GRUPOS = [
  ['fotos', join(baleia, 'material-real/web/full')],
  ['planos', join(baleia, 'material/planos/unidad')],
  ['renders', join(baleia, 'material/renders')],
  ['marca', join(baleia, 'material/marca')],
]

let copiados = 0
const faltantes = []

for (const [nombre, src] of GRUPOS) {
  if (!existsSync(src)) { faltantes.push(`${nombre}: no existe ${src}`); continue }
  const out = join(dest, nombre)
  await mkdir(out, { recursive: true })
  for (const f of await readdir(src, { withFileTypes: true })) {
    // Las miniaturas y los PDF fuente no se publican: el sitio usa las full.
    if (!f.isFile() || f.name.includes('.thumb.') || f.name.endsWith('.pdf')) continue
    await cp(join(src, f.name), join(out, f.name))
    copiados++
  }
}

// El masterplan vive suelto, un nivel arriba de los planos de unidad.
const masterplan = join(baleia, 'material/planos/masterplan-v3.png')
if (existsSync(masterplan)) {
  await mkdir(join(dest, 'planos'), { recursive: true })
  await cp(masterplan, join(dest, 'planos/masterplan.png'))
  copiados++
} else faltantes.push('masterplan-v3.png')

console.log(`sync-assets: ${copiados} archivos -> public/media`)
if (faltantes.length) {
  console.warn('FALTAN (el sitio va a mostrar huecos):')
  for (const f of faltantes) console.warn('  - ' + f)
}
