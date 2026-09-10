#!/usr/bin/env python3
"""Reaplica la capa comercial sobre out/baleia_unidades.csv.

Por que existe este script
--------------------------
`build_units_csv.py` deriva del brochure vectorial lo unico que el brochure
trae: codigos, tipologias y superficies. Las columnas `estado`, `precio`,
`moneda`, `mostrar_precio_publico` y `financiacion` quedan vacias a proposito
(ver README.md seccion 3): no estan en el brochure.

Ese dato aparecio despues, en septiembre 2026, en la lista de precios de
Caetano Negocios Inmobiliarios, y hasta ahora se cargaba **a mano** sobre el
CSV generado. Como `out/` esta gitignoreado, esa edicion manual se perdio al
migrar de maquina y hubo que reconstruirla. Este script existe para que no
vuelva a pasar: la fuente de verdad es
`apps/viewer/public/baleia/availability.json`, que es el mismo archivo que
consume el visor, y de ahi se derivan estado y precio.

Uso
---
    python3 scripts/build_units_csv.py        # genera el CSV base
    python3 scripts/apply_commercial_data.py  # le aplica la capa comercial

Que NO hace
-----------
- No toca Bloque 3: sus unidades siguen sin `estado` en el CSV, para que el
  operador elija el default al importar (hoy "proximamente" en el visor).
- No inventa datos: si una unidad no esta en availability.json, la deja como
  esta y lo avisa.
"""

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "out" / "baleia_unidades.csv"
AVAILABILITY_PATH = (
    ROOT.parent.parent / "apps" / "viewer" / "public" / "baleia" / "availability.json"
)

# Cochera: el brochure la cobra aparte, USD 10.000 fijo. La lista de precios
# mide "superficie total" SIN cochera, mientras que build_units_csv.py la suma.
# Se corrige solo donde el resultado calza EXACTO contra la lista de precios
# (7 de 9 unidades); B2-H y B2-I estan vendidas y el brochure no publica sus
# m2, asi que no hay contra que verificar y se dejan con el criterio original.
# Ver README.md seccion 3.1.
COCHERA_M2 = 12.5
AJUSTAR_SUPERFICIE = {"B2-A", "B2-B", "B2-C", "B2-D", "B2-E", "B2-F", "B2-G"}

FINANCIACION = (
    "50% anticipo + 12 cuotas mensuales al 6% anual. "
    "Gastos de ocupacion 4% aparte. Entrega diciembre 2026. "
    "Precios sujetos a modificacion sin previo aviso."
)


def main() -> None:
    if not CSV_PATH.exists():
        raise SystemExit(
            f"No existe {CSV_PATH}.\nCorre antes: python3 scripts/build_units_csv.py"
        )
    if not AVAILABILITY_PATH.exists():
        raise SystemExit(f"No existe {AVAILABILITY_PATH} (deberia venir con el repo).")

    availability = json.loads(AVAILABILITY_PATH.read_text(encoding="utf-8"))["units"]

    with CSV_PATH.open(encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        fieldnames = reader.fieldnames or []
        rows = list(reader)

    tocadas, sin_dato = 0, []

    for row in rows:
        codigo = row["codigo_unidad"]

        # Bloque 3 y cualquier cosa que no sea Bloque 2: no se toca.
        if not codigo.startswith("B2-"):
            continue

        info = availability.get(codigo)
        if info is None:
            sin_dato.append(codigo)
            continue

        row["estado"] = info["s"]

        precio = info.get("p")
        if precio:
            # Solo se publica precio de lo que esta a la venta. Una unidad
            # vendida o bloqueada no publica precio (README seccion 3.2).
            row["precio"] = f"{precio['a']:.0f}"
            row["moneda"] = precio["c"]
            row["mostrar_precio_publico"] = "SI"
        else:
            row["precio"] = ""
            row["moneda"] = ""
            row["mostrar_precio_publico"] = ""

        row["financiacion"] = FINANCIACION

        if codigo in AJUSTAR_SUPERFICIE:
            total_con_cochera = float(row["superficie_total_m2"])
            row["superficie_total_m2"] = f"{total_con_cochera - COCHERA_M2:.2f}"

        tocadas += 1

    with CSV_PATH.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Capa comercial aplicada a {tocadas} unidades de Bloque 2 en {CSV_PATH}")
    print(f"Fuente: {AVAILABILITY_PATH.name} (generado {json.loads(AVAILABILITY_PATH.read_text(encoding='utf-8'))['generated_at']})")
    if sin_dato:
        print(f"AVISO: sin dato en availability.json, quedaron sin tocar: {', '.join(sin_dato)}")


if __name__ == "__main__":
    main()
