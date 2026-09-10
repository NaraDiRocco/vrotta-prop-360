# Unidad A (207) — Dúplex 2 dormitorios · cotas de referencia

Fuente: `Baleia/Copia de Baleia prueba brochure (1).pdf`, p.10 (300 DPI).
Las cotas están rotuladas dentro del raster del plano, **no** en el texto del
PDF: se leyeron visualmente. No hay CAD del proyecto (ni `.dwg` ni `.dxf`).

**"Unidad A" = UNIDAD 207 del brochure.** La identificación se hizo
comparando con el axonométrico `unidad-A-plano-3D-minimalista.png`, que
coincide planta por planta. Las letras A-I de esa carpeta **no** mapean a
201-209 en orden alfabético — no asumir el mapeo para las otras unidades.

> **Los axonométricos 3D de `Baleia ia/` NO son referencia de modelado.**
> Son trabajo previo del autor del proyecto. La única fuente geométrica válida
> son los **planos 2D acotados** del brochure, extraídos a 900 DPI en
> `planos/A-207-PA.png` y `planos/A-207-PB.png`.

## Superficies (brochure, oficiales)

| Concepto | m² |
|---|---|
| Cubierta | 109.68 |
| Semicubierta | 33.26 |
| Descubierta | 20.48 |
| Cochera | 12.50 |
| **Total** | **175.92** |

Cubierta 109.68 m² repartida en dos plantas ≈ **54.8 m² por planta**.

## Planta Alta (PA) — acceso, día

| Ambiente | Cotas (m) |
|---|---|
| Living-Comedor | 6.05 × 4.31 |
| Hall (con escalera) | 4.70 × 3.07 |
| Cocina | 3.73 × 2.90 |
| Baño (toilette) | 1.76 × 1.02 |
| Terraza | 6.28 × 3.62 |
| Cochera "E" (exterior) | 2.50 × 5.00 |

## Planta Baja (PB) — noche

| Ambiente | Cotas (m) |
|---|---|
| Dormitorio principal | 5.31 × 2.90 |
| Dormitorio 2 | 4.16 × 2.87 |
| Vestidor | 3.95 × 1.71 |
| Baño | 2.80 × 1.41 |
| Baño-Lavadero | 2.80 × 2.50 |
| Pasillo | 3.23 × 1.00 |
| Terraza | 6.34 × 3.57 |

## Envolvente derivada

El ancho de terraza (6.28 PA / 6.34 PB) fija el **ancho exterior ≈ 6.3 m**.
Con 54.8 m² cubiertos por planta y ~6.05 m de luz interior, el **largo
cubierto ≈ 9.1 m**. La unidad es un rectángulo alargado perpendicular al mar,
con la terraza en el extremo **este** (fachada vidriada al horizonte).

## Lo que las cotas NO dicen

Hay que decidirlo al modelar y **marcarlo como supuesto**, no como dato:

- Altura libre de piso a techo (se asume **2.60 m**) y espesor de losa (0.25 m).
- Espesor de muros: exterior 0.20 m, interior 0.10 m (lectura del grafismo).
- Altura de antepechos, cotas de ventanas y anchos de puertas.
- La pendiente real del terreno entre bloques escalonados.

## Restricción que manda sobre todo el modelo

De `07-BALEIA-360/4-Especificacion-Tecnica-Baleia.md`: cámara a **1.60 m**,
equirectangular **8192 × 4096** mínimo, **2:1 exacto**, pitch 0, y el centro
horizontal de la panorámica **mirando al mar (este)**. El modelo tiene que
orientarse con **+X = este = mar** para que esa regla salga sola del render.
