"""Orquestador: valida -> genera tiles -> genera previews, y deja todo
listo en la estructura de carpetas para subir a R2:

  /t/{tenant}/{proyecto}/v{N}/scenes/{slug}/
    tiles/{cara}/{nivel}/{fila}_{columna}.{ext}
    tiles/tiles.json
    poster.{ext}
    preview.{ext}
    thumbnail.{ext}
    validation.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any, Dict, List

from .preview import generate_previews
from .tiles import generate_tiles
from .validate import validate_panorama


def build_scene_path(out_root: str, tenant: str, project: str, version: int, slug: str) -> str:
    return os.path.join(out_root, "t", tenant, project, f"v{version}", "scenes", slug)


def run_pipeline(
    equirect_path: str,
    out_root: str,
    tenant: str,
    project: str,
    version: int,
    slug: str,
    face_size: int = None,
    tile_size: int = 512,
    fmt: str = "webp",
    min_width: int = 4096,
    skip_validation: bool = False,
    strict_horizon: bool = False,
) -> Dict[str, Any]:
    scene_dir = build_scene_path(out_root, tenant, project, version, slug)
    os.makedirs(scene_dir, exist_ok=True)

    validation = validate_panorama(
        equirect_path, min_width=min_width, strict_horizon=strict_horizon
    )
    with open(os.path.join(scene_dir, "validation.json"), "w", encoding="utf-8") as f:
        json.dump(validation, f, indent=2, ensure_ascii=False)

    if not validation["approved"] and not skip_validation:
        return {
            "ok": False,
            "stage": "validate",
            "validation": validation,
            "scene_dir": scene_dir,
        }

    tiles_dir = os.path.join(scene_dir, "tiles")
    tiles_result = generate_tiles(
        equirect_path,
        tiles_dir,
        face_size=face_size,
        tile_size=tile_size,
        fmt=fmt,
        base=f"/t/{tenant}/{project}/v{version}/scenes/{slug}/tiles",
    )

    previews_result = generate_previews(equirect_path, scene_dir, fmt=fmt)

    manifest = {
        "tenant": tenant,
        "project": project,
        "version": version,
        "slug": slug,
        "scene_dir": scene_dir,
        "validation": validation,
        "tiles": tiles_result,
        "previews": previews_result,
    }
    with open(os.path.join(scene_dir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    return {"ok": True, "scene_dir": scene_dir, "manifest": manifest}


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Orquesta validacion + tiles + preview para un panorama, dejando la estructura lista para R2."
    )
    parser.add_argument("image", help="Ruta al panorama equirectangular.")
    parser.add_argument("out_root", help="Carpeta raiz de salida (equivalente a la raiz del bucket R2).")
    parser.add_argument("--tenant", required=True)
    parser.add_argument("--project", required=True)
    parser.add_argument("--version", type=int, required=True)
    parser.add_argument("--slug", required=True, help="Slug de la escena.")
    parser.add_argument("--face-size", type=int, default=None)
    parser.add_argument("--tile-size", type=int, default=512)
    parser.add_argument("--format", dest="fmt", choices=["webp", "jpg"], default="webp")
    parser.add_argument("--min-width", type=int, default=4096)
    parser.add_argument(
        "--skip-validation",
        action="store_true",
        help="Continuar con tiles/preview aunque la validacion rechace el panorama.",
    )
    parser.add_argument("--strict-horizon", action="store_true")
    return parser


def main(argv: List[str] = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    result = run_pipeline(
        args.image,
        args.out_root,
        tenant=args.tenant,
        project=args.project,
        version=args.version,
        slug=args.slug,
        face_size=args.face_size,
        tile_size=args.tile_size,
        fmt=args.fmt,
        min_width=args.min_width,
        skip_validation=args.skip_validation,
        strict_horizon=args.strict_horizon,
    )
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
