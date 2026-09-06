# Baleia — extracción de geometría y datos comerciales (piloto real)

Material de partida: `baleia_brochure-v6.pdf` (37 páginas, vectorial) y sus
páginas exportadas a SVG. Foco: página 6 (MASTERPLAN, a color, con letras
A/D/E/F/G) y página 9 (planta de implantación en línea + corte topográfico).

Todo lo generado vive en `out/` (no versionado, ver `.gitignore` del repo —
`out/` y `.venv/` están excluidos globalmente). Para reproducir cualquier
cosa de este documento, corré los pasos de la sección "Cómo reproducir".

## Qué se extrajo

### 1–2. Geometría de los 5 bloques + amenities → GeoJSON

**Resultado:** `out/baleia_hotspots.geojson` — 11 features:
`B1`..`B5` (kind `bloque`), `A`/`D`/`E`/`F`/`G` (kind `amenity`, acceso /
piscina / piscina infantil / rincón de fuego / laguna) y `TERRENO` (kind
`perimetro`). Coordenadas `polygon_px`: pares `[x, y]` normalizados 0..1
sobre el ancho/alto de `out/masterplan/baleia_masterplan_300dpi_recortado.png`
(ver `packages/core/src/types.ts`, tipos `Hotspot`, `GeometryKind`, `Px`).

**Verificación visual:** `out/preview_deteccion_masterplan.png` — el plano
con los 11 polígonos superpuestos y rotulados. **Lo miré y coincide con el
plano real**: los 5 bloques calzan borde a borde con el dibujo (incluyendo
las salientes de balcón, que hacen que el contorno no sea un rectángulo
limpio), A/D/E/F/G están cada uno sobre el elemento correcto, y el perímetro
sigue el límite del terreno (Carlos Páez Vilaró, Ruta 10, los dos retiros
laterales).

**Por qué no se parseó el SVG directamente (se intentó primero):**
`p09.svg` tiene 11.706 `<path>`, pero casi todos son artefactos de la
textura de papel del fondo: 4.153 `<mask>`, 4.409 `<clipPath>` y 5.520
`<feImage>`/`<feBlend>` que `pdftocairo` genera para resolver opacidades y
blends de Illustrator. La geometría real de los bloques queda referenciada
solo a través de esa cadena de filtros de composición, no como paths de
primer nivel: `svgelements` (y `svgpathtools`) solo encuentran 45 `<path>`
"reales" navegando el árbol de render de `p09.svg`, y ninguno es el contorno
de un bloque (podés reproducir esto con `scripts/explore_paths.py
src/svg/p09.svg`). Reventar esa cadena de filtros a mano no es razonable
para un solo plano.

En cambio, como el PDF es 100% vectorial, se lo re-renderizó con
`pdftoppm` a 300dpi (sin pérdida relevante) y se segmentó **por color** con
OpenCV: en el masterplan (p06) los edificios son un tostado sólido, el
agua es celeste sólido y el césped es verde sólido, así que un umbral de
color + componentes conexas + contornos es mucho más confiable que pelear
con `feImage`/`feBlend`. Todo el pipeline está en
`scripts/extract_geometry.py`, con el razonamiento completo en su docstring
y comentarios inline (incluye los dos problemas reales que aparecieron
durante la calibración y cómo se resolvieron):

1. **El blob tostado más grande de todo el plano no es un bloque.** Es el
   edificio de servicios/clubhouse, pegado al sector de piscinas — más
   grande en área que cualquier bloque real. Tomar "los 5 blobs tostados
   más grandes" a secas lo cuela como si fuera un bloque y desplaza al
   verdadero Bloque 1 fuera del top 5. Se filtran los blobs que caen a
   menos de 600px (a escala de imagen de 8000px) de cualquier ancla de
   letra de amenity antes de elegir los 5 bloques.
2. **El sector F ("rincón de fuego") está pintado del mismo tostado sólido
   que el edificio de servicios y la vereda que los conecta** — no hay gap
   de color entre ellos. Ni el cierre morfológico simple ni una
   reconstrucción por dilatación (que termina invadiendo el vecino a través
   del mismo puente) los separan bien. Se probó `cv2.watershed` sobre la
   transformada de distancia (la técnica estándar para separar blobs
   pegados) y **tampoco corta ahí**, porque el "puente" entre clubhouse y F
   no es angosto: es una franja ancha y continua del mismo color. Como
   único fallback documentado, la geometría de F sale de recortar la
   máscara a una caja alrededor del ancla de la letra "F" (calibrada una
   vez a ojo sobre `out/calibration_debug/debug_split_result.png`) y tomar
   el contorno más grande adentro. **Es la única geometría de este
   entregable que no sale de detección de color 100% automática** — el
   resto (B1-B5, A, D, E, G, perímetro) sí.

