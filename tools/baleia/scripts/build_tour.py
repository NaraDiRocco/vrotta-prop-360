"""Genera el recorrido publicable de Baleia (tour.json + availability.json +
la imagen de la escena floorplan) a partir de los dos artefactos ya
verificados en out/: `baleia_hotspots.geojson` (geometría) y
`baleia_unidades.csv` (datos comerciales de Bloque 2 y 3).

Nada de esto se escribe a mano: correr este script siempre reproduce el
mismo `tour.json`/`availability.json` (salvo `generated_at`, que es la hora
de corrida) desde las dos fuentes de datos versionadas.

Salida: out/tour/
  tour.json           — TourManifest (packages/core/src/types.ts)
  availability.json   — AvailabilityFile (idem)
  masterplan.webp     — imagen de la escena floorplan
  masterplan.thumb.webp — miniatura del plano, placeholder del arranque
  media/renders/*     — los 7 renders del complejo (escenas de galería)
  media/plantas/*     — la imagen de cada unidad (`units[].media`)
  media/planos-3d/*   — el plano 3D de la tipología (`attrs.plano3d`)
  media/planos-pdf/*  — el plano acotado en PDF (`attrs.planoPdf`)
  marca/*             — el logo del proyecto, que dibuja el visor

Con `--publish` además copia todo a `apps/viewer/public/baleia/` y deja el
manifiesto con las URLs prefijadas en `apps/viewer/public/tour.json`, que es
lo que abre el visor en dev sin ningún parámetro.

Las escenas 360 no se arman acá —las agrega `integrate_panoramas.py`, que es
otro paso con otro entorno— pero este script ya NO las pierde: al reescribir
el manifiesto repone las que estaban, siempre que sus tiles sigan en
`out/tour/scenes/` (ver `reintegrar_panoramas`).

------------------------------------------------------------------------
DECISIONES QUE VALE LA PENA DEJAR EXPLÍCITAS
------------------------------------------------------------------------

1. IMAGEN DE LA ESCENA FLOORPLAN: imagen única, no deep-zoom (DZI).
   El masterplan recortado es 7945×1960px (~15.6 MP). `packages/pipeline`
   ofrece un fallback DZI con vips (no instalado en esta Mac) o Pillow, pero
   el visor (`apps/viewer/src/floorplan.ts`) sólo sabe consumir
   `PlanSource = { url, width, height }` vía `L.imageOverlay`: no hay
   ningún consumidor de pirámides DZI en el visor hoy. Meter una pirámide
   DZI implicaría escribir un plugin Leaflet nuevo (tipo
   `leaflet-deepzoom`/IIP) que no existe en este repo — desproporcionado
   para un plano de este tamaño. En cambio, se recomprime PNG→WebP
   (calidad 85): igual de nítido, ~10x más liviano (~11 MB → ~1 MB), UNA
   sola request. Si el proyecto crece a un plano realmente gigapíxel
   (>50-80 MP) esta cuenta cambia y ahí sí vale la pena el DZI + el plugin
   Leaflet correspondiente.

2. LOS 5 BLOQUES SON HOTSPOTS "GRUPO": el masterplan no tiene un polígono
   por unidad (eso requeriría plantas individuales por piso, que no están
   en el material — ver README, sección "Qué falta pedirle al cliente").
   Cada bloque se hotspotea como si fuera, él mismo, una "unidad" del
   sistema de disponibilidad (`Hotspot.unitCode = "B1".."B5"`,
   `action: {kind:'unit'}`): así el polígono se colorea con el mismo
   pipeline de estados (`resolveStatus`/`tokenFor`) que cualquier lote,
   sin tocar `packages/core` ni el visor. El estado de cada bloque es el
   MEJOR estado (menor `STATUS_TOKENS[...].order`) entre las unidades que
   contiene, calculado en `aggregate_block_status()` — "el bloque tiene
   algo para vender" pesa más que mostrar un promedio.

3. LOS AMENITIES (A/D/E/F/G) SON INFORMATIVOS: `unitCode: null`.
   `resolveStatus(null, ...)` no los resuelve contra availability.json y el
   visor los pinta con `INFO_TOKEN` ("Punto de interés", celeste), no con el
   gris de `no_disponible`: una laguna no está ni disponible ni vendida.
   Informativo no quiere decir inerte: cada amenity lleva
   `action: {kind:'goto'}` al render donde ese amenity se ve (ver
   `AMENITY_SCENE`), que en un proyecto sin panorámicas es lo más parecido
   a "entrar" al amenity.

4. TERRENO (perímetro) va primero en el array de hotspots para que quede
   dibujado debajo del resto (Leaflet apila por orden de inserción, no lee
   `zIndex` del hotspot — ver `floorplan.ts::mount`).

5. `availability.json` YA NO LLEVA ESTADOS DE DEMOSTRACIÓN para Bloque 2:
   desde septiembre 2026 hay una lista de precios real (brochure "Baleia
   prueba brochure (1).pdf", ver `docs/08-MATERIAL-REAL/README.md` §5 y
   `tools/baleia/README.md`, sección "Condiciones comerciales"). Las 9
   unidades de Bloque 2 (`B2-A`..`B2-I`) traen `estado` y `precio` reales
   en el CSV (`load_units()` los lee de las columnas `estado`/`precio`/
   `moneda`/`mostrar_precio_publico`), y el precio sólo se publica en
   `availability.json` si `mostrar_precio_publico=SI`. Bloque 3 sigue sin
   dato real (columnas vacías en el CSV, ver README) — sus unidades y su
   bloque quedan en `"proximamente"` (ver punto 6), nunca con un estado
   inventado tipo round-robin.

6. REGLA DURA (un hotspot nunca desaparece por dato ausente/raro):
   demostrada en dos capas:
     - Nivel bloque (visible en el floorplan): Bloque 1 y Bloque 3 llevan
       el estado real `"proximamente"` (`BLOCKS_PROXIMAMENTE` — token de
       primera clase desde `0017_unit_status_proximamente.sql`, chip de
       CONTORNO, ver `packages/core/src/status.ts`). Bloque 4 y Bloque 5
       (`BLOCKS_MISSING_FROM_AVAILABILITY`) quedan directamente FUERA de
       `availability.json`: ni siquiera "próximamente" dice el brochure de
       ellos, así que sí caen en la regla dura clásica (gris + warning en
       consola, `FALLBACK_STATUS`) en vez de un estado inventado. Los
       cuatro deben verse en el plano sin desaparecer nunca.
     - Nivel unidad: las unidades de Bloque 3 (sin dato real) heredan el
       mismo `"proximamente"` de su bloque, salvo `B3-K` que queda fuera de
       `availability.json` (`UNIT_MISSING_FROM_AVAILABILITY`) para seguir
       demostrando la otra mitad de la regla (unidad ausente, no sólo
       estado desconocido).

7. LOS RENDERS SON ESCENAS `floorplan`, NO UN TIPO DE ESCENA NUEVO.
   `SceneKind` (packages/core) no tiene 'gallery' ni 'image', y agregarlo
   sería tocar el contrato compartido con el panel y el editor. Un render
   es exactamente lo que la escena `floorplan` ya sabe mostrar: una imagen
   plana, paneable y zoomeable con Leaflet (`apps/viewer/src/floorplan.ts`),
   con cero hotspots encima. Así la galería sale del manifiesto sin
   inventar schema: 7 escenas más y la navegación por `goto`/hash que ya
   existe. El visor las presenta agrupadas en una tira de miniaturas
   ("Galería") porque son las escenas que NO son el masterplan.

8. LAS MINIATURAS SE DERIVAN POR CONVENCIÓN DE NOMBRE, no por un campo nuevo.
   Para cada imagen `X.webp` se emite también `X.thumb.webp`. Ni `Scene` ni
   `units[].media` tienen dónde guardar una miniatura, y agregarles un campo
   es, otra vez, tocar `packages/core`. El visor deriva la miniatura con un
   `.replace(/\\.webp$/, '.thumb.webp')` y, si esa request falla, se queda
   con la imagen grande (`onerror`): la convención se puede romper sin que
   la galería se rompa.

9. LAS PLANTAS SE APLANAN SOBRE BLANCO. Los PNG de `material/plantas/` son
   RGBA con fondo transparente y trazos oscuros (verde/azul marino) para el
   contorno de la unidad resaltada. Sobre el fondo oscuro del visor esos
   contornos —que son justamente el dato -- desaparecen. Se componen sobre
   blanco, que es el fondo con el que fueron diseñados (el del brochure), y
   el visor les da un contenedor claro.

11. CONTACTO: SE CARGA (06/09/2026), YA NO ES OPCIONAL EN LA PRÁCTICA.
   `TourManifest.contact` habilita el CTA de WhatsApp con mensaje prellenado
   y deep link a la unidad. El brochure de septiembre 2026 publica un
   teléfono comercial (+598 95 559 230, Caetano Negocios Inmobiliarios +
   Dacal): `CONTACT_WHATSAPP` lo carga por defecto (plan de experiencia
   §6). **Falta que el cliente confirme que ese número atiende los leads
   del recorrido** — ver README, "Qué falta pedirle al cliente". `theme.
   priceBands` sigue en `None`, sin inventar tramos: el visor deriva por
   cuantiles de los precios reales que ya hay. `--whatsapp <numero>` pisa
   el default sin tocar el script.

10. QUÉ UNIDAD LE CORRESPONDE A CADA PLANTA: ver `UNIT_MEDIA` (axonometrías
   IA de `material/plantas/`) y `UNIT_FLOORPLANS` (planos acotados reales
   de `material/planos/unidad/`, ver `tools/baleia/material/INVENTARIO.md`
   §2 — publicados desde el 06/09/2026, se agregan al mismo array
   `units[code].media`, no lo reemplazan). El mapeo se verificó una por una
   contra el brochure (`pdftotext` de las páginas 13-19 y 26-29) y mirando
   cada imagen. Las unidades para las que el material NO trae imagen quedan
   sin ese `media` — no se les asigna la de otra unidad "parecida" aunque
   las superficies coincidan.

12. PROCEDENCIA DE CADA IMAGEN (plan de experiencia, §5.1). `Scene` y
   `PhotoTourItem` (packages/core/src/types.ts) llevan un campo aditivo
   `procedencia: { kind: 'foto' | 'render' | 'ia', capturedAt?, basedOn? }`.
   El masterplan y los 7 renders son siempre `render`. Las fotos reales
   curadas (`material-real/web/`) son `foto`, con `capturedAt` leído del
   EXIF `DateTimeOriginal` de los archivos originales — nunca escrito a
   mano: ver `tools/baleia/material-real/index.csv`, columna
   `capturado_en` (agregada el 06/09/2026 justamente para esto). La imagen
   de paisajismo terminado del deslizador (`generado-ia/paisajismo/`) es
   `render`, no `ia`: es una proyección del proyecto como cualquier otro
   render, generada a partir de una foto real para que el ángulo calce
   exacto (ver `BEFORE_AFTER_PAIRS`/`_paisajismo_pair_item`); no lleva
   `restricted`. `amueblado-virtual/` sigue sin publicarse.

13. `TourManifest.photoTour` (nuevo, opcional): el material narrativo del
   plan de experiencia — las fotos reales del Tramo 1 y el paseo de 11
   fotos del Tramo 2 Mitad B, con caption y `ambiente` TEXTUALES tomados
   de `docs/06-BENCHMARK/5-EXPERIENCIA-BALEIA.md` §1 (se copian literales,
   no se resumen), más el deslizador antes/después que describe el mismo
   documento. Aditivo: no reemplaza escenas ni hotspots.

16. LA FICHA QUE CIERRA (06/09/2026, auditoría §4 Idea 3). Tres campos
   aditivos en `units[code].attrs` — `attrs` es `Record<string, unknown>`
   en el contrato, así que no hace falta tocar `packages/core`:

     - `numeroComercial`: el número de la lista de precios ("201"). **Se
       emite SÓLO para las tres unidades cuyo mapeo letra↔número está
       verificado por aritmética de superficie** (A→201, F→206, G→207; ver
       `tools/baleia/README.md` §3.1). B→202..E→205 y H→208/I→209 son
       asunciones posicionales sin confirmar con Caetano: no se emiten, y
       el visor entonces muestra la letra sola ("Unidad B"). Un número
       inventado en la pantalla se convierte en un número dicho por
       teléfono, y ahí ya no hay forma de saber de dónde salió.
     - `plano3d`: la vista isométrica de la tipología
       (`material/generado-ia/planos-3d/`, INVENTARIO.md §6.2). Es material
       generado con IA a partir del plano real y el visor lo etiqueta como
       tal, con la chapa "Plano 3D · recreación sobre el plano real" pegada
       a la imagen. El mapeo sale de los propios nombres de archivo
       (`unidad-B-D-…` cubre B y D; `unidad-C-E-…`, C y E): ver
       `UNIT_PLANOS_3D`.
     - `planoPdf`: el plano acotado original en PDF
       (`material/planos/unidad/src-pdf/`, 224-292 KB c/u). Existían desde
       la carga del material y no se publicaban. Se renombran al código de
       unidad al copiarlos (los originales tienen espacios en el nombre:
       "Unidad F y G.pdf") y siguen la misma convención que los WebP
       acotados de `UNIT_FLOORPLANS`.

17. LA MARCA LA COPIA ESTE SCRIPT. El logo blanco vive en
   `material/marca/baleia-logo-blanco.svg` (versionado, es material del
   cliente) y se copia a `out/tour/marca/`, así `--publish` lo deja dentro
   de `apps/viewer/public/baleia/marca/`. Antes había además una copia
   suelta versionada en `apps/viewer/public/marca/`, que existía sólo
   porque `--publish` borra y recrea la carpeta publicada entera: dos
   archivos idénticos, uno de ellos invisible para el pipeline. Ahora hay
   una sola fuente y un solo destino.

15. LA ESCENA DE VIDEO (Tramo 4, 06/09/2026): el reel real del predio y de
   la unidad terminada del Bloque 2, filmado el 2 de septiembre de 2026
   (82,8 s, aérea + paseo a pie), ya comprimido en `media/video/` (ver su
   README). Se emite como UNA escena más de `tour.scenes`, `kind: 'video'`
   (valor que `packages/core` ya reservaba en `SceneKind` sin ningún
   emisor hasta ahora):
     - `source.url` es la versión 1080p (escritorio); `mobileUrl` (campo
       aditivo nuevo de `Scene`, packages/core/src/types.ts) es la 720p
       para pantallas angostas. El visor elige con un `<source media=...>`
       nativo (`apps/viewer/src/tour-rail.ts::renderVideo`) — sin JS de
       selección, sin bloquear nada mientras carga.
     - `poster` (también aditivo) es el cuadro aéreo de apertura, para no
       mostrar un rectángulo negro antes de que cargue metadata.
     - `procedencia: {kind:'foto', capturedAt:'2026-09-02'}`, igual que
       las fotos reales: es la prueba de que es filmación real y no un
       render. La fecha es la del README del video, no un EXIF leído acá
       (a diferencia de las fotos de `material-real/`) porque el archivo ya
       viene editado (reel) sin el EXIF del original.
     - Sin capítulos ni timestamps: nadie marcó los tiempos de cada plano
       todavía (ver `media/README.md`) y esta versión no los inventa.
     - Si `media/video/baleia-recorrido-real.mp4` no está (build sin el
       material real), la función simplemente no agrega la escena: el
       tramo se sigue dibujando con su tarjeta "todavía no está publicado"
       (`tour-rail.ts`), el build no rompe.
   Esta escena NUNCA se navega por hash (`#/scene/video` la intercepta
   `SceneController` como slug virtual del tramo homónimo — ver
   `tour-rail.model.ts::TRAMO_SLUGS` — antes de intentar cargarla como
   panorámica): es puramente el dato que consume la tarjeta del riel. Por
   eso también se la excluye a mano del filtro de "otras vistas" de
   Amenities (`buildRailContent`, campo `otros`), que de otro modo la
   tomaría por un render más y le pondría un `<img>` a un archivo .mp4.

18. VARIANTE VERTICAL DEL VIDEO (17/09/2026), para que en celular ocupe la
   altura completa en vez de quedar encajonado con bandas negras. Es OTRO
   CORTE, no el horizontal rotado: 49,7 s contra 82,8 s, con la marca del
   proyecto incrustada en los primeros segundos (ver `media/README.md`).
   Va en `Scene.portrait` (packages/core/src/types.ts), no en `mobileUrl`:
   `mobileUrl` es "mismo corte, más liviano" y el visor dimensiona su caja
   con `source.width`/`height`, así que un archivo 1080x1920 ahí se ve
   encajonado. `portrait` trae sus propias dimensiones, su propio póster y
   su propio `mobileUrl` (720p) para que `tour-rail.ts::renderVideo` arme
   la caja con las medidas de la fuente que realmente usa. Igual que el
   horizontal, opcional: sin los tres archivos `.vertical.*` en
   `media/video/`, la escena sigue funcionando sólo con el horizontal.

19. COTIZADOR (23/09/2026): `TourManifest.cotizador` (campo aditivo y
   opcional, packages/core/src/types.ts) habilita el simulador de plan de
   pago de la ficha de unidad. El MOTOR de cálculo (cuota francesa, tabla de
   amortización) vive en `packages/core/src/cotizador.ts` -- este script no
   calcula nada, sólo declara los NÚMEROS vigentes como constantes con
   nombre (`ANTICIPO_PCT` y compañía, más abajo), tal como los publica la
   lista de precios de Caetano de septiembre 2026 (`elementos baleia/Baleia
   prueba brochure (1).pdf`; ver también tools/baleia/README.md §3.1 y
   docs/08-MATERIAL-REAL/README.md §5, que ya documentaban "50% anticipo +
   12 cuotas mensuales al 6% anual" y "gastos de ocupación: 4% aparte" en
   prosa, sin el desglose 2.5%/1.5% que sí trae el brochure). Se emite
   incondicional (a diferencia de `contact`, que espera confirmación del
   cliente sobre el número de WhatsApp): las condiciones de venta de Bloque
   2 ya están confirmadas y publicadas, no son un dato provisorio.
"""
from __future__ import annotations

