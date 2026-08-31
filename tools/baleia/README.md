# Baleia — extracción de geometría y datos comerciales (piloto real)

Material de partida: `baleia_brochure-v6.pdf` (37 páginas, vectorial) y sus
páginas exportadas a SVG. Foco: página 6 (MASTERPLAN, a color, con letras
A/D/E/F/G) y página 9 (planta de implantación en línea + corte topográfico).

Todo lo generado vive en `out/` (no versionado, ver `.gitignore` del repo —
`out/` y `.venv/` están excluidos globalmente). Para reproducir cualquier
cosa de este documento, corré los pasos de la sección "Cómo reproducir".

## Qué se extrajo

### 1–2. Geometría de los 5 bloques + amenities → GeoJSON

**Resultado:** `out/baleia_hotspots.geojson` — 11 features:
`B1`..`B5` (kind `bloque`), `A`/`D`/`E`/`F`/`G` (kind `amenity`, acceso /
piscina / piscina infantil / rincón de fuego / laguna) y `TERRENO` (kind
`perimetro`). Coordenadas `polygon_px`: pares `[x, y]` normalizados 0..1
sobre el ancho/alto de `out/masterplan/baleia_masterplan_300dpi_recortado.png`
(ver `packages/core/src/types.ts`, tipos `Hotspot`, `GeometryKind`, `Px`).

**Verificación visual:** `out/preview_deteccion_masterplan.png` — el plano
con los 11 polígonos superpuestos y rotulados. **Lo miré y coincide con el
plano real**: los 5 bloques calzan borde a borde con el dibujo (incluyendo
las salientes de balcón, que hacen que el contorno no sea un rectángulo
limpio), A/D/E/F/G están cada uno sobre el elemento correcto, y el perímetro
sigue el límite del terreno (Carlos Páez Vilaró, Ruta 10, los dos retiros
laterales).

**Por qué no se parseó el SVG directamente (se intentó primero):**
`p09.svg` tiene 11.706 `<path>`, pero casi todos son artefactos de la
textura de papel del fondo: 4.153 `<mask>`, 4.409 `<clipPath>` y 5.520
`<feImage>`/`<feBlend>` que `pdftocairo` genera para resolver opacidades y
blends de Illustrator. La geometría real de los bloques queda referenciada
solo a través de esa cadena de filtros de composición, no como paths de
primer nivel: `svgelements` (y `svgpathtools`) solo encuentran 45 `<path>`
"reales" navegando el árbol de render de `p09.svg`, y ninguno es el contorno
de un bloque (podés reproducir esto con `scripts/explore_paths.py
src/svg/p09.svg`). Reventar esa cadena de filtros a mano no es razonable
para un solo plano.

En cambio, como el PDF es 100% vectorial, se lo re-renderizó con
`pdftoppm` a 300dpi (sin pérdida relevante) y se segmentó **por color** con
OpenCV: en el masterplan (p06) los edificios son un tostado sólido, el
agua es celeste sólido y el césped es verde sólido, así que un umbral de
color + componentes conexas + contornos es mucho más confiable que pelear
con `feImage`/`feBlend`. Todo el pipeline está en
`scripts/extract_geometry.py`, con el razonamiento completo en su docstring
y comentarios inline (incluye los dos problemas reales que aparecieron
durante la calibración y cómo se resolvieron):

1. **El blob tostado más grande de todo el plano no es un bloque.** Es el
   edificio de servicios/clubhouse, pegado al sector de piscinas — más
   grande en área que cualquier bloque real. Tomar "los 5 blobs tostados
   más grandes" a secas lo cuela como si fuera un bloque y desplaza al
   verdadero Bloque 1 fuera del top 5. Se filtran los blobs que caen a
   menos de 600px (a escala de imagen de 8000px) de cualquier ancla de
   letra de amenity antes de elegir los 5 bloques.