Las anclas de las letras A/D/E/F/G (usadas para saber cuál blob de color es
cuál amenity, ya que varios comparten color) se detectan automáticamente
por color+conectividad en `scripts/find_label_anchors.py`, no están puestas
a mano — ese script documenta cómo se llega a las coordenadas que
`extract_geometry.py` usa como constantes `ANCHORS_150DPI`.

### 3. Datos comerciales → CSV

**Resultado:** `out/baleia_unidades.csv`, 20 unidades, columnas exactas de
`docs/03-PLANTILLAS-CSV/plantilla-en-blanco.csv`.

- **Bloque 2** (brochure pág. 13-19): 5 dúplex `B2-A`..`B2-E` + 4 de 1
  dormitorio `B2-F`..`B2-I`.
- **Bloque 3** (brochure pág. 23-29): 3 dúplex `B3-A`..`B3-C` + 8 de 1
  dormitorio `B3-D`..`B3-K`.

Superficies (cubierta, semicubierta, descubierta, cochera) transcriptas de
cada página de planos y **verificadas matemáticamente**: el script
(`scripts/build_units_csv.py`) tiene un `assert` por unidad que exige que
`cubierta + semicubierta + descubierta + cochera` cierre contra la
"Superficie total" (dúplex) o "PA: Xm2 / PB: Ym2" (unidades de 1 dormitorio)
que el propio PDF imprime. Los 20 casos cierran exacto — correr
`python3 scripts/build_units_csv.py` falla ruidosamente si algún número no
suma, así que si el script terminó OK, los números están bien transcriptos
del PDF.

La plantilla solo tiene columnas `superficie_cubierta_m2` y
`superficie_total_m2` — no hay columna para semicubierta/descubierto/cochera
por separado. Se respetaron las columnas de la plantilla tal cual (no se
inventaron columnas nuevas) y el detalle discriminado quedó en
`notas_internas`, con la página del brochure de donde salió cada número
para poder auditarlo.

**Dato de nomenclatura para reconciliar con el equipo:** la plantilla del
cliente (`docs/01-CLIENTE/4-Plantilla-Listado-de-Unidades.md`) documenta
`[BLOQUE]-U[número]` (ej. `B1-U03`) como convención para "Complejo", pero
la tarea pidió explícitamente códigos tipo `B2-A`/`B3-K` (letra de unidad,
no número), que además es la nomenclatura que usa el propio brochure
("UNIDAD A", "UNIDAD B"...). Se usó `B2-A`/`B3-K` tal como se pidió. Si el
cliente/equipo comercial insiste en el formato `B2-U01`, es un
find-and-replace trivial sobre la columna `codigo_unidad` — pero hay que
decidirlo antes de que el equipo comercial empiece a usar los códigos, para
que el matching automático con los polígonos del mapa no se rompa.

**Lo que NO está en el brochure vectorial** (columnas `estado`, `precio`,
`moneda`, `mostrar_precio_publico`, `financiacion`, `orientacion` quedaron
vacías a propósito, no inventadas): ver sección siguiente para lo que sí
apareció después, en septiembre 2026.

### 3.1. Datos comerciales REALES de Bloque 2 (septiembre 2026)

`elementos baleia/Baleia prueba brochure (1).pdf` trae dos páginas finales
que no existían en ningún lado del repo hasta esta carga: una lista de
precios real, **"BLOQUE 2 — DISPONIBLE · Entrega Diciembre 2026"**, fechada
septiembre 2026 y firmada por Caetano Negocios Inmobiliarios
(`dcaetano@caetano.com.uy`, `+598 95 559 230`, junto con Dacal Bienes
Raíces). El análisis completo está en
`docs/08-MATERIAL-REAL/README.md`, sección 5 — acá sólo el resultado de
cargarlo al CSV.

**El problema a resolver:** el CSV usa códigos `B2-A`..`B2-I` (letra de
unidad, heredados del brochure vectorial), pero la lista de precios nueva
numera las unidades `201`..`209`. Ninguno de los dos documentos trae una
tabla de equivalencia explícita — hubo que reconstruirla.

