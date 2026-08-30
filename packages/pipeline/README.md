# pano-pipeline

Pipeline de producción de tiles para panoramas equirectangulares (cubemap
multiresolución) y planos gigapíxel (deep-zoom / DZI), para Recorrido 360.

Python **3.9** (verificado con Python 3.9.6 del sistema — no se usa sintaxis
de 3.10+ como `X | Y` en anotaciones ni `match`).

## Instalación

```bash
cd packages/pipeline
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -e .
```

Esto instala las dependencias (`py360convert`, `Pillow`, `numpy<2`, `tqdm`) y
registra los siguientes comandos de consola dentro del venv:

- `pano-validate`
- `pano-tiles`
- `pano-preview`
- `pano-dzi`
- `pano-run`
- `pano-make-test`

Para deep-zoom de planos gigapíxel se recomienda instalar `vips`:

```bash
brew install vips
```

Si `vips` no está instalado, `pano-dzi` detecta su ausencia, imprime el
mensaje de instalación y falla con código de salida 1 (o usa un fallback
puro en Pillow si se pasa `--fallback-pillow`; no apto para gigapíxel real,
solo para no bloquear desarrollo/tests).

## Comandos

### `pano-validate` — validación de panorama

```bash
pano-validate panorama.jpg [--min-width 4096] [--aspect-tolerance-px 2] \
  [--horizon-warn-deg 1.5] [--strict-horizon] [-o resultado.json]
```

Checks:
1. **Relación 2:1** exacta, con tolerancia de 2 px.
2. **Resolución mínima** de ancho, default 4096 px.
3. **Horizonte torcido (heurística)**: busca el borde de mayor contraste
   (mayor gradiente vertical) en una banda central de la imagen, cerca del
   extremo izquierdo y del extremo derecho, y reporta la diferencia de
   altura convertida a grados de inclinación. Es explícitamente una
   heurística (`"heuristic": true` en el JSON) — asume que el borde más
   marcado en la banda central es el horizonte real, lo cual puede fallar
   con objetos de alto contraste en escena. Por eso **no rechaza el
   panorama por sí sola** salvo que se pase `--strict-horizon`.

Salida: JSON con veredicto por check + resumen `APROBADO`/`RECHAZADO`.
Código de salida `0` si aprueba, `1` si rechaza.

### `pano-tiles` — equirectangular → cubemap multiresolución

```bash
pano-tiles panorama.jpg out_dir [--face-size N] [--tile-size 512] \
  [--format webp|jpg] [--quality N] [--workers N] [--base /ruta]
```

- Conversión a las 6 caras del cubemap vía `py360convert.e2c` (MIT).
- `face_size` default = ancho del equirectangular / 4.
- `tile_size` default 512.
- `levels = ceil(log2(face_size / tile_size)) + 1`, reduciendo a la mitad
  por nivel con `Image.LANCZOS`.
- Estructura: `{cara}/{nivel}/{fila}_{columna}.{ext}`, caras nombradas
  `front, right, back, left, up, down` (nivel 0 = más baja resolución).
- **Formato por defecto: WebP** (calidad ~82). Razón (documentada también
  en `tiles.py`): WebP pesa ~20-30% menos que JPEG a calidad comparable y
  decodifica rápido. AVIF pesa aún menos pero decodifica sensiblemente más
  lento, y el caso de uso (visor 360) necesita decodificar decenas de tiles
  a la vez al mover la cámara — ahí prioridad va a velocidad de decode, no
  al último % de compresión. `--format jpg` queda disponible como opción.
- Escribe `tiles.json` con `{base, faceSize, tileSize, levels, format}`,
  que matchea el tipo `TiledSource` de `packages/core/src/types.ts`
  (mismos nombres de campo, camelCase).
- Paralelización con `concurrent.futures.ProcessPoolExecutor` (CPU-bound:
  usa procesos, no threads) + barra de progreso `tqdm`.

### `pano-preview` — poster / preview / thumbnail

