"""Compara cada panoramica contra la lente cruda de la que salio.

Una equirectangular mal proyectada —volteada, espejada, rotada— **se ve
plausible**. En un bano o un pasillo, dada vuelta parece normal. Mirar dos o
tres tomas al azar no alcanza: hay que comparar contra algo que se sepa
derecho.

La referencia es la mitad izquierda del `.insp` original: la lente frontal
cruda, tal como salio de la camara. Este script pone una al lado de la otra:

    izquierda  el fisheye crudo (referencia)
    derecha    una vista rectilinea al frente de la panoramica generada

Tienen que coincidir ambiente por ambiente: **mismo material en el techo,
mismo material en el piso, y los muebles del mismo lado**. Si el techo de
hormigon aparece abajo, esta volteada. Si la cocina cambio de lado, esta
espejada.

Uso:
    python scripts/verificar_stitch.py <carpeta-insp> <carpeta-equirect> <salida.jpg>
"""

from __future__ import annotations

import os
import sys

import numpy as np
from PIL import Image, ImageDraw

Image.MAX_IMAGE_PIXELS = None

LADO = 460   # px de cada panel


def vista_al_frente(eq: np.ndarray, fov_deg: float = 100.0, w: int = LADO) -> np.ndarray:
    """Proyeccion rectilinea al frente: la panoramica vista como una foto."""
    alto_eq, ancho_eq = eq.shape[:2]
    f = (w / 2) / np.tan(np.deg2rad(fov_deg) / 2)
    px, py = np.meshgrid(np.arange(w) - w / 2, np.arange(w) - w / 2)

    vx = px.astype(np.float32)
    vy = -py.astype(np.float32)      # el eje vertical de imagen crece hacia abajo
    vz = np.full_like(vx, f)

    n = np.sqrt(vx ** 2 + vy ** 2 + vz ** 2)
    lon = np.arctan2(vx / n, vz / n)
    lat = np.arcsin(np.clip(vy / n, -1, 1))

    u = ((lon + np.pi) / (2 * np.pi)) * (ancho_eq - 1)
    v = ((np.pi / 2 - lat) / np.pi) * (alto_eq - 1)
    return eq[v.astype(np.int32), u.astype(np.int32)]


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print(__doc__)
        return 2

    dir_insp, dir_eq, salida = argv[0], argv[1], argv[2]

    insp = {os.path.splitext(f)[0]: f for f in os.listdir(dir_insp)
            if f.lower().endswith(".insp")}
    equis = sorted(f for f in os.listdir(dir_eq) if f.lower().endswith((".jpg", ".webp")))
    if not equis:
        print(f"No hay panoramicas en {dir_eq}")
        return 1

    hoja = Image.new("RGB", (LADO * 2 + 12, len(equis) * (LADO + 20)), "white")
    dib = ImageDraw.Draw(hoja)
    sin_par = []

    for i, f in enumerate(equis):
        base = os.path.splitext(f)[0]
        origen = insp.get(base)
        y = i * (LADO + 20)

        if origen:
            with Image.open(os.path.join(dir_insp, origen)) as crudo:
                lado_lente = crudo.size[0] // 2
                hoja.paste(crudo.crop((0, 0, lado_lente, lado_lente)).resize((LADO, LADO)), (0, y))
        else:
            sin_par.append(f)
            dib.rectangle([0, y, LADO, y + LADO], fill="#eee")
            dib.text((10, y + LADO // 2), "sin .insp de referencia", fill="black")

        eq = np.asarray(Image.open(os.path.join(dir_eq, f)))
        hoja.paste(Image.fromarray(vista_al_frente(eq)), (LADO + 12, y))
        dib.text((4, y + LADO + 4), f"{base}   <- lente cruda (referencia)   |   panoramica ->", fill="black")

    hoja.save(salida, quality=85)
    print(f"{len(equis)} pares -> {salida}")
    print("Revisar: techo y piso del mismo material a ambos lados, y muebles del mismo lado.")
    if sin_par:
        print("Sin .insp de referencia:")
        for f in sin_par:
            print("  - " + f)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