**Cómo se resolvió (por aritmética de superficie, no por adivinar el orden):**
la "superficie total" de la lista de precios resultó ser el total del CSV
**sin la cochera** (el brochure cobra la cochera aparte, USD 10.000 fijo:
"total lista" = `cubierta + semicubierta + descubierto`, mientras que el
`superficie_total_m2` que ya tenía el CSV sumaba también los 12.5 m² de
cochera). Restando la cochera a cada unidad del CSV, el resultado calza
**exacto** contra la lista de precios en 7 de las 9 unidades:

| Código CSV | Total CSV (con cochera) | − cochera (12.5) | Total lista de precios | Unidad | Confianza |
|---|---|---|---|---|---|
| B2-A | 175.92 | **163.42** | 163.42 | 201 | Alta — univoco, ninguna otra unidad da 163.42 |
| B2-B/C/D/E | 173.0 (las 4 iguales) | **160.50** | 160.50 | 202/203/204/205 | Alta en el precio y la superficie (calzan exacto); el orden exacto B→202, C→203, D→204, E→205 es una asunción posicional (orden alfabético = orden de página en el brochure), no verificable porque las 4 unidades son idénticas en precio y superficie |
| B2-F | 96.95 | **84.45** | 84.45 | 206 ("2 amb., reventa") | Alta — univoco |
| B2-G | 95.0 | **82.50** | 82.50 | 207 ("2 amb., reventa") | Alta — univoco |
| B2-H | 94.4 | 81.9 | — (vendida, sin m² publicado) | 208 (asumido) | **Media-baja** — mapeo posicional (orden alfabético), no verificable: el brochure no publica m² ni precio de las unidades vendidas |
| B2-I | 86.85 | 74.35 | — (vendida, sin m² publicado) | 209 (asumido) | **Media-baja**, misma razón que B2-H |

El detalle de cada unidad quedó en `notas_internas` del CSV (columna
interna, nunca sale al `tour.json` público).

**Discrepancia de definición de `superficie_total_m2` (no de dato):** el
CSV originalmente guardaba el total *con* cochera; la lista de precios
mide el total *sin* cochera (la cochera se vende aparte, a precio fijo). No
es un número inventado contra otro — es el mismo dato con un criterio de
suma distinto. Se actualizó `superficie_total_m2` de las 7 unidades con
match exacto al criterio del brochure de precios (sin cochera), porque es
el número que el cliente va a mostrarle al comprador. El desglose completo
(cubierta/semicubierta/descubierto/cochera) sigue íntegro en
`notas_internas` para poder reconstruir cualquiera de los dos criterios.

**Lo que se cargó por unidad (columnas `estado`/`precio`/`moneda`/
`mostrar_precio_publico`/`financiacion`):**

| Unidad (lista) | Código CSV | Estado | Precio (USD, cochera incl.) |
|---|---|---|---|
| 201 | B2-A | disponible | 364.861 |
| 202–205 | B2-B, B2-C, B2-D, B2-E | disponible | 358.638 c/u |
| 206 | B2-F | **bloqueado** (ver 3.2 — pendiente de confirmar) | no se publica |
| 207 | B2-G | **bloqueado** (ver 3.2 — pendiente de confirmar) | no se publica |
| 208 | B2-H | **vendido** | — (no se publica precio de una unidad vendida) |
| 209 | B2-I | **vendido** | — |

**Condiciones comerciales** (nuevas, no estaban documentadas en ningún
lado — columna `financiacion` de cada unidad de Bloque 2 apunta acá):
- Precio = m² cubierto USD 2.700 + m² semicubierto USD 1.350 + m²
  descubierto USD 675 + cochera USD 10.000 fijo.
- Forma de pago: 50% anticipo + 12 cuotas mensuales al 6% anual.
- Gastos de ocupación: 4% aparte.
- Entrega: diciembre 2026.
- **Precios sujetos a modificación sin previo aviso** (textual del brochure
  — no tratar el precio cargado como definitivo en ninguna comunicación).

**Bloque 1 y Bloque 3: "PRÓXIMAMENTE"**, según el mismo cartel del
brochure ("PRÓXIMAMENTE: BLOQUE 1 Y BLOQUE 3") — no están a la venta hoy.

