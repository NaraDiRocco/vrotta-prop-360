"""Genera el recorrido publicable de Baleia (tour.json + availability.json +
la imagen de la escena floorplan) a partir de los dos artefactos ya
verificados en out/: `baleia_hotspots.geojson` (geometría) y
`baleia_unidades.csv` (datos comerciales de Bloque 2 y 3).

Nada de esto se escribe a mano: correr este script siempre reproduce el
mismo `tour.json`/`availability.json` (salvo `generated_at`, que es la hora
de corrida) desde las dos fuentes de datos versionadas.

Salida: out/tour/
  tour.json          — TourManifest (packages/core/src/types.ts)
  availability.json  — AvailabilityFile (idem)
  masterplan.webp     — imagen de la escena floorplan

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
   `resolveStatus(null, ...)` cae directo a FALLBACK_STATUS sin loguear
   warning (motivo 'sin-codigo', ver polygons.ts) — es el camino ya
   pensado en el visor para "esto no es una unidad en venta". Efecto
   secundario documentado: como `floorplan.ts` no distingue "informativo"
   de "unidad sin dato", el amenity se pinta con el gris de
   `no_disponible` y el tooltip agrega "(sin dato)". Es ruido cosmético,
   no funcional — corregirlo bien pide un campo nuevo en `Hotspot` (por
   ejemplo `informational?: boolean`), que es un cambio de
   `packages/core`, fuera de las carpetas de este encargo
   (`apps/viewer/**`, `tools/baleia/**`).

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
"""
from __future__ import annotations

import csv
import json
import os
import re
import sys
from datetime import datetime, timezone

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "..", "out")
GEOJSON_PATH = os.path.join(OUT_DIR, "baleia_hotspots.geojson")
CSV_PATH = os.path.join(OUT_DIR, "baleia_unidades.csv")
MASTERPLAN_SRC = os.path.join(OUT_DIR, "masterplan", "baleia_masterplan_300dpi_recortado.png")
TOUR_DIR = os.path.join(OUT_DIR, "tour")

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

# Casos de la "regla dura" (ver punto 6 del docstring).
BLOCK_MISSING_FROM_AVAILABILITY = "B1"
BLOCK_UNKNOWN_STATUS = "B4"
UNIT_MISSING_FROM_AVAILABILITY = "B3-K"
UNIT_UNKNOWN_STATUS = "B3-J"
UNKNOWN_STATUS_VALUE = "en_promocion"
UNKNOWN_STATUS_VALUE_UNIT = "en_pausa"


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
    simple y liviana que meter una pirámide DZI sin consumidor en el visor."""
    img = Image.open(MASTERPLAN_SRC).convert("RGB")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "masterplan.webp")
    img.save(out_path, format="WEBP", quality=85, method=6)
    return {"path": out_path, "width": img.width, "height": img.height, "bytes": os.path.getsize(out_path)}


def build(argv: list[str] | None = None) -> int:
    units = load_units(CSV_PATH)
    geoms = load_hotspot_geoms(GEOJSON_PATH)
    masterplan = convert_masterplan(TOUR_DIR)

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
                # Informativo: sin `action` (ver nota en TERRENO más arriba).
                "zIndex": 1,
                "label": label,
            }
        )

    tour = {
        "schema": 1,
        "project": "Baleia",
        "version": 1,
        "tenant": "baleia",
        "availabilityUrl": "./availability.json",
        "start": "masterplan",
        "scenes": [
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
        ],
        "hotspots": hotspots,
        "units": tour_units,
    }

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

    print(
        json.dumps(
            {
                "tour": os.path.join(TOUR_DIR, "tour.json"),
                "availability": os.path.join(TOUR_DIR, "availability.json"),
                "masterplan": masterplan,
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
