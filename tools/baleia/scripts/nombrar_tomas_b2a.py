"""Renombra las 15 panoramicas de la unidad A a las claves del recorrido.

`integrate_panoramas.py` mapea cada archivo a una escena por el **nombre**:
`{CLAVE}_{NN}.jpg`. Este script pone esos nombres a la entrega cruda de la
sesion del 2026-09-02 (Insta360 X5, ya pasada por `stitch_insp.py`).

El orden de la historia **no** es el orden en que se fotografio: la camara fue
saltando entre ambientes. El recorrido empieza afuera, entra por la galeria,
recorre la planta alta, baja y termina en los banos.

La asignacion se hizo mirando las panoramicas una por una. **Conviene
revisarla**: distinguir un dormitorio vacio de otro por una foto 360 es
ambiguo, y los tres banos son parecidos entre si.

Uso:
    python scripts/nombrar_tomas_b2a.py <carpeta-stitcheada> <carpeta-salida>
"""

from __future__ import annotations

import os
import shutil
import sys

# sufijo del archivo original -> (clave del recorrido, que se ve en la toma)
MAPEO: dict[str, tuple[str, str]] = {
    "_021": ("B2-A_LLEGADA",         "exterior, el frente del bloque y el terreno"),
    "_012": ("B2-A_GALERIA",         "galeria techada, vista abierta al paisaje"),
    "_009": ("B2-A_LIVING",          "living/comedor con la cocina al fondo"),
    "_010": ("B2-A_COCINA",          "cocina de cerca: mesada negra, campana"),
    "_023": ("B2-A_LIVING-ESCALERA", "living con el arranque de la escalera"),
    "_011": ("B2-A_LIVING-TERRAZA",  "living mirando a los ventanales"),
    "_017": ("B2-A_TERRAZA",         "terraza, piso de hormigon"),
    "_014": ("B2-A_ESCALERA",        "pasillo con la escalera al fondo"),
    "_020": ("B2-A_DORM-01",         "dormitorio con ventanal a la terraza"),
    "_022": ("B2-A_DORM-02",         "dormitorio con placard negro"),
    "_015": ("B2-A_DORM-03",         "ambiente vacio con puerta y ventanal"),
    "_019": ("B2-A_VESTIDOR",        "vestidor, placard negro"),
    "_016": ("B2-A_BANO-01",         "bano con ducha y mampara de vidrio"),
    "_013": ("B2-A_BANO-02",         "bano con bacha de apoyo redonda"),
    "_018": ("B2-A_BANO-03",         "bano con bidet e inodoro"),
}


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2

    entrada, destino = argv[0], argv[1]
    os.makedirs(destino, exist_ok=True)

    archivos = sorted(f for f in os.listdir(entrada) if f.lower().endswith(".jpg"))
    usados: set[str] = set()
    sin_mapear: list[str] = []

    for f in archivos:
        base = os.path.splitext(f)[0]
        clave = None
        for sufijo, (k, _) in MAPEO.items():
            if base.endswith(sufijo):
                clave = k
                break
        if clave is None:
            sin_mapear.append(f)
            continue
        nuevo = f"{clave}_01.jpg"
        shutil.copy2(os.path.join(entrada, f), os.path.join(destino, nuevo))
        usados.add(clave)
        print(f"  {f}  ->  {nuevo}")

    faltan = {k for k, _ in MAPEO.values()} - usados
    print(f"\n{len(usados)} de {len(MAPEO)} escenas nombradas -> {destino}")
    if sin_mapear:
        print("Sin mapear (no entran al recorrido con nombre):")
        for f in sin_mapear:
            print("  - " + f)
    if faltan:
        print("Claves del recorrido sin archivo:")
        for k in sorted(faltan):
            print("  - " + k)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
