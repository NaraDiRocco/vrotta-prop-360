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

5. `availability.json` lleva ESTADOS DE DEMOSTRACIÓN sintéticos, no reales:
   el brochure no trae stock (columna `estado` vacía a propósito en el
   CSV, ver README). Se asignan estados variados de forma determinística
   (round-robin sobre UNIT_STATUSES) sólo para poder mostrar el mapa de
   colores funcionando; no representan disponibilidad real. Los precios
   van siempre en `null`: el brochure no los publica.

6. REGLA DURA (un hotspot nunca desaparece por dato ausente/raro):
   demostrada en dos capas:
     - Nivel bloque (visible en el floorplan): B1 queda FUERA de
       `availability.json` (simula un bloque del que no llegó dato) y B4
       recibe un estado inventado "en_promocion" que NO existe en
       UNIT_STATUSES (simula un estado nuevo que el CRM manda y el visor
       no conoce todavía). Ambos deben verse en gris con warning en
       consola, sin desaparecer.
     - Nivel unidad (dato comercial, no clickeable individualmente en este
       masterplan): la última unidad de Bloque 3 (B3-K) queda fuera de
       `availability.json`, y B3-J recibe el estado inventado "en_pausa".

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

11. CONTACTO Y TRAMOS DE PRECIO SON OPCIONALES Y NO SE INVENTAN.
   `TourManifest` tiene desde ahora dos campos opcionales y aditivos:
   `contact` (habilita el CTA de WhatsApp con mensaje prellenado y deep link
   a la unidad) y `theme.priceBands` (tramos fijos de la capa de precio).
   Baleia no tiene teléfono publicado ni precios, así que este script NO los
   emite: sin `contact` el visor no dibuja el botón, y sin `priceBands` los
   deriva por cuantiles de lo que haya. Cuando el cliente dé el número:
   `python3 scripts/build_tour.py --publish --whatsapp +59891234567`.

10. QUÉ UNIDAD LE CORRESPONDE A CADA PLANTA: ver `UNIT_MEDIA`. El mapeo se
   verificó una por una contra el brochure (`pdftotext` de las páginas 13-19
   y 26-29) y mirando cada PNG. Las unidades para las que el material NO
   trae imagen quedan sin `media` — no se les asigna la de otra unidad
   "parecida" aunque las superficies coincidan.