2. **El sector F ("rincón de fuego") está pintado del mismo tostado sólido
   que el edificio de servicios y la vereda que los conecta** — no hay gap
   de color entre ellos. Ni el cierre morfológico simple ni una
   reconstrucción por dilatación (que termina invadiendo el vecino a través
   del mismo puente) los separan bien. Se probó `cv2.watershed` sobre la
   transformada de distancia (la técnica estándar para separar blobs
   pegados) y **tampoco corta ahí**, porque el "puente" entre clubhouse y F
   no es angosto: es una franja ancha y continua del mismo color. Como
   único fallback documentado, la geometría de F sale de recortar la
   máscara a una caja alrededor del ancla de la letra "F" (calibrada una
   vez a ojo sobre `out/calibration_debug/debug_split_result.png`) y tomar
   el contorno más grande adentro. **Es la única geometría de este
   entregable que no sale de detección de color 100% automática** — el
   resto (B1-B5, A, D, E, G, perímetro) sí.

Las anclas de las letras A/D/E/F/G (usadas para saber cuál blob de color es
cuál amenity, ya que varios comparten color) se detectan automáticamente
por color+conectividad en `scripts/find_label_anchors.py`, no están puestas
a mano — ese script documenta cómo se llega a las coordenadas que
`extract_geometry.py` usa como constantes `ANCHORS_150DPI`.

### 3. Datos comerciales → CSV

**Resultado:** `out/baleia_unidades.csv`, 20 unidades, columnas exactas de
`docs/03-PLANTILLAS-CSV/plantilla-en-blanco.csv`.

- **Bloque 2** (brochure pág. 13-19): 5 dúplex `B2-A`..`B2-E` + 4 de 1
  dormitorio `B2-F`..`B2-I`.
- **Bloque 3** (brochure pág. 23-29): 3 dúplex `B3-A`..`B3-C` + 8 de 1
  dormitorio `B3-D`..`B3-K`.

Superficies (cubierta, semicubierta, descubierta, cochera) transcriptas de
cada página de planos y **verificadas matemáticamente**: el script
(`scripts/build_units_csv.py`) tiene un `assert` por unidad que exige que
`cubierta + semicubierta + descubierta + cochera` cierre contra la
"Superficie total" (dúplex) o "PA: Xm2 / PB: Ym2" (unidades de 1 dormitorio)
que el propio PDF imprime. Los 20 casos cierran exacto — correr
`python3 scripts/build_units_csv.py` falla ruidosamente si algún número no
suma, así que si el script terminó OK, los números están bien transcriptos
del PDF.

La plantilla solo tiene columnas `superficie_cubierta_m2` y
`superficie_total_m2` — no hay columna para semicubierta/descubierto/cochera
por separado. Se respetaron las columnas de la plantilla tal cual (no se
inventaron columnas nuevas) y el detalle discriminado quedó en
`notas_internas`, con la página del brochure de donde salió cada número
para poder auditarlo.

**Dato de nomenclatura para reconciliar con el equipo:** la plantilla del
cliente (`docs/01-CLIENTE/4-Plantilla-Listado-de-Unidades.md`) documenta
`[BLOQUE]-U[número]` (ej. `B1-U03`) como convención para "Complejo", pero
la tarea pidió explícitamente códigos tipo `B2-A`/`B3-K` (letra de unidad,
no número), que además es la nomenclatura que usa el propio brochure
("UNIDAD A", "UNIDAD B"...). Se usó `B2-A`/`B3-K` tal como se pidió. Si el
cliente/equipo comercial insiste en el formato `B2-U01`, es un
find-and-replace trivial sobre la columna `codigo_unidad` — pero hay que
decidirlo antes de que el equipo comercial empiece a usar los códigos, para
que el matching automático con los polígonos del mapa no se rompa.

**Lo que NO está en el brochure** (columnas `estado`, `precio`, `moneda`,
`mostrar_precio_publico`, `financiacion`, `orientacion` quedaron vacías a
propósito, no inventadas): ver sección siguiente.

### 4. Imagen del masterplan (300dpi)