```bash
pano-preview panorama.jpg out_dir [--format webp|jpg] [--quality 85]
```

Genera desde el master: `poster` (2048 px de ancho), `preview` (512 px),
`thumbnail` (64 px), manteniendo la relación de aspecto original.

### `pano-dzi` — pirámide deep-zoom (planos gigapíxel)

```bash
pano-dzi plano.jpg out_basename [--tile-size 512] [--overlap 1] \
  [--format jpg|png] [--fallback-pillow]
```

Invoca `vips dzsave plano.jpg out_basename --tile-size 512 --overlap 1
--suffix .jpg` como proceso externo. Si `vips` no está instalado:
- Sin `--fallback-pillow`: falla con exit code 1 e imprime
  `"vips no esta instalado. Instalalo con: brew install vips"`.
- Con `--fallback-pillow`: genera una pirámide DZI equivalente
  (`.dzi` + carpeta `_files/{nivel}/{col}_{fila}.{ext}`) usando Pillow puro.
  Más lento y con mayor uso de memoria — solo para desarrollo/tests, no
  para gigapíxel real en producción.

### `pano-run` — orquestador

```bash
pano-run panorama.jpg out_root --tenant TENANT --project PROYECTO \
  --version N --slug SLUG [--face-size N] [--tile-size 512] \
  [--format webp|jpg] [--min-width 4096] [--skip-validation] [--strict-horizon]
```

Corre validación → tiles → preview y deja todo en:

```
{out_root}/t/{tenant}/{proyecto}/v{N}/scenes/{slug}/
  tiles/{cara}/{nivel}/{fila}_{columna}.{ext}
  tiles/tiles.json
  poster.webp
  preview.webp
  thumbnail.webp
  validation.json
  manifest.json
```

Si la validación rechaza el panorama, el pipeline se corta ahí (no genera
tiles/preview) salvo que se pase `--skip-validation`. Código de salida `0`
si todo OK, `1` si se rechazó.

### `pano-make-test` — panorama de prueba sintético

```bash
pano-make-test out.jpg [--width 8192]
```

Genera un equirectangular sintético 2:1 con grilla de referencia cada 15°
de yaw/pitch, marcas de yaw (0/90/180/270) y pitch (-90/0/+90) etiquetadas,
franjas de color por cuadrante para reconocer orientación a simple vista, y
marcadores concéntricos en los polos (para detectar distorsión en las caras
`up`/`down` del cubemap). Permite probar el pipeline completo sin depender
de material real del cliente.

## Verificación end-to-end (resultados medidos, no teóricos)

Se corrió `pano-run` completo sobre dos panoramas sintéticos generados con
`pano-make-test`, replicando la tabla de referencia del encargo.

Comando:

```bash
pano-make-test out/test_input/pano_8192.jpg --width 8192
pano-make-test out/test_input/pano_12288.jpg --width 12288

pano-run out/test_input/pano_8192.jpg out/r2 \
  --tenant demo --project casa-test --version 1 --slug living-8192

pano-run out/test_input/pano_12288.jpg out/r2 \
  --tenant demo --project casa-test --version 1 --slug living-12288
```

### Resultados medidos

| Master | face_size | tile_size | niveles (medido) | tiles totales (6 caras, medido) | peso total tiles | tiempo pano-run |
|---|---|---|---|---|---|---|
| 8192×4096  | 2048 | 512 | 3 | **126** | 816 KB | ~8.4 s |
| 12288×6144 | 3072 | 512 | 4 | **300** | 1.5 MB | ~10.4 s |

Desglose de tiles por nivel medido (1 cara, `front`), ambos casos con 6
caras idénticas por simetría del cubemap:

- **8192×4096** (face_size 2048): nivel 0 → 1 tile, nivel 1 → 4 tiles,
  nivel 2 → 16 tiles. Total por cara 21 → **21 × 6 = 126**.
