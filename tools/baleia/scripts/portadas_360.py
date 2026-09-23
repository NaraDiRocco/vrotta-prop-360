#!/usr/bin/env python3
"""Genera la portada de cada escena 360.

POR QUE EXISTE: la tarjeta que invita a entrar al 360 mostraba la panoramica
tal cual, que es una equirectangular 2:1. Eso se ve deformado -el techo y el
piso estirados de lado a lado, y los 360 grados enteros aplastados en un
rectangulo-, y la primera impresion de una unidad no puede ser una imagen que
parece rota.

Lo que genera este script es lo que la persona VERIA al entrar: la misma
escena proyectada en perspectiva, con el encuadre inicial de la escena
(`initialView`: yaw, pitch y campo visual). Asi la tarjeta es una promesa
honesta de lo que hay del otro lado.

La fuente es el `poster.webp` de cada escena, que ya se publica y es la
equirectangular a 2048x1024 -de sobra para una tarjeta-.
"""

import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

RAIZ = Path(__file__).resolve().parents[3]
ESCENAS = RAIZ / "apps/viewer/public/baleia/scenes"
MANIFIESTO = RAIZ / "apps/viewer/public/tour.json"
ANCHO, ALTO = 1280, 720  # 16:9, generoso para pantallas retina


def proyectar(equi: np.ndarray, yaw_deg: float, pitch_deg: float, fov_deg: float) -> np.ndarray:
    """Equirectangular -> perspectiva, con muestreo bilineal.

    No es un recorte: un recorte del centro de la equirectangular sigue
    arrastrando la deformacion horizontal. Acá se traza un rayo por pixel de
    salida y se lo va a buscar a la esfera, que es lo mismo que hace el visor
    al dibujar la escena.
    """
    he, we = equi.shape[:2]
    fov = math.radians(fov_deg)
    focal = (ANCHO / 2) / math.tan(fov / 2)

    x = np.arange(ANCHO) - ANCHO / 2 + 0.5
    y = np.arange(ALTO) - ALTO / 2 + 0.5
    xx, yy = np.meshgrid(x, y)
    # Camara mirando a +Z, X a la derecha, Y arriba.
    d = np.stack([xx, -yy, np.full_like(xx, focal)], axis=-1)
    d /= np.linalg.norm(d, axis=-1, keepdims=True)

    p, t = math.radians(pitch_deg), math.radians(yaw_deg)
    rx = np.array([[1, 0, 0], [0, math.cos(p), -math.sin(p)], [0, math.sin(p), math.cos(p)]])
    ry = np.array([[math.cos(t), 0, math.sin(t)], [0, 1, 0], [-math.sin(t), 0, math.cos(t)]])
    # Se aplana a (N,3) antes de multiplicar: la forma 3D x 2D dispara avisos
    # espurios de BLAS en macOS -divide by zero, overflow- con un resultado
    # que igual es correcto. Un aviso que no significa nada enseña a ignorar
    # los avisos, así que mejor no provocarlo.
    forma = d.shape
    d = (d.reshape(-1, 3) @ rx.T @ ry.T).reshape(forma)

    lon = np.arctan2(d[..., 0], d[..., 2])
    lat = np.arcsin(np.clip(d[..., 1], -1, 1))
    u = (lon / (2 * math.pi) + 0.5) * we - 0.5
    v = (0.5 - lat / math.pi) * he - 0.5

    u0, v0 = np.floor(u).astype(int), np.floor(v).astype(int)
    fu, fv = (u - u0)[..., None], (v - v0)[..., None]
    # La longitud da la vuelta; la latitud se recorta en los polos.
    iu0, iu1 = u0 % we, (u0 + 1) % we
    iv0, iv1 = np.clip(v0, 0, he - 1), np.clip(v0 + 1, 0, he - 1)
    arriba = equi[iv0, iu0] * (1 - fu) + equi[iv0, iu1] * fu
    abajo = equi[iv1, iu0] * (1 - fu) + equi[iv1, iu1] * fu
    return (arriba * (1 - fv) + abajo * fv).astype(np.uint8)


def main() -> int:
    tour = json.loads(MANIFIESTO.read_text(encoding="utf-8"))
    escenas = [s for s in tour["scenes"] if "base" in (s.get("source") or {})]
    hechas = 0
    for s in escenas:
        carpeta = ESCENAS / s["slug"].replace("sc-", "", 1) if not (ESCENAS / s["slug"]).exists() else ESCENAS / s["slug"]
        origen = carpeta / "poster.webp"
        if not origen.exists():
            print(f"  ! {s['slug']}: no encuentro {origen.relative_to(RAIZ)}")
            continue
        vista = s.get("initialView") or {}
        equi = np.asarray(Image.open(origen).convert("RGB"), dtype=np.float32)
        salida = proyectar(equi, vista.get("yaw", 0.0), vista.get("pitch", 0.0), vista.get("fov", 90))
        img = Image.fromarray(salida)
        img.save(carpeta / "portada.webp", "WEBP", quality=82, method=6)
        img.resize((400, 225), Image.LANCZOS).save(carpeta / "portada.thumb.webp", "WEBP", quality=80, method=6)
        hechas += 1
        print(f"  {s['slug']}: yaw {vista.get('yaw',0)} pitch {vista.get('pitch',0)} fov {vista.get('fov',90)} -> portada.webp")
    print(f"\n{hechas} de {len(escenas)} escenas con portada.")
    return 0 if hechas == len(escenas) else 1


if __name__ == "__main__":
    sys.exit(main())
