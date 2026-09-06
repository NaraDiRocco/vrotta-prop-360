# Inventario de material — Baleia (consolidado 06/09/2026)

> Este archivo cataloga todo lo que había desparramado en `~/Downloads/`,
> `~/Desktop/Baleia ia/` y lo que ya vivía en el repo, ahora reunido bajo
> `tools/baleia/material/`. **Todo se copió, nada se movió ni se borró** de
> las carpetas de origen. Lo que ya estaba inventariado en
> `docs/08-MATERIAL-REAL/README.md` (las 74 fotos/video de `elementos
> baleia/`, curadas en `tools/baleia/material-real/`) **no se repite acá** —
> ver ese documento para esa parte.

## 0. Resumen ejecutivo

- **Marca oficial encontrada y consolidada**: no estaba en el repo, vivía
  suelta en `~/Downloads/`. Ver §1.
- **Planos acotados de las 9 unidades de Bloque 2** (A-I) extraídos a
  imagen web — resuelve el punto 8 de "Qué falta pedirle al cliente" en
  `tools/baleia/README.md`. Ver §2.
- **Conflicto real entre las 4 listas de precios**: 3 de las 4 contradicen
  los datos ya cargados al proyecto (`packages`/CSV) sobre el estado de las
  unidades 206 y 207. Ver §3 — **destacado porque ya se cargaron precios al
  proyecto con el criterio que sí coincide**.
- **`WMW_Brochure-Digital_EveTower.pdf` es de otro proyecto** (competencia
  directa en Punta del Este). No se copió. Ver §7.
- Encontrado sin catalogar y **fuera del pedido explícito**, no incorporado
  al inventario visual pero documentado en §8: `Desarrollo baleia.pdf`
  (propuesta comercial de un tercero) y una captura de pantalla del chatbot
  de caetano.com.uy sin info útil.

---

## 1. Marca (`marca/`)

| Archivo | Origen | Qué es |
|---|---|---|
| `baleia-logo.svg` | `~/Downloads/baleia-logo.svg` | **Fuente vectorial**, wordmark "Baleia" solo (sin subtítulo). Exportado de Adobe Illustrator 29.1.0. `viewBox 0 0 870.9 230`. |
| `baleia-logo-blanco.png` / `baleia-logo-negro.png` | `~/Downloads/` | Wordmark solo, 3000×792px, PNG con transparencia (RGBA). |
| `baleia-logo-completo-blanco.png` / `baleia-logo-completo-negro.png` | `~/Downloads/` | Wordmark **+ subtítulo "PUNTA BALLENA · URUGUAY"**, 3000×1203px, RGBA. |

**Sobre los dos SVG:** `~/Downloads/baleia-logo.svg` y `~/Downloads/logo-baleia.svg`
**son el mismo dibujo** — mismo `viewBox`, mismos 11 `<path>`, mismos datos
de trazado byte a byte en el `d=`. Difieren solo en el envoltorio XML
(`logo-baleia.svg` tiene declaración `<?xml?>` + `DOCTYPE` + `width`/`height`
explícitos, típico de un segundo export desde otro programa). Se usó
`baleia-logo.svg` como fuente única en `marca/` porque es el export nativo de
Illustrator; el otro no se duplicó por ser idéntico en contenido.

**Falta:** un SVG de la versión "completa" (con subtítulo) — solo existe
rasterizada en PNG. Si se necesita vectorial con subtítulo hay que pedirlo o
maquetar el texto aparte del isotipo.

---

## 2. Planos de unidad (`planos/unidad/`)

Extraídos de los 7 PDF nuevos en `~/Downloads/` (`Unidad A.pdf` … `Unidad H y
I.pdf`, A4 apaisado, 1 página c/u) — son **plantas acotadas reales**, algo que
`tools/baleia/README.md` (punto 8 de "Qué falta pedirle al cliente") marcaba
como faltante (antes solo existían axonometrías de ubicación en
`material/plantas/`, que muestran dónde está la unidad dentro del edificio,
no la planta acotada en sí).