> **Actualización (06/09/2026 — implementado):** el plan de experiencia
> (`docs/06-BENCHMARK/5-EXPERIENCIA-BALEIA.md`, §5.3) confirmó que
> "próximamente" es un estado permanente de la experiencia (chip de
> contorno en el plano), no un caso de laboratorio. Se dio de alta como
> token real: `packages/core/src/status.ts` (`UNIT_STATUSES`/
> `STATUS_TOKENS.proximamente`, `fill: 0` + `pattern: 'outline'` — el chip
> se dibuja SÓLO con el trazo, nunca relleno, para no confundirse con
> "disponible" ni con "vendido") y
> `supabase/migrations/0017_unit_status_proximamente.sql` (agrega el valor
> al enum `unit_status`). Se auditó cada consumidor de `UNIT_STATUSES` en
> `apps/admin` (panel, editor, onboarding, CSV) — todos lo resuelven
> genéricamente iterando el array o el `Record<UnitStatus, …>`, salvo dos
> objetos armados a mano (`emptyCounts()` en
> `apps/admin/src/lib/units/query.ts` y `STATUS_LABEL` en
> `apps/admin/src/components/onboarding/shared.tsx`), que se actualizaron
> con la clave nueva. `scripts/build_tour.py` ya no necesita el truco del
> valor no reconocido: emite `"proximamente"` como estado real y punto.

**Bloque 4 y Bloque 5: sin ningún dato**, ni siquiera "próximamente" (el
cartel del brochure sólo nombra Bloque 1 y 3). Quedan directamente afuera
de `availability.json` — la misma regla dura, por el motivo más honesto
posible: no hay nada que decir de ellos todavía. Esto no cambió: siguen sin
chip y sin dato, como pide el plan (§5.3, Bloques 4 y 5).

### 3.2. Unidades 206 y 207: bloqueadas hasta confirmar con Caetano (06/09/2026)

`tools/baleia/material/INVENTARIO.md` §3 detectó una contradicción real
entre las cuatro listas de precios del cliente: **3 de las 4 dicen
textualmente que las unidades 206 a 209 ya están vendidas** — incluida
`lista-precios-1_sep2026.pdf`, fechada el mismo mes que
`lista-precios-2-VIGENTE_sep2026.pdf` (la que se usó para cargar 206/207
como disponibles a USD 235.000 en 3.1, ver tabla arriba). No hay forma de
resolver la contradicción desde el material disponible: puede que la lista
"1" sea una plantilla vieja reusada sin actualizar el texto fijo, o puede
que 206/207 se hayan vendido después de armar la lista "2" y ésta haya
quedado desactualizada.

**Decisión implementada:** mientras no se confirme con Caetano, 206 y 207
(`B2-F`, `B2-G` en el CSV) **no publican precio ni afirman disponibilidad**.
Publicar como disponible algo que puede estar vendido es el peor error que
puede cometer este recorrido (ver el plan de experiencia, §0 y §5). El
tratamiento, en `tools/baleia/out/baleia_unidades.csv`:

- `mostrar_precio_publico`: `SI` → `NO`. Con esto `availability.json` nunca
  publica el precio de estas dos unidades — el visor muestra "Consultar"
  (`apps/viewer/src/polygons.ts::PRICE_ON_REQUEST`) para un estado que lo
  admita, o nada si el estado no lo admite (ver el punto siguiente).
- `estado`: `disponible` → `bloqueado`. Esto es lo que de verdad resuelve
  "no afirmar disponibilidad": `mostrar_precio_publico=NO` por sí solo
  sólo oculta el precio, pero el chip del mapa y el tooltip seguirían
  diciendo "Disponible" en verde — que es exactamente el dato en disputa.
  De los tokens que ya existen en `packages/core/src/status.ts`,
  `bloqueado` es el único que no afirma ninguna de las dos cosas en pugna
  (ni "disponible", ni "vendido") y sigue dibujando el hotspot (regla
  dura: ningún polígono desaparece). Con `estado=bloqueado`, además,
  `apps/viewer/src/polygons.ts::priceText()` no ofrece "Consultar" —
  correcto acá: invitar a preguntar precio por una unidad que 3 de 4
  fuentes dicen vendida sería una invitación falsa.
- `precio`/`moneda` se dejan tal cual (235.000 USD) como registro interno
  de la lista vigente — nunca llegan a `availability.json` mientras
  `mostrar_precio_publico=NO`.
