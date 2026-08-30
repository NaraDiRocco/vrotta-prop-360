"""
Baleia — arma el CSV de unidades comerciales (Bloque 2 y Bloque 3) a partir
del texto de las paginas de planos individuales del brochure
(src/baleia_brochure-v6.pdf, paginas 13-19 y 23-29).

Por que esta hardcodeado y no "parseado 100% automatico":
pdfplumber.extract_text() devuelve el texto en el orden de lectura del PDF,
que en las paginas de unidades dobles (dos plantas por pagina, ej. UNIDAD F
+ UNIDAD G) intercala las dos columnas de forma no trivial (a veces
izquierda-primero, a veces no), y NO imprime a que unidad corresponde cada
numero salvo por la posicion relativa en la pagina. Parsear eso a ciegas con
regex es fragil y puede pegarle los m2 de una unidad a la otra sin ningun
error visible.

En su lugar, cada valor de este diccionario fue tomado leyendo el texto
extraido de cada pagina (ver scripts/dump_unit_pages.py) y verificado
sumando manualmente: cubierta + semicub + descub + cochera debe dar
exactamente la "Superficie total" / "PA: ... / PB: ..." que imprime el propio
PDF. Los 20 casos cierran exacto (o con <0.01m2 de redondeo), lo que da
confianza de que la asignacion PA/PB por unidad es correcta. El detalle de
esa verificacion esta en el README (tools/baleia/README.md).

Convención detectada en las unidades de 1 dormitorio con dos plantas por
pagina (Bloque2 F/G, H/I; Bloque3 D/E, F/G, H/I, J/K): la primera unidad
nombrada en el titulo de la pagina es la de planta alta (PA) y la segunda la
de planta baja (PB) — se verifico en los 6 pares que la suma de superficies
de la PRIMERA columna de datos siempre cierra contra el "PA: Xm2" impreso, y
la SEGUNDA columna contra "PB: Ym2".
"""
import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_CSV = ROOT / "out" / "baleia_unidades.csv"

CSV_COLUMNS = [
    "codigo_unidad", "tipologia", "superficie_cubierta_m2", "superficie_total_m2",
    "estado", "precio", "moneda", "mostrar_precio_publico", "financiacion",
    "bloque_o_piso", "orientacion", "notas_internas",
]


def duplex(code, bloque, page, cubierta_pa, cubierta_pb, semicub_pa, semicub_pb,
           descub_pa, descub_pb, cochera, total):
    cubierta = round(cubierta_pa + cubierta_pb, 2)
    check = round(cubierta + semicub_pa + semicub_pb + descub_pa + descub_pb + cochera, 2)
    assert abs(check - total) < 0.02, f"{code}: suma {check} != total {total}"
    notas = (
        f"Fuente: brochure pag.{page}. Duplex 2 plantas. "
        f"Cubierta PA {cubierta_pa}m2 + PB {cubierta_pb}m2 = {cubierta}m2. "
        f"Semicubierta PA {semicub_pa}m2 + PB {semicub_pb}m2 = {round(semicub_pa+semicub_pb,2)}m2. "
        f"Descubierto PA {descub_pa}m2 + PB {descub_pb}m2 = {round(descub_pa+descub_pb,2)}m2. "
        f"Cochera {cochera}m2. Sin datos de dormitorios/orientacion/precio en el brochure."
    )
    return {
        "codigo_unidad": code,
        "tipologia": "Dúplex",
        "superficie_cubierta_m2": cubierta,
        "superficie_total_m2": total,
        "estado": "",
        "precio": "",
        "moneda": "",
        "mostrar_precio_publico": "",
        "financiacion": "",
        "bloque_o_piso": bloque,
        "orientacion": "",
        "notas_internas": notas,
    }


def un_dorm(code, bloque, page, planta, cubierta, semicub, descub, cochera, total):
    check = round(cubierta + semicub + descub + cochera, 2)
    assert abs(check - total) < 0.02, f"{code}: suma {check} != total {total}"
    notas = (
        f"Fuente: brochure pag.{page}. Planta {planta}. "
        f"Cubierta {cubierta}m2, semicubierta {semicub}m2, descubierto {descub}m2, "
        f"cochera {cochera}m2. Sin datos de orientacion/precio en el brochure."
    )
    return {
        "codigo_unidad": code,
        "tipologia": "1 dormitorio",
        "superficie_cubierta_m2": cubierta,
        "superficie_total_m2": total,
        "estado": "",
        "precio": "",
        "moneda": "",
        "mostrar_precio_publico": "",
        "financiacion": "",
        "bloque_o_piso": bloque,
        "orientacion": "",
        "notas_internas": notas,
    }


