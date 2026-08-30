"""
Detecta automaticamente la posicion (centroide en pixeles) de las etiquetas
de letra "A", "D", "E", "F", "G" impresas en verde oscuro sobre el masterplan
(pagina 6), a partir de out/ref/p06_ref-06.png (render a 150dpi generado por
pdftoppm -r 150 -f 6 -l 6).

El texto de esas letras y el de la leyenda inferior ("A: ACCESO D: PISCINA...")
comparten el mismo color verde oscuro (~RGB 60,96,72). Se detectan todas las
componentes conexas de ese color en la mitad inferior de la pagina (donde esta
el plano) y se toman las primeras 5 (mayor area, ubicadas sobre el plano, antes
de la fila de leyenda que aparece mas abajo con muchas letras chicas repetidas).

Este script documenta como se obtuvieron las constantes ANCHORS_150DPI que
extract_geometry.py usa como anclas para desambiguar los blobs de amenities
(varios edificios/piletas comparten color, la letra es la unica forma de saber
cual es cual). No se "adivinaron" a mano: son centroides de deteccion por color.
"""
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
REF_PATH = ROOT / "out/ref/p06_ref-06.png"

LABEL_COLOR = np.array([60, 96, 72])  # RGB


def main():
    img = cv2.imread(str(REF_PATH))  # BGR
    if img is None:
        raise SystemExit(f"Falta {REF_PATH}. Correr: pdftoppm -png -r 150 -f 6 -l 6 src/baleia_brochure-v6.pdf out/ref/p06_ref")
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype(np.int16)
    dist = np.abs(rgb - LABEL_COLOR).sum(axis=2)
    mask = (dist < 30).astype(np.uint8) * 255
    mask[:900, :] = 0  # descarta el header de texto arriba

    n, labels, stats, centroids = cv2.connectedComponentsWithStats(mask, connectivity=8)
    comps = [(i, stats[i], centroids[i]) for i in range(1, n) if 300 < stats[i][4] < 2000]
    # descarta la fila de leyenda inferior (y > ~2000 en esta imagen de 2250 alto)
    comps = [c for c in comps if c[2][1] < 1900]
    comps.sort(key=lambda c: -c[1][4])
    top5 = comps[:5]
    # ordenar por X para que la lectura sea estable
    top5.sort(key=lambda c: c[2][0])

    print("ANCHORS_150DPI detectados (x, y):")
    for i, st, ce in top5:
        print(f"  area={st[4]:5d} centroid=({ce[0]:.0f}, {ce[1]:.0f})")


if __name__ == "__main__":
    main()