import csv
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
BALEIA_DIR = os.path.normpath(os.path.join(HERE, ".."))
REPO_DIR = os.path.normpath(os.path.join(BALEIA_DIR, "..", ".."))
OUT_DIR = os.path.join(BALEIA_DIR, "out")
MATERIAL_DIR = os.path.join(BALEIA_DIR, "material")
GEOJSON_PATH = os.path.join(OUT_DIR, "baleia_hotspots.geojson")
CSV_PATH = os.path.join(OUT_DIR, "baleia_unidades.csv")
MASTERPLAN_SRC = os.path.join(OUT_DIR, "masterplan", "baleia_masterplan_300dpi_recortado.png")
TOUR_DIR = os.path.join(OUT_DIR, "tour")
# Material real curado (26 fotos, ya en WebP 2000px + thumb 480px) y su
# índice con la fecha EXIF de captura (columna `capturado_en`, agregada el
# 06/09/2026 — ver tools/baleia/README.md).
MATERIAL_REAL_DIR = os.path.join(BALEIA_DIR, "material-real")
MATERIAL_REAL_WEB = os.path.join(MATERIAL_REAL_DIR, "web")
MATERIAL_REAL_INDEX = os.path.join(MATERIAL_REAL_DIR, "index.csv")
# Planos acotados reales por unidad (INVENTARIO.md §2).
UNIT_FLOORPLANS_DIR = os.path.join(MATERIAL_DIR, "planos", "unidad")
UNIT_PDF_DIR = os.path.join(UNIT_FLOORPLANS_DIR, "src-pdf")
PLANOS_3D_DIR = os.path.join(MATERIAL_DIR, "generado-ia", "planos-3d")
MARCA_DIR = os.path.join(MATERIAL_DIR, "marca")
# El único archivo de marca que consume el visor (`tour-rail.ts::MARCA_SVG`).
MARCA_FILE = "baleia-logo-blanco.svg"
# `generado-ia/paisajismo/`: paisajismo terminado generado A PARTIR de una
# foto real del predio (mismo ángulo y cámara por construcción — no es una
# recreación libre). Alimenta el lado "después" del único deslizador
# antes/después que queda (ver BEFORE_AFTER_PAIRS). `generado-ia/
# amueblado-virtual/` sigue sin publicarse: los archivos quedan en el repo
# como material interno, no se borraron, sólo no tienen referencia acá.
PAISAJISMO_DIR = os.path.join(MATERIAL_DIR, "generado-ia", "paisajismo")
# Video real del recorrido (decisión 15 del docstring), ya comprimido +faststart
# en dos resoluciones. Vive fuera de `material/` porque no es una foto curada
# ni un render: es el único video real que hoy entra al manifiesto. Ver
# tools/baleia/media/README.md para el detalle de cada archivo.
VIDEO_DIR = os.path.join(BALEIA_DIR, "media", "video")
VIDEO_REAL_FILE = "baleia-recorrido-real.mp4"
VIDEO_REAL_MOBILE_FILE = "baleia-recorrido-real.720.mp4"
VIDEO_REAL_POSTER_FILE = "baleia-recorrido-real.poster.jpg"
# Corte VERTICAL (decisión 18), para celular. NO es el horizontal rotado: es
# otra edición, de otra duración (49,7 s contra 82,8 s), con la marca del
# proyecto incrustada en los primeros segundos. Opcional: si estos tres
# archivos no están, `build_video_scene` sigue emitiendo sólo el horizontal.
VIDEO_REAL_VERTICAL_FILE = "baleia-recorrido-real.vertical.mp4"
VIDEO_REAL_VERTICAL_MOBILE_FILE = "baleia-recorrido-real.vertical.720.mp4"
VIDEO_REAL_VERTICAL_POSTER_FILE = "baleia-recorrido-real.vertical.poster.jpg"
# Fecha real de filmación (aérea de apertura + paseo por la unidad del Bloque
# 2), documentada en tools/baleia/media/README.md. Es la misma fecha que las
# fotos reales de `material-real/` (2 sep 2026): la procedencia `foto` con
# esta fecha es la prueba de que es filmación real, no un render (plan §5.1).
VIDEO_REAL_CAPTURED_AT = "2026-09-02"
# Destino de `--publish`: lo que sirve `apps/viewer` en dev (vite sirve
# `public/` en la raíz). Está en .gitignore, igual que `out/`.
PUBLISH_DIR = os.path.join(REPO_DIR, "apps", "viewer", "public", "baleia")
PUBLISH_ROOT_TOUR = os.path.join(REPO_DIR, "apps", "viewer", "public", "tour.json")