"""
from __future__ import annotations

import csv
import json
import os
import re
import shutil
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
# Destino de `--publish`: lo que sirve `apps/viewer` en dev (vite sirve
# `public/` en la raíz). Está en .gitignore, igual que `out/`.
PUBLISH_DIR = os.path.join(REPO_DIR, "apps", "viewer", "public", "baleia")
PUBLISH_ROOT_TOUR = os.path.join(REPO_DIR, "apps", "viewer", "public", "tour.json")

# Mismo contrato que packages/core/src/status.ts::UNIT_STATUSES (orden =
# STATUS_TOKENS[...].order, del más vendible al menos).
UNIT_STATUSES = ["disponible", "reservado", "vendido", "bloqueado", "no_disponible"]
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
# unidad. Baleia NO tiene un número de contacto publicado, así que acá va en
# None y el visor simplemente no dibuja el botón — nunca un botón roto, y
# nunca un teléfono inventado en un artefacto que se publica.
#
# Para cargarlo cuando el cliente lo dé:  build_tour.py --whatsapp +59891234567
CONTACT_WHATSAPP: str | None = None
CONTACT_NAME: str | None = None
# Plantilla opcional del mensaje. None = el visor usa la suya
# (ver apps/viewer/src/contact.ts::buildCtaMessage).
CONTACT_TEMPLATE: str | None = None

# `theme.priceBands` (también aditivo y opcional): tramos FIJOS de la capa de
# precio. Sin esto el visor los deriva por cuantiles de los precios presentes
# en availability.json. Baleia no publica precios, así que no hay tramos que
# fijar: queda en None y no se emite `theme`.
PRICE_BANDS: list[dict] | None = None

# Casos de la "regla dura" (ver punto 6 del docstring).
BLOCK_MISSING_FROM_AVAILABILITY = "B1"
BLOCK_UNKNOWN_STATUS = "B4"
UNIT_MISSING_FROM_AVAILABILITY = "B3-K"
UNIT_UNKNOWN_STATUS = "B3-J"
UNKNOWN_STATUS_VALUE = "en_promocion"
UNKNOWN_STATUS_VALUE_UNIT = "en_pausa"


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
    with open(csv_path, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    units = []
    for r in rows:
        code = r["codigo_unidad"].strip()
        block = block_code_from_bloque_o_piso(r["bloque_o_piso"])
        units.append(
            {
                "code": code,
                "block": block,
                "tipologia": r["tipologia"].strip(),
                "superficie_cubierta_m2": float(r["superficie_cubierta_m2"]),
                "superficie_total_m2": float(r["superficie_total_m2"]),
                "notas_internas": r["notas_internas"].strip(),
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
    return {"renders": renders, "plantas": plantas}


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
    for u in tour["units"].values():
        if u.get("media"):
            u["media"] = [m.replace("./", "./baleia/", 1) for m in u["media"]]
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
                "sort": 10 + i,
            }
        )

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

    # ------------------------------------------------------- availability
    demo_status: dict[str, str] = {}
    for i, u in enumerate(units):
        if u["code"] == UNIT_MISSING_FROM_AVAILABILITY:
            continue  # regla dura: unidad ausente (ver punto 6)
        if u["code"] == UNIT_UNKNOWN_STATUS:
            continue  # se agrega abajo con un estado inválido a propósito
        demo_status[u["code"]] = UNIT_STATUSES[i % len(UNIT_STATUSES)]

    availability_units: dict = {}
    for code, status in demo_status.items():
        availability_units[code] = {"s": status, "p": None}
    availability_units[UNIT_UNKNOWN_STATUS] = {"s": UNKNOWN_STATUS_VALUE_UNIT, "p": None}
    # UNIT_MISSING_FROM_AVAILABILITY (B3-K) queda deliberadamente fuera.

    for code in ["B2", "B3"]:
        agg = aggregate_block_status(block_codes.get(code, []), demo_status)
        if agg is not None:
            availability_units[code] = {"s": agg, "p": None}
    availability_units[BLOCK_UNKNOWN_STATUS] = {"s": UNKNOWN_STATUS_VALUE, "p": None}
    availability_units["B5"] = {"s": "reservado", "p": None}
    # BLOCK_MISSING_FROM_AVAILABILITY (B1) queda deliberadamente fuera.

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

    all_media = list(media["renders"].values()) + list(media["plantas"].values())
    peso = {
        "originales_bytes": sum(m["src_bytes"] for m in all_media),
        "webp_bytes": sum(m["bytes"] for m in all_media),
        "miniaturas_bytes": sum(m["thumb_bytes"] for m in all_media),
        "archivos": len(all_media),
    }
    peso["ahorro_pct"] = round(100 * (1 - peso["webp_bytes"] / peso["originales_bytes"]), 1)

    print(
        json.dumps(
            {
                "tour": os.path.join(TOUR_DIR, "tour.json"),
                "availability": os.path.join(TOUR_DIR, "availability.json"),
                "masterplan": masterplan,
                "media": media,
                "peso_imagenes": peso,
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
                "regla_dura": {
                    "bloque_ausente": BLOCK_MISSING_FROM_AVAILABILITY,
                    "bloque_estado_desconocido": [BLOCK_UNKNOWN_STATUS, UNKNOWN_STATUS_VALUE],
                    "unidad_ausente": UNIT_MISSING_FROM_AVAILABILITY,
                    "unidad_estado_desconocido": [UNIT_UNKNOWN_STATUS, UNKNOWN_STATUS_VALUE_UNIT],
                },
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(build(sys.argv[1:]))