**Resultado:**
- `out/masterplan/baleia_masterplan_300dpi_recortado.png` — el plano
  recortado a la franja del dibujo (sin título ni leyenda inferior), en las
  mismas coordenadas que `baleia_hotspots.geojson`. **Este es el que hay
  que usar como imagen de la escena `floorplan`.**
- `out/masterplan/p06_masterplan_300dpi-06.png` — la página 6 completa a
  300dpi, por si se necesita el contexto con título/leyenda.
- `out/masterplan/p09_plan_300dpi-09.png` — página 9 completa a 300dpi
  (planta de implantación en línea + corte topográfico), de referencia.

Generados con `pdftoppm -png -r 300 -f <pág> -l <pág>
src/baleia_brochure-v6.pdf <salida>`.

### 5. Este README

## Cómo reproducir

```bash
cd tools/baleia
python3 -m venv .venv && source .venv/bin/activate
pip install svgelements svgpathtools numpy shapely pillow opencv-python-headless

# 1) Rasterizar el PDF (fuente = src/baleia_brochure-v6.pdf)
mkdir -p out/ref out/masterplan
pdftoppm -png -r 150 -f 6 -l 6 src/baleia_brochure-v6.pdf out/ref/p06_ref
pdftoppm -png -r 300 -f 6 -l 6 src/baleia_brochure-v6.pdf out/masterplan/p06_masterplan_300dpi
pdftoppm -png -r 300 -f 9 -l 9 src/baleia_brochure-v6.pdf out/masterplan/p09_plan_300dpi

# 2) (opcional) recalcular las anclas de letras A/D/E/F/G
python3 scripts/find_label_anchors.py

# 3) Geometría: bloques + amenities + perímetro -> GeoJSON + preview
python3 scripts/extract_geometry.py

# 4) CSV de unidades comerciales (Bloque 2 y 3)
python3 scripts/build_units_csv.py
```

`scripts/explore_paths.py src/svg/p09.svg` reproduce el diagnóstico que
mostró por qué el SVG no era un buen punto de partida (deja ver que
`svgelements` solo encuentra 45 `<path>` de primer nivel en un archivo con
11.706 `<path>` totales).

## Qué falta pedirle al cliente

Esto es lo que **no estaba en el material disponible** y bloquea pasar de
"piloto de geometría" a "recorrido publicable":

1. **Panorámicas 360°** de cada escena (no había ningún panorama entre el
   material descargado, solo renders estáticos en `imgs/` y el brochure
   vectorial). Sin esto no hay recorrido, solo el floorplan con hotspots.
2. **Disponibilidad real** (`estado`: disponible/reservado/vendido) de las
   20 unidades de Bloque 2 y 3 — el brochure es un documento de venta, no
   tiene estado de stock. Las columnas `estado` quedaron vacías en el CSV,
   no en `disponible` por defecto (sería inventar dato).
3. **Precios y moneda** por unidad, y si se muestran públicamente o solo on
   request (columnas `precio`, `moneda`, `mostrar_precio_publico`) —
   tampoco están en el brochure.
4. **Condiciones de financiación** (columna `financiacion`) — no aparece en
   ninguna página del PDF (se revisaron todas las 37 páginas de texto).
5. **Orientación** de cada unidad (columna `orientacion`) — el brochure no
   la indica explícitamente por unidad (a diferencia del ejemplo de la
   plantilla, que sí trae "Frente Norte", "Contrafrente", etc.).
6. **Datos de Bloque 1, Bloque 4 y Bloque 5**: el brochure solo tiene
   páginas de planos individuales por unidad para Bloque 2 y Bloque 3 (9 +
   11 = 20 unidades). No hay plantas de unidades para los otros 3 bloques
   en este documento — falta ese material o el brochure que lo incluya.
7. **Confirmar la convención de `codigo_unidad`** (`B2-A` vs `B2-U01`, ver
   nota en la sección del CSV) contra lo que va a usar el equipo comercial,
   antes de que se generen materiales con esos códigos (fichas, carteles,
   nombres de archivo de renders/panorámicas).