- **12288×6144** (face_size 3072): nivel 0 → 1 tile, nivel 1 → 4 tiles,
  nivel 2 → 9 tiles, nivel 3 → 36 tiles. Total por cara 50 → **50 × 6 = 300**.

Estructura de carpetas verificada con `find`:
`out/r2/t/demo/casa-test/v1/scenes/living-8192/tiles/{front,right,back,left,up,down}/{0,1,2}/{fila}_{col}.webp`
más `tiles.json`, `poster.webp`, `preview.webp`, `thumbnail.webp`,
`validation.json` y `manifest.json` — coincide con lo esperado.

`tiles.json` generado (caso 8192):

```json
{
  "base": "/t/demo/casa-test/v1/scenes/living-8192/tiles",
  "faceSize": 2048,
  "tileSize": 512,
  "levels": 3,
  "format": "webp"
}
```

### Contraste contra la tabla teórica del encargo

| Master | Teórico (niveles / tiles) | Medido (niveles / tiles) | ¿Coincide? |
|---|---|---|---|
| 8192×4096  | 3 / 126 | 3 / 126 | **Sí, exacto.** |
| 12288×6144 | 3 / 276 | 4 / 300 | **No — discrepancia esperada, explicada abajo.** |

**Por qué no coincide el caso 12288×6144:** `face_size = 3072`, y
`3072 / 512 = 6`, que **no es potencia exacta de 2** (a diferencia del caso
2048/512 = 4, que sí lo es). Aplicando la fórmula del encargo,
`niveles = ceil(log2(6)) + 1 = ceil(2.585) + 1 = 3 + 1 = 4` niveles, no 3.
La tabla teórica del encargo asumía 3 niveles para este caso (probablemente
redondeando `log2(6) ≈ 2.58` hacia abajo en vez de con `ceil`), pero la
fórmula tal como está especificada (`ceil(log2(face_size/tile_size)) + 1`)
da 4. Con 4 niveles, el nivel 0 queda en 384 px (3072 dividido a la mitad
tres veces: 3072→1536→768→384), que tampoco es múltiplo exacto de
`tile_size`, y el nivel superior (3072 px) se corta en una grilla de 6×6
tiles de 512 px (`ceil(3072/512) = 6`), de ahí los 36 tiles del nivel 3.
Sumando 1+4+9+36 = 50 tiles por cara × 6 caras = 300. Este comportamiento
es correcto respecto de la fórmula pedida: la discrepancia contra la tabla
del encargo viene del redondeo cuando `face_size` no es potencia exacta de
2 sobre `tile_size`, tal como el encargo anticipaba que podía pasar.

### Otras verificaciones hechas

- `pano-validate` sobre un panorama con aspect ratio incorrecta
  (4000×1500) rechaza correctamente (`RECHAZADO`, exit code 1), fallando
  tanto el check de aspecto como el de resolución mínima.
- `pano-dzi` sin `vips` instalado (caso real de esta Mac) falla con
  mensaje claro (`"vips no esta instalado. Instalalo con: brew install
  vips..."`, exit code 1) y no rompe feo.
- `pano-dzi --fallback-pillow` sobre una imagen de prueba genera una
  pirámide DZI completa en Pillow puro (`.dzi` + `_files/{nivel}/{col}_{fila}.jpg`).

## Notas de diseño

- El cómputo de tiles es CPU-bound (redimensionado LANCZOS + compresión de
  imagen), por eso `tiles.py` paraleliza con `ProcessPoolExecutor`
  (procesos, no threads — evita el GIL).
- Los nombres de campo de `tiles.json` (`base`, `faceSize`, `tileSize`,
  `levels`, `format`) fueron tomados directamente de la interfaz
  `TiledSource` en `packages/core/src/types.ts` para que el visor pueda
  consumir el manifiesto sin transformación.
- El check de horizonte torcido en `validate.py` está marcado
  explícitamente como heurístico (`"heuristic": true`) tanto en el nombre
  de la función como en el JSON de salida, y no bloquea la aprobación salvo
  `--strict-horizon`.