# Mismo contrato que packages/core/src/status.ts::UNIT_STATUSES (orden =
# STATUS_TOKENS[...].order, del más vendible al menos). "proximamente" es
# estado de primera clase desde 0017_unit_status_proximamente.sql — ver
# tools/baleia/README.md §3.1 (actualización 06/09/2026).
UNIT_STATUSES = ["disponible", "reservado", "vendido", "bloqueado", "no_disponible", "proximamente"]
STATUS_ORDER = {s: i for i, s in enumerate(UNIT_STATUSES)}

AMENITY_LABELS = {
    "A": "Acceso",
    "D": "Piscina",
    "E": "Piscina infantil",
    "F": "Rincón de fuego",
    "G": "Laguna",
}

# --------------------------------------------------------------- material
# Renders del complejo -> escenas de galería. El título es descriptivo de lo
# que SE VE en el render (los miré uno por uno); no se le pone nombre de
# amenity a un render donde ese amenity no aparece.
RENDERS = [
    ("back-acceso-v2.jpg", "acceso", "Acceso al complejo"),
    ("complejo1-v2.jpg", "complejo-laguna", "El complejo desde la laguna"),
    ("complejo2.jpg", "complejo-llegada", "Llegada por el camino interior"),
    ("complejo3.jpg", "complejo-terrazas", "Terrazas y cubierta verde"),
    ("complejo4.jpg", "complejo-fachada", "Fachada de un bloque al atardecer"),
    ("complejo5.jpg", "complejo-pergola", "Pérgola junto a la piscina"),
    ("back-amenities-v2.jpg", "amenities", "Amenities: piscina, fuego y laguna"),
    # La portada del brochure, que la dueña eligió para abrir el recorrido.
    # Sale de la página 1 del PDF, donde el render va como imagen aparte del
    # texto: por eso se extrae limpia, sin el título encima.
    ("portada-brochure.jpg", "portada", "La portada del brochure"),
]

# Amenity -> escena de render a la que salta su hotspot en el masterplan.
# A = acceso tiene su propio render; D/E/F/G (piscina, piscina infantil,
# rincón de fuego, laguna) aparecen los cuatro en el render de amenities.
AMENITY_SCENE = {"A": "acceso", "D": "amenities", "E": "amenities", "F": "amenities", "G": "amenities"}

# --------------------------------------------------------- photoTour (§5.1)
# Captions TEXTUALES del plan de experiencia
# (docs/06-BENCHMARK/5-EXPERIENCIA-BALEIA.md). No se resumen ni se
# parafrasean: son las que están pensadas para leerse en pantalla.
#
# Tramo 1 (§1) — sólo las dos fotos con caption escrita en el plan.
PHOTO_CAPTIONS = {
    # El salto de línea decide dónde corta la frase en pantalla; el visor lo
    # respeta (`pintarConSaltos` en `tour-rail.ts`).
    "01_aerea_contexto_costa_lejos": "El terreno,\nentre el bosque y la Ruta 10. Foto real, 2 sep 2026.",
    # Apertura del Tramo 2 Mitad A (§1).
    "02_aerea_bloque2_oblicua_cercana": "Bloque 2. Tres niveles, nueve unidades. Foto real.",
    # Caption de la bienvenida (§2): la aérea del conjunto que abre el recorrido.
    "27_aerea_tres_bloques": "El conjunto: tres bloques sobre el bosque.",
}

# Tramo 2, Mitad B (§1): el paseo de 10 fotos con orden de casa. Rótulo de
# ambiente + caption, tal como están escritos uno por uno en la tabla del
# plan — se usan textuales a propósito, están pensadas.
UNIT_WALK = [
    ("16_living_comedor_amplio", "Living", "Living-comedor de un dúplex.\nPiso de madera, ventanales\ncorredizos a la terraza."),
    ("14_living_ventanales_vista_verde", "Los ventanales", "Los ventanales dan al este:\nla vista, no el\nestacionamiento."),
    ("17_cocina_equipada_completa", "Cocina", "Cocina entregada así: mesada de cuarzo negro, horno y anafe instalados."),
    ("21_escalera_interna_duplex", "Escalera", "La escalera del dúplex: dos plantas."),
    ("20_dormitorio_placard_vacio", "Dormitorio", "Dormitorio con placard instalado. Sin\u00a0amueblar: así se entrega."),
    ("19_bano_completo_ducha", "Baño", "Baño completo, mampara de vidrio, sanitarios colocados."),
    ("12_terraza_pergolotecho_parrillero", "Bajo techo", "Techada, con luces embutidas\ny baranda de vidrio."),
    ("22_parrillero_empotrado_detalle", "Terraza", "El parrillero, de cerca."),
    ("13_terraza_sillon_vista_verde", "El paso afuera", "Los ventanales corren enteros:\nel living se abre a la terraza."),
    ("11_vista_terraza_peninsula_skyline", "La vista", "Desde esta terraza: Punta del Este\nsobre el mar. Sin retoque."),
]

# El deslizador antes/después del plan (§1 Tramo 2 Mitad A, mecánica en
# §3.1). Reemplaza al par render/foto (`complejo-fachada` contra
# `07_fachada_bloque2_dia_completa`), que la dueña rechazó: el render y esa
# foto están tomados desde distancias distintas, así que el deslizador no
# comparaba bien (el render sigue en el tramo de amenities con su chapa,
# sólo dejó de ser parte de este comparador).
#
# Este par es el ángulo exacto: `before` es la foto real curada
# (`24_fachada_bloque2_atardecer_angulo`, YA en `photoTour.items`), `after`
# es `generado-ia/paisajismo/DSC05104-paisajismo-baleia.webp`, generada A
# PARTIR de esa misma foto — mismo ángulo, misma cámara, mismo destello de
# sol, por construcción. Verificado a mano: 2000x2994 contra 1025x1534,
# mismo ratio 0.668 (vertical 2:3). Lo único que cambia es que el "after"
# tiene césped y canteros plantados donde la foto real tiene tierra y
# escombros — falta el paisajismo, no el edificio.
#
# El "after" no es `kind: 'foto'` (no es una captura) ni `kind: 'ia'` (esa
# chapa está reservada al slider que ya no existe y además `isPublicable()`
# la filtraría de `pairs` en `tour-rail.model.ts`); es `kind: 'render'`: como
# cualquier render del proyecto, es una proyección de un estado — el
# paisajismo terminado — que todavía no existe en el terreno, y con la misma
# salvedad ("lo construido puede diferir en detalles"). No se marca
# `restricted`: no hay nada que esconder, el punto del comparador es
# mostrarla.
BEFORE_AFTER_PAIRS = [
    {
        "id": "slider-paisajismo",
        # Leyenda debajo del deslizador (`tour-rail.ts::sliderCard` le agrega
        # ". Arrastrá para comparar."). El rótulo fijo pegado a cada imagen
        # ("Hoy · foto real" / "Render del proyecto") es constante del
        # componente, no sale de acá — ver `beforeafter.ts`.
        "label": "Lo que falta es el paisajismo, no el edificio",
        "before_photo": "24_fachada_bloque2_atardecer_angulo",
        "after_dir": PAISAJISMO_DIR,
        # Reiluminada al atardecer sobre la imagen de paisajismo, que a su vez
        # salió de esta misma foto: por eso el edificio cae en el mismo pixel
        # y la costura del deslizador no salta. Generarla de cero desde la foto
        # —probado— reinterpreta la perspectiva y el edificio se corre. El
        # criterio y el prompt quedaron en `prompt-render-fachada-desde-foto.md`
        # junto al archivo.
        "after_file": "DSC05104-render-atardecer.webp",
    },
]

# Planta (imagen del bloque con la unidad resaltada) -> unidades que cubre.
# Verificado contra el brochure, página por página:
#   pág.13-17  Bloque 2, unidades A..E (dúplex, una página cada una)
#   pág.18     Bloque 2, unidad F (planta alta) y G (planta baja)
#   pág.19     Bloque 2, unidad H (planta alta) e I (planta baja)
#   pág.26     Bloque 3, unidad D (planta alta) y E (planta baja)
#   pág.27     Bloque 3, unidad F (planta alta) y G (planta baja)
# B3-A..C (dúplex) y B3-H..K NO tienen imagen en el material descargado:
# quedan sin `media`. B3-H/I y B3-J/K tienen exactamente las mismas
# superficies que B3-F/G y B3-D/E, pero son otro tramo del bloque: reusarles
# la imagen sería mostrarle al visitante una unidad que no es la suya.
UNIT_MEDIA = {
    "unidad-a-vf.png": ["B2-A"],
    "unidad-b-vf.png": ["B2-B"],
    "unidad-c-vf.png": ["B2-C"],
    "unidad-d-vf.png": ["B2-D"],
    "unidad-e-vf.png": ["B2-E"],
    "unidades-fyg-vf.png": ["B2-F", "B2-G"],
    "unidades-hei-vf.png": ["B2-H", "B2-I"],
    "b3-udye.png": ["B3-D", "B3-E"],
    "b3-ufyg.png": ["B3-F", "B3-G"],
}

# Planos ACOTADOS reales por unidad (`material/planos/unidad/`, ya en WebP
# 1800px + thumb 480px, ver INVENTARIO.md §2 — extraídos de los 7 PDF reales
# del cliente). Se agregan al MISMO array `units[code].media` que UNIT_MEDIA,
# después de la axonometría IA: no la reemplazan, la complementan (el plan
# de experiencia §1 Tramo 5 quiere la axonometría como imagen principal Y el
# plano acotado real para "Descargar plano"/pinch-zoom).
# Los PDF originales de esos mismos planos (`planos/unidad/src-pdf/`, 1 página
# A4 apaisada c/u, 224-292 KB). Existen desde que se cargó el material y no se
# publicaban (auditoría §4, Idea 3): son el "Descargar el plano (PDF)" de la
# ficha, la acción que Urbania cobra como feature y que acá es un archivo que
# ya estaba en el repo. Se renombran al código de unidad al copiarlos porque
# los originales traen espacios y una "y" en el nombre ("Unidad F y G.pdf").
UNIT_PDFS = {
    "Unidad A.pdf": ["B2-A"],
    "Unidad B.pdf": ["B2-B"],
    "Unidad C.pdf": ["B2-C"],
    "Unidad D.pdf": ["B2-D"],
    "Unidad E.pdf": ["B2-E"],
    "Unidad F y G.pdf": ["B2-F", "B2-G"],
    "Unidad H y I.pdf": ["B2-H", "B2-I"],
}

