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

Con `--publish` además copia todo a `apps/viewer/public/baleia/` y deja el
manifiesto con las URLs prefijadas en `apps/viewer/public/tour.json`, que es
lo que abre el visor en dev sin ningún parámetro.

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
   `capturado_en` (agregada el 06/09/2026 justamente para esto). Las dos
   recreaciones amuebladas/paisajismo con IA son `ia` y viajan con
   `restricted: true`: el plan (§3.1) prohíbe usarlas como portada o
   miniatura fuera de su slider.

13. `TourManifest.photoTour` (nuevo, opcional): el material narrativo del
   plan de experiencia — las fotos reales del Tramo 1 y el paseo de 11
   fotos del Tramo 2 Mitad B, con caption y `ambiente` TEXTUALES tomados
   de `docs/06-BENCHMARK/5-EXPERIENCIA-BALEIA.md` §1 (se copian literales,
   no se resumen), más los dos deslizadores antes/después que describe el
   mismo documento. Aditivo: no reemplaza escenas ni hotspots.

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
"""
from __future__ import annotations

import csv
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
# Planos acotados reales por unidad (INVENTARIO.md §2) y las dos recreaciones
# con IA que arman los dos deslizadores antes/después del plan de experiencia.
UNIT_FLOORPLANS_DIR = os.path.join(MATERIAL_DIR, "planos", "unidad")
AMUEBLADO_DIR = os.path.join(MATERIAL_DIR, "generado-ia", "amueblado-virtual")
PAISAJISMO_DIR = os.path.join(MATERIAL_DIR, "generado-ia", "paisajismo")
# Video real del recorrido (decisión 15 del docstring), ya comprimido +faststart
# en dos resoluciones. Vive fuera de `material/` porque no es una foto curada
# ni un render: es el único video real que hoy entra al manifiesto. Ver
# tools/baleia/media/README.md para el detalle de cada archivo.
VIDEO_DIR = os.path.join(BALEIA_DIR, "media", "video")
VIDEO_REAL_FILE = "baleia-recorrido-real.mp4"
VIDEO_REAL_MOBILE_FILE = "baleia-recorrido-real.720.mp4"
VIDEO_REAL_POSTER_FILE = "baleia-recorrido-real.poster.jpg"
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
    "01_aerea_contexto_costa_lejos": "El terreno, entre el bosque y la Ruta 10. Foto real, 2 sep 2026.",
    # Caption de la bienvenida (§2) y apertura del Tramo 2 Mitad A (§1): la
    # misma foto cumple los dos roles con el mismo texto.
    "02_aerea_bloque2_oblicua_cercana": "Bloque 2. Tres niveles, nueve unidades. Foto real.",
}

# Tramo 2, Mitad B (§1): el paseo de 11 fotos con orden de casa. Rótulo de
# ambiente + caption, tal como están escritos uno por uno en la tabla del
# plan — se usan textuales a propósito, están pensadas.
UNIT_WALK = [
    ("16_living_comedor_amplio", "Living", "Living-comedor de un dúplex. Piso de madera, ventanales corredizos a la terraza."),
    ("14_living_ventanales_vista_verde", "Living", "Los ventanales dan al este: la vista, no el estacionamiento."),
    ("17_cocina_equipada_completa", "Cocina", "Cocina entregada así: mesada de cuarzo negro, horno y anafe instalados."),
    ("18_cocina_vista_horizonte_mar", "Cocina", "Desde la cocina, el horizonte."),
    ("21_escalera_interna_duplex", "Escalera", "La escalera del dúplex: dos plantas."),
    ("20_dormitorio_placard_vacio", "Dormitorio", "Dormitorio con placard instalado. Sin amueblar: así se entrega."),
    ("19_bano_completo_ducha", "Baño", "Baño completo, mampara de vidrio, sanitarios colocados."),
    ("12_terraza_pergolotecho_parrillero", "Terraza", "Terraza con parrillero de obra."),
    ("22_parrillero_empotrado_detalle", "Terraza", "El parrillero, de cerca."),
    ("13_terraza_sillon_vista_verde", "Terraza", "Y la terraza mira al verde."),
    ("11_vista_terraza_peninsula_skyline", "La vista", "Desde esta terraza: Punta del Este sobre el mar. Sin retoque."),
]

# Los dos deslizadores antes/después del plan (§1 Tramo 2 Mitad A, mecánica
# en §3.1). `before` es la foto real curada (`material-real/web`); `after`
# es la recreación con IA (`material/generado-ia/...`), SIEMPRE `restricted`.
BEFORE_AFTER_PAIRS = [
    {
        "id": "slider-paisajismo",
        "label": "Con el paisajismo terminado",
        "before_photo": "24_fachada_bloque2_atardecer_angulo",
        "after_dir": PAISAJISMO_DIR,
        "after_file": "DSC05104-paisajismo-baleia.webp",
    },
    {
        "id": "slider-terrazas",
        "label": "Con las terrazas amuebladas",
        "before_photo": "06_aerea_balcones_detalle",
        "after_dir": AMUEBLADO_DIR,
        # La variante "-terrazas-pasto-techo-final" (techo verde) NO se usa:
        # requiere confirmar con el cliente que el techo verde está en el
        # proyecto para B2 (plan §1, nota bajo el slider #2). Sin
        # confirmación, sólo la variante de mobiliario.
        "after_file": "DJI_20260902160101_0060_D_LEO-terrazas-equipadas.webp",
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

    return {"renders": renders, "plantas": plantas, "floorplanes": floorplanes}


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


def _ia_pair_item(tour_dir: str, src_dir: str, filename: str, based_on: str) -> tuple[dict, dict]:
    """Igual que `_photo_item`, pero para una recreación con IA
    (`generado-ia/...`): siempre `restricted: true` y `procedencia.kind='ia'`
    con `basedOn` apuntando a la foto real de la que sale (plan §3.1: la
    imagen de IA no existe fuera del slider)."""
    name = filename.rsplit(".", 1)[0]
    src_full = os.path.join(src_dir, filename)
    dst_full = os.path.join(tour_dir, "media", "ia", filename)
    info = copy_optimized(src_full, dst_full)
    item = {
        "id": name,
        "url": f"./media/ia/{filename}",
        "thumbUrl": f"./media/ia/{name}.thumb.webp",
        "width": info["width"],
        "height": info["height"],
        "procedencia": {"kind": "ia", "basedOn": based_on},
        "restricted": True,
    }
    return item, info


def build_photo_tour(tour_dir: str) -> tuple[dict, list[dict]]:
    """`TourManifest.photoTour` (punto 13 del docstring): las fotos reales
    curadas, en el orden con sentido del plan de experiencia, más los dos
    deslizadores antes/después. Devuelve `(photoTour, media_info)` — lo
    segundo sólo para el reporte de peso publicado."""
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

    # Tramo 1 (§1): las fotos con caption propia del plan.
    add_photo("01_aerea_contexto_costa_lejos", caption=PHOTO_CAPTIONS["01_aerea_contexto_costa_lejos"])
    add_photo("04_aerea_skyline_punta_del_este")

    # Tramo 2, Mitad A (§1): apertura + serie de fachada (swipe horizontal).
    add_photo("02_aerea_bloque2_oblicua_cercana", caption=PHOTO_CAPTIONS["02_aerea_bloque2_oblicua_cercana"])
    for name in ("07_fachada_bloque2_dia_completa", "08_fachada_bloque2_angulo", "09_fachada_bloque2_vertical", "24_fachada_bloque2_atardecer_angulo"):
        add_photo(name)

    # Tramo 2, Mitad B (§1): el paseo de 11 fotos, con caption y ambiente
    # TEXTUALES (ver UNIT_WALK más arriba — se usan tal como están escritos).
    for name, ambiente, caption in UNIT_WALK:
        add_photo(name, caption=caption, ambiente=ambiente)

    # Deslizadores antes/después (§1, mecánica en §3.1).
    pairs = []
    for spec in BEFORE_AFTER_PAIRS:
        add_photo(spec["before_photo"])
        before_item = next(i for i in items if i["id"] == spec["before_photo"])
        after_item, after_info = _ia_pair_item(tour_dir, spec["after_dir"], spec["after_file"], based_on=spec["before_photo"])
        media_info.append(after_info)
        pairs.append({"id": spec["id"], "label": spec["label"], "before": before_item, "after": after_item})

    return {"items": items, "pairs": pairs}, media_info


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
    tour["availabilityUrl"] = "./baleia/availability.json"
    for sc in tour["scenes"]:
        sc["source"]["url"] = sc["source"]["url"].replace("./", "./baleia/", 1)
        # Campos aditivos de la escena de video (decisión 15): mismo prefijo.
        if sc.get("mobileUrl"):
            sc["mobileUrl"] = sc["mobileUrl"].replace("./", "./baleia/", 1)
        if sc.get("poster"):
            sc["poster"]["url"] = sc["poster"]["url"].replace("./", "./baleia/", 1)
    for u in tour["units"].values():
        if u.get("media"):
            u["media"] = [m.replace("./", "./baleia/", 1) for m in u["media"]]

    def rewrite_photo_item(item: dict) -> None:
        item["url"] = item["url"].replace("./", "./baleia/", 1)
        item["thumbUrl"] = item["thumbUrl"].replace("./", "./baleia/", 1)

    if tour.get("photoTour"):
        for item in tour["photoTour"]["items"]:
            rewrite_photo_item(item)
        for pair in tour["photoTour"].get("pairs", []):
            rewrite_photo_item(pair["before"])
            rewrite_photo_item(pair["after"])

    with open(PUBLISH_ROOT_TOUR, "w", encoding="utf-8") as f:
        json.dump(tour, f, indent=2, ensure_ascii=False)
    return {"dir": PUBLISH_DIR, "root_tour": PUBLISH_ROOT_TOUR}


def build(argv: list[str] | None = None) -> int:
    argv = argv or []
    units = load_units(CSV_PATH)
    geoms = load_hotspot_geoms(GEOJSON_PATH)
    masterplan = convert_masterplan(TOUR_DIR)
    media = build_media(TOUR_DIR)
    media_by_unit: dict[str, list[str]] = {}
    for name, info in media["plantas"].items():
        for code in info["units"]:
            media_by_unit.setdefault(code, []).append(f"./media/plantas/{name}.webp")
    # Planos acotados reales (punto 14 del docstring): se agregan DESPUÉS de
    # la axonometría IA en el mismo array, nunca la reemplazan.
    for name, info in media["floorplanes"].items():
        for code in info["units"]:
            media_by_unit.setdefault(code, []).append(f"./media/planos/{name}.webp")

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
        "start": "masterplan",
        "scenes": scenes,
        "hotspots": hotspots,
        "units": tour_units,
    }

    # Campos OPCIONALES del contrato: sólo se emiten si hay dato real. Un
    # `contact` vacío o un `theme.priceBands` inventado harían que el visor
    # dibuje un CTA que no lleva a nadie o una leyenda de precios que nadie
    # publicó — exactamente lo que este pipeline evita en todo lo demás.
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
    with open(os.path.join(TOUR_DIR, "tour.json"), "w", encoding="utf-8") as f:
        json.dump(tour, f, indent=2, ensure_ascii=False)
    with open(os.path.join(TOUR_DIR, "availability.json"), "w", encoding="utf-8") as f:
        json.dump(availability, f, indent=2, ensure_ascii=False)

    published = publish(TOUR_DIR) if "--publish" in argv else None

    all_media = (
        list(media["renders"].values())
        + list(media["plantas"].values())
        + list(media["floorplanes"].values())
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
                "availability": os.path.join(TOUR_DIR, "availability.json"),
                "masterplan": masterplan,
                "media": media,
                "peso_imagenes": peso,
                "video": {
                    "publicado": video_scene is not None,
                    "archivos": video_media_info,
                    "bytes_totales": sum(m["bytes"] for m in video_media_info),
                },
                "publicado": published,
                "contact": tour.get("contact", None),
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