| Archivo generado | Código(s) | Verificación |
|---|---|---|
| `B2-A.webp` | B2-A (unidad 201) | "Superficie total: 175.92m²" impreso en el PDF = total CSV con cochera de B2-A. Coincide exacto. |
| `B2-B.webp` | B2-B (202) | Misma tipología dúplex, PA+PB. |
| `B2-C.webp` | B2-C (203) | ídem |
| `B2-D.webp` | B2-D (204) | ídem |
| `B2-E.webp` | B2-E (205) | ídem |
| `B2-F_B2-G.webp` | B2-F (206) + B2-G (207) | El PDF trae **las dos unidades en una sola página** (F arriba/PA, G abajo/PB), no se separaron en dos imágenes para no cortar contenido a mano; "PA: 96.95m²" (F) y "PB: 95m²" (G) impresos coinciden con el orden de magnitud del CSV. |
| `B2-H_B2-I.webp` | B2-H (208) + B2-I (209) | Igual criterio que F/G. |

Cada imagen tiene su `.thumb.webp` (480px) para miniatura de galería. Los 7
PDF originales quedaron en `planos/unidad/src-pdf/` como fuente/trazabilidad
(pesan 224-292 KB cada uno, no hace falta optimizarlos).

**Peso:** 7 PNG a 200dpi (2.83 MB) → 7 WebP a 1800px + miniatura (0.47 MB) —
**-83%**.

---

## 3. Precios (`precios/`) — el conflicto a resolver

Se leyeron las 4 listas de precios de `~/Downloads/` más el simulador de
condiciones (xlsx). Las 5 comparten la misma fórmula de precio (m² cubierto
USD 2.700 + semicubierto USD 1.350 + descubierto USD 675 + cochera USD
10.000) y las mismas condiciones (50% anticipo + 12 cuotas al 6% anual + 4%
gastos de ocupación aparte, entrega diciembre 2026) — **eso no está en
discusión**. Lo que sí difiere es el **estado de las unidades 206-209**:

| Archivo | Fecha | Contenido | Estado de 206/207 según este PDF |
|---|---|---|---|
| `lista-precios-bloque2-5_jul2026.pdf` (`Baleia_Lista_de_Precios_Bloque2_5.pdf`) | Julio 2026 | Solo tabla 201-205 | Texto: **"206 a 209 ya vendidas"** |
| `lista-precios-baleia_jul2026.pdf` (`Lista de Precios Baleia.pdf`) | Julio 2026 | Mismo diseño, sin tabla completa renderizada en texto (solo imagen) | Texto: **"206 a 209 ya vendidas"** |
| `lista-precios-1_sep2026.pdf` (`Baleia Lista de precios 1.pdf`) | **Septiembre 2026** | Igual a las anteriores, tabla 201-205 | Texto: **"206 a 209 ya vendidas"** |
| **`lista-precios-2-VIGENTE_sep2026.pdf`** (`Baleia Lista de precios 2.pdf`) | **Septiembre 2026** | Tabla completa 201-207, con Anticipo 50% y Cuota×12 discriminados | **206 y 207 = "2 Amb. · Reventa", DISPONIBLES a USD 235.000 cada una** (208/209 no figuran, es decir vendidas) |

**Resolución — la vigente es `lista-precios-2-VIGENTE_sep2026.pdf`:**
coincide exactamente, unidad por unidad y precio por precio, con lo que ya
está cargado en `tools/baleia/out/baleia_unidades.csv` y documentado en
`tools/baleia/README.md` §3.1 / `docs/08-MATERIAL-REAL/README.md` §5:
201=364.861, 202-205=358.638 c/u, **206 y 207 disponibles (reventa) a
235.000 c/u**, 208/209 vendidas sin precio publicado. Además es la más
completa (única con desglose de m² de 206/207: 84.45 y 82.50, que también
matchean el CSV) y la de fecha más reciente junto con la "1".

