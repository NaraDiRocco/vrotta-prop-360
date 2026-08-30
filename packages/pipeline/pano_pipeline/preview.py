"""Genera poster, preview y thumbnail a partir del panorama master.

  - poster:    2048 px de ancho (vista previa grande / fallback sin tiles)
  - preview:   512 px de ancho (placeholder mientras cargan los tiles)
  - thumbnail: 64 px de ancho (miniaturas en listados)

Todas mantienen la relacion de aspecto original (2:1 esperado) y se generan
con Pillow usando LANCZOS.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Dict, List

from PIL import Image

SIZES = {
    "poster": 2048,
    "preview": 512,
    "thumbnail": 64,
}


def generate_previews(
    equirect_path: str,
    out_dir: str,
    fmt: str = "webp",
    quality: int = 85,
) -> Dict:
    img = Image.open(equirect_path).convert("RGB")
    width, height = img.size
    aspect = height / width

    os.makedirs(out_dir, exist_ok=True)
    ext = "webp" if fmt == "webp" else "jpg"

    outputs = {}
    for name, target_width in SIZES.items():
        target_width = min(target_width, width)
        target_height = max(1, round(target_width * aspect))
        resized = img.resize((target_width, target_height), Image.LANCZOS)
        out_path = os.path.join(out_dir, f"{name}.{ext}")
        if fmt == "webp":
            resized.save(out_path, format="WEBP", quality=quality, method=4)
        else:
            resized.save(out_path, format="JPEG", quality=quality, optimize=True)
        outputs[name] = {
            "path": out_path,
            "width": target_width,
            "height": target_height,
            "bytes": os.path.getsize(out_path),
        }

    return {"source": equirect_path, "outputs": outputs}


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Genera poster/preview/thumbnail desde el master.")
    parser.add_argument("image", help="Ruta al panorama equirectangular master.")
    parser.add_argument("out_dir", help="Directorio de salida.")
    parser.add_argument("--format", dest="fmt", choices=["webp", "jpg"], default="webp")
    parser.add_argument("--quality", type=int, default=85)
    return parser


def main(argv: List[str] = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    result = generate_previews(args.image, args.out_dir, fmt=args.fmt, quality=args.quality)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