8. **Las plantas acotadas por unidad como imagen suelta** (PNG/JPG o PDF de
   una página). Hoy sólo existen dentro del brochure; lo que hay en
   `material/plantas/` son axonometrías de ubicación, no plantas. Faltan
   además las de B3-A/B/C y B3-H/I/J/K en cualquier formato.
9. Los polígonos de bloques y amenities están calibrados sobre el
   masterplan de la **página 6**. Si el cliente termina usando otro plano
   (por ejemplo una versión más nueva o de otra escala) como imagen final
   de la escena `floorplan`, esta geometría hay que re-extraerla o
   re-alinearla contra esa imagen — no es portable a ciegas a otro archivo.

## Honestidad sobre la calidad de la extracción

- **B1-B5, perímetro, A, D, E, G**: geometría 100% de detección de color
  automática, verificada visualmente contra el plano (ver
  `out/preview_deteccion_masterplan.png`). Alta confianza.
- **F (rincón de fuego)**: la única geometría semi-manual del lote (recorte
  espacial calibrado a ojo una vez, ver arriba). El polígono en el preview
  se ve razonable, pero si el cliente necesita el contorno exacto del
  rincón de fuego (no solo "más o menos ahí"), conviene redibujarlo a mano
  sobre el floorplan en el editor en vez de confiar en este.
- **20/20 superficies del CSV** verificadas matemáticamente contra los
  totales impresos por el propio PDF (ver `scripts/build_units_csv.py`).
- El edificio de servicios/clubhouse (visible en el masterplan, al lado de
  las piscinas) **no tiene polígono propio** en el GeoJSON — no está entre
  las letras A/D/E/F/G pedidas y no es una unidad vendible, así que se dejó
  afuera a propósito.

## Recorrido publicable (tour.json + availability.json)

`scripts/build_tour.py` toma `out/baleia_hotspots.geojson` y
`out/baleia_unidades.csv` (los dos artefactos de arriba, ya verificados) y
genera `out/tour/`:

```bash
cd tools/baleia && source .venv/bin/activate
python3 scripts/build_tour.py            # sólo out/tour/
python3 scripts/build_tour.py --publish  # además, copia a apps/viewer/public/
```

- `tour.json` — `TourManifest`: una escena `floorplan` (el masterplan
  recomprimido a WebP, ver decisión #1 en el docstring del script sobre
  por qué imagen única y no DZI) con los 11 hotspots del GeoJSON (`B1`-`B5`
  apuntan a sí mismos como "unidad" para heredar el pipeline de colores de
  estado sin tocar `packages/core`; los amenities son informativos, sin
  `unitCode`) y las 20 unidades del CSV en `units`.
- `availability.json` — `AvailabilityFile` con estados de DEMOSTRACIÓN
  (round-robin sintético, no reales: el brochure no trae stock, ver arriba)
  y precios siempre en `null`.
- Demuestra la regla dura del visor (un hotspot nunca desaparece por dato
  ausente/raro, ver `apps/viewer/src/polygons.ts`) en dos capas: **Bloque 1**
  queda fuera de `availability.json` y **Bloque 4** recibe un estado
  inventado (`en_promocion`) que el visor no conoce — ambos deben verse en
  gris con warning en consola. El mismo patrón se repite a nivel unidad
  individual con `B3-K` (ausente) y `B3-J` (`en_pausa`).
- El detalle completo de cada decisión (por qué imagen única, por qué los
  bloques son "unidad-grupo", por qué los renders son escenas y no un tipo
  nuevo) está en el docstring de `scripts/build_tour.py` — no se repite acá
  para no desincronizarse.
- `out/tour/` no está versionado (mismo `.gitignore` que el resto de
  `out/`); correr el script siempre lo regenera.

### El material real dentro del recorrido (Nivel 1: brochure + renders)