- El razonamiento completo, con la cita de las 4 listas, quedó en
  `notas_internas` de `B2-F`/`B2-G` — esa columna **nunca** sale a
  `tour.json` (es pública) ni a `availability.json`.

**Pregunta abierta para Caetano:** ¿cuál es el estado real de las unidades
206 y 207 — disponibles en reventa a USD 235.000 (como dice la lista "2",
la más completa y de fecha más reciente) o vendidas (como dicen las otras
tres, incluida una de la misma fecha)? Hasta que conteste, el recorrido las
muestra bloqueadas y sin precio público. Si confirma "disponibles", el
cambio es trivial: `estado=disponible` + `mostrar_precio_publico=SI` en esas
dos filas y correr `build_tour.py --publish` de nuevo.

### 3.3. B3-K sin estado en `availability.json`: a propósito, no un olvido (06/09/2026)

`docs/06-BENCHMARK/6-AUDITORIA-EXPERIENCIA.md` (§2.2) volvió a levantar
`B3-K` como hallazgo: en la grilla del Tramo 5 y en la pestaña Unidades, la
celda de `B3-K` sale sin texto y más baja que las demás (49px contra 63),
al lado de diez "Próximamente" — se lee como un dato roto, no como una
decisión. **Se revisó y se decide dejarlo así**, por lo siguiente:

- `UNIT_MISSING_FROM_AVAILABILITY = "B3-K"` (`scripts/build_tour.py`,
  sección "regla dura") es intencional desde que se cargó el Bloque 3: las
  otras 10 unidades de Bloque 3 (`B3-A`..`B3-J`) llevan el estado real
  `"proximamente"` (ver 3.1); `B3-K` queda **totalmente ausente** de
  `availability.json`, ni siquiera con ese valor. Son dos niveles de la
  regla dura y hoy sólo hay evidencia real de uno solo con datos de
  producción: "el estado llegó pero es uno que el visor no conoce"
  (Bloque 1 y 3 antes de `0017_unit_status_proximamente.sql`, ya resuelto)
  y "el estado no llegó ni siquiera intentado" — que sin `B3-K` no tendría
  ningún caso real en Baleia, y la regla ("ningún hotspot desaparece nunca")
  es la única que este proyecto no se puede dar el lujo de dejar sin probar
  con datos reales.
- La confusión que señala la auditoría es real y vale la pena separarla del
  disparador: el CÓDIGO está bien documentado (este archivo y el docstring
  de `build_tour.py`), lo que falta es que la PANTALLA diga lo mismo. Hoy
  una celda vacía y una celda "Próximamente" se distinguen sólo por altura
  — nada le dice al comprador (ni a quien audita mirando la pantalla, sin
  leer el código) que son dos cosas distintas a propósito. Eso es un
  tratamiento visual de la grilla (`tour-rail.ts`/`units-panel.ts`), fuera
  del alcance de este agente (ver reparto de archivos de la auditoría,
  §5) — la corrección sugerida ahí es un texto corto tipo "Sin dato" en la
  celda de `B3-K`, visualmente distinto del chip de contorno de
  "Próximamente", en vez de dejarla en blanco.
- Si en algún momento deja de ser útil como demostración (por ejemplo,
  porque Caetano informa que B3-K tampoco tiene fecha comercial y por lo
  tanto es indistinguible de sus vecinas), lo correcto es sumarla a
  `BLOCKS_PROXIMAMENTE`-equivalente a nivel unidad, no borrar el caso sin
  reemplazo: la regla dura necesita seguir teniendo un ejemplo real de
  "estado completamente ausente" en algún lado del dataset.

### 4. Imagen del masterplan (300dpi)

**Resultado:**
- `out/masterplan/baleia_masterplan_300dpi_recortado.png` — el plano
  recortado a la franja del dibujo (sin título ni leyenda inferior), en las
  mismas coordenadas que `baleia_hotspots.geojson`. **Este es el que hay
  que usar como imagen de la escena `floorplan`.**
- `out/masterplan/p06_masterplan_300dpi-06.png` — la página 6 completa a
  300dpi, por si se necesita el contexto con título/leyenda.
- `out/masterplan/p09_plan_300dpi-09.png` — página 9 completa a 300dpi
  (planta de implantación en línea + corte topográfico), de referencia.

Generados con `pdftoppm -png -r 300 -f <pág> -l <pág>
src/baleia_brochure-v6.pdf <salida>`.