# Planos 3D de la tipología (`generado-ia/planos-3d/`, INVENTARIO.md §6.2):
# vistas isométricas generadas con IA A PARTIR de los planos reales. Van como
# imagen principal de la ficha CON su chapa ("Plano 3D · recreación sobre el
# plano real"), igual que todo el material generado de este recorrido.
#
# El mapeo sale de los nombres de archivo tal como los dejó el pipeline de
# INVENTARIO.md: hay un archivo por tipología, no uno por unidad, y dos de
# ellos nombran las dos unidades que cubren (`unidad-B-D` = B y D,
# `unidad-C-E` = C y E — las cuatro dúplex B/C/D/E tienen la misma superficie
# y se agrupan de a dos). Entre los 7 archivos cubren las 9 unidades del
# Bloque 2 exactamente una vez. De las variantes de prueba de A
# ("-fondo-blanco", "-prototipo") se publica sólo la minimalista, que es la
# que tienen las otras ocho.
UNIT_PLANOS_3D = {
    "unidad-A-plano-3D-minimalista.webp": ["B2-A"],
    "unidad-B-D-plano-3D-minimalista.webp": ["B2-B", "B2-D"],
    "unidad-C-E-plano-3D-minimalista.webp": ["B2-C", "B2-E"],
    "unidad-F-plano-3D-minimalista.webp": ["B2-F"],
    "unidad-G-plano-3D-minimalista.webp": ["B2-G"],
    "unidad-H-plano-3D-minimalista.webp": ["B2-H"],
    "unidad-I-plano-3D-minimalista.webp": ["B2-I"],
}

# Numeración comercial de la lista de precios REAL de Caetano (planilla
# "BLOQUE 2", entregada septiembre 2026). Hasta acá sólo había tres filas:
# el mapeo letra→número se resolvía por aritmética de superficie contra una
# tabla de precios parcial, y sólo tres unidades cerraban EXACTO y sin
# ambigüedad; las otras seis quedaban sin número hasta que Caetano
# confirmara la tabla completa. El comentario anterior decía "agregar una
# fila acá es todo lo que hace falta el día que la confirme" — ese día
# llegó: Caetano entregó la lista de precios real y completa de las nueve
# unidades (ver `tools/baleia/README.md` §3.1).
#
# El mapeo sale de comparar, por código, la superficie cubierta y el total
# (con cochera) del CSV contra los de la tabla nueva — igual método que
# antes, ahora con los nueve pares de números en vez de tres:
#   B2-A→207 (cubierta 109.68, univoca), B2-F→202 (cubierta 54.15, univoca),
#   B2-G→209 (cubierta 60.05, univoca), B2-H→201 y B2-I→208 (ambas con
#   52.62 de cubierta, se distinguen por el total: 94.40 vs 86.85).
# B2-B/B2-C/B2-D/B2-E→203/204/205/206 es la única asunción que queda: los
# cuatro dúplex son idénticos en cubierta (107.76m2) y precio (USD 358.638),
# así que ningún dato los distingue entre sí. La dueña del proyecto
# confirmó el 2026-09-23 que la unidad vendida de las cuatro es B2-C = 204
# — ese dato viene de esa confirmación humana, no de aritmética, y no se
# puede re-derivar si este mapeo se regenera desde cero. El orden de las
# otras tres (203→B2-B, 205→B2-D, 206→B2-E) sigue siendo una asunción
# posicional (orden alfabético = orden de la lista), no verificada unidad
# por unidad.
# La foto de portada del recorrido 360 en la ficha de unidad (ver más abajo,
# donde se emite `portada360`). Cambiar esta línea es todo lo que hace falta
# para cambiar esa imagen.
PORTADA_360_FILE = "14_living_ventanales_vista_verde.webp"

UNIT_NUMEROS_CONFIRMADOS = {
    "B2-H": "201",
    "B2-F": "202",
    "B2-B": "203",
    "B2-C": "204",
    "B2-D": "205",
    "B2-E": "206",
    "B2-A": "207",
    "B2-I": "208",
    "B2-G": "209",
}

UNIT_FLOORPLANS = {
    "B2-A.webp": ["B2-A"],
    "B2-B.webp": ["B2-B"],
    "B2-C.webp": ["B2-C"],
    "B2-D.webp": ["B2-D"],
    "B2-E.webp": ["B2-E"],
    "B2-F_B2-G.webp": ["B2-F", "B2-G"],
    "B2-H_B2-I.webp": ["B2-H", "B2-I"],
}

# Ancho máximo de publicación. Los originales son ~1920px; a 1600 no se nota
# la diferencia en pantalla y pesan bastante menos. La miniatura sólo se usa
# en la tira de la galería y en la ficha, donde nunca se dibuja más grande
# que ~200px de ancho en pantalla (400 cubre pantallas 2x).
RENDER_MAX_W, RENDER_Q = 1600, 76
PLAN_MAX_W, PLAN_Q = 1400, 82
THUMB_MAX_W, THUMB_Q = 400, 70

# ------------------------------------------------------ contacto y precio
# `TourManifest.contact` (packages/core/src/types.ts) es el campo opcional que
# habilita el CTA de WhatsApp con el mensaje prellenado y el deep link a la
# unidad. El brochure de septiembre 2026 trae un teléfono comercial (Caetano
# Negocios Inmobiliarios + Dacal Bienes Raíces, +598 95 559 230) y un mail
# (dcaetano@caetano.com.uy). El plan de experiencia (§6, punto 1) pide
# cargarlo — se hace acá, con el número tal como lo publica el brochure.
# **Falta confirmar con el cliente que ese número atiende los leads del
# recorrido** (ver tools/baleia/README.md, "Qué falta pedirle al cliente").
# `--whatsapp <numero>` sigue disponible para pisarlo sin tocar el script.
CONTACT_WHATSAPP: str | None = "+59895559230"
CONTACT_NAME: str | None = "Caetano Negocios Inmobiliarios"
# Plantilla opcional del mensaje. None = el visor usa la suya
# (ver apps/viewer/src/contact.ts::buildCtaMessage).
CONTACT_TEMPLATE: str | None = None

# `theme.priceBands` (también aditivo y opcional): tramos FIJOS de la capa de
# precio. Desde set-2026 sí hay precios reales (Bloque 2, ver README), pero
# son sólo 3 valores distintos (364.861 / 358.638 / 235.000) sobre 7 unidades
# con precio: el visor ya deriva tramos razonables por cuantiles de eso sin
# que haga falta fijarlos a mano. Se deja en None; si el cliente pide cortes
# específicos de la leyenda de precios, ahí sí se completa esta lista.
PRICE_BANDS: list[dict] | None = None

# ------------------------------------------------------------- cotizador
# Condiciones comerciales vigentes para `TourManifest.cotizador` (punto 19
# del docstring). Fuente: lista de precios de Caetano, septiembre 2026
# (`elementos baleia/Baleia prueba brochure (1).pdf`; ver también
# tools/baleia/README.md §3.1):
#
#   "Anticipo del 50% del precio de la unidad + 12 cuotas mensuales con
#   interés del 6% anual sobre saldo. Modalidad única — no se aplica
#   descuento por pago contado."
#   "Gastos de ocupación: 4% sobre el precio total de la unidad (cochera
#   incluida), a cargo del comprador. Se abona 2.5% a la posesión y 1.5% a
#   la escritura, por separado y no integran el total a escriturar."
#
# Estos números NO se calculan acá: el motor (cuota francesa, tabla de
# amortización) vive en `packages/core/src/cotizador.ts`
# (`CondicionesVenta`). Este script sólo los declara como constantes CON
# NOMBRE, igual criterio que `CONTACT_WHATSAPP`/`PRICE_BANDS` de arriba: si
# el día de mañana Caetano publica otra tasa u otro plazo, se cambia acá, en
# un solo lugar, sin tocar la forma del manifiesto ni el motor de cálculo.
ANTICIPO_PCT = 0.5
TASA_ANUAL_PCT = 0.06
PLAZO_MESES = 12
GASTOS_OCUPACION_PCT = 0.04
# Reparto del 4% de gastos de ocupación: 2.5% a la posesión + 1.5% a la
# escritura (ambos expresados sobre el precio de la unidad, igual que los
# publica la lista de precios — no como fracción del propio 4%).
GASTOS_OCUPACION_POSESION_PCT = 0.025
GASTOS_OCUPACION_ESCRITURA_PCT = 0.015

# ------------------------------------------------------ regla dura (punto 6)
# Bloques 1 y 3: el brochure los marca explícitamente "PRÓXIMAMENTE" (no
# están a la venta hoy, pero SÍ hay una fecha comercial pública de que van a
# estarlo — a diferencia de Bloque 4 y 5, que no tienen ni eso). Desde
# `0017_unit_status_proximamente.sql` / `packages/core/src/status.ts`,
# "proximamente" es un estado REAL de `UNIT_STATUSES` (chip de contorno:
# `fill:0`, `pattern:'outline'` — nunca se confunde con "disponible" ni con
# el gris de fallback). Antes de esa migración este script emitía a
# propósito un valor que el visor NO reconocía, para demostrar la regla
# dura con un caso real (ver el historial de este archivo y
# `tools/baleia/README.md` §3.1) — ya no hace falta el truco.
BLOCKS_PROXIMAMENTE = ["B1", "B3"]
PROXIMAMENTE_VALUE = "proximamente"

# Bloque 4 y 5: cero datos, ni siquiera "próximamente" (el brochure sólo
# nombra Bloque 1 y 3 en ese cartel). Quedan afuera de `availability.json` a
# propósito: la regla dura los pinta gris con warning en vez de inventarles
# un estado que no está en ningún lado.
BLOCKS_MISSING_FROM_AVAILABILITY = ["B4", "B5"]

# Bloque 3 (11 unidades): mismo caso que su bloque, sin estado/precio real.
# B3-K en particular se deja afuera de `availability.json` (no "proximamente"
# como el resto) para seguir demostrando la otra mitad de la regla dura:
# una unidad de la que ni siquiera llegó un estado inválido.
#
# Revisado el 06/09/2026 contra `docs/06-BENCHMARK/6-AUDITORIA-EXPERIENCIA.md`
# (§2.2), que vuelve a señalarlo como confuso en pantalla (celda vacía y más
# baja, al lado de diez "Próximamente"). SIGUE SIENDO A PROPÓSITO: el detalle
# completo de por qué se decide mantenerlo así, en vez de sumarlo a
# `BLOCKS_PROXIMAMENTE`, está en `tools/baleia/README.md` §3.3. Lo que sí
# falta —y no es cosa de este dato sino de cómo la grilla de unidades pinta
# un estado ausente (`tour-rail.ts`/`units-panel.ts`)— es que la pantalla
# diga "Sin dato" en vez de dejar la celda en blanco.
UNIT_MISSING_FROM_AVAILABILITY = "B3-K"


def cli_value(argv: list[str], flag: str) -> str | None:
    """`--flag valor` -> "valor". Sin argparse: el script tiene dos banderas."""
    if flag in argv:
        i = argv.index(flag)
        if i + 1 < len(argv):
            return argv[i + 1]
    return None


def slug(s: str) -> str:
    s = s.strip().lower()
    s = (
        s.replace("á", "a").replace("é", "e").replace("í", "i")
        .replace("ó", "o").replace("ú", "u")
    )
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def block_code_from_bloque_o_piso(v: str) -> str | None:
    m = re.search(r"(\d+)", v)
    return f"B{m.group(1)}" if m else None


