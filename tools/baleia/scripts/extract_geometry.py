"""
Baleia — extraccion de geometria del masterplan (pagina 6 del brochure, "MASTERPLAN").

Por que este enfoque y no parseo directo del SVG exportado por pdftocairo:
El SVG de esta pagina (p06.svg / p09.svg) tiene 4200-11700 <path>, pero la enorme
mayoria son artefactos de la textura de papel del fondo, resueltos por pdftocairo
via <mask>/<clipPath>/<feImage>/<feBlend> (4153 mask, 4409 clipPath, 5520 feImage
en p09.svg). La geometria util (edificios, piletas, laguna) queda referenciada
solo a traves de esa cadena de filtros de composicion, no como paths de primer
nivel navegables: svgelements solo encuentra 45 <path> "reales" en el arbol de
render de p09.svg, y ninguno corresponde a los contornos de los bloques.

Por eso se opto por un parseo propio, pero a nivel raster: se re-renderiza la
pagina del PDF (que es 100% vectorial) a 300dpi con pdftoppm — sin perdida
relevante de precision para este uso — y se segmenta por color con OpenCV.
El masterplan (p06) tiene los edificios en color tostado/beige solido, las
piletas y la laguna en celeste solido y el cesped en verde solido, lo que hace
que la deteccion de contornos por umbral de color sea mucho mas confiable que
perseguir la cadena de filtros del SVG.

Pasos:
  1. Cargar el PNG a 300dpi de la pagina 6.
  2. Umbral de color para "tostado" (edificios) y "celeste" (agua).
  3. Componentes conexas -> contornos -> polygon approx (cv2.approxPolyDP).
  4. Clasificar:
     - Los 5 blobs tostados mas grandes y mas alargados (aspect ratio via
       minAreaRect) = bloques de vivienda. Se ordenan por X del centroide
       (oeste -> este) y se rotulan B1..B5.
     - El resto de blobs tostados/celestes se asignan a la letra de amenity
       (A, D, E, F, G) mas cercana a un punto ancla. Los anclas son los
       centroides de las etiquetas de letra verde-oscura ("A","D","E","F","G")
       impresas sobre el plano, detectados automaticamente en
       scripts/find_label_anchors.py (no son coordenadas puestas a mano: se
       calculan por color+conectividad y se citan aqui como constantes
       reproducibles a partir de ese script).
  5. Perimetro del terreno = contorno externo de la union de todas las zonas
     "no fondo" (cesped + tostado + celeste + gris de calles/parking) dentro
     de la franja del plano.
  6. Exportar:
     - preview PNG con los poligonos superpuestos y rotulados, para
       verificacion visual.
     - GeoJSON en coordenadas de pixel normalizadas 0..1 (formato polygon_px
       de packages/core/src/types.ts).

Reproducir:
  cd tools/baleia && source .venv/bin/activate
  pdftoppm -png -r 300 -f 6 -l 6 src/baleia_brochure-v6.pdf out/masterplan/p06_masterplan_300dpi
  python3 scripts/find_label_anchors.py   # opcional, recalcula ANCHORS_150DPI
  python3 scripts/extract_geometry.py
"""
import json
import math
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
IMG_PATH = ROOT / "out/masterplan/p06_masterplan_300dpi-06.png"
OUT_DIR = ROOT / "out"
PREVIEW_PATH = OUT_DIR / "preview_deteccion_masterplan.png"
GEOJSON_PATH = OUT_DIR / "baleia_hotspots.geojson"
FLOORPLAN_PATH = OUT_DIR / "masterplan" / "baleia_masterplan_300dpi_recortado.png"

# Region del plano dentro de la pagina completa (excluye el header de texto
# arriba y la leyenda "A: ACCESO D: PISCINA..." abajo), en fraccion 0..1 de
# alto de imagen. Calculado observando out/ref/p06_ref-06.png (900..2040 de
# 2250 px -> 0.40..0.906).
PLAN_Y0_FRAC = 0.40
PLAN_Y1_FRAC = 0.906

# Anclas de las letras A/D/E/F/G, detectadas automaticamente por
# scripts/find_label_anchors.py sobre out/ref/p06_ref-06.png (render a 150dpi,
# 4000x2250). Se listan aqui a esa resolucion; el script las reescala a la
# resolucion real de IMG_PATH.
ANCHORS_150DPI = {
    "A": (494, 1081),
    "D": (3175, 1661),
    "E": (3209, 1489),
    "F": (3351, 1698),
    "G": (3569, 1631),
}
ANCHOR_SRC_SIZE = (4000, 2250)  # tamaño del render del que salieron las anclas

