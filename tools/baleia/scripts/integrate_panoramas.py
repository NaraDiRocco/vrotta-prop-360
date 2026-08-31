"""Recibe una carpeta de panorámicas entregadas para Baleia, las valida con
`packages/pipeline`, genera los tiles de cubemap y las integra al `tour.json`
que ya produjo `build_tour.py` — como escenas nuevas y, cuando corresponde,
enlazadas desde el hotspot del masterplan que les toca.

    # 1) el recorrido base (masterplan + renders + unidades)
    python3 scripts/build_tour.py

    # 2) las panorámicas que llegaron encima
    ../../packages/pipeline/.venv/bin/python scripts/integrate_panoramas.py \
        --in ~/Downloads/baleia-360 --publish

Corre con el intérprete de `packages/pipeline/.venv` (necesita
`py360convert`, `numpy` y `Pillow`, que el venv de `tools/baleia` no tiene).

------------------------------------------------------------------------
DECISIONES
------------------------------------------------------------------------

1. NO SE LLAMA A `pano_pipeline.run.run_pipeline`, SE LLAMAN SUS TRES PASOS.
   `run_pipeline` deja todo en `t/{tenant}/{proyecto}/v{N}/scenes/{slug}/` y
   escribe en `tiles.json` un `base` ABSOLUTO (`/t/...`). El visor resuelve
   `TiledSource.base` con `new URL(base, urlDelTourJson)`
   (`apps/viewer/src/main.ts::resolveManifestUrls`): un base absoluto se
   resuelve contra la raíz del sitio y rompe apenas el recorrido vive en un
   subdirectorio (`/baleia/`, un embed, un preview del panel) — que es
   exactamente cómo se publica Baleia hoy. Así que se usan las mismas tres
   funciones que usa `run_pipeline` (`validate_panorama`, `generate_tiles`,
   `generate_previews`), con la salida en `out/tour/scenes/{slug}/` y
   `base = "./scenes/{slug}/tiles"`, RELATIVO al `tour.json` igual que el
   resto de las URLs del manifiesto. Se escriben igual `validation.json` y
   `manifest.json` por escena, para no perder la trazabilidad que deja
   `run_pipeline`.

2. `--min-width` ARRANCA EN 8192, NO EN 4096. El default del pipeline (4096)
   es el piso técnico del tiler; el piso CONTRACTUAL que le pedimos al
   renderista de Baleia es 8192×4096 (ver
   `docs/07-BALEIA-360/4-Especificacion-Tecnica-Baleia.md`). Si entra algo
   por debajo, este script lo rechaza y NO genera tiles: es material que hay
   que devolver, no arreglar de nuestro lado. `--min-width` se puede bajar a
   mano para una prueba, y `--skip-validation` procesa igual dejando el
   veredicto escrito en `validation.json`.

3. EL HORIZONTE TORCIDO ADVIERTE, NO RECHAZA. `check_crooked_horizon` es una
   heurística declarada como tal en el pipeline (busca el borde de mayor
   contraste de la banda central y asume que es el horizonte). En un
   panorama de render de un complejo con bloques largos y horizontales, ese
   borde puede ser perfectamente el alero de una losa y no el mar. Rechazar
   una entrega buena por una heurística es peor que dejar pasar una torcida
   que se ve a simple vista en el poster. Se reporta siempre y se puede
   endurecer con `--strict-horizon`.

4. LOS BLOQUES NO SE RE-ENLAZAN POR DEFECTO. Los hotspots `h-B1..h-B5` del
   masterplan hoy son `action: {kind:'unit'}`: abren la ficha comercial del
   bloque (superficies, unidades que contiene, estado). Cambiarlos a
   `{kind:'goto'}` para que salten a la panorámica del bloque CANJEA la
   ficha por la vista — se gana el 360 y se pierde el dato comercial, que es
   lo que convierte. La respuesta correcta es un botón "Ver en 360°" dentro
   de la ficha, que es un cambio del visor y no de este script (ver
   `docs/07-BALEIA-360/6-Que-Cambia-en-la-Experiencia.md`). Mientras tanto
   la panorámica del bloque se llega desde la galería/tira de vistas, y
   `--relink-blocks` está disponible para el caso en que el cliente prefiera
   explícitamente el salto directo.

5. LOS AMENITIES SÍ SE RE-ENLAZAN. `h-A/D/E/F/G` hoy apuntan por `goto` al
   RENDER donde ese amenity se ve (decisión 3 de `build_tour.py`: sin
   panorámicas, un render es lo más parecido a "entrar"). Cuando llega la
   panorámica del mismo punto, apuntar el hotspot a la panorámica es
   estrictamente mejor y no pierde nada: el render sigue en la galería.

6. UN ARCHIVO CON NOMBRE DESCONOCIDO NO SE DESCARTA. Se integra igual como
   escena, con slug y título derivados del nombre, sin enlazar a ningún
   hotspot, y se lista en el reporte bajo `desconocidas`. Misma regla dura
   que el resto del repo: nada desaparece en silencio por un dato raro.

7. `initialView.yaw` VIENE DE LA ESPECIFICACIÓN, NO DE LA IMAGEN. La spec de
   Baleia fija que el CENTRO HORIZONTAL del equirectangular (yaw 0) mira al
   mar/este en toda toma que tenga vista. Por eso casi todos los puntos
   arrancan en yaw 0. Los que no (el acceso mira tierra adentro, la laguna
   mira de vuelta al complejo) llevan el desvío escrito acá. Los valores van
   en RADIANES porque `initialView.yaw/pitch` se pasan tal cual a
   `viewer.rotate()` de photo-sphere-viewer; `fov` va en GRADOS porque el
   visor lo convierte con `fovToZoom(fovDeg)` (`apps/viewer/src/scenes.ts`).

8. SE EMITE `poster.thumb.webp` AUNQUE HOY NADIE LO USE. La galería del visor
   deriva la miniatura de `source.url` (`apps/viewer/src/ui.ts::renderGallery`),
   y una escena de tiles no tiene `url`: hoy las panorámicas entran a la
   galería con la miniatura vacía. Es un bug conocido del visor, no de este
   script (está documentado en el doc 6 como lo primero a construir). Dejar
   el archivo con la convención de nombre que el visor ya usa (`X.webp` →
   `X.thumb.webp`) hace que arreglarlo sea una línea, no una entrega nueva.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
from datetime import datetime, timezone

# `packages/pipeline` se importa desde el repo, no desde site-packages, para
# que este script siga la versión del pipeline que está en el árbol.
HERE = os.path.dirname(os.path.abspath(__file__))
BALEIA_DIR = os.path.normpath(os.path.join(HERE, ".."))
REPO_DIR = os.path.normpath(os.path.join(BALEIA_DIR, "..", ".."))
sys.path.insert(0, os.path.join(REPO_DIR, "packages", "pipeline"))

from PIL import Image  # noqa: E402

from pano_pipeline.preview import generate_previews  # noqa: E402
from pano_pipeline.tiles import generate_tiles  # noqa: E402
from pano_pipeline.validate import validate_panorama  # noqa: E402

TOUR_DIR = os.path.join(BALEIA_DIR, "out", "tour")
TOUR_JSON = os.path.join(TOUR_DIR, "tour.json")
SCENES_DIR = os.path.join(TOUR_DIR, "scenes")
PUBLISH_DIR = os.path.join(REPO_DIR, "apps", "viewer", "public", "baleia")
PUBLISH_ROOT_TOUR = os.path.join(REPO_DIR, "apps", "viewer", "public", "tour.json")

# Piso contractual de la entrega (ver decisión 2 y la spec del doc 4).
DEFAULT_MIN_WIDTH = 8192
# Las panorámicas van después de los 7 renders (`sort` 10..16 en build_tour.py)
# para que la tira de vistas las muestre agrupadas y en el orden del recorrido.
SORT_BASE = 100

DEG = 3.141592653589793 / 180.0

# --------------------------------------------------------------- puntos
# La lista de tomas de `docs/07-BALEIA-360/1-Lista-de-Tomas.md`, en código.
# Clave = `{PUNTO}_{TIPO}` del nombre de archivo (sin el `_NN` final ni la
# extensión), en mayúsculas.
#
#   slug      — slug de la escena en el tour (prefijo `p-` = panorámica, para
#               distinguirla de un vistazo de las escenas `floorplan`).
#   name      — título visible en la galería y en la barra superior.
#   hotspots  — hotspots del masterplan que pasan a apuntar acá.
#   claims    — hotspots que toma SÓLO si ninguna otra panorámica los reclamó
#               (la piscina cubre también la piscina infantil mientras no
#               llegue una toma dedicada de E).
#   yaw       — orientación inicial, en radianes; 0 = el centro de la imagen,
#               que por spec mira al mar.
#   fov       — campo visual inicial en grados.
#   sort      — orden dentro de la tira de vistas.
POINTS: dict[str, dict] = {
    # -- conjunto y contexto
    "MASTERPLAN_AEREA": dict(
        slug="p-aerea-conjunto", name="Vista aérea del conjunto",
        hotspots=[], claims=[], yaw=0.0, fov=100, sort=0,
    ),
    "MASTERPLAN_AEREA-BAJA": dict(
        slug="p-aerea-baja", name="El conjunto escalonado desde 35 m",
        hotspots=[], claims=[], yaw=0.0, fov=100, sort=1,
    ),
    "ACCESO_EXTERIOR": dict(
        slug="p-acceso", name="Acceso al complejo",
        # El acceso está en el extremo alto (oeste): la toma interesante mira
        # tierra adentro / hacia el complejo, no al mar. 180° de desvío.
        hotspots=["h-A"], claims=[], yaw=180 * DEG, fov=90, sort=2,
    ),
    "CIRCULACION_EXTERIOR": dict(
        slug="p-circulacion", name="Circulación entre bloques",
        hotspots=[], claims=[], yaw=0.0, fov=90, sort=3,
    ),
    # -- un exterior por bloque
    "B1_EXTERIOR": dict(slug="p-b1", name="Bloque 1 — el punto más alto",
                        hotspots=[], claims=[], yaw=0.0, fov=90, sort=10),
    "B2_EXTERIOR": dict(slug="p-b2", name="Bloque 2 desde el parque",
                        hotspots=[], claims=[], yaw=0.0, fov=90, sort=11),
    "B3_EXTERIOR": dict(slug="p-b3", name="Bloque 3 desde el parque",
                        hotspots=[], claims=[], yaw=0.0, fov=90, sort=12),
    "B4_EXTERIOR": dict(slug="p-b4", name="Bloque 4 desde el parque",
                        hotspots=[], claims=[], yaw=0.0, fov=90, sort=13),
    "B5_EXTERIOR": dict(slug="p-b5", name="Bloque 5 — el más cerca del mar",
                        hotspots=[], claims=[], yaw=0.0, fov=90, sort=14),
    # -- amenities
    "D_AMENITY": dict(
        slug="p-piscina", name="Piscina",
        # Mientras no llegue una toma dedicada de la piscina infantil (E),
        # este punto la cubre: están una al lado de la otra y entran las dos
        # en cuadro (ver el render `back-amenities-v2`).
        hotspots=["h-D"], claims=["h-E"], yaw=0.0, fov=90, sort=20,
    ),
    "E_AMENITY": dict(slug="p-piscina-infantil", name="Piscina infantil",
                      hotspots=["h-E"], claims=[], yaw=0.0, fov=90, sort=21),
    "F_AMENITY": dict(slug="p-rincon-fuego", name="Rincón de fuego",
                      hotspots=["h-F"], claims=[], yaw=0.0, fov=90, sort=22),
    "G_AMENITY": dict(
        slug="p-laguna", name="Laguna",
        # La toma de la laguna mira de vuelta al complejo (oeste): es el
        # encuadre del render `complejo1-v2`, que ya probó que lee bien.
        hotspots=["h-G"], claims=[], yaw=180 * DEG, fov=90, sort=23,
    ),
    # -- interiores de la unidad tipo dúplex (Bloque 2, unidad A)
    "B2-A_TERRAZA": dict(slug="p-b2a-terraza", name="Dúplex — terraza y vista",
                         hotspots=[], claims=[], yaw=0.0, fov=90, sort=30),
    "B2-A_INT-LIVING": dict(slug="p-b2a-living", name="Dúplex — living/comedor",
                            hotspots=[], claims=[], yaw=0.0, fov=85, sort=31),
    "B2-A_INT-DORM": dict(slug="p-b2a-dorm", name="Dúplex — dormitorio principal",
                          hotspots=[], claims=[], yaw=0.0, fov=85, sort=32),
    "B2-A_INT-COCINA": dict(slug="p-b2a-cocina", name="Dúplex — cocina",
                            hotspots=[], claims=[], yaw=0.0, fov=85, sort=33),
    # -- interiores de la unidad tipo 1 dormitorio (Bloque 3, unidad D)
    "B3-D_TERRAZA": dict(slug="p-b3d-terraza", name="1 dormitorio — terraza y vista",
                         hotspots=[], claims=[], yaw=0.0, fov=90, sort=40),
    "B3-D_INT-LIVING": dict(slug="p-b3d-living", name="1 dormitorio — living/comedor",
                            hotspots=[], claims=[], yaw=0.0, fov=85, sort=41),
    "B3-D_INT-DORM": dict(slug="p-b3d-dorm", name="1 dormitorio — dormitorio",
                          hotspots=[], claims=[], yaw=0.0, fov=85, sort=42),
    "B3-D_INT-COCINA": dict(slug="p-b3d-cocina", name="1 dormitorio — cocina",
                            hotspots=[], claims=[], yaw=0.0, fov=85, sort=43),
}

# Hotspots de bloque: sólo se re-enlazan con `--relink-blocks` (decisión 4).
BLOCK_POINT_TO_HOTSPOT = {
    "B1_EXTERIOR": "h-B1", "B2_EXTERIOR": "h-B2", "B3_EXTERIOR": "h-B3",
    "B4_EXTERIOR": "h-B4", "B5_EXTERIOR": "h-B5",
}

VALID_EXT = {".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".exr"}
NAME_RE = re.compile(r"^(?P<key>.+?)_(?P<n>\d+)$")


def parse_filename(path: str) -> tuple[str, str | None]:
    """Devuelve `(key, numero)` a partir del nombre `{PUNTO}_{TIPO}_{NN}.ext`.

    El número de toma es opcional: si el renderista entrega `B1_EXTERIOR.png`
    sin `_01`, se toma igual (la clave es lo que importa para el mapeo).
    """
    stem = os.path.splitext(os.path.basename(path))[0].upper()
    m = NAME_RE.match(stem)
    if m:
        return m.group("key"), m.group("n")
    return stem, None


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s or "escena"


def integrate_one(
    src: str,
    key: str,
    point: dict,
    min_width: int,
    strict_horizon: bool,
    skip_validation: bool,
    tile_size: int,
    face_size: int | None,
    fmt: str,
) -> dict:
    """Valida + tilea + previsualiza una panorámica. Devuelve el reporte."""
    slug = point["slug"]
    scene_dir = os.path.join(SCENES_DIR, slug)
    os.makedirs(scene_dir, exist_ok=True)

    validation = validate_panorama(src, min_width=min_width, strict_horizon=strict_horizon)
    with open(os.path.join(scene_dir, "validation.json"), "w", encoding="utf-8") as f:
        json.dump(validation, f, indent=2, ensure_ascii=False)

    if not validation["approved"] and not skip_validation:
        fallos = [c["name"] for c in validation["checks"] if not c["passed"]]
        return {
            "archivo": os.path.basename(src), "clave": key, "slug": slug,
            "ok": False, "motivo": "validación rechazada", "checks_fallados": fallos,
            "validation": os.path.join(scene_dir, "validation.json"),
        }

    tiles = generate_tiles(
        src,
        os.path.join(scene_dir, "tiles"),
        face_size=face_size,
        tile_size=tile_size,
        fmt=fmt,
        # RELATIVO al tour.json, no absoluto (ver decisión 1).
        base=f"./scenes/{slug}/tiles",
    )
    previews = generate_previews(src, scene_dir, fmt=fmt)

    # Miniatura con la convención de nombre que ya usa el visor para el resto
    # del material (`X.webp` -> `X.thumb.webp`), ver decisión 8.
    poster_path = previews["outputs"]["poster"]["path"]
    thumb_path = re.sub(r"\.(webp|jpg)$", r".thumb.\1", poster_path)
    with Image.open(poster_path) as im:
        t = im.copy()
    t.thumbnail((400, 400), Image.LANCZOS)
    if fmt == "webp":
        t.save(thumb_path, quality=70, method=6)
    else:
        t.save(thumb_path, quality=70, optimize=True)

    manifest = {
        "slug": slug, "clave": key, "source": os.path.abspath(src),
        "validation": validation, "tiles": tiles["metadata"],
        "tile_count": tiles["tile_count"],
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    with open(os.path.join(scene_dir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    return {
        "archivo": os.path.basename(src), "clave": key, "slug": slug, "ok": True,
        "resolucion": [validation["width"], validation["height"]],
        "tiles": tiles["tile_count"], "metadata": tiles["metadata"],
        "poster": os.path.relpath(poster_path, TOUR_DIR),
        "advertencias": [
            c["name"] for c in validation["checks"] if not c["passed"] and c.get("heuristic")
        ],
    }


def publish(tour: dict) -> dict:
    """Mismo contrato que `build_tour.py::publish`, pero contemplando escenas
    de tiles: `TiledSource` no tiene `url`, tiene `base` — el publish de
    `build_tour.py` sólo reescribe `url` y reventaría con un KeyError acá."""
    if os.path.isdir(PUBLISH_DIR):
        shutil.rmtree(PUBLISH_DIR)
    shutil.copytree(TOUR_DIR, PUBLISH_DIR)

    pub = json.loads(json.dumps(tour))
    pub["availabilityUrl"] = pub["availabilityUrl"].replace("./", "./baleia/", 1)
    for sc in pub["scenes"]:
        if "url" in sc["source"]:
            sc["source"]["url"] = sc["source"]["url"].replace("./", "./baleia/", 1)
        else:
            sc["source"]["base"] = sc["source"]["base"].replace("./", "./baleia/", 1)
    for u in pub["units"].values():
        if u.get("media"):
            u["media"] = [m.replace("./", "./baleia/", 1) for m in u["media"]]
    with open(PUBLISH_ROOT_TOUR, "w", encoding="utf-8") as f:
        json.dump(pub, f, indent=2, ensure_ascii=False)
    return {"dir": PUBLISH_DIR, "root_tour": PUBLISH_ROOT_TOUR}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description="Integra panorámicas entregadas al tour.json de Baleia.",
    )
    ap.add_argument("--in", dest="in_dir", required=True,
                    help="Carpeta con las panorámicas entregadas.")
    ap.add_argument("--min-width", type=int, default=DEFAULT_MIN_WIDTH,
                    help=f"Ancho mínimo aceptado (default {DEFAULT_MIN_WIDTH}, el piso de la spec).")
    ap.add_argument("--strict-horizon", action="store_true",
                    help="Rechazar también por la heurística de horizonte torcido.")
    ap.add_argument("--skip-validation", action="store_true",
                    help="Generar tiles aunque la validación rechace (deja el veredicto escrito).")
    ap.add_argument("--tile-size", type=int, default=512)
    ap.add_argument("--face-size", type=int, default=None,
                    help="Cara del cubemap en px (default: ancho/4).")
    ap.add_argument("--format", dest="fmt", choices=["webp", "jpg"], default="webp")
    ap.add_argument("--relink-blocks", action="store_true",
                    help="Hacer que h-B1..h-B5 salten a la panorámica del bloque "
                         "en vez de abrir la ficha comercial (ver decisión 4).")
    ap.add_argument("--publish", action="store_true",
                    help="Copiar a apps/viewer/public/baleia/ y reescribir public/tour.json.")
    ap.add_argument("--dry-run", action="store_true",
                    help="Sólo listar qué haría con cada archivo, sin tocar nada.")
    args = ap.parse_args(argv)

    if not os.path.isfile(TOUR_JSON):
        print(f"ERROR: no existe {TOUR_JSON}. Corré primero: python3 scripts/build_tour.py",
              file=sys.stderr)
        return 2
    if not os.path.isdir(args.in_dir):
        print(f"ERROR: no existe la carpeta {args.in_dir}", file=sys.stderr)
        return 2

    with open(TOUR_JSON, encoding="utf-8") as f:
        tour = json.load(f)

    archivos = sorted(
        os.path.join(args.in_dir, n) for n in os.listdir(args.in_dir)
        if os.path.splitext(n)[1].lower() in VALID_EXT and not n.startswith(".")
    )
    if not archivos:
        print(f"ERROR: {args.in_dir} no tiene ninguna imagen ({', '.join(sorted(VALID_EXT))}).",
              file=sys.stderr)
        return 2

    # ------------------------------------------------ resolución de puntos
    plan: list[tuple[str, str, dict]] = []
    desconocidas: list[dict] = []
    for i, src in enumerate(archivos):
        key, _n = parse_filename(src)
        point = POINTS.get(key)
        if point is None:
            # Decisión 6: no se descarta, se integra sin enlace.
            slug = "p-" + slugify(key)
            point = dict(slug=slug, name=key.replace("_", " ").title(),
                         hotspots=[], claims=[], yaw=0.0, fov=90, sort=900 + i)
            desconocidas.append({"archivo": os.path.basename(src), "clave": key, "slug": slug})
        plan.append((src, key, point))

    if args.dry_run:
        print(json.dumps({
            "carpeta": args.in_dir,
            "plan": [{"archivo": os.path.basename(s), "clave": k, "slug": p["slug"],
                      "escena": p["name"], "hotspots": p["hotspots"], "reclama": p["claims"]}
                     for s, k, p in plan],
            "desconocidas": desconocidas,
        }, indent=2, ensure_ascii=False))
        return 0

    # ------------------------------------------------------- procesamiento
    reportes = [
        integrate_one(src, key, point, args.min_width, args.strict_horizon,
                      args.skip_validation, args.tile_size, args.face_size, args.fmt)
        for src, key, point in plan
    ]
    ok_keys = {r["clave"] for r in reportes if r["ok"]}
    rechazadas = [r for r in reportes if not r["ok"]]

    # ------------------------------------------------------ escenas nuevas
    by_slug = {s["slug"]: s for s in tour["scenes"]}
    escenas_nuevas, escenas_actualizadas = [], []
    for src, key, point in plan:
        if key not in ok_keys:
            continue
        slug = point["slug"]
        with open(os.path.join(SCENES_DIR, slug, "tiles", "tiles.json"), encoding="utf-8") as f:
            meta = json.load(f)
        scene = {
            "id": f"sc-{slug}",
            "slug": slug,
            "kind": "panorama",
            "name": point["name"],
            "source": {
                "base": meta["base"], "faceSize": meta["faceSize"],
                "tileSize": meta["tileSize"], "levels": meta["levels"],
                "format": meta["format"],
            },
            # Ver decisión 7: yaw/pitch en radianes, fov en grados.
            "initialView": {"yaw": point["yaw"], "pitch": 0.0, "fov": point["fov"]},
            "sort": SORT_BASE + point["sort"],
        }
        if slug in by_slug:
            by_slug[slug].clear()
            by_slug[slug].update(scene)
            escenas_actualizadas.append(slug)
        else:
            tour["scenes"].append(scene)
            by_slug[slug] = scene
            escenas_nuevas.append(slug)
    tour["scenes"].sort(key=lambda s: s["sort"])

    # ------------------------------------------------------ re-enlace
    hotspots_by_id = {h["id"]: h for h in tour["hotspots"]}
    enlaces: list[dict] = []
    reclamados: set[str] = set()

    def relink(hid: str, slug: str, motivo: str) -> None:
        h = hotspots_by_id.get(hid)
        if h is None:
            return
        antes = h.get("action")
        h["action"] = {"kind": "goto", "sceneSlug": slug}
        reclamados.add(hid)
        enlaces.append({"hotspot": hid, "label": h.get("label"), "escena": slug,
                        "antes": antes, "motivo": motivo})

    for _src, key, point in plan:
        if key not in ok_keys:
            continue
        for hid in point["hotspots"]:
            relink(hid, point["slug"], "toma dedicada")
    # Los `claims` recién después, y sólo sobre lo que nadie reclamó.
    for _src, key, point in plan:
        if key not in ok_keys:
            continue
        for hid in point["claims"]:
            if hid not in reclamados:
                relink(hid, point["slug"], "cubierto por la toma vecina")
    if args.relink_blocks:
        for _src, key, point in plan:
            if key in ok_keys and key in BLOCK_POINT_TO_HOTSPOT:
                relink(BLOCK_POINT_TO_HOTSPOT[key], point["slug"], "--relink-blocks")

    with open(TOUR_JSON, "w", encoding="utf-8") as f:
        json.dump(tour, f, indent=2, ensure_ascii=False)

    publicado = publish(tour) if args.publish else None

    print(json.dumps({
        "carpeta": args.in_dir,
        "archivos": len(archivos),
        "integradas": len(ok_keys),
        "rechazadas": rechazadas,
        "desconocidas": desconocidas,
        "escenas_nuevas": escenas_nuevas,
        "escenas_actualizadas": escenas_actualizadas,
        "escenas_totales": len(tour["scenes"]),
        "hotspots_reenlazados": enlaces,
        "detalle": reportes,
        "tour": TOUR_JSON,
        "publicado": publicado,
    }, indent=2, ensure_ascii=False))
    return 1 if rechazadas else 0


if __name__ == "__main__":
    sys.exit(main())