def load_units(csv_path: str) -> list[dict]:
    """Lee el CSV comercial. Desde septiembre 2026, Bloque 2 trae `estado`,
    `precio`, `moneda` y `mostrar_precio_publico` REALES (brochure "Baleia
    prueba brochure (1).pdf", lista de precios BLOQUE 2 - DISPONIBLE) — el
    resto de las unidades (Bloque 3) sigue sin ese dato y las columnas
    quedan vacías, tal como las dejó `scripts/build_units_csv.py`."""
    with open(csv_path, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    units = []
    for r in rows:
        code = r["codigo_unidad"].strip()
        block = block_code_from_bloque_o_piso(r["bloque_o_piso"])
        estado = r["estado"].strip()
        precio_raw = r["precio"].strip()
        mostrar = r["mostrar_precio_publico"].strip().upper()
        units.append(
            {
                "code": code,
                "block": block,
                "tipologia": r["tipologia"].strip(),
                "superficie_cubierta_m2": float(r["superficie_cubierta_m2"]),
                "superficie_total_m2": float(r["superficie_total_m2"]),
                "notas_internas": r["notas_internas"].strip(),
                # Dato comercial real (Bloque 2) o vacío (Bloque 3, ver arriba).
                "estado_real": estado if estado in UNIT_STATUSES else None,
                "precio_real": float(precio_raw) if precio_raw else None,
                "moneda_real": r["moneda"].strip() or None,
                # Sin `mostrar_precio_publico=SI` explícito no se publica el
                # precio aunque exista (nunca se infiere "sí" por default).
                "mostrar_precio_publico": mostrar in ("SI", "SÍ", "TRUE", "1"),
            }
        )
    return units


def ring_to_px(coords: list[list[float]]) -> list[list[float]]:
    """GeoJSON Polygon exterior ring -> Hotspot.geometry (Px[]).

    GeoJSON repite el primer vértice al final para cerrar el anillo; los
    hotspots del visor no lo esperan repetido (ver el ejemplo de
    apps/viewer/public/tour.json), así que se descarta el duplicado."""
    ring = coords[:-1] if coords[0] == coords[-1] else coords[:]
    return [[round(x, 5), round(y, 5)] for x, y in ring]


def load_hotspot_geoms(geojson_path: str) -> dict[str, list[list[float]]]:
    data = json.load(open(geojson_path, encoding="utf-8"))
    out = {}
    for feat in data["features"]:
        code = feat["properties"]["code"]
        out[code] = ring_to_px(feat["geometry"]["coordinates"][0])
    return out


def aggregate_block_status(codes: list[str], demo_status: dict[str, str]) -> str | None:
    """Mejor estado (menor `order`) entre las unidades conocidas del bloque.
    Ignora las que fueron sacadas a propósito de `demo_status` para el caso
    de "unidad ausente"."""
    known = [demo_status[c] for c in codes if c in demo_status]
    if not known:
        return None
    return min(known, key=lambda s: STATUS_ORDER[s])


def convert_masterplan(out_dir: str) -> dict:
    """PNG (300dpi) -> WebP calidad 85. Ver punto 1 del docstring: con el
    tamaño actual del masterplan (~15.6MP) una sola imagen WebP es más
    simple y liviana que meter una pirámide DZI sin consumidor en el visor.

    Emite ADEMÁS `masterplan.thumb.webp` con la misma convención de nombre que
    los renders (punto 8). El visor la usa como placeholder desenfocado durante
    el arranque: a los ~0,5 s se ve la forma del proyecto en vez de un texto
    "Cargando…" sobre negro, y la barra de progreso mide la descarga del master
    de verdad (ver `apps/viewer/src/main.ts`). Son ~15 KB para no tener nunca
    una pantalla vacía."""
    img = Image.open(MASTERPLAN_SRC).convert("RGB")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "masterplan.webp")
    img.save(out_path, format="WEBP", quality=85, method=6)

    thumb = img.copy()
    thumb.thumbnail((THUMB_MAX_W, THUMB_MAX_W), Image.LANCZOS)
    thumb_path = os.path.join(out_dir, "masterplan.thumb.webp")
    thumb.save(thumb_path, format="WEBP", quality=THUMB_Q, method=6)

    return {
        "path": out_path,
        "width": img.width,
        "height": img.height,
        "bytes": os.path.getsize(out_path),
        "thumb": thumb_path,
        "thumb_bytes": os.path.getsize(thumb_path),
    }


def optimize_image(src: str, dst: str, max_w: int, quality: int, flatten: bool = False) -> dict:
    """JPG/PNG -> WebP redimensionado + su miniatura `*.thumb.webp`.

    `flatten=True` compone el RGBA sobre blanco (ver punto 9 del docstring).
    Devuelve tamaños y bytes de las tres cosas (original, grande, miniatura)
    para poder reportar el antes/después sin volver a medir a mano."""
    img = Image.open(src)
    if flatten and img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[-1])
        img = bg
    else:
        img = img.convert("RGB")

    big = img.copy()
    if big.width > max_w:
        big = big.resize((max_w, round(big.height * max_w / big.width)), Image.LANCZOS)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    big.save(dst, format="WEBP", quality=quality, method=6)

    thumb = img.copy()
    thumb.thumbnail((THUMB_MAX_W, THUMB_MAX_W), Image.LANCZOS)
    thumb_path = re.sub(r"\.webp$", ".thumb.webp", dst)
    thumb.save(thumb_path, format="WEBP", quality=THUMB_Q, method=6)

    return {
        "src": os.path.relpath(src, BALEIA_DIR),
        "src_bytes": os.path.getsize(src),
        "src_size": [img.width, img.height],
        "out": os.path.relpath(dst, TOUR_DIR),
        "bytes": os.path.getsize(dst),
        "width": big.width,
        "height": big.height,
        "thumb_bytes": os.path.getsize(thumb_path),
    }


def load_capture_dates() -> dict[str, str]:
    """`nombre_nuevo` (sin extensión) -> fecha EXIF `capturado_en` (YYYY-MM-DD).

    Lee `material-real/index.csv`, columna agregada el 06/09/2026 leyendo el
    EXIF `DateTimeOriginal` de los 26 archivos originales (`elementos
    baleia/fotos-editadas/`, fuera del repo). Nunca se escribe una fecha a
    mano: si el CSV no tiene la columna o el valor está vacío, la imagen
    queda sin `capturedAt` en vez de inventar "2 sep 2026" por default."""
    if not os.path.isfile(MATERIAL_REAL_INDEX):
        return {}
    with open(MATERIAL_REAL_INDEX, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    out = {}
    for r in rows:
        name = r["nombre_nuevo"].rsplit(".", 1)[0]
        date = (r.get("capturado_en") or "").strip()
        if date:
            out[name] = date
    return out


CAPTURE_DATES: dict[str, str] = load_capture_dates()


def copy_optimized(src: str, dst: str) -> dict:
    """Copia un asset YA optimizado (WebP + `*.thumb.webp` propio) tal cual,
    sin volver a codificarlo (evita una segunda pasada de compresión sobre
    material que `material-real/scripts` y el pipeline de INVENTARIO.md ya
    dejaron en su tamaño final). Sólo lee dimensiones para el reporte."""
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copyfile(src, dst)
    thumb_src = re.sub(r"\.webp$", ".thumb.webp", src)
    thumb_dst = re.sub(r"\.webp$", ".thumb.webp", dst)
    has_thumb = os.path.isfile(thumb_src)
    if has_thumb:
        shutil.copyfile(thumb_src, thumb_dst)
    img = Image.open(src)
    return {
        "src": os.path.relpath(src, BALEIA_DIR),
        "src_bytes": os.path.getsize(src),
        "out": os.path.relpath(dst, TOUR_DIR),
        "bytes": os.path.getsize(dst),
        "width": img.width,
        "height": img.height,
        "thumb_bytes": os.path.getsize(thumb_dst) if has_thumb else 0,
    }


def probe_video(path: str) -> tuple[int, int, float]:
    """Ancho, alto y duración de un mp4 vía `ffprobe`. Nunca se hardcodea:
    si `ffprobe` no está instalado o el archivo no es válido, mejor romper
    fuerte acá que inventar un tamaño que después desalinea el manifiesto
    con el archivo real."""
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height,duration",
            "-of", "json", path,
        ],
        capture_output=True, text=True, check=True,
    )
    stream = json.loads(result.stdout)["streams"][0]
    return int(stream["width"]), int(stream["height"]), float(stream["duration"])


def copy_video_asset(src: str, dst: str) -> dict:
    """Copia un mp4/jpg del video YA comprimido tal cual (nunca se
    reencodea acá: la compresión con ffmpeg es un paso manual, ver
    `media/README.md`)."""
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copyfile(src, dst)
    return {
        "src": os.path.relpath(src, BALEIA_DIR),
        "src_bytes": os.path.getsize(src),
        "out": os.path.relpath(dst, TOUR_DIR),
        "bytes": os.path.getsize(dst),
    }


def build_video_scene(tour_dir: str) -> tuple[dict | None, list[dict]]:
    """Escena `kind:'video'` del Tramo 4 (decisión 15 del docstring). Si el
    archivo real todavía no está en `media/video/`, devuelve `(None, [])`
    y el build sigue sin romperse — el tramo se dibuja con la tarjeta
    "todavía no está publicado" (`tour-rail.ts::renderVideo`)."""
    src_1080 = os.path.join(VIDEO_DIR, VIDEO_REAL_FILE)
    if not os.path.isfile(src_1080):
        return None, []

    dst_1080 = os.path.join(tour_dir, "media", "video", VIDEO_REAL_FILE)
    info_1080 = copy_video_asset(src_1080, dst_1080)
    width, height, _duration = probe_video(src_1080)

    media_info = [info_1080]
    scene: dict = {
        "id": "sc-video",
        "slug": "video",
        "kind": "video",
        "name": "El recorrido real",
        "source": {"url": f"./media/video/{VIDEO_REAL_FILE}", "width": width, "height": height},
        # Igual que las fotos reales (punto 12): la fecha es la prueba de que
        # es filmación real. No sale de EXIF (el reel ya está editado y no
        # conserva el original) sino del README del video — documentada, no
        # inventada.
        "procedencia": {"kind": "foto", "capturedAt": VIDEO_REAL_CAPTURED_AT},
        # Después de los renders (10..16): es la única escena real navegable
        # de la galería hoy, pero nunca compite con el masterplan (sort 1).
        "sort": 900,
    }

    src_720 = os.path.join(VIDEO_DIR, VIDEO_REAL_MOBILE_FILE)
    if os.path.isfile(src_720):
        dst_720 = os.path.join(tour_dir, "media", "video", VIDEO_REAL_MOBILE_FILE)
        media_info.append(copy_video_asset(src_720, dst_720))
        scene["mobileUrl"] = f"./media/video/{VIDEO_REAL_MOBILE_FILE}"

    src_poster = os.path.join(VIDEO_DIR, VIDEO_REAL_POSTER_FILE)
    if os.path.isfile(src_poster):
        dst_poster = os.path.join(tour_dir, "media", "video", VIDEO_REAL_POSTER_FILE)
        info_poster = copy_video_asset(src_poster, dst_poster)
        media_info.append(info_poster)
        poster_img = Image.open(src_poster)
        scene["poster"] = {
            "url": f"./media/video/{VIDEO_REAL_POSTER_FILE}",
            "width": poster_img.width,
            "height": poster_img.height,
        }

    # Corte vertical (decisión 18, `Scene.portrait` en packages/core): mismo
    # tratamiento que el horizontal, dimensiones leídas con `ffprobe` (nunca
    # a mano) y `copy_video_asset`, que nunca reencodea. Opcional: si el
    # archivo vertical no está, la escena queda sólo con el horizontal.
    src_vertical = os.path.join(VIDEO_DIR, VIDEO_REAL_VERTICAL_FILE)
    if os.path.isfile(src_vertical):
        dst_vertical = os.path.join(tour_dir, "media", "video", VIDEO_REAL_VERTICAL_FILE)
        media_info.append(copy_video_asset(src_vertical, dst_vertical))
        v_width, v_height, v_duration = probe_video(src_vertical)
        portrait: dict = {
            "url": f"./media/video/{VIDEO_REAL_VERTICAL_FILE}",
            "width": v_width,
            "height": v_height,
            "duration": round(v_duration, 1),
        }

        src_vertical_mobile = os.path.join(VIDEO_DIR, VIDEO_REAL_VERTICAL_MOBILE_FILE)
        if os.path.isfile(src_vertical_mobile):
            dst_vertical_mobile = os.path.join(
                tour_dir, "media", "video", VIDEO_REAL_VERTICAL_MOBILE_FILE
            )
            media_info.append(copy_video_asset(src_vertical_mobile, dst_vertical_mobile))
            portrait["mobileUrl"] = f"./media/video/{VIDEO_REAL_VERTICAL_MOBILE_FILE}"

        src_vertical_poster = os.path.join(VIDEO_DIR, VIDEO_REAL_VERTICAL_POSTER_FILE)
        if os.path.isfile(src_vertical_poster):
            dst_vertical_poster = os.path.join(
                tour_dir, "media", "video", VIDEO_REAL_VERTICAL_POSTER_FILE
            )
            media_info.append(copy_video_asset(src_vertical_poster, dst_vertical_poster))
            vposter_img = Image.open(src_vertical_poster)
            portrait["poster"] = {
                "url": f"./media/video/{VIDEO_REAL_VERTICAL_POSTER_FILE}",
                "width": vposter_img.width,
                "height": vposter_img.height,
            }

        scene["portrait"] = portrait

    return scene, media_info