### 5. Este README

## Cómo reproducir

```bash
cd tools/baleia
python3 -m venv .venv && source .venv/bin/activate
pip install svgelements svgpathtools numpy shapely pillow opencv-python-headless

# 1) Rasterizar el PDF (fuente = src/baleia_brochure-v6.pdf)
mkdir -p out/ref out/masterplan
pdftoppm -png -r 150 -f 6 -l 6 src/baleia_brochure-v6.pdf out/ref/p06_ref
pdftoppm -png -r 300 -f 6 -l 6 src/baleia_brochure-v6.pdf out/masterplan/p06_masterplan_300dpi
pdftoppm -png -r 300 -f 9 -l 9 src/baleia_brochure-v6.pdf out/masterplan/p09_plan_300dpi

# 2) (opcional) recalcular las anclas de letras A/D/E/F/G
python3 scripts/find_label_anchors.py

# 3) Geometría: bloques + amenities + perímetro -> GeoJSON + preview
python3 scripts/extract_geometry.py

# 4) CSV de unidades comerciales (Bloque 2 y 3)
python3 scripts/build_units_csv.py
```

`scripts/explore_paths.py src/svg/p09.svg` reproduce el diagnóstico que
mostró por qué el SVG no era un buen punto de partida (deja ver que
`svgelements` solo encuentra 45 `<path>` de primer nivel en un archivo con
11.706 `<path>` totales).

## Qué falta pedirle al cliente

Esto es lo que **no estaba en el material disponible** y bloquea pasar de
"piloto de geometría" a "recorrido publicable":

1. **Panorámicas 360°** de cada escena (no había ningún panorama entre el
   material descargado, solo renders estáticos en `imgs/` y el brochure
   vectorial). Sin esto no hay recorrido, solo el floorplan con hotspots.
2. ~~**Disponibilidad real** (`estado`)~~ **RESUELTO para Bloque 2** en
   septiembre 2026 (ver sección 3.1 más arriba): `disponible`/`vendido`
   reales de las 9 unidades de Bloque 2. **Sigue faltando** para Bloque 1, 3,
   4 y 5 — Bloque 1 y 3 quedan como "próximamente" (el brochure lo dice
   explícitamente), Bloque 4 y 5 sin ningún dato.
3. ~~**Precios y moneda** por unidad~~ **RESUELTO para Bloque 2** (ver
   sección 3.1): 7 de 9 unidades con precio público en USD, cochera
   incluida. Las 2 unidades vendidas (208/209) no tienen precio publicado
   por el brochure. **Sigue faltando** para Bloque 1, 3, 4 y 5.
4. ~~**Condiciones de financiación**~~ **RESUELTO**: 50% anticipo + 12
   cuotas mensuales al 6% anual + 4% de gastos de ocupación aparte, precio
   = m² cubierto USD 2.700 + semicubierto USD 1.350 + descubierto USD 675 +
   cochera USD 10.000 fijo, entrega diciembre 2026. Ver sección 3.1.
5. **Orientación** de cada unidad (columna `orientacion`) — el brochure no
   la indica explícitamente por unidad (a diferencia del ejemplo de la
   plantilla, que sí trae "Frente Norte", "Contrafrente", etc.).
6. **Datos de Bloque 1, Bloque 4 y Bloque 5**: el brochure solo tiene
   páginas de planos individuales por unidad para Bloque 2 y Bloque 3 (9 +
   11 = 20 unidades). No hay plantas de unidades para los otros 3 bloques
   en este documento — falta ese material o el brochure que lo incluya.
7. **Confirmar la convención de `codigo_unidad`** (`B2-A` vs `B2-U01`, ver
   nota en la sección del CSV) contra lo que va a usar el equipo comercial,
   antes de que se generen materiales con esos códigos (fichas, carteles,
   nombres de archivo de renders/panorámicas).
8. ~~**Las plantas acotadas por unidad como imagen suelta**~~ **RESUELTO
   para Bloque 2** (06/09/2026): `tools/baleia/material/planos/unidad/`
   tiene las 9 unidades (7 imágenes WebP, ver
   `tools/baleia/material/INVENTARIO.md` §2) extraídas de los PDF reales
   del cliente, publicadas y referenciadas en `tour.json`
   (`units[].media`), además de las axonometrías IA de `material/plantas/`
   que ya estaban. **Sigue faltando** B3-A/B/C y B3-H/I/J/K en cualquier
   formato — Bloque 3 no tiene plano acotado propio en ningún documento.