AMENITY_NAMES = {
    "A": "Acceso",
    "D": "Piscina",
    "E": "Piscina infantil",
    "F": "Rincón de fuego",
    "G": "Laguna",
}


def load_image():
    img = cv2.imread(str(IMG_PATH))
    if img is None:
        raise SystemExit(f"No se pudo leer {IMG_PATH}. Correr pdftoppm primero (ver docstring).")
    return img  # BGR


def scale_anchors(img_shape):
    h, w = img_shape[:2]
    sx = w / ANCHOR_SRC_SIZE[0]
    sy = h / ANCHOR_SRC_SIZE[1]
    return {k: (x * sx, y * sy) for k, (x, y) in ANCHORS_150DPI.items()}


def color_mask(img_bgr, kind):
    """kind: 'tan' (edificios) o 'blue' (agua)."""
    b = img_bgr[:, :, 0].astype(np.int16)
    g = img_bgr[:, :, 1].astype(np.int16)
    r = img_bgr[:, :, 2].astype(np.int16)
    if kind == "tan":
        # tostado: R-B moderado/alto, R > G (calido), no muy gris
        mask = (r - b > 15) & (r > g - 5) & (r > 110)
    elif kind == "blue":
        mask = (b - r > 15) & (b > 140)
    elif kind == "green":
        mask = (g - r > 12) & (g - b > 12)
    elif kind == "notbg":
        # cualquier cosa que no sea el textura-papel de fondo casi blanco
        # ni el gris muy claro de calles: saturacion minima o luminosidad < umbral
        mx = np.maximum(np.maximum(r, g), b)
        mn = np.minimum(np.minimum(r, g), b)
        sat = mx - mn
        mask = (sat > 10) | (mx < 225)
    else:
        raise ValueError(kind)
    return (mask.astype(np.uint8)) * 255


def split_touching_components(mask, erode_ksize=21):
    """Separa blobs que se tocan por un puente angosto (ej: el edificio de
    amenities y el sector 'rincon de fuego' F, unidos por una vereda del
    mismo color en la mascara).

    Una reconstruccion por dilatacion sin restriccion "compite" mal: cada
    semilla, al crecer, termina invadiendo el mismo puente y las dos vuelven
    a fundirse en la forma original. Por eso se usa cv2.watershed sobre la
    transformada de distancia: cada pixel del blob se asigna a la semilla
    (componente de la version erosionada) mas cercana en distancia dentro
    de la mascara, y el "divisor de aguas" corta justo en el punto medio del
    puente angosto — el resultado estandar para separar blobs pegados.
    """
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (erode_ksize, erode_ksize))
    eroded = cv2.erode(mask, kernel)
    n_seeds, seed_labels = cv2.connectedComponents(eroded)
    if n_seeds <= 2:
        return mask  # nada que separar

    dist = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
    dist_img = cv2.cvtColor(cv2.convertScaleAbs(dist, alpha=255.0 / (dist.max() or 1)), cv2.COLOR_GRAY2BGR)

    markers = np.zeros(mask.shape, dtype=np.int32)
    markers[mask == 0] = 1  # fondo seguro
    for lbl in range(1, n_seeds):
        markers[seed_labels == lbl] = lbl + 1  # semillas de cada blob, id >= 2

    cv2.watershed(dist_img, markers)

    out = np.zeros_like(mask)
    out[(markers > 1) & (mask > 0)] = 255
    return out


def find_contours(mask, min_area, split=False):
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    if split:
        mask = split_touching_components(mask)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    out = []
    for c in contours:
        area = cv2.contourArea(c)
        if area < min_area:
            continue
        out.append(c)
    return out


def min_area_rect_info(c):
    (cx, cy), (w, h), angle = cv2.minAreaRect(c)
    long_side = max(w, h)
    short_side = max(1e-6, min(w, h))
    elongation = long_side / short_side
    return cx, cy, elongation


def simplify(contour, epsilon_frac=0.004):
    peri = cv2.arcLength(contour, True)
    eps = epsilon_frac * peri
    approx = cv2.approxPolyDP(contour, eps, True)
    return approx.reshape(-1, 2)


