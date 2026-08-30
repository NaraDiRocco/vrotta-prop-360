"""Piramide deep-zoom (DZI) para planos gigapixel.

Metodo principal: invocar `vips dzsave` como proceso externo
(--tile-size 512 --overlap 1), que es la herramienta estandar y mucho mas
rapida/eficiente en memoria que cualquier implementacion pura en Python
para imagenes gigapixel.

`vips` no esta garantizado en toda maquina de desarrollo (en este Mac no
esta instalado). Si no se encuentra el binario:
  1. Se informa el comando de instalacion (`brew install vips`).
  2. Si se paso --fallback-pillow, se usa un fallback puro en Pillow que
     genera una piramide DZI equivalente (mas lento y con mayor uso de
     memoria: no recomendado para imagenes realmente gigapixel, pero
     suficiente para no bloquear el desarrollo/tests).
"""
from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
from typing import Dict, List

from PIL import Image

VIPS_INSTALL_HINT = "vips no esta instalado. Instalalo con: brew install vips"


def vips_available() -> bool:
    return shutil.which("vips") is not None


def run_vips_dzsave(
    image_path: str,
    out_basename: str,
    tile_size: int = 512,
    overlap: int = 1,
    fmt: str = "jpg",
) -> Dict:
    if not vips_available():
        raise RuntimeError(VIPS_INSTALL_HINT)

    cmd = [
        "vips",
        "dzsave",
        image_path,
        out_basename,
        "--tile-size",
        str(tile_size),
        "--overlap",
        str(overlap),
        "--suffix",
        f".{fmt}",
    ]
    subprocess.run(cmd, check=True)
    return {
        "engine": "vips",
        "dzi": f"{out_basename}.dzi",
        "tiles_dir": f"{out_basename}_files",
    }


def _pillow_dzsave(
    image_path: str,
    out_basename: str,
    tile_size: int = 512,
    overlap: int = 1,
    fmt: str = "jpg",
) -> Dict:
    """Fallback puro en Pillow, compatible con el layout DZI estandar
    (Deep Zoom Image de OpenSeadragon/Seadragon):
      {out_basename}.dzi                  -> manifest XML
      {out_basename}_files/{level}/{c}_{r}.{ext}

    No es apto para imagenes realmente gigapixel (todo se mantiene en
    memoria con Pillow), pero produce una piramide funcionalmente
    equivalente para desarrollo/tests cuando vips no esta disponible.
    """
    img = Image.open(image_path).convert("RGB")
    width, height = img.size

    max_level = int(math.ceil(math.log2(max(width, height))))
    files_dir = f"{out_basename}_files"
    os.makedirs(files_dir, exist_ok=True)

    tile_counts = {}
    current = img
    for level in range(max_level, -1, -1):
        level_dir = os.path.join(files_dir, str(level))
        os.makedirs(level_dir, exist_ok=True)
        w, h = current.size
        n_cols = math.ceil(w / tile_size)
        n_rows = math.ceil(h / tile_size)
        count = 0
        for row in range(n_rows):
            for col in range(n_cols):
                left = max(0, col * tile_size - overlap)
                top = max(0, row * tile_size - overlap)
                right = min(w, (col + 1) * tile_size + overlap)
                bottom = min(h, (row + 1) * tile_size + overlap)
                tile = current.crop((left, top, right, bottom))
                out_path = os.path.join(level_dir, f"{col}_{row}.{fmt}")
                if fmt == "jpg":
                    tile.save(out_path, format="JPEG", quality=85, optimize=True)
                else:
                    tile.save(out_path, format=fmt.upper())
                count += 1
        tile_counts[level] = count
        if w <= 1 and h <= 1:
            break
        new_w = max(1, math.ceil(w / 2))
        new_h = max(1, math.ceil(h / 2))
        current = current.resize((new_w, new_h), Image.LANCZOS)

    dzi_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<Image TileSize="{tile_size}" Overlap="{overlap}" Format="{fmt}" '
        'xmlns="http://schemas.microsoft.com/deepzoom/2008">\n'
        f'  <Size Width="{width}" Height="{height}"/>\n'
        "</Image>\n"
    )
    dzi_path = f"{out_basename}.dzi"
    with open(dzi_path, "w", encoding="utf-8") as f:
        f.write(dzi_xml)

    return {
        "engine": "pillow-fallback",
        "dzi": dzi_path,
        "tiles_dir": files_dir,
        "levels": max_level + 1,
        "tile_counts_by_level": tile_counts,
        "note": (
            "Fallback puro en Pillow: no recomendado para gigapixel real. "
            "Instalar vips (brew install vips) para produccion."
        ),
    }


def generate_dzi(
    image_path: str,
    out_basename: str,
    tile_size: int = 512,
    overlap: int = 1,
    fmt: str = "jpg",
    fallback_pillow: bool = False,
) -> Dict:
    if vips_available():
        return run_vips_dzsave(image_path, out_basename, tile_size, overlap, fmt)

    if fallback_pillow:
        return _pillow_dzsave(image_path, out_basename, tile_size, overlap, fmt)

    raise RuntimeError(VIPS_INSTALL_HINT + " (o correr con --fallback-pillow para un fallback de desarrollo).")


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Genera una piramide DZI para un plano gigapixel.")
    parser.add_argument("image", help="Ruta a la imagen del plano.")
    parser.add_argument("out_basename", help="Basename de salida (sin extension) para el .dzi y la carpeta _files.")
    parser.add_argument("--tile-size", type=int, default=512)
    parser.add_argument("--overlap", type=int, default=1)
    parser.add_argument("--format", dest="fmt", choices=["jpg", "png"], default="jpg")
    parser.add_argument(
        "--fallback-pillow",
        action="store_true",
        help="Si vips no esta instalado, usar un fallback puro en Pillow en vez de fallar.",
    )
    return parser


def main(argv: List[str] = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    try:
        result = generate_dzi(
            args.image,
            args.out_basename,
            tile_size=args.tile_size,
            overlap=args.overlap,
            fmt=args.fmt,
            fallback_pillow=args.fallback_pillow,
        )
    except RuntimeError as exc:
        print(json.dumps({"error": str(exc)}, indent=2, ensure_ascii=False), file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