9. Los polígonos de bloques y amenities están calibrados sobre el
   masterplan de la **página 6**. Si el cliente termina usando otro plano
   (por ejemplo una versión más nueva o de otra escala) como imagen final
   de la escena `floorplan`, esta geometría hay que re-extraerla o
   re-alinearla contra esa imagen — no es portable a ciegas a otro archivo.
10. **Confirmar el estado real de las unidades 206 y 207** — ver la sección
    3.2 más arriba. Bloqueadas y sin precio público mientras tanto.
11. **Confirmar que ese teléfono comercial atiende leads del recorrido**:
    `tour.json` ya carga `contact.whatsapp = "+59895559230"` (Caetano
    Negocios Inmobiliarios + Dacal, el que publica el brochure), pero nadie
    del cliente confirmó todavía que sea el número al que hay que mandar
    los WhatsApp que salgan del visor (plan de experiencia, §6, punto 1).

## Honestidad sobre la calidad de la extracción

- **B1-B5, perímetro, A, D, E, G**: geometría 100% de detección de color
  automática, verificada visualmente contra el plano (ver
  `out/preview_deteccion_masterplan.png`). Alta confianza.
- **F (rincón de fuego)**: la única geometría semi-manual del lote (recorte
  espacial calibrado a ojo una vez, ver arriba). El polígono en el preview
  se ve razonable, pero si el cliente necesita el contorno exacto del
  rincón de fuego (no solo "más o menos ahí"), conviene redibujarlo a mano
  sobre el floorplan en el editor en vez de confiar en este.
- **20/20 superficies del CSV** verificadas matemáticamente contra los
  totales impresos por el propio PDF (ver `scripts/build_units_csv.py`).
- El edificio de servicios/clubhouse (visible en el masterplan, al lado de
  las piscinas) **no tiene polígono propio** en el GeoJSON — no está entre
  las letras A/D/E/F/G pedidas y no es una unidad vendible, así que se dejó
  afuera a propósito.

## Recorrido publicable (tour.json + availability.json)

`scripts/build_tour.py` toma `out/baleia_hotspots.geojson` y
`out/baleia_unidades.csv` (los dos artefactos de arriba, ya verificados) y
genera `out/tour/`:

```bash
cd tools/baleia && source .venv/bin/activate
python3 scripts/build_tour.py            # sólo out/tour/
python3 scripts/build_tour.py --publish  # además, copia a apps/viewer/public/
```

- `tour.json` — `TourManifest`: una escena `floorplan` (el masterplan
  recomprimido a WebP, ver decisión #1 en el docstring del script sobre
  por qué imagen única y no DZI) con los 11 hotspots del GeoJSON (`B1`-`B5`
  apuntan a sí mismos como "unidad" para heredar el pipeline de colores de
  estado sin tocar `packages/core`; los amenities son informativos, sin
  `unitCode`) y las 20 unidades del CSV en `units`.
- `availability.json` — `AvailabilityFile`. Desde septiembre 2026 **ya no es
  demostración para Bloque 2**: trae el `estado`/`precio` reales de las 9
  unidades (ver sección 3.1). Bloque 3, 1, 4 y 5 siguen sin dato real — ver
  el punto siguiente.
- Demuestra la regla dura del visor (un hotspot nunca desaparece por dato
  ausente/raro, ver `apps/viewer/src/polygons.ts`), ahora con motivos reales
  en vez de casos de laboratorio: **Bloque 1 y Bloque 3** (y las 11 unidades
  de Bloque 3) llevan el estado `"proximamente"` — el brochure los marca
  "PRÓXIMAMENTE" pero ese token no existe en `UNIT_STATUSES`, así que caen
  en la regla dura (gris + warning) en vez de sumar un token nuevo a
  `packages/core` sin auditar su impacto en admin/Supabase (ver sección
  3.1). **Bloque 4 y Bloque 5** quedan directamente fuera de
  `availability.json` (ni el brochure dice "próximamente" de ellos). A nivel
  unidad, `B3-K` también queda fuera (no "proximamente" como el resto de
  Bloque 3) para seguir demostrando la otra mitad de la regla: una unidad
  de la que ni siquiera llegó un estado inválido.