def main():
    img = load_image()
    h, w = img.shape[:2]
    print(f"Imagen: {w}x{h} px")

    anchors = scale_anchors(img.shape)

    y0 = int(h * PLAN_Y0_FRAC)
    y1 = int(h * PLAN_Y1_FRAC)
    plan_mask_region = np.zeros((h, w), np.uint8)
    plan_mask_region[y0:y1, :] = 255

    tan_mask = color_mask(img, "tan")
    tan_mask = cv2.bitwise_and(tan_mask, plan_mask_region)
    blue_mask = color_mask(img, "blue")
    blue_mask = cv2.bitwise_and(blue_mask, plan_mask_region)

    min_area_px = 0.00005 * w * h  # ~0.005% del area del plano, filtra ruido/hatching

    # split=True: el edificio de amenities y el sector F ("rincon de fuego")
    # se tocan por una vereda angosta en la mascara de color; sin separarlos
    # quedarian como un solo blob y F heredaria geometria del edificio.
    tan_contours = find_contours(tan_mask, min_area_px, split=True)
    blue_contours = find_contours(blue_mask, min_area_px)

    print(f"Blobs tostados detectados (post-filtro area): {len(tan_contours)}")
    print(f"Blobs celestes detectados (post-filtro area): {len(blue_contours)}")

    # --- Clasificar bloques: son los blobs tostados mas grandes, EXCLUYENDO
    # cualquiera que este pegado al cluster de amenities (D/E/F/G). Sin esta
    # exclusion, el edificio de servicios/clubhouse (que por area es el blob
    # tostado mas grande de todo el plano, 650k px2, mas grande que cualquier
    # bloque de vivienda real) se cuela como si fuera "Bloque 5" y desplaza al
    # verdadero Bloque 1 fuera del top 5. Se detecto este caso concreto
    # durante la calibracion (ver out/debug_centroids_crop.png) comprobando
    # que el blob de mayor area caia justo al lado de la letra "E", no sobre
    # una fila de vivienda.
    AMENITY_EXCLUSION_RADIUS_PX = 600  # a escala de la imagen de 8000px de ancho
    tan_info = []
    for c in tan_contours:
        cx, cy, elong = min_area_rect_info(c)
        area = cv2.contourArea(c)
        min_anchor_dist = min(math.hypot(cx - ax, cy - ay) for ax, ay in anchors.values())
        tan_info.append({
            "contour": c, "cx": cx, "cy": cy, "elong": elong, "area": area,
            "near_amenity": min_anchor_dist < AMENITY_EXCLUSION_RADIUS_PX,
        })

    candidate_blocks = sorted(
        (t for t in tan_info if not t["near_amenity"]),
        key=lambda t: -t["area"],
    )
    top5 = candidate_blocks[:5]
    top5.sort(key=lambda t: t["cx"])  # oeste -> este

    features = []

    for i, t in enumerate(top5, start=1):
        code = f"B{i}"
        poly = simplify(t["contour"])
        features.append(make_feature(poly, w, h, code=code, kind="bloque", name=f"Bloque {i}"))
        print(f"{code}: centroid=({t['cx']:.0f},{t['cy']:.0f}) area={t['area']:.0f} elong={t['elong']:.2f} verts={len(poly)}")

    # --- Amenities: para cada letra ancla, buscar el blob (tostado o celeste)
    # cuyo centroide este mas cerca, excluyendo los ya usados como bloques y
    # los blobs chiquitos (< AMENITY_MIN_AREA_PX): son ruido/detalle grafico
    # (canteros, iconos) que a veces cae mas cerca de una letra en linea
    # recta que el amenity real, y lo desplazaria por error.
    AMENITY_MIN_AREA_PX = 8000
    block_contour_ids = {id(t["contour"]) for t in top5}
    remaining_tan = [
        t for t in tan_info
        if id(t["contour"]) not in block_contour_ids and t["area"] >= AMENITY_MIN_AREA_PX
    ]

    blue_info = []
    for c in blue_contours:
        cx, cy, elong = min_area_rect_info(c)
        area = cv2.contourArea(c)
        blue_info.append({"contour": c, "cx": cx, "cy": cy, "elong": elong, "area": area})

    pool_candidates = remaining_tan + blue_info

    # F ("rincon de fuego") queda descartado del emparejamiento generico: en
    # esta ilustracion el sector F esta pintado del MISMO tostado solido que
    # el edificio de servicios y la vereda que los conecta — no hay gap de
    # color entre ellos, asi que ninguna segmentacion por color (ni siquiera
    # watershed sobre la transformada de distancia) los separa de forma
    # confiable; ver out/debug_split_result.png tomado durante la
    # calibracion, donde el contorno mas grande efectivamente encierra
    # clubhouse + pasillo + F como una sola pieza. Como fallback documentado
    # se recorta la mascara tostada a una caja alrededor del ancla de la
    # letra F (calibrada a mano una vez, mirando esa misma imagen) y se toma
    # el contorno mas grande dentro de esa caja. Es la unica geometria de
    # este entregable que no sale 100% de deteccion automatica de color —
    # se marca explicitamente en el README como aproximada.
    letters_for_generic_match = {k: v for k, v in anchors.items() if k != "F"}

    assigned = {}
    for letter, (ax, ay) in letters_for_generic_match.items():
        best = None
        best_d = None
        for cand in pool_candidates:
            d = math.hypot(cand["cx"] - ax, cand["cy"] - ay)
            if best_d is None or d < best_d:
                best_d = d
                best = cand
        assigned[letter] = (best, best_d)

    for letter, (cand, d) in assigned.items():
        if cand is None:
            print(f"AMENITY {letter}: sin blob candidato cercano (revisar manualmente)")
            continue
        poly = simplify(cand["contour"])
        name = AMENITY_NAMES[letter]
        print(f"AMENITY {letter} ({name}): dist_a_ancla={d:.0f}px area={cand['area']:.0f} verts={len(poly)}")
        features.append(make_feature(poly, w, h, code=letter, kind="amenity", name=name))

    f_anchor = anchors["F"]
    f_poly = extract_f_by_bbox_crop(tan_mask, f_anchor)
    if f_poly is not None:
        print(f"AMENITY F (Rincón de fuego): geometria aproximada por recorte espacial alrededor del ancla, verts={len(f_poly)} [ver nota en README]")
        features.append(make_feature(f_poly, w, h, code="F", kind="amenity", name=AMENITY_NAMES["F"]))
    else:
        print("AMENITY F: no se pudo aislar ni por recorte espacial (revisar manualmente)")

    # --- Perimetro del terreno: contorno externo de todo lo que no es fondo,
    # dentro de la franja del plano.
    notbg = color_mask(img, "notbg")
    notbg = cv2.bitwise_and(notbg, plan_mask_region)
    notbg = cv2.morphologyEx(notbg, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    perim_contours, _ = cv2.findContours(notbg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    perim_contours = sorted(perim_contours, key=cv2.contourArea, reverse=True)
    perimeter_poly = None
    if perim_contours:
        biggest = perim_contours[0]
        perimeter_poly = simplify(biggest, epsilon_frac=0.002)
        features.append(make_feature(perimeter_poly, w, h, code="TERRENO", kind="perimetro", name="Perímetro del terreno"))
        print(f"Perimetro terreno: verts={len(perimeter_poly)} area={cv2.contourArea(biggest):.0f}")

    # --- Recortar la pagina completa a la franja del plano (sin el header de
    # texto ni la leyenda inferior) y RE-normalizar todas las geometrias
    # contra ese recorte, que es la imagen que efectivamente se va a usar
    # como escena floorplan en el visor. Coordenadas 0..1 sobre la pagina
    # completa serian inconsistentes con esa imagen recortada.
    all_px = []
    for feat in features:
        for x, y in feat["geometry"]["coordinates"][0]:
            all_px.append((x * w, y * h))
    xs = [p[0] for p in all_px]
    ys = [p[1] for p in all_px]
    pad_x = int(0.015 * w)
    pad_y = int(0.02 * h)
    cx0 = max(0, int(min(xs)) - pad_x)
    cx1 = min(w, int(max(xs)) + pad_x)
    cy0 = max(0, int(min(ys)) - pad_y)
    cy1 = min(h, int(max(ys)) + pad_y)
    crop_w = cx1 - cx0
    crop_h = cy1 - cy0
    print(f"Recorte del plano: ({cx0},{cy0})-({cx1},{cy1}) -> {crop_w}x{crop_h}")

    floorplan_img = img[cy0:cy1, cx0:cx1]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(FLOORPLAN_PATH), floorplan_img, [cv2.IMWRITE_PNG_COMPRESSION, 6])
    print(f"Floorplan (300dpi, recortado) escrito en {FLOORPLAN_PATH}")

    for feat in features:
        new_coords = []
        for x, y in feat["geometry"]["coordinates"][0]:
            px, py = x * w, y * h
            new_coords.append([round((px - cx0) / crop_w, 5), round((py - cy0) / crop_h, 5)])
        feat["geometry"]["coordinates"] = [new_coords]

    # --- Preview (sobre el recorte, ya en las coordenadas finales)
    preview = floorplan_img.copy()
    colors = {
        "bloque": (60, 90, 220),      # rojo-naranja BGR
        "amenity": (220, 140, 30),    # azul BGR
        "perimetro": (0, 200, 0),     # verde BGR
    }
    for feat in features:
        kind = feat["properties"]["kind"]
        code = feat["properties"]["code"]
        pts_norm = feat["geometry"]["coordinates"][0]
        pts = np.array([[int(x * crop_w), int(y * crop_h)] for x, y in pts_norm], dtype=np.int32)
        color = colors.get(kind, (0, 0, 0))
        thickness = 3 if kind != "perimetro" else 4
        cv2.polylines(preview, [pts], True, color, thickness, cv2.LINE_AA)
        cx, cy = pts[:, 0].mean(), pts[:, 1].mean()
        cv2.putText(preview, code, (int(cx) - 20, int(cy)), cv2.FONT_HERSHEY_SIMPLEX, 1.3, (0, 0, 0), 6, cv2.LINE_AA)
        cv2.putText(preview, code, (int(cx) - 20, int(cy)), cv2.FONT_HERSHEY_SIMPLEX, 1.3, (255, 255, 255), 2, cv2.LINE_AA)

    scale = 1600 / crop_w
    preview_small = cv2.resize(preview, (1600, int(crop_h * scale)))
    cv2.imwrite(str(PREVIEW_PATH), preview_small)
    print(f"Preview escrito en {PREVIEW_PATH}")

    geojson = {"type": "FeatureCollection", "features": features}
    GEOJSON_PATH.write_text(json.dumps(geojson, ensure_ascii=False, indent=2))
    print(f"GeoJSON escrito en {GEOJSON_PATH} ({len(features)} features)")


def extract_f_by_bbox_crop(tan_mask, f_anchor, half_w=420, half_h=520, y_offset=80):
    """Aisla el sector F recortando la mascara tostada a una caja alrededor
    del ancla de la letra F (ver nota extensa mas arriba) y devolviendo el
    contorno mas grande dentro de esa caja. Los tamaños de caja fueron
    calibrados una vez a ojo sobre out/debug_split_result.png para que
    incluyan el "guitarron" completo del rincon de fuego sin llegar a tocar
    el edificio de servicios (al norte) ni el anillo de arena de la laguna
    (al este). Escala: pensados para una imagen de referencia de 8000px de
    ancho; se re-escalan proporcionalmente si tan_mask tiene otro tamaño.
    """
    h_img, w_img = tan_mask.shape[:2]
    scale = w_img / 8000.0
    hw = int(half_w * scale)
    hh = int(half_h * scale)
    yoff = int(y_offset * scale)
    ax, ay = f_anchor
    x0 = max(0, int(ax - hw))
    x1 = min(w_img, int(ax + hw))
    y0 = max(0, int(ay - hh + yoff))
    y1 = min(h_img, int(ay + hh + yoff))
    crop = tan_mask[y0:y1, x0:x1]
    contours, _ = cv2.findContours(crop, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    biggest = max(contours, key=cv2.contourArea)
    poly = simplify(biggest, epsilon_frac=0.006)
    poly = poly + np.array([x0, y0])
    return poly


def make_feature(poly_px, w, h, code, kind, name):
    coords = [[round(x / w, 5), round(y / h, 5)] for x, y in poly_px]
    if coords[0] != coords[-1]:
        coords.append(coords[0])
    return {
        "type": "Feature",
        "properties": {"code": code, "kind": kind, "name": name},
        "geometry": {"type": "Polygon", "coordinates": [coords]},
    }


if __name__ == "__main__":
    main()