def build_media(tour_dir: str) -> dict:
    """Convierte renders y plantas a WebP dentro de `out/tour/media/`."""
    renders = {}
    for filename, slug_, _title in RENDERS:
        renders[slug_] = optimize_image(
            os.path.join(MATERIAL_DIR, "renders", filename),
            os.path.join(tour_dir, "media", "renders", f"{slug_}.webp"),
            RENDER_MAX_W,
            RENDER_Q,
        )
    plantas = {}
    for filename, codes in UNIT_MEDIA.items():
        name = filename.rsplit(".", 1)[0]
        info = optimize_image(
            os.path.join(MATERIAL_DIR, "plantas", filename),
            os.path.join(tour_dir, "media", "plantas", f"{name}.webp"),
            PLAN_MAX_W,
            PLAN_Q,
            flatten=True,
        )
        info["units"] = codes
        plantas[name] = info

    # Planos acotados reales (punto 14 del docstring): ya vienen en WebP
    # 1800px + thumb 480px (INVENTARIO.md §2) — se copian tal cual.
    floorplanes = {}
    for filename, codes in UNIT_FLOORPLANS.items():
        name = filename.rsplit(".", 1)[0]
        info = copy_optimized(
            os.path.join(UNIT_FLOORPLANS_DIR, filename),
            os.path.join(tour_dir, "media", "planos", filename),
        )
        info["units"] = codes
        floorplanes[name] = info

    # Planos 3D de la tipología (punto 16): ya vienen en WebP + thumb, se
    # copian tal cual como el resto del material generado.
    planos3d = {}
    for filename, codes in UNIT_PLANOS_3D.items():
        info = copy_optimized(
            os.path.join(PLANOS_3D_DIR, filename),
            os.path.join(tour_dir, "media", "planos-3d", filename),
        )
        info["units"] = codes
        planos3d[filename] = info

    # El brochure, página por página como imagen. NO como PDF embebido: en el
    # navegador del teléfono un PDF dentro de la página es poco confiable —en
    # iOS suele quedar en blanco o mostrar sólo la primera hoja—. Como
    # imágenes se ve en cualquier teléfono y se pasa con el dedo. El PDF
    # completo sigue en `material/brochure/` para quien lo quiera entero.
    brochure_dir = os.path.join(MATERIAL_DIR, "brochure", "paginas")
    brochure_pages = []
    if os.path.isdir(brochure_dir):
        for filename in sorted(os.listdir(brochure_dir)):
            if not filename.endswith(".webp"):
                continue
            src = os.path.join(brochure_dir, filename)
            dst = os.path.join(tour_dir, "media", "brochure", filename)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copyfile(src, dst)
            # La URL lleva un sello del contenido. Las páginas se llaman
            # siempre igual (`pagina-01.webp`), así que al cambiar el brochure
            # el teléfono seguía mostrando las viejas de su caché: misma
            # dirección, archivo distinto. Con el sello, un brochure nuevo es
            # una dirección nueva y no hay nada que vaciar a mano.
            sello = hashlib.md5(open(src, "rb").read()).hexdigest()[:8]
            brochure_pages.append(f"./media/brochure/{filename}?v={sello}")

    # Los PDF originales, renombrados al código de unidad: son un archivo para
    # bajar, no una imagen, así que no pasan por Pillow ni tienen miniatura.
    pdfs = {}
    for filename, codes in UNIT_PDFS.items():
        name = "_".join(codes)
        dst = os.path.join(tour_dir, "media", "planos-pdf", f"{name}.pdf")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        src = os.path.join(UNIT_PDF_DIR, filename)
        shutil.copyfile(src, dst)
        pdfs[name] = {
            "src": os.path.relpath(src, BALEIA_DIR),
            "out": os.path.relpath(dst, TOUR_DIR),
            "bytes": os.path.getsize(dst),
            "units": codes,
        }

    return {
        "renders": renders,
        "plantas": plantas,
        "floorplanes": floorplanes,
        "planos3d": planos3d,
        "pdfs": pdfs,
        "brochure_pages": brochure_pages,
    }


def copy_marca(tour_dir: str) -> dict | None:
    """Copia la marca del proyecto a `out/tour/marca/` (punto 17).

    Es lo que hace que `--publish` la deje dentro de la carpeta publicada, que
    el propio `--publish` borra y recrea entera. Sin este paso el logo tenía
    que vivir versionado aparte en `apps/viewer/public/marca/` para sobrevivir
    a cada regeneración — dos copias del mismo archivo, una sola de ellas
    dentro del pipeline."""
    src = os.path.join(MARCA_DIR, MARCA_FILE)
    if not os.path.isfile(src):
        return None
    dst = os.path.join(tour_dir, "marca", MARCA_FILE)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copyfile(src, dst)
    return {"out": os.path.relpath(dst, TOUR_DIR), "bytes": os.path.getsize(dst)}


def _photo_item(tour_dir: str, name: str, *, restricted: bool = False) -> tuple[dict, dict]:
    """Copia una foto curada de `material-real/web/{full,thumb}` a
    `out/tour/media/fotos/` y arma su `PhotoTourItem` (sin caption/ambiente:
    eso lo agrega el llamador). Devuelve `(item, info_para_reporte)`."""
    src_full = os.path.join(MATERIAL_REAL_WEB, "full", f"{name}.webp")
    dst_full = os.path.join(tour_dir, "media", "fotos", f"{name}.webp")
    info = copy_optimized(src_full, dst_full)
    src_thumb = os.path.join(MATERIAL_REAL_WEB, "thumb", f"{name}.webp")
    dst_thumb = os.path.join(tour_dir, "media", "fotos", f"{name}.thumb.webp")
    if os.path.isfile(src_thumb) and not os.path.isfile(dst_thumb):
        os.makedirs(os.path.dirname(dst_thumb), exist_ok=True)
        shutil.copyfile(src_thumb, dst_thumb)

    capture = CAPTURE_DATES.get(name)
    item = {
        "id": name,
        "url": f"./media/fotos/{name}.webp",
        "thumbUrl": f"./media/fotos/{name}.thumb.webp",
        "width": info["width"],
        "height": info["height"],
        # Fecha = prueba (plan §5.1): sólo se emite si el EXIF la dio de
        # verdad (ver load_capture_dates()), nunca a mano.
        "procedencia": {"kind": "foto", **({"capturedAt": capture} if capture else {})},
    }
    if restricted:
        item["restricted"] = True
    return item, info


def _paisajismo_pair_item(tour_dir: str, src_dir: str, filename: str) -> tuple[dict, dict]:
    """Arma el lado "después" de `BEFORE_AFTER_PAIRS`: copia la imagen de
    paisajismo terminado (`generado-ia/paisajismo/`, ya generada A PARTIR de
    una foto real, mismo ángulo) a `out/tour/media/paisajismo/`, sin
    reencodear (mismo `copy_optimized` que usa `_photo_item`). `kind:
    'render'` — no `'foto'` (no es una captura) ni `'ia'` (esa chapa y el
    filtro `restricted` son del slider "foto real vs. IA" que ya no existe,
    y `isPublicable()` la sacaría de `pairs`): es una proyección del
    proyecto, igual que cualquier otro render, sólo que del paisajismo en
    vez de la arquitectura. Devuelve `(item, info_para_reporte)`."""
    name = filename.rsplit(".", 1)[0]
    src_full = os.path.join(src_dir, filename)
    dst_full = os.path.join(tour_dir, "media", "paisajismo", filename)
    info = copy_optimized(src_full, dst_full)
    item = {
        "id": name,
        "url": f"./media/paisajismo/{filename}",
        "thumbUrl": f"./media/paisajismo/{name}.thumb.webp",
        "width": info["width"],
        "height": info["height"],
        "procedencia": {"kind": "render"},
    }
    return item, info


def build_photo_tour(tour_dir: str) -> tuple[dict, list[dict]]:
    """`TourManifest.photoTour` (punto 13 del docstring): las fotos reales
    curadas, en el orden con sentido del plan de experiencia, más el
    deslizador antes/después de paisajismo. Devuelve `(photoTour,
    media_info)` — lo segundo sólo para el reporte de peso publicado."""
    items: list[dict] = []
    media_info: list[dict] = []
    seen: set[str] = set()

    def add_photo(name: str, *, caption: str | None = None, ambiente: str | None = None) -> None:
        if name in seen:
            return
        seen.add(name)
        item, info = _photo_item(tour_dir, name)
        if caption:
            item["caption"] = caption
        if ambiente:
            item["ambiente"] = ambiente
        items.append(item)
        media_info.append(info)

    # Tramo 1 (§1): las fotos con caption propia del plan. Abre la aérea del
    # conjunto, que es la misma de la bienvenida (§2): el recorrido arranca
    # donde quedó la portada, sin un corte de imagen en el medio.
    add_photo("27_aerea_tres_bloques", caption=PHOTO_CAPTIONS["27_aerea_tres_bloques"])
    add_photo("01_aerea_contexto_costa_lejos", caption=PHOTO_CAPTIONS["01_aerea_contexto_costa_lejos"])
    add_photo("04_aerea_skyline_punta_del_este")

    # Tramo 2, Mitad A (§1): apertura + serie de fachada (swipe horizontal).
    add_photo("02_aerea_bloque2_oblicua_cercana", caption=PHOTO_CAPTIONS["02_aerea_bloque2_oblicua_cercana"])
    for name in ("07_fachada_bloque2_dia_completa", "08_fachada_bloque2_angulo", "09_fachada_bloque2_vertical", "24_fachada_bloque2_atardecer_angulo"):
        add_photo(name)

    # Tramo 2, Mitad B (§1): el paseo de 10 fotos, con caption y ambiente
    # TEXTUALES (ver UNIT_WALK más arriba — se usan tal como están escritos).
    for name, ambiente, caption in UNIT_WALK:
        add_photo(name, caption=caption, ambiente=ambiente)

    # Deslizador antes/después de paisajismo (§1, mecánica en §3.1).
    # `before` es la foto real, que entra por el mismo `add_photo` que las
    # demás — ya está en la serie de fachada (`24_fachada_bloque2_atardecer_
    # angulo`), así que `seen` evita duplicarla y el `next()` la encuentra;
    # `after` se copia de `generado-ia/paisajismo/` (`_paisajismo_pair_item`).
    pairs = []
    for spec in BEFORE_AFTER_PAIRS:
        add_photo(spec["before_photo"])
        before_item = next(i for i in items if i["id"] == spec["before_photo"])
        after_item, after_info = _paisajismo_pair_item(tour_dir, spec["after_dir"], spec["after_file"])
        media_info.append(after_info)
        pairs.append({"id": spec["id"], "label": spec["label"], "before": before_item, "after": after_item})

    return {"items": items, "pairs": pairs}, media_info