Baleia no tiene panorámicas (ver `docs/04-PRODUCCION/2-Escalera-de-Niveles-de-Material.md`),
así que el recorrido se arma con lo que sí hay, todo desde `material/`:

- **Galería de renders.** Los 7 renders de `material/renders/` entran como 7
  escenas `floorplan` más (una imagen plana paneable, sin hotspots). El visor
  las junta en la tira "Galería" con su miniatura. Títulos descriptivos de lo
  que se ve en cada uno, mirados uno por uno.
- **Amenities clickeables.** El hotspot A (acceso) salta al render del acceso;
  D/E/F/G (piscina, piscina infantil, rincón de fuego, laguna) saltan al
  render de amenities, que es donde los cuatro se ven.
- **Planta por unidad.** Ojo con el nombre de la carpeta: los archivos de
  `material/plantas/` **no son plantas acotadas**, son axonometrías del bloque
  con la unidad resaltada (dónde está la unidad dentro del edificio). La
  planta acotada de cada unidad existe sólo adentro del brochure, como página
  de PDF. La ficha del visor lo dice con todas las letras ("Ubicación de la
  unidad dentro del bloque"). Las 9 imágenes de `material/plantas/` van a
  `units[].media` de las 13 unidades que cubren (`UNIT_MEDIA` en el script
  tiene el mapeo verificado contra el brochure página por página). **7
  unidades quedan sin imagen a propósito**: B3-A/B/C (dúplex) y B3-H/I/J/K no
  están en el material descargado. Aunque B3-H/I y B3-J/K tienen exactamente
  las mismas superficies que B3-F/G y B3-D/E, son otro tramo del bloque: la
  ficha dice "sin imagen" en vez de mostrar la unidad de al lado.
- **Peso.** Todo se recomprime a WebP (renders a 1600px de ancho, calidad 76;
  plantas a 1400px, calidad 82, aplanadas sobre blanco) más una miniatura
  `*.thumb.webp` de 400px. 6,5 MB de originales → 1,9 MB de WebP (-71%) +
  154 KB de miniaturas. La galería carga sólo las miniaturas (~100 KB) hasta
  que se abre un render.

### Panorámicas 360° (Nivel 2): el sistema ya está listo para recibirlas

`scripts/integrate_panoramas.py` toma una carpeta de panorámicas entregadas,
las valida contra la especificación de Baleia (2:1 exacto, ≥ 8192 px de
ancho) con `packages/pipeline`, genera los tiles de cubemap multiresolución y
las suma al `out/tour/tour.json` que produjo `build_tour.py` como escenas
`panorama`, re-enlazando los hotspots del masterplan que corresponden.

```bash
cd tools/baleia
python3 scripts/build_tour.py                     # el recorrido base, primero

# ojo: este corre con el venv del PIPELINE, no con el de tools/baleia
../../packages/pipeline/.venv/bin/python scripts/integrate_panoramas.py \
    --in <carpeta-de-la-entrega> --dry-run        # ver el plan sin tocar nada
../../packages/pipeline/.venv/bin/python scripts/integrate_panoramas.py \
    --in <carpeta-de-la-entrega> --publish        # integrar y publicar
```

Probado de punta a punta con panorámicas sintéticas de `pano-make-test`: 6
archivos → 5 integradas, 1 rechazada por resolución insuficiente, 126 tiles
por panorámica, navegación masterplan ↔ panorámica verificada en el navegador
sin errores de consola ni tiles fallidas. Las decisiones (por qué el `base`
de los tiles es relativo y no el absoluto que emite `pano-run`, por qué los
hotspots de bloque NO se re-enlazan por defecto, qué pasa con un archivo mal
nombrado) están en el docstring del script.

**El paquete completo — lista de tomas punto por punto, los tres caminos para
conseguirlas con costo y plazo, los mails listos para mandarle a Dacal y al
estudio, y la especificación técnica para el renderista — está en
`docs/07-BALEIA-360/`.**