**La contradicción a destacar:** tanto `lista-precios-bloque2-5` y
`lista-precios-baleia` (ambas de julio) **como `lista-precios-1` (de
septiembre, misma fecha que la vigente)** dicen textualmente que **las 4
unidades de 1 dormitorio (206 a 209) ya están vendidas** — sin excepción,
sin mencionar reventa. Si esto fuera cierto, **el proyecto tiene cargado un
precio público (USD 235.000) y un estado "disponible" para dos unidades
(206/207) que en 3 de las 4 listas del cliente figuran como vendidas.**
No hay forma de saber desde acá cuál de las dos versiones es la real —
puede que "lista de precios 1" sea una plantilla vieja reusada sin
actualizar el texto fijo (el texto "206 a 209 ya vendidas" es idéntico,
carácter por carácter, en las 3 listas que lo dicen, mientras que la tabla
sí cambia entre ellas), o puede que 206/207 se hayan vendido *después* de
armar la lista 2 y ella haya quedado desactualizada. **Hay que confirmar
con Caetano cuál es el estado real de 206 y 207 antes de mostrarle un
precio público a un comprador para esas dos unidades.**

Otros archivos de esta carpeta:
- `simulador-condiciones.xlsx` (`Baleia_Simulador_Condiciones_5.xlsx`,
  2 hojas) — simulador de cuotas, no se abrió celda por celda pero
  corresponde a la misma fórmula comercial de las listas; útil si se quiere
  ofrecer un simulador interactivo en el visor.

---

## 4. Brochures (`brochures/`)

| Archivo | Origen | Qué es |
|---|---|---|
| `baleia-prueba-brochure_v1_ago2026.pdf` | `~/Downloads/Baleia prueba brochure.pdf` (31/08, 13 páginas) | Versión **anterior** a `Baleia prueba brochure (1).pdf` (25 páginas, ya analizada en `docs/08-MATERIAL-REAL/README.md` §5, vive en `elementos baleia/`, no tocada). Esta v1 **no tiene** las páginas de lista de precios reales — son un agregado posterior. Se conserva como registro de la evolución del documento. |

`renders-unidades-duplex.pdf` (`Renders unidades_Duplex.pdf`, 16 MB, 7
páginas) **no se copió entero** — es un render 3D real de estudio (portada +
volumetría del Bloque 2 + planta de dúplex tipo, mismo contenido que ya está
en `Unidad A-E.pdf`), no material nuevo de datos. Se extrajeron sus 7
páginas a WebP en `renders/duplex/render-duplex-01..07.webp` (con
miniatura) para que el peso quede razonable: **3.69 MB → 0.95 MB (-74%)**.
El PDF original de 16 MB queda solo en `~/Downloads/`, no se dupla en el
repo.

`baleia-brochure-v6.pdf` de `~/Downloads/` es **idéntico** (mismo MD5) al
que ya está en `tools/baleia/material/docs/brochure-v6.pdf` y en
`tools/baleia/src/baleia_brochure-v6.pdf` — no se volvió a copiar.

---

## 5. Fotos reales (`fotos-reales/aereas/`)

| Archivo | Origen | Qué es |
|---|---|---|
| `DJI_0060_terraza-real-antes.webp` | `~/Downloads/DJI_20260902160101_0060_D_LEO.jpg` | **Foto real** (drone, sesión del 02/09/2026, ver `docs/08-MATERIAL-REAL/README.md`), aérea de la terraza del último piso del Bloque 2 tal como está hoy: sin amueblar. Es el **"antes"** del par antes/después de amueblado virtual — ver §6. |
| `aerea-real-frame-video_bloque2.webp` | `~/Desktop/Baleia ia/bloque 1.jpg` | Foto real aérea del predio/Bloque 2, usada como frame inicial para generar el video con Higgsfield (ver §6, video). **El nombre del archivo dice "bloque 1" pero es una vista del Bloque 2 construido** — mal nombrada en origen, no confundir con el Bloque 1 real (que sigue en pozo). |

Peso: 25.8 MB (JPG originales) → 1.16 MB WebP (full + thumb) — **-95%**.

---

## 6. Generado con IA (`generado-ia/`)

Todo lo de esta carpeta es **contenido sintético** (IA generativa), nunca
fotografía ni render de estudio. Se separó de lo real en carpetas propias
para que la experiencia pueda etiquetarlo así.

