"""Genera un panorama equirectangular sintetico 2:1 con:
  - Grilla de referencia (lineas cada N grados de yaw/pitch).
  - Marcas de yaw (0/90/180/270) y pitch (-90/0/+90) etiquetadas.
  - Franjas de color distintas por cuadrante para reconocer orientacion
    a simple vista al mirar los tiles generados.

Sirve para probar el pipeline completo (validate -> tiles -> preview -> run)
sin depender de material real del cliente.
"""
from __future__ import annotations

import argparse
import sys
from typing import List

from PIL import Image, ImageDraw, ImageFont

DEFAULT_WIDTH = 8192


def _get_font(size: int):
    try:
        return ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", size)
    except Exception:
        return ImageFont.load_default()


def make_test_pano(width: int = DEFAULT_WIDTH) -> Image.Image:
    height = width // 2
    img = Image.new("RGB", (width, height), (30, 30, 40))
    draw = ImageDraw.Draw(img)

    # Franjas de color por cuadrante de yaw (0-90-180-270) para reconocer
    # orientacion de un vistazo.
    quadrant_colors = [
        (200, 80, 80),   # 0-90    front/right-ish
        (80, 160, 80),   # 90-180
        (80, 100, 200),  # 180-270
        (200, 180, 60),  # 270-360
    ]
    quad_w = width // 4
    for i, color in enumerate(quadrant_colors):
        draw.rectangle([i * quad_w, 0, (i + 1) * quad_w, height], fill=color)

    # Grilla: lineas cada 15 grados de yaw (verticales) y cada 15 grados de
    # pitch (horizontales).
    grid_color = (255, 255, 255)
    for yaw_deg in range(0, 360, 15):
        x = int(width * yaw_deg / 360)
        line_width = 4 if yaw_deg % 90 == 0 else 1
        draw.line([(x, 0), (x, height)], fill=grid_color, width=line_width)

    for pitch_deg in range(-90, 91, 15):
        y = int(height * (pitch_deg + 90) / 180)
        line_width = 4 if pitch_deg == 0 else 1
        draw.line([(0, y), (width, y)], fill=grid_color, width=line_width)

    # Etiquetas de yaw en el ecuador (pitch=0, y=height/2)
    font_size = max(24, width // 120)
    font = _get_font(font_size)
    equator_y = height // 2
    for yaw_deg in range(0, 360, 30):
        x = int(width * yaw_deg / 360)
        label = f"yaw {yaw_deg}"
        draw.text((x + 6, equator_y + 6), label, fill=(0, 0, 0), font=font, stroke_width=2, stroke_fill=(255, 255, 255))

    # Etiquetas de pitch en el meridiano central (yaw=0/180, x=0 y x=width/2)
    for pitch_deg in (-90, -60, -30, 0, 30, 60, 90):
        y = int(height * (pitch_deg + 90) / 180)
        label = f"pitch {pitch_deg}"
        draw.text((6, y + 4), label, fill=(0, 0, 0), font=font, stroke_width=2, stroke_fill=(255, 255, 255))

    # Marcadores de polos (arriba/abajo) con circulos concentricos, para
    # detectar distorsion en las caras up/down del cubemap.
    for cy, tag in ((0, "UP"), (height, "DOWN")):
        for r in range(20, 200, 40):
            bbox = [width // 2 - r, max(0, cy - r) if cy == 0 else cy - r, width // 2 + r, cy + r]
            draw.ellipse(bbox, outline=(255, 255, 0), width=3)
        draw.text((width // 2 - 40, min(max(cy, 10), height - 30)), tag, fill=(255, 255, 0), font=font)

    # Marco exterior + texto de identificacion
    draw.rectangle([0, 0, width - 1, height - 1], outline=(0, 0, 0), width=6)
    draw.text(
        (width // 2 - 150, height - font_size - 20),
        f"TEST PANO {width}x{height}",
        fill=(255, 255, 255),
        font=font,
        stroke_width=2,
        stroke_fill=(0, 0, 0),
    )

    return img


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Genera un panorama equirectangular sintetico 2:1 para pruebas.")
    parser.add_argument("out_path", help="Ruta de salida (jpg/png/webp).")
    parser.add_argument("--width", type=int, default=DEFAULT_WIDTH, help=f"Ancho en px (default {DEFAULT_WIDTH}).")
    return parser


def main(argv: List[str] = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    img = make_test_pano(args.width)
    img.save(args.out_path, quality=92)
    print(args.out_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