def reintegrar_panoramas(tour: dict) -> int:
    """Devuelve al manifiesto las panorámicas que ya estaban integradas.

    Este script arma el `tour.json` desde cero cada vez, y las escenas 360 no
    salen de acá: las agrega después `integrate_panoramas.py`, que es otro
    paso con otro entorno. Resultado: cualquier corrida de rutina —cambiar un
    texto, cambiar el brochure— dejaba el recorrido publicado sin las 15
    panorámicas, con los tiles ahí en el disco pero sin nadie que los nombrara.
    Pasó, y nadie se entera hasta que alguien abre una ficha y el botón de
    "Recorrer en 360°" no está.

    Así que se reponen desde el `tour.json` anterior, y sólo las que todavía
    tienen sus tiles en `out/tour/scenes/`: si el material se fue, la escena no
    vuelve. Volver a correr `integrate_panoramas.py` sigue siendo la forma de
    agregar tomas nuevas o cambiar las que hay; esto sólo evita perderlas.
    """
    previo_path = os.path.join(TOUR_DIR, "tour.json")
    if not os.path.isfile(previo_path):
        return 0
    with open(previo_path, encoding="utf-8") as f:
        previo = json.load(f)

    vivas = [
        sc
        for sc in previo.get("scenes", [])
        if sc.get("kind") == "panorama"
        and os.path.isfile(
            os.path.join(TOUR_DIR, "scenes", sc.get("slug", ""), "tiles", "tiles.json")
        )
    ]
    if not vivas:
        return 0

    ya = {sc["slug"] for sc in tour["scenes"]}
    for sc in vivas:
        if sc["slug"] not in ya:
            tour["scenes"].append(sc)
    tour["scenes"].sort(key=lambda sc: sc.get("sort", 0))

    # Y los hotspots del masterplan que saltaban a una panorámica vuelven a
    # saltar ahí: sin esto la escena existe pero no hay cómo llegar.
    slugs = {sc["slug"] for sc in vivas}
    acciones = {
        h["id"]: h["action"]
        for h in previo.get("hotspots", [])
        if (h.get("action") or {}).get("sceneSlug") in slugs
    }
    for h in tour.get("hotspots", []):
        if h["id"] in acciones:
            h["action"] = acciones[h["id"]]

    return len(vivas)


def publish(tour_dir: str) -> dict:
    """Copia `out/tour/` a `apps/viewer/public/baleia/` y deja en
    `public/tour.json` la misma cosa con las URLs prefijadas, que es lo que
    abre el visor en dev sin parámetros (`main.ts` cae a `./tour.json`)."""
    if os.path.isdir(PUBLISH_DIR):
        shutil.rmtree(PUBLISH_DIR)
    shutil.copytree(tour_dir, PUBLISH_DIR)

    with open(os.path.join(tour_dir, "tour.json"), encoding="utf-8") as f:
        tour = json.load(f)

    # `./x` -> `./baleia/x`: el mismo manifiesto servido un nivel más arriba.
    #
    # Se recorre el manifiesto entero y se prefija TODA ruta relativa, en vez
    # de ir campo por campo. La lista escrita a mano se quedaba corta cada vez
    # que el manifiesto crecía —y cuando entraron las escenas 360, que traen
    # `source.base` en lugar de `source.url`, directamente reventaba y dejaba
    # el manifiesto de la raíz sin actualizar—. Es el mismo criterio que usa
    # `integrate_panoramas.py`.
    def prefijar(nodo):
        if isinstance(nodo, dict):
            return {k: prefijar(v) for k, v in nodo.items()}
        if isinstance(nodo, list):
            return [prefijar(v) for v in nodo]
        if isinstance(nodo, str) and nodo.startswith("./") and not nodo.startswith("./baleia/"):
            return nodo.replace("./", "./baleia/", 1)
        return nodo

    tour = prefijar(tour)

    with open(PUBLISH_ROOT_TOUR, "w", encoding="utf-8") as f:
        json.dump(tour, f, indent=2, ensure_ascii=False)
    return {"dir": PUBLISH_DIR, "root_tour": PUBLISH_ROOT_TOUR}