def build_rows():
    rows = []

    # ---------- BLOQUE 2 (paginas 13-19): 5 duplex (A-E) + 4 de 1 dorm (F-I)
    rows.append(duplex("B2-A", "Bloque 2", 13, 55.15, 54.53, 18.61, 14.65, 12.20, 8.28, 12.50, 175.92))
    rows.append(duplex("B2-B", "Bloque 2", 14, 54.30, 53.46, 18.35, 14.37, 11.90, 8.12, 12.50, 173.00))
    rows.append(duplex("B2-C", "Bloque 2", 15, 54.30, 53.46, 18.35, 14.37, 11.90, 8.12, 12.50, 173.00))
    rows.append(duplex("B2-D", "Bloque 2", 16, 54.30, 53.46, 18.35, 14.37, 11.90, 8.12, 12.50, 173.00))
    rows.append(duplex("B2-E", "Bloque 2", 17, 54.30, 53.46, 18.35, 14.37, 11.90, 8.12, 12.50, 173.00))
    rows.append(un_dorm("B2-F", "Bloque 2", 18, "alta (PA)", 54.15, 18.40, 11.90, 12.50, 96.95))
    rows.append(un_dorm("B2-G", "Bloque 2", 18, "baja (PB)", 60.05, 14.33, 8.12, 12.50, 95.00))
    rows.append(un_dorm("B2-H", "Bloque 2", 19, "alta (PA)", 52.62, 17.76, 11.52, 12.50, 94.40))
    rows.append(un_dorm("B2-I", "Bloque 2", 19, "baja (PB)", 52.62, 13.87, 7.86, 12.50, 86.85))

    # ---------- BLOQUE 3 (paginas 23-29): 3 duplex (A-C) + 8 de 1 dorm (D-K)
    rows.append(duplex("B3-A", "Bloque 3", 23, 55.15, 54.53, 18.61, 14.65, 12.20, 8.28, 12.50, 175.92))
    rows.append(duplex("B3-B", "Bloque 3", 24, 54.30, 53.46, 18.35, 14.37, 11.90, 8.12, 12.50, 173.00))
    rows.append(duplex("B3-C", "Bloque 3", 25, 54.30, 53.46, 18.35, 14.37, 11.90, 8.12, 12.50, 173.00))
    rows.append(un_dorm("B3-D", "Bloque 3", 26, "alta (PA)", 56.90, 15.25, 11.27, 12.50, 95.92))
    rows.append(un_dorm("B3-E", "Bloque 3", 26, "baja (PB)", 67.60, 18.52, 8.28, 12.50, 106.90))
    rows.append(un_dorm("B3-F", "Bloque 3", 27, "alta (PA)", 56.90, 15.25, 11.27, 12.50, 95.92))
    rows.append(un_dorm("B3-G", "Bloque 3", 27, "baja (PB)", 55.00, 14.33, 8.12, 12.50, 89.94))
    rows.append(un_dorm("B3-H", "Bloque 3", 28, "alta (PA)", 56.90, 15.25, 11.27, 12.50, 95.92))
    rows.append(un_dorm("B3-I", "Bloque 3", 28, "baja (PB)", 55.00, 14.33, 8.12, 12.50, 89.94))
    rows.append(un_dorm("B3-J", "Bloque 3", 29, "alta (PA)", 56.90, 15.25, 11.27, 12.50, 95.92))
    rows.append(un_dorm("B3-K", "Bloque 3", 29, "baja (PB)", 67.60, 18.52, 8.28, 12.50, 106.90))

    return rows


def main():
    rows = build_rows()
    assert len(rows) == 20, f"se esperaban 20 unidades, hay {len(rows)}"
    codes = [r["codigo_unidad"] for r in rows]
    assert len(codes) == len(set(codes)), "codigo_unidad duplicado"

    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        for r in rows:
            writer.writerow(r)

    print(f"Escritas {len(rows)} unidades en {OUT_CSV}")


if __name__ == "__main__":
    main()