### 6.1 `amueblado-virtual/` — el par antes/después para el deslizador

- `DJI_20260902160101_0060_D_LEO-terrazas-equipadas.webp`
- `DJI_20260902160101_0060_D_LEO-terrazas-pasto-techo-final.webp`

**Ambas son la misma foto aérea real** (`fotos-reales/aereas/DJI_0060_terraza-real-antes.webp`,
§5) con pasto, mesas, sillas y plantas agregados por IA sobre las terrazas
del último piso. Quedan registradas explícitamente como **par** porque la
experiencia va a usarlas en un slider antes/después:

```
antes = fotos-reales/aereas/DJI_0060_terraza-real-antes.webp
después = generado-ia/amueblado-virtual/DJI_20260902160101_0060_D_LEO-terrazas-pasto-techo-final.webp
  (o la variante "-terrazas-equipadas.webp", dos grados distintos de amueblado)
```

Peso: 5.6 MB → 0.59 MB (-89%).

### 6.2 `planos-3d/` — plantas 3D minimalistas por unidad

9 imágenes (`unidad-A-plano-3D-fondo-blanco/minimalista/prototipo.webp` — A
tiene 3 variantes de prueba —, `unidad-B-D`, `unidad-C-E`, `unidad-F`,
`unidad-G`, `unidad-H`, `unidad-I`, todas "-plano-3D-minimalista.webp").
Vistas isométricas estilizadas generadas con IA a partir de los planos
reales — complementan (no reemplazan) los planos acotados reales de §2.
Peso: 13.9 MB → 0.78 MB (-94%).

### 6.3 `paisajismo/` — renders de paisajismo sobre foto real

`7IV01199-paisajismo-baleia.webp` y `DSC05104-paisajismo-baleia.webp`:
fotos reales de la sesión del 02/09 con vegetación/paisajismo agregado por
IA (mismo criterio que el amueblado de terrazas). Peso: 4.87 MB → 0.42 MB.

### 6.4 `exploratorias/` — imágenes de prueba (Gemini + Codex)

55 imágenes: 53 `Gemini_Generated_Image_*` (`~/Downloads/`, todas del
31/08/2026) + 2 `imagen-codex-*` (`~/Desktop/Baleia ia/`, 05/09/2026). Son
exploraciones visuales generadas con IA — no tienen curaduría ni etiqueta de
qué representan cada una (nombres de archivo son hashes aleatorios de las
herramientas que las generaron). **No catalogadas individualmente** más
allá de guardarlas optimizadas; si alguna va a usarse en la experiencia hay
que elegirla y renombrarla a mano. Peso: 322.2 MB → 5.35 MB (**-98%**, la
mayor reducción de todo el lote).

### 6.5 `video/` — prompts y frames (los .mp4 NO se tocaron)

Los dos videos generados con Higgsfield (`baleia-torres-01-principal.mp4`,
`baleia-torres-02-respiracion.mp4`, ~10s c/u) **ya están** en
`tools/baleia/media/video/` (carpeta protegida, no tocada por esta tarea).
Acá solo se sumó lo que faltaba documentar:

- `prompt-higgsfield-torres.md`, `prompt-principal.txt`,
  `prompt-respiracion.txt` — los prompts usados para generarlos.
- `frame-16x9.webp`, `frame-9x16.webp` — los frames de referencia usados
  como punto de partida (derivados de `aerea-real-frame-video_bloque2` de
  §5). Peso: 7.18 MB → 0.62 MB.

---

## 7. `WMW_Brochure-Digital_EveTower.pdf` — es de otro proyecto

**Confirmado por el contenido del PDF: es el brochure de "EVE Tower"**, una
torre de 26 pisos sobre Av. Roosevelt y Playa Brava en Punta del Este — un
desarrollo distinto, **competencia directa** de Baleia en la misma zona (no
tiene relación societaria ni de marca con Baleia). **No se copió** a
`material/`.