def build(argv: list[str] | None = None) -> int:
    argv = argv or []
    units = load_units(CSV_PATH)
    geoms = load_hotspot_geoms(GEOJSON_PATH)
    masterplan = convert_masterplan(TOUR_DIR)
    media = build_media(TOUR_DIR)
    marca = copy_marca(TOUR_DIR)
    media_by_unit: dict[str, list[str]] = {}
    for name, info in media["plantas"].items():
        for code in info["units"]:
            media_by_unit.setdefault(code, []).append(f"./media/plantas/{name}.webp")
    # Planos acotados reales (punto 14 del docstring): se agregan DESPUÉS de
    # la axonometría IA en el mismo array, nunca la reemplazan.
    for name, info in media["floorplanes"].items():
        for code in info["units"]:
            media_by_unit.setdefault(code, []).append(f"./media/planos/{name}.webp")
    # Plano 3D y PDF NO van a `media` (ese array es la galería de plantas de la
    # ficha): van a `attrs`, porque cada uno tiene su propio tratamiento —el 3D
    # es la imagen principal y lleva chapa de IA, el PDF es una descarga.
    plano3d_by_unit: dict[str, str] = {}
    for filename, info in media["planos3d"].items():
        for code in info["units"]:
            plano3d_by_unit[code] = f"./media/planos-3d/{filename}"
    pdf_by_unit: dict[str, str] = {}
    for name, info in media["pdfs"].items():
        for code in info["units"]:
            pdf_by_unit[code] = f"./media/planos-pdf/{name}.pdf"

    block_codes: dict[str, list[str]] = {}
    for u in units:
        block_codes.setdefault(u["block"], []).append(u["code"])

    # --------------------------------------------------------- tour.units
    tour_units: dict = {}
    for u in units:
        tour_units[u["code"]] = {
            "label": u["code"],
            "groupCode": u["block"],
            "typeCode": slug(u["tipologia"]),
            "areaTotalM2": u["superficie_total_m2"],
            # El tour.json es PUBLICO: lo descarga cualquier visitante. Nunca
            # vuelquen aca campos internos. `notas_internas` del CSV se queda
            # en el panel, igual que el precio cuando no es de visibilidad
            # publica: eso se resuelve en availability.json, no aca.
            "attrs": {
                "tipologia": u["tipologia"],
                "superficieCubiertaM2": u["superficie_cubierta_m2"],
            },
        }
        # Los tres campos aditivos de la ficha (punto 16). Cada uno se emite
        # sólo si el dato existe de verdad: la ficha dibuja lo que llega.
        numero = UNIT_NUMEROS_CONFIRMADOS.get(u["code"])
        if numero:
            tour_units[u["code"]]["attrs"]["numeroComercial"] = numero
        if u["code"] in plano3d_by_unit:
            tour_units[u["code"]]["attrs"]["plano3d"] = plano3d_by_unit[u["code"]]
        if u["code"] in pdf_by_unit:
            tour_units[u["code"]]["attrs"]["planoPdf"] = pdf_by_unit[u["code"]]
        if u["code"] in media_by_unit:
            tour_units[u["code"]]["media"] = media_by_unit[u["code"]]

    block_names = {"B1": "Bloque 1", "B2": "Bloque 2", "B3": "Bloque 3", "B4": "Bloque 4", "B5": "Bloque 5"}
    for code, name in block_names.items():
        contained = block_codes.get(code, [])
        area_sum = sum(tour_units[c]["areaTotalM2"] for c in contained) if contained else None
        tour_units[code] = {
            "label": name,
            "groupCode": None,
            "typeCode": "bloque",
            # No es el área del polígono del bloque: es la suma de las
            # superficies totales publicadas de las unidades que contiene
            # (null cuando no hay unidades con datos, ver punto 6). Se deja
            # como atributo, no como `areaTotalM2`, para no mentir sobre
            # qué mide ese número (ver docstring, punto 2).
            "attrs": {
                "unitCount": len(contained),
                "unitCodes": contained,
                "superficieTotalUnidadesM2": round(area_sum, 2) if area_sum is not None else None,
            },
        }

    # ---------------------------------------------------------- hotspots
    hotspots = []
    hotspots.append(
        {
            "id": "h-TERRENO",
            "sceneId": "sc-masterplan",
            "unitCode": None,
            "geometryKind": "polygon_px",
            "geometry": geoms["TERRENO"],
            # Sin `action`: es puramente decorativo (perímetro), no clickeable.
            # `Hotspot.action` es opcional pero no admite `null` en su tipo
            # (packages/core/src/types.ts), así que se omite la clave en vez
            # de escribirla en `null`.
            "zIndex": 0,
            "label": "Perímetro del terreno",
        }
    )
    for code in ["B1", "B2", "B3", "B4", "B5"]:
        hotspots.append(
            {
                "id": f"h-{code}",
                "sceneId": "sc-masterplan",
                "unitCode": code,
                "geometryKind": "polygon_px",
                "geometry": geoms[code],
                "action": {"kind": "unit"},
                "zIndex": 2,
                "label": block_names[code],
            }
        )
    for code, label in AMENITY_LABELS.items():
        hotspots.append(
            {
                "id": f"h-{code}",
                "sceneId": "sc-masterplan",
                "unitCode": None,
                "geometryKind": "polygon_px",
                "geometry": geoms[code],
                # Informativo (sin `unitCode`), pero clickeable: lleva al
                # render donde ese amenity efectivamente se ve. Es la única
                # forma de "entrar" a un amenity sin panorámicas.
                "action": {"kind": "goto", "sceneSlug": AMENITY_SCENE[code]},
                "zIndex": 1,
                "label": label,
            }
        )

    # ------------------------------------------------------------ escenas
    scenes = [
        {
            "id": "sc-masterplan",
            "slug": "masterplan",
            "kind": "floorplan",
            "name": "Masterplan",
            "source": {
                "url": "./masterplan.webp",
                "width": masterplan["width"],
                "height": masterplan["height"],
            },
            # Plan §5.1: el masterplan es "render del proyecto" (imagen del
            # proyecto arquitectónico, no una foto).
            "procedencia": {"kind": "render"},
            "sort": 1,
        }
    ]
    for i, (_filename, slug_, title) in enumerate(RENDERS):
        info = media["renders"][slug_]
        scenes.append(
            {
                "id": f"sc-{slug_}",
                "slug": slug_,
                # Ver punto 7 del docstring: un render es una escena
                # `floorplan` sin hotspots, no un tipo de escena nuevo.
                "kind": "floorplan",
                "name": title,
                "source": {
                    "url": f"./media/renders/{slug_}.webp",
                    "width": info["width"],
                    "height": info["height"],
                },
                "procedencia": {"kind": "render"},
                "sort": 10 + i,
            }
        )

    # Escena de video (decisión 15 del docstring): sólo se agrega si el
    # archivo real está en `media/video/` — ver `build_video_scene()`.
    video_scene, video_media_info = build_video_scene(TOUR_DIR)
    if video_scene:
        scenes.append(video_scene)

    tour = {
        "schema": 1,
        "project": "Baleia",
        "version": 1,
        "tenant": "baleia",
        "availabilityUrl": "./availability.json",
        "brochurePages": media["brochure_pages"],
        "start": "masterplan",
        "scenes": scenes,
        "hotspots": hotspots,
        "units": tour_units,
    }

    # Campos OPCIONALES del contrato: sólo se emiten si hay dato real. Un
    # `contact` vacío o un `theme.priceBands` inventado harían que el visor
    # dibuje un CTA que no lleva a nadie o una leyenda de precios que nadie
    # publicó — exactamente lo que este pipeline evita en todo lo demás.
    # El logo del proyecto viaja en el manifiesto (`TourManifest.brandLogo`,
    # campo aditivo) y no como una ruta adivinada por el visor: el `tour.json`
    # de la raíz se sirve un nivel más arriba que sus assets, así que la ruta
    # tiene que pasar por el mismo prefijado que el resto en `publish()`.
    if marca:
        tour["brandLogo"] = f"./marca/{MARCA_FILE}"

    # La foto que ilustra la invitación a entrar al 360 en la ficha de unidad.
    #
    # Se elige a mano y no se saca de la panorámica: una panorámica proyectada
    # sirve para mostrar el lugar, pero la mejor foto del proyecto casi nunca
    # coincide con el punto donde se paró la cámara 360. Ésta es la del living
    # con los ventanales, que muestra las tres cosas que se venden -el espacio,
    # la luz y la vista- en una sola imagen.
    portada_360 = os.path.join(TOUR_DIR, "media", "fotos", PORTADA_360_FILE)
    if os.path.exists(portada_360):
        # Se genera una copia intermedia en vez de usar la foto completa. La
        # tarjeta mide unos 350 px de ancho: servir los 2000 px originales son
        # 240 KB para dibujar 350, y esta ficha se abre desde el teléfono, con
        # datos móviles. La miniatura de 480 px que ya existe se queda corta en
        # pantallas retina, así que 960 px es el punto donde la imagen se ve
        # nítida y pesa una fracción.
        nombre_medio = PORTADA_360_FILE.replace(".webp", ".card.webp")
        destino = os.path.join(TOUR_DIR, "media", "fotos", nombre_medio)
        try:
            from PIL import Image

            with Image.open(portada_360) as im:
                ancho = 960
                alto = round(im.height * ancho / im.width)
                im.resize((ancho, alto), Image.LANCZOS).save(destino, "WEBP", quality=80, method=6)
            tour["portada360"] = f"./media/fotos/{nombre_medio}"
            print(f"  portada del 360: {nombre_medio} ({os.path.getsize(destino)//1024} KB)")
        except Exception as e:  # sin Pillow o foto ilegible: mejor la grande que ninguna
            print(f"  ! no pude generar la portada intermedia ({e}); se usa la foto completa")
            tour["portada360"] = f"./media/fotos/{PORTADA_360_FILE}"
    else:
        print(f"  ! no encuentro {PORTADA_360_FILE}: la ficha cae a la portada generada de la panorámica")

    whatsapp = cli_value(argv, "--whatsapp") or CONTACT_WHATSAPP
    if whatsapp:
        contact: dict = {"whatsapp": whatsapp}
        if CONTACT_NAME:
            contact["name"] = CONTACT_NAME
        if CONTACT_TEMPLATE:
            contact["messageTemplate"] = CONTACT_TEMPLATE
        tour["contact"] = contact
    if PRICE_BANDS:
        tour["theme"] = {"priceBands": PRICE_BANDS}

    # `cotizador` (punto 19 del docstring): condiciones comerciales reales,
    # confirmadas y publicadas (a diferencia de `contact`, no está atado a
    # ninguna confirmación pendiente) — se emite siempre. El shape tiene que
    # calzar EXACTO con `CondicionesVenta` de `packages/core/src/cotizador.ts`.
    tour["cotizador"] = {
        "anticipoPct": ANTICIPO_PCT,
        "tasaAnualPct": TASA_ANUAL_PCT,
        "plazoMeses": PLAZO_MESES,
        "gastosOcupacionPct": GASTOS_OCUPACION_PCT,
        "gastosOcupacionReparto": {
            "posesionPct": GASTOS_OCUPACION_POSESION_PCT,
            "escrituraPct": GASTOS_OCUPACION_ESCRITURA_PCT,
        },
    }

    # `photoTour` (punto 13 del docstring): material narrativo curado, con
    # procedencia y captions textuales del plan de experiencia.
    photo_tour, photo_media_info = build_photo_tour(TOUR_DIR)
    tour["photoTour"] = photo_tour

    # ------------------------------------------------------- availability
    # Ya NO son estados de demostración: Bloque 2 trae estado y precio reales
    # del brochure (set-2026, ver README). `known_status` sólo tiene los
    # códigos con dato real -- no se rellena con round-robin ni nada
    # inventado (eso es justo lo que este cambio reemplaza).
    known_status: dict[str, str] = {
        u["code"]: u["estado_real"] for u in units if u["estado_real"] is not None
    }

    availability_units: dict = {}
    for u in units:
        code = u["code"]
        if code == UNIT_MISSING_FROM_AVAILABILITY:
            continue  # regla dura: unidad ausente (ver punto 6 del docstring)
        if code in known_status:
            # El precio sólo se publica si `mostrar_precio_publico=SI` en el
            # CSV -- nunca se infiere "sí" por default (ver load_units()).
            # `AvailabilityFile.units[].p` es {a, c} (packages/core/src/types.ts),
            # no un número pelado -- sin moneda el visor no sabe cómo formatearlo.
            price = None
            if u["mostrar_precio_publico"] and u["precio_real"] is not None and u["moneda_real"]:
                price = {"a": u["precio_real"], "c": u["moneda_real"]}
            availability_units[code] = {"s": known_status[code], "p": price}
        elif u["block"] in BLOCKS_PROXIMAMENTE:
            # Bloque 3: sin estado/precio real (ver README). "proximamente"
            # es un token real de UNIT_STATUSES desde 0017_unit_status_
            # proximamente.sql (chip de contorno) -- ver el comentario junto
            # a BLOCKS_PROXIMAMENTE.
            availability_units[code] = {"s": PROXIMAMENTE_VALUE, "p": None}
        # Cualquier otro caso (no debería darse hoy) queda afuera: regla dura.

    for code in ["B1", "B2", "B3", "B4", "B5"]:
        if code in BLOCKS_MISSING_FROM_AVAILABILITY:
            continue  # regla dura: bloque ausente (ni "próximamente" dice el brochure de éstos)
        if code in BLOCKS_PROXIMAMENTE:
            availability_units[code] = {"s": PROXIMAMENTE_VALUE, "p": None}
            continue
        agg = aggregate_block_status(block_codes.get(code, []), known_status)
        if agg is not None:
            availability_units[code] = {"s": agg, "p": None}

    availability = {
        "v": 1,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z",
        "units": availability_units,
    }

    os.makedirs(TOUR_DIR, exist_ok=True)
    panoramas = reintegrar_panoramas(tour)
    with open(os.path.join(TOUR_DIR, "tour.json"), "w", encoding="utf-8") as f:
        json.dump(tour, f, indent=2, ensure_ascii=False)
    with open(os.path.join(TOUR_DIR, "availability.json"), "w", encoding="utf-8") as f:
        json.dump(availability, f, indent=2, ensure_ascii=False)

    published = publish(TOUR_DIR) if "--publish" in argv else None

    all_media = (
        list(media["renders"].values())
        + list(media["plantas"].values())
        + list(media["floorplanes"].values())
        + list(media["planos3d"].values())
        + photo_media_info
    )
    peso = {
        "originales_bytes": sum(m["src_bytes"] for m in all_media),
        "webp_bytes": sum(m["bytes"] for m in all_media),
        "miniaturas_bytes": sum(m["thumb_bytes"] for m in all_media),
        "archivos": len(all_media),
    }
    peso["ahorro_pct"] = round(100 * (1 - peso["webp_bytes"] / peso["originales_bytes"]), 1) if peso["originales_bytes"] else 0.0
    peso["total_publicado_bytes"] = peso["webp_bytes"] + peso["miniaturas_bytes"]

    print(
        json.dumps(
            {
                "tour": os.path.join(TOUR_DIR, "tour.json"),
                "panoramas_repuestas": panoramas,
                "availability": os.path.join(TOUR_DIR, "availability.json"),
                "masterplan": masterplan,
                "media": media,
                "marca": marca,
                "peso_imagenes": peso,
                "video": {
                    "publicado": video_scene is not None,
                    "archivos": video_media_info,
                    "bytes_totales": sum(m["bytes"] for m in video_media_info),
                },
                "publicado": published,
                "contact": tour.get("contact", None),
                "cotizador": tour.get("cotizador", None),
                "escenas": len(scenes),
                "unidades_con_planta": sorted(media_by_unit),
                "unidades_sin_planta": sorted(
                    u["code"] for u in units if u["code"] not in media_by_unit
                ),
                "hotspots": len(hotspots),
                "units_in_tour": len(tour_units),
                "units_in_availability": len(availability_units),
                "photo_tour": {
                    "items": len(photo_tour["items"]),
                    "pairs": len(photo_tour["pairs"]),
                    "restringidas_ia": sum(1 for i in photo_tour["items"] if i.get("restricted"))
                    + sum(1 for p in photo_tour["pairs"] for i in (p["before"], p["after"]) if i.get("restricted")),
                },
                "regla_dura": {
                    "bloques_ausentes": BLOCKS_MISSING_FROM_AVAILABILITY,
                    "bloques_proximamente": [BLOCKS_PROXIMAMENTE, PROXIMAMENTE_VALUE],
                    "unidad_ausente": UNIT_MISSING_FROM_AVAILABILITY,
                    "unidades_proximamente": [
                        [u["code"] for u in units if u["block"] in BLOCKS_PROXIMAMENTE and u["code"] != UNIT_MISSING_FROM_AVAILABILITY],
                        PROXIMAMENTE_VALUE,
                    ],
                    "unidades_bloqueadas_pendientes_confirmar": [
                        u["code"] for u in units if u["estado_real"] == "bloqueado"
                    ],
                },
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(build(sys.argv[1:]))