- El detalle completo de cada decisión (por qué imagen única, por qué los
  bloques son "unidad-grupo", por qué los renders son escenas y no un tipo
  nuevo) está en el docstring de `scripts/build_tour.py` — no se repite acá
  para no desincronizarse.
- `out/tour/` no está versionado (mismo `.gitignore` que el resto de
  `out/`); correr el script siempre lo regenera.

### El material real dentro del recorrido (Nivel 1: brochure + renders)

Baleia no tiene panorámicas (ver `docs/04-PRODUCCION/2-Escalera-de-Niveles-de-Material.md`),
así que el recorrido se arma con lo que sí hay, todo desde `material/`:

- **Galería de renders.** Los 7 renders de `material/renders/` entran como 7
  escenas `floorplan` más (una imagen plana paneable, sin hotspots). El visor
  las junta en la tira "Galería" con su miniatura. Títulos descriptivos de lo
  que se ve en cada uno, mirados uno por uno.
- **Amenities clickeables.** El hotspot A (acceso) salta al render del acceso;
  D/E/F/G (piscina, piscina infantil, rincón de fuego, laguna) saltan al
  render de amenities, que es donde los cuatro se ven.
- **Planta por unidad.** Ojo con el nombre de la carpeta: los archivos de
  `material/plantas/` **no son plantas acotadas**, son axonometrías del bloque
  con la unidad resaltada (dónde está la unidad dentro del edificio). La
  planta acotada de cada unidad existe sólo adentro del brochure, como página
  de PDF. La ficha del visor lo dice con todas las letras ("Ubicación de la
  unidad dentro del bloque"). Las 9 imágenes de `material/plantas/` van a
  `units[].media` de las 13 unidades que cubren (`UNIT_MEDIA` en el script
  tiene el mapeo verificado contra el brochure página por página). **7
  unidades quedan sin imagen a propósito**: B3-A/B/C (dúplex) y B3-H/I/J/K no
  están en el material descargado. Aunque B3-H/I y B3-J/K tienen exactamente
  las mismas superficies que B3-F/G y B3-D/E, son otro tramo del bloque: la
  ficha dice "sin imagen" en vez de mostrar la unidad de al lado.
- **Peso.** Todo se recomprime a WebP (renders a 1600px de ancho, calidad 76;
  plantas a 1400px, calidad 82, aplanadas sobre blanco) más una miniatura
  `*.thumb.webp` de 400px. 6,5 MB de originales → 1,9 MB de WebP (-71%) +
  154 KB de miniaturas. La galería carga sólo las miniaturas (~100 KB) hasta
  que se abre un render.

### Panorámicas 360° (Nivel 2): el sistema ya está listo para recibirlas

`scripts/integrate_panoramas.py` toma una carpeta de panorámicas entregadas,
las valida contra la especificación de Baleia (2:1 exacto, ≥ 8192 px de
ancho) con `packages/pipeline`, genera los tiles de cubemap multiresolución y
las suma al `out/tour/tour.json` que produjo `build_tour.py` como escenas
`panorama`, re-enlazando los hotspots del masterplan que corresponden.

```bash
cd tools/baleia
python3 scripts/build_tour.py                     # el recorrido base, primero

# ojo: este corre con el venv del PIPELINE, no con el de tools/baleia
../../packages/pipeline/.venv/bin/python scripts/integrate_panoramas.py \
    --in <carpeta-de-la-entrega> --dry-run        # ver el plan sin tocar nada
../../packages/pipeline/.venv/bin/python scripts/integrate_panoramas.py \
    --in <carpeta-de-la-entrega> --publish        # integrar y publicar
```

Probado de punta a punta con panorámicas sintéticas de `pano-make-test`: 6
archivos → 5 integradas, 1 rechazada por resolución insuficiente, 126 tiles
por panorámica, navegación masterplan ↔ panorámica verificada en el navegador
sin errores de consola ni tiles fallidas. Las decisiones (por qué el `base`
de los tiles es relativo y no el absoluto que emite `pano-run`, por qué los
hotspots de bloque NO se re-enlazan por defecto, qué pasa con un archivo mal
nombrado) están en el docstring del script.

**El paquete completo — lista de tomas punto por punto, los tres caminos para
conseguirlas con costo y plazo, los mails listos para mandarle a Dacal y al
estudio, y la especificación técnica para el renderista — está en
`docs/07-BALEIA-360/`.**
