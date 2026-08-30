"""Validacion de un panorama equirectangular antes de procesarlo.

Chequeos:
  1. Relacion de aspecto exacta 2:1 (tolerancia configurable en px).
  2. Resolucion minima de ancho (default 4096 px).
  3. Heuristica de "horizonte torcido": ubica el borde de mayor contraste
     dentro de una banda central de la imagen y compara su altura en el
     extremo izquierdo vs. el extremo derecho, reportando la diferencia
     en grados de inclinacion equivalente. Es una heuristica: no hay
     garantia de que el borde de mayor contraste sea el horizonte real,
     por eso el veredicto de este check nunca por si solo rechaza el
     panorama salvo que se supere un umbral generoso.

Salida: JSON con veredicto por check + resumen APROBADO/RECHAZADO.
Exit code 0 si aprueba, 1 si rechaza.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass, field
from typing import Any, Dict, List

import numpy as np
from PIL import Image

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------

DEFAULT_MIN_WIDTH = 4096
ASPECT_TOLERANCE_PX = 2  # tolerancia sobre |width - 2*height|
# Umbral de inclinacion (grados) por encima del cual la heuristica de
# horizonte torcido marca advertencia. No rechaza el panorama por si sola
# porque es una heuristica, salvo que se pase --strict-horizon.
HORIZON_WARN_DEG = 1.5


@dataclass
class CheckResult:
    name: str
    passed: bool
    details: Dict[str, Any] = field(default_factory=dict)
    heuristic: bool = False


def check_aspect_ratio(width: int, height: int, tolerance_px: int = ASPECT_TOLERANCE_PX) -> CheckResult:
    expected_height = width / 2.0
    diff = abs(height - expected_height)
    passed = diff <= tolerance_px
    return CheckResult(
        name="aspect_ratio_2_1",
        passed=passed,
        details={
            "width": width,
            "height": height,
            "expected_height": expected_height,
            "diff_px": diff,
            "tolerance_px": tolerance_px,
        },
    )


def check_min_resolution(width: int, min_width: int = DEFAULT_MIN_WIDTH) -> CheckResult:
    return CheckResult(
        name="min_resolution",
        passed=width >= min_width,
        details={"width": width, "min_width": min_width},
    )


def _horizon_row_at_column(gray_col: np.ndarray) -> int:
    """Devuelve el indice de fila con mayor gradiente vertical de intensidad
    dentro de la columna dada (proxy de "borde de mayor contraste")."""
    grad = np.abs(np.diff(gray_col.astype(np.float64)))
    return int(np.argmax(grad))


def check_crooked_horizon(
    img_gray: np.ndarray,
    band_frac: float = 0.5,
    sample_frac: float = 0.02,
    warn_deg: float = HORIZON_WARN_DEG,
) -> CheckResult:
    """Heuristica de horizonte torcido.

    Se toma una banda central (band_frac de la altura total, centrada) y se
    busca en columnas cerca del extremo izquierdo y del extremo derecho el
    borde de mayor contraste (mayor gradiente vertical de intensidad). La
    diferencia de altura entre ambos extremos se convierte a un angulo en
    grados usando el ancho total de la imagen como base.

    Esto es una HEURISTICA: asume que el borde mas marcado dentro de la
    banda central corresponde al horizonte real, lo cual puede ser falso en
    escenas con objetos de alto contraste (columnas, muebles, etc.).
    """
    height, width = img_gray.shape
    band_h = max(2, int(height * band_frac))
    band_top = (height - band_h) // 2
    band = img_gray[band_top : band_top + band_h, :]

    sample_w = max(1, int(width * sample_frac))

    left_cols = band[:, :sample_w]
    right_cols = band[:, width - sample_w :]

    left_rows = [_horizon_row_at_column(left_cols[:, c]) for c in range(left_cols.shape[1])]
    right_rows = [_horizon_row_at_column(right_cols[:, c]) for c in range(right_cols.shape[1])]

    left_row = float(np.median(left_rows)) + band_top
    right_row = float(np.median(right_rows)) + band_top

    delta_px = right_row - left_row
    angle_deg = math.degrees(math.atan2(delta_px, width))

    passed = abs(angle_deg) <= warn_deg
    return CheckResult(
        name="crooked_horizon",
        passed=passed,
        heuristic=True,
        details={
            "left_edge_row": left_row,
            "right_edge_row": right_row,
            "delta_px": delta_px,
            "tilt_deg": round(angle_deg, 3),
            "warn_threshold_deg": warn_deg,
            "note": (
                "Heuristica basada en el borde de mayor contraste en la banda "
                "central; no garantiza deteccion del horizonte real."
            ),
        },
    )


def validate_panorama(
    path: str,
    min_width: int = DEFAULT_MIN_WIDTH,
    aspect_tolerance_px: int = ASPECT_TOLERANCE_PX,
    horizon_warn_deg: float = HORIZON_WARN_DEG,
    strict_horizon: bool = False,
) -> Dict[str, Any]:
    img = Image.open(path)
    img = img.convert("RGB")
    width, height = img.size

    checks: List[CheckResult] = []
    checks.append(check_aspect_ratio(width, height, aspect_tolerance_px))
    checks.append(check_min_resolution(width, min_width))

    gray = np.asarray(img.convert("L"))
    checks.append(check_crooked_horizon(gray, warn_deg=horizon_warn_deg))

    # El check de horizonte es heuristico: solo cuenta para el veredicto
    # final si --strict-horizon fue pasado explicitamente.
    blocking_checks = [c for c in checks if not c.heuristic or strict_horizon]
    approved = all(c.passed for c in blocking_checks)

    return {
        "file": path,
        "width": width,
        "height": height,
        "checks": [
            {
                "name": c.name,
                "passed": c.passed,
                "heuristic": c.heuristic,
                "details": c.details,
            }
            for c in checks
        ],
        "strict_horizon": strict_horizon,
        "verdict": "APROBADO" if approved else "RECHAZADO",
        "approved": approved,
    }


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Valida un panorama equirectangular.")
    parser.add_argument("image", help="Ruta al panorama equirectangular (jpg/png/webp).")
    parser.add_argument(
        "--min-width",
        type=int,
        default=DEFAULT_MIN_WIDTH,
        help=f"Ancho minimo requerido en px (default {DEFAULT_MIN_WIDTH}).",
    )
    parser.add_argument(
        "--aspect-tolerance-px",
        type=int,
        default=ASPECT_TOLERANCE_PX,
        help=f"Tolerancia en px para la relacion 2:1 (default {ASPECT_TOLERANCE_PX}).",
    )
    parser.add_argument(
        "--horizon-warn-deg",
        type=float,
        default=HORIZON_WARN_DEG,
        help=f"Umbral en grados para la heuristica de horizonte torcido (default {HORIZON_WARN_DEG}).",
    )
    parser.add_argument(
        "--strict-horizon",
        action="store_true",
        help="Si se pasa, el check heuristico de horizonte torcido puede rechazar el panorama.",
    )
    parser.add_argument(
        "-o",
        "--output",
        help="Ruta opcional para escribir el JSON de resultado (ademas de stdout).",
    )
    return parser


def main(argv: List[str] = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    result = validate_panorama(
        args.image,
        min_width=args.min_width,
        aspect_tolerance_px=args.aspect_tolerance_px,
        horizon_warn_deg=args.horizon_warn_deg,
        strict_horizon=args.strict_horizon,
    )

    output_json = json.dumps(result, indent=2, ensure_ascii=False)
    print(output_json)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output_json)

    return 0 if result["approved"] else 1


if __name__ == "__main__":
    sys.exit(main())