Qué hace bien, en tres líneas:
1. Abre con una identidad tipográfica fuerte (logo compuesto en anillo de
   letras) antes de mostrar una sola imagen del edificio — genera intriga.
2. Vende la ubicación con nombres propios reconocibles (Av. Roosevelt,
   Playa Brava) en la primera frase, no en una página de mapa al final.
3. Usa la altura (26 pisos) como argumento diferencial explícito desde el
   segundo bloque de texto, algo que Baleia no puede ni necesita competir
   (Baleia es baja altura/integración al paisaje) pero vale tenerlo de
   referencia de tono competitivo en la zona.

---

## 8. Encontrado sin catalogar, fuera de lo pedido — no incorporado

- **`Desarrollo baleia.pdf`** (`~/Downloads/`, 3 páginas) — es una
  **propuesta comercial de servicios de marketing** ("Marketing &
  Comercialización Integral") de un proveedor externo para Inmobiliaria
  Caetano, con honorarios y condiciones. No es material de producto ni de
  venta al comprador final — es un documento interno/comercial de un
  tercero. No se copió a `material/` por no ser material de la experiencia,
  pero se deja registrado acá para que quien gestiona el proyecto sepa que
  existe en Downloads.
- **`Baleia · Punta Ballena · Caetano.png`** (`~/Downloads/`) — captura de
  pantalla de un celular mostrando el chatbot de `caetano.com.uy`
  respondiendo *"no encontré información sobre el proyecto Baleia en
  nuestro sitio"*. No aporta material ni dato — es evidencia de que el sitio
  público de la inmobiliaria todavía no publicó el proyecto. No se copió.

---

## 9. Pesos: antes → después (todo lo optimizado en esta tarea)

| Conjunto | Antes | Después | Reducción |
|---|---|---|---|
| Planos de unidad (7, PNG 200dpi → WebP) | 2.83 MB | 0.47 MB | -83% |
| Fotos reales aéreas (2, JPG → WebP) | 25.8 MB | 1.16 MB | -95% |
| Amueblado virtual (2) | 5.6 MB | 0.59 MB | -89% |
| Planos 3D IA (9) | 13.9 MB | 0.78 MB | -94% |
| Paisajismo IA (2) | 4.87 MB | 0.42 MB | -91% |
| Exploratorias IA (55) | 322.2 MB | 5.35 MB | -98% |
| Frames de video (2) | 7.18 MB | 0.62 MB | -91% |
| Renders dúplex del PDF de estudio (7 páginas) | 3.69 MB | 0.95 MB | -74% |
| **Total optimizado** | **~386 MB** | **~10.3 MB** | **-97%** |

PDFs y el xlsx quedaron sin recomprimir (no hay `ghostscript`/`qpdf`
disponibles en este entorno) — pesan lo mismo que el original: 4 listas de
precios (516 KB en total) + simulador (17 KB) + brochure v1 (10 MB) +
plan de sesión (496 KB) + 7 PDF fuente de plantas (1.6 MB). El
`docs/brochure-v6.pdf` (27 MB) ya estaba en el repo de antes, sin cambios.

**Tamaño total de `tools/baleia/material/` después de esta tarea: ~59 MB**
(dominado por los dos brochures PDF sin comprimir, 10 + 27 MB — ninguno se
acerca a "cientos de MB").

---

## 10. Qué falta / próximos pasos

- Confirmar con Caetano el estado real de 206/207 (§3) antes de mostrar el
  precio público de esas dos unidades en el visor.
- Decidir si vale la pena curar las 55 imágenes exploratorias de IA (§6.4)
  o descartar las que no se vayan a usar — hoy están todas optimizadas pero
  ninguna tiene un nombre ni un uso asignado.
- Si se quiere una versión SVG del logo "completo" (con subtítulo), hay que
  pedirla — solo existe rasterizada.
- El PDF de 10 MB (`baleia-prueba-brochure_v1`) y el de 16 MB
  (`Renders unidades_Duplex.pdf`, no copiado, solo sus páginas extraídas)
  pueden recomprimirse con `ghostscript`/`qpdf` si se instalan esas
  herramientas — no estaban disponibles en este entorno.
