"""Convierte los .insp crudos de una Insta360 X5 a equirectangular.

Los .insp que entrega la camara son JPEG **dual-fisheye**: los dos circulos de
las lentes, uno al lado del otro, sin unir. El visor necesita equirectangular
2:1, asi que hay que proyectarlos.

Lo correcto seria que el fotografo los exporte desde Insta360 Studio, que
aplica la calibracion de fabrica y **nivela el horizonte con el giroscopio**.
Este script no puede hacer eso: los .insp de esta entrega no traen metadata de
pose (ni trailer de Insta360, ni GPano, ni EXIF de orientacion util), asi que
el horizonte queda como estaba la camara. Ver `docs/09-MODELO-3D/`.

Los dos detalles del mapeo que hay que tener bien, y que se validan mirando:

  1. El eje `y` del mundo apunta hacia ARRIBA, pero el eje vertical de una
     imagen crece hacia ABAJO. Hay que negarlo en las **dos** lentes. Sin eso
     la panoramica sale volteada de arriba a abajo: el cielorraso de hormigon
     aparece como piso y el piso de madera como cielorraso.
  2. La lente trasera mira a -z, asi que ademas se niega `x`.

El punto 1 es el que engana. En ambientes chicos y simetricos —banos,
vestidor, pasillos— una panoramica dada vuelta se ve casi normal, asi que
revisar dos o tres tomas al azar no alcanza para detectarlo.

**Como verificarlo:** proyectar una vista rectilinea al frente de la
panoramica y compararla contra la mitad izquierda del .insp original, que es
la lente frontal cruda y esta derecha. Tienen que coincidir ambiente por
ambiente: mismo material en el techo, mismo material en el piso, y los
muebles del mismo lado.

Uso:
    python scripts/stitch_insp.py <carpeta-entrada> <carpeta-salida> [ancho]

El ancho por defecto es 8192, el piso contractual de la spec del proyecto
(`docs/07-BALEIA-360/4-Especificacion-Tecnica-Baleia.md`).
"""

from __future__ import annotations

import os
import sys

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

FOV = np.deg2rad(193.0)   # las lentes pasan de 180: hay solape para mezclar
BANDA = np.deg2rad(6.0)   # ancho angular de la transicion entre lentes
FILAS = 512               # se procesa por bandas para no reventar la RAM


def stitch(path: str, ancho: int = 8192) -> np.ndarray:
    """Devuelve la equirectangular (alto = ancho/2) de un dual-fisheye."""
    src = np.asarray(Image.open(path))
    alto_src, ancho_src = src.shape[:2]
    lado = ancho_src // 2          # cada fisheye es un cuadrado lado x lado
    radio = lado / 2.0
    alto = ancho // 2

    salida = np.empty((alto, ancho, 3), np.uint8)
    lons = np.linspace(-np.pi, np.pi, ancho, dtype=np.float32)

    for y0 in range(0, alto, FILAS):
        y1 = min(y0 + FILAS, alto)
        lats = np.linspace(np.pi / 2, -np.pi / 2, alto, dtype=np.float32)[y0:y1]
        lon, lat = np.meshgrid(lons, lats)

        x = np.cos(lat) * np.sin(lon)
        y = np.sin(lat)
        z = np.cos(lat) * np.cos(lon)

        acum = np.zeros((y1 - y0, ancho, 3), np.float32)
        peso = np.zeros((y1 - y0, ancho, 1), np.float32)

        for atras in (False, True):
            # `y` apunta hacia ARRIBA en el mundo, pero el eje vertical de una
            # imagen crece hacia ABAJO: hay que negarlo en las **dos** lentes.
            # Sin esto la panoramica sale volteada de arriba a abajo — el techo
            # de hormigon aparece como piso y el piso de madera como techo. En
            # ambientes chicos y simetricos (banos, vestidor) casi no se nota.
            # La lente trasera ademas mira a -z, asi que tambien se niega x.
            zl = -z if atras else z
            xl = -x if atras else x
            yl = -y

            theta = np.arctan2(np.sqrt(xl ** 2 + yl ** 2), zl)
            phi = np.arctan2(yl, xl)
            r = (theta / (FOV / 2)) * radio

            u = radio + r * np.cos(phi)
            v = radio + r * np.sin(phi)
            if atras:
                u = u + lado

            ui = np.clip(u, 0, ancho_src - 1).astype(np.int32)
            vi = np.clip(v, 0, alto_src - 1).astype(np.int32)

            # Peso 1 en el eje de la lente, cayendo a 0 pasado su ecuador. La
            # banda de transicion disimula la costura en vez de cortarla seco.
            w = np.clip((np.pi / 2 + BANDA - theta) / (2 * BANDA), 0, 1)[..., None]
            acum += src[vi, ui] * w
            peso += w

        salida[y0:y1] = (acum / np.maximum(peso, 1e-6)).astype(np.uint8)

    return salida


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2

    entrada, destino = argv[0], argv[1]
    ancho = int(argv[2]) if len(argv) > 2 else 8192
    os.makedirs(destino, exist_ok=True)

    archivos = sorted(
        f for f in os.listdir(entrada)
        if f.lower().endswith((".insp", ".jpg", ".jpeg"))
    )
    if not archivos:
        print(f"No hay .insp en {entrada}")
        return 1

    for i, f in enumerate(archivos, 1):
        origen = os.path.join(entrada, f)
        with Image.open(origen) as probe:
            w0, h0 = probe.size
        if w0 != h0 * 2:
            print(f"  {i:02d}/{len(archivos)}  {f}: SALTEADA, no es 2:1 ({w0}x{h0})")
            continue

        salida = os.path.join(destino, os.path.splitext(f)[0] + ".jpg")
        Image.fromarray(stitch(origen, ancho)).save(salida, quality=92, subsampling=0)
        print(f"  {i:02d}/{len(archivos)}  {f} -> {os.path.basename(salida)}  {ancho}x{ancho // 2}")

    print(f"\nListo: {destino}")
    print("Recordar: el horizonte NO esta nivelado (no hay metadata de giroscopio).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
