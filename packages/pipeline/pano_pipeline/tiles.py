"""Conversion de equirectangular a cubemap multiresolucion (piramide de tiles).

Formato por defecto: WebP (calidad ~82).
  - WebP pesa ~20-30% menos que JPEG a calidad comparable y decodifica rapido.
  - AVIF pesa aun menos, pero su decodificacion es sensiblemente mas lenta
    que WebP/JPEG; el visor tiene que decodificar decenas de tiles a la vez
    al mover la camara, asi que priorizamos velocidad de decode sobre el
    ultimo % de compresion. Por eso NO usamos AVIF por defecto.

Estructura de salida:
  {out_dir}/{cara}/{nivel}/{fila}_{columna}.{ext}
  caras: front, right, back, left, up, down
  nivel 0 = mas baja resolucion (1 tile), nivel (levels-1) = resolucion
  completa (face_size).

tiles.json (metadatos para el visor, debe matchear TiledSource en
packages/core/src/types.ts):
  {
    "base": "...",       # ruta relativa base (se completa en run.py)
    "faceSize": int,
    "tileSize": int,
    "levels": int,
    "format": "webp" | "jpg"
  }
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from typing import Dict, List, Tuple

import numpy as np
import py360convert
from PIL import Image

try:
    from tqdm import tqdm
except ImportError:  # pragma: no cover
    def tqdm(iterable, **kwargs):
        return iterable

FACE_KEY_TO_NAME = {
    "F": "front",
    "R": "right",
    "B": "back",
    "L": "left",
    "U": "up",
    "D": "down",
}

DEFAULT_TILE_SIZE = 512
DEFAULT_WEBP_QUALITY = 82
DEFAULT_JPG_QUALITY = 85


def compute_levels(face_size: int, tile_size: int) -> int:
    """Cantidad de niveles de la piramide.

    niveles = ceil(log2(face_size / tile_size)) + 1

    Nivel (levels-1) tiene resolucion face_size (o el tamaño reducido a
    potencia de 2 mas cercana hacia arriba si face_size no es multiplo
    exacto de tile_size), y cada nivel anterior es la mitad del siguiente.
    """
    if face_size <= tile_size:
        return 1
    ratio = face_size / float(tile_size)
    return int(math.ceil(math.log2(ratio))) + 1


def resize_lanczos(img: Image.Image, size: int) -> Image.Image:
    if img.width == size and img.height == size:
        return img
    return img.resize((size, size), Image.LANCZOS)


def slice_face_to_tiles(
    face_img: Image.Image, tile_size: int
) -> Dict[Tuple[int, int], Image.Image]:
    """Recorta una cara cuadrada en tiles de tile_size x tile_size.
    Si la cara no es multiplo exacto de tile_size, el ultimo tile de cada
    fila/columna se recorta al remanente (sin padding) para no inventar
    pixeles fuera de la imagen."""
    tiles: Dict[Tuple[int, int], Image.Image] = {}
    w, h = face_img.size
    n_cols = math.ceil(w / tile_size)
    n_rows = math.ceil(h / tile_size)
    for row in range(n_rows):
        for col in range(n_cols):
            left = col * tile_size
            top = row * tile_size
            right = min(left + tile_size, w)
            bottom = min(top + tile_size, h)
            tiles[(row, col)] = face_img.crop((left, top, right, bottom))
    return tiles


def _save_tile(
    args: Tuple[np.ndarray, str, str, int],
) -> str:
    arr, out_path, fmt, quality = args
    img = Image.fromarray(arr)
    save_kwargs = {}
    if fmt == "webp":
        save_kwargs = {"quality": quality, "method": 4}
        img.save(out_path, format="WEBP", **save_kwargs)
    else:
        save_kwargs = {"quality": quality, "optimize": True}
        img.convert("RGB").save(out_path, format="JPEG", **save_kwargs)
    return out_path


def build_face_pyramid_jobs(
    face_name: str,
    face_img: Image.Image,
    face_size: int,
    tile_size: int,
    levels: int,
    out_dir: str,
    fmt: str,
    quality: int,
) -> List[Tuple[np.ndarray, str, str, int]]:
    """Genera la lista de jobs (tile arrays + rutas de salida) para una cara,
    de nivel 0 (mas chico) a nivel levels-1 (resolucion completa)."""
    jobs: List[Tuple[np.ndarray, str, str, int]] = []
    ext = "webp" if fmt == "webp" else "jpg"

    # nivel mas alto = face_size completo; vamos reduciendo a la mitad
    sizes = []
    size = face_size
    for _ in range(levels):
        sizes.append(size)
        size = max(1, size // 2)
    sizes = list(reversed(sizes))  # [nivel0 (chico), ..., nivel N-1 (face_size)]

    for level, level_size in enumerate(sizes):
        level_img = resize_lanczos(face_img, level_size)
        tiles = slice_face_to_tiles(level_img, tile_size)
        level_dir = os.path.join(out_dir, face_name, str(level))
        os.makedirs(level_dir, exist_ok=True)
        for (row, col), tile_img in tiles.items():
            out_path = os.path.join(level_dir, f"{row}_{col}.{ext}")
            jobs.append((np.asarray(tile_img), out_path, fmt, quality))
    return jobs


def generate_tiles(
    equirect_path: str,
    out_dir: str,
    face_size: int = None,
    tile_size: int = DEFAULT_TILE_SIZE,
    fmt: str = "webp",
    quality: int = None,
    workers: int = None,
    base: str = "",
) -> Dict:
    img = Image.open(equirect_path).convert("RGB")
    width, _height = img.size

    if face_size is None:
        face_size = width // 4

    if quality is None:
        quality = DEFAULT_WEBP_QUALITY if fmt == "webp" else DEFAULT_JPG_QUALITY

    levels = compute_levels(face_size, tile_size)

    equirect_arr = np.asarray(img)
    cube_faces = py360convert.e2c(equirect_arr, face_w=face_size, cube_format="dict")

    os.makedirs(out_dir, exist_ok=True)

    all_jobs: List[Tuple[np.ndarray, str, str, int]] = []
    for key, face_name in FACE_KEY_TO_NAME.items():
        face_arr = cube_faces[key]
        face_img = Image.fromarray(face_arr)
        jobs = build_face_pyramid_jobs(
            face_name, face_img, face_size, tile_size, levels, out_dir, fmt, quality
        )
        all_jobs.extend(jobs)

    workers = workers or os.cpu_count() or 4
    with ProcessPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(_save_tile, job) for job in all_jobs]
        for _ in tqdm(as_completed(futures), total=len(futures), desc="tiles"):
            pass

    metadata = {
        "base": base,
        "faceSize": face_size,
        "tileSize": tile_size,
        "levels": levels,
        "format": fmt,
    }
    with open(os.path.join(out_dir, "tiles.json"), "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    return {
        "metadata": metadata,
        "tile_count": len(all_jobs),
        "out_dir": out_dir,
    }


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Genera una piramide de tiles cubemap a partir de un equirectangular."
    )
    parser.add_argument("image", help="Ruta al panorama equirectangular.")
    parser.add_argument("out_dir", help="Directorio de salida para los tiles.")
    parser.add_argument(
        "--face-size",
        type=int,
        default=None,
        help="Tamaño de cara del cubemap en px (default: ancho/4).",
    )
    parser.add_argument(
        "--tile-size", type=int, default=DEFAULT_TILE_SIZE, help=f"Tamaño de tile en px (default {DEFAULT_TILE_SIZE})."
    )
    parser.add_argument(
        "--format", dest="fmt", choices=["webp", "jpg"], default="webp", help="Formato de salida (default webp)."
    )
    parser.add_argument("--quality", type=int, default=None, help="Calidad de compresion (default 82 webp / 85 jpg).")
    parser.add_argument("--workers", type=int, default=None, help="Cantidad de procesos (default: cpu_count).")
    parser.add_argument("--base", default="", help="Valor 'base' a escribir en tiles.json.")
    return parser


def main(argv: List[str] = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    result = generate_tiles(
        args.image,
        args.out_dir,
        face_size=args.face_size,
        tile_size=args.tile_size,
        fmt=args.fmt,
        quality=args.quality,
        workers=args.workers,
        base=args.base,
    )
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
