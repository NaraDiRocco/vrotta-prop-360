# Material real de Baleia (septiembre 2026) — inventario y diagnóstico

> Fecha del material: fotos y video tomados el **02/09/2026** en el predio. PDFs
> generados el 04 y 05/09/2026. Todo lo analizado acá vino de
> `elementos baleia/` (fuera del repo versionado); las versiones optimizadas
> para web quedaron en `tools/baleia/material-real/web/`.

## 0. El titular: esto no es más "en pozo"

Todo el resto de la documentación de Baleia (`tools/baleia/README.md`,
`docs/07-BALEIA-360/*`) asume un proyecto sin construir, con renders como
único material visual. **Eso cambió.** Las 74 fotos muestran:

- **El Bloque 2 tiene su estructura, fachada y al menos una unidad
  completamente terminada** (cocina equipada y funcionando, baños con
  sanitarios y grifería instalados, piso de madera colocado, terraza con
  parrillero de obra). No es un render: hay luz solar real, sombras duras,
  polvo de obra en el terreno de alrededor y una camioneta estacionada en
  dos tomas de drone.
- El PDF `Baleia prueba brochure (1).pdf` lo confirma con un dato que no
  estaba en ningún documento del repo: **`BLOQUE 2 — DISPONIBLE · Entrega
  Diciembre 2026`**, con **lista de precios real en USD** (ver sección 5).
- El mismo PDF marca **"PRÓXIMAMENTE: BLOQUE 1 Y BLOQUE 3"** — es decir, de
  los 5 bloques, **solo el Bloque 2 está construido/en etapa final**; el
  resto sigue siendo pozo.

Esto no es una corrección menor a la escalera de niveles: cambia qué se le
puede vender al cliente ahora mismo (ver sección 7).

---

## 1. Inventario general

| Origen | Cantidad | Cámara | Qué es |
|---|---|---|---|
| `7IV*.jpg` | 54 | Sony ILCE-7M4 (A7 IV), lente ~20mm (algunas a 24-70mm) | Fotografía de arquitectura/inmobiliaria en el Bloque 2: fachada, terrazas y el interior completo de una unidad (probablemente un dúplex tipo Unidad A-E, a confirmar con el fotógrafo) |
| `DJI_*.jpg` | 12 | Drone DJI (cámara principal Hasselblad L3D-100c + cámara secundaria DJI FC9284) | Aéreas del predio y del Bloque 2 en obra, más contexto hacia la península |
| `DSC*.jpg` | 8 | Sony ILME-FX3 (cámara de cine, usada acá para fotos fijas) | Mismos ambientes que el A7 IV — parecen ser los still-frames o tomas de respaldo de quien filmó el video |

Todas del **02/09/2026**, entre las 15:12 y las 17:31. Resoluciones: hasta
7008×4672 (A7 IV), 6144×4096 (drone, cámara principal), 4240×2832 (FX3).
Confirmado con EXIF (`DateTimeOriginal`, `Model`, dimensiones — ver
`/private/tmp/.../scratchpad/exif.json` de esta sesión si hace falta
reproducir el análisis).

---

## 2. Tabla de clasificación de las 74 fotos

Convención de la columna **Uso**: `HERO` (portada/apertura), `GAL`
(galería), `HOT` (hotspot de amenity/ambiente), `DESC` (descartar).

### Aéreas de drone (`DJI_*`, 12 fotos)

| Archivo | Alt. (m) | Qué muestra | Uso |
|---|---|---|---|
| `DJI_..._0023` | 122 | Aérea alta y lejana: el predio completo entre el monte y la costa, con dos losas/estructuras alargadas visibles (footprint de bloques) | GAL — contexto |
| `DJI_..._0025` | 122 | Mismo punto que 0023, encuadre vertical | DESC (duplicado) |
| `DJI_..._0028` | 103 | Mismo terreno, ángulo más cerrado | DESC (redundante con 0023) |
| `DJI_..._0031` | 67 | Aérea oblicua **cercana** del Bloque 2 terminado: fachada de hormigón, balcones con baranda de vidrio, 3 niveles | **HERO** |
| `DJI_..._0035` | 174 | Aérea muy alta hacia el este: se ve la costa, La Barra/península y el pueblo circundante — prueba real de "vista a la península" | GAL — clave para el argumento de venta |
| `DJI_..._0036` | 174 | Mismo punto que 0035, vertical | DESC (duplicado) |
| `DJI_..._0051` | 76 | Sobre el techo del Bloque 2 en obra (losa de azotea, sin terminar), mirando hacia la ruta y la costa | GAL |
| `DJI_..._0053` | 76 | Igual que 0051 pero se distingue nítido el **skyline de Punta del Este** sobre el mar, al fondo | **GAL — la mejor prueba fotográfica real de la promesa "se ve la Punta"** |
| `DJI_..._0054` | 76 | Aérea cercana y oblicua del edificio en obra, andamios visibles | GAL — obra |
| `DJI_..._0055` | 78 | Aérea oblicua larga de todo el frente del Bloque 2, con una camioneta estacionada (prueba de obra activa) | GAL — obra |
| `DJI_..._0060` | 81 | Aérea cercana, detalle de balcones y terrazas del último piso | GAL |
| `DJI_..._0062` | 73 | Igual que 0060, otro ángulo | DESC (redundante) |

**Importante:** ninguna aérea muestra el masterplan completo (los 5 bloques
escalonados a la vez, como pide la toma `MASTERPLAN_AEREA_01` de la lista
de tomas) — todas están centradas en el Bloque 2 o en vistas muy alejadas
hacia la costa. **La toma aérea de conjunto sigue faltando.**

### Fotografía de arquitectura (`7IV*`, 54 fotos, Sony A7 IV)

Agrupadas por ambiente/función (nombres de archivo originales entre
paréntesis):

| Grupo | Archivos | Qué muestra | Uso |
|---|---|---|---|
| Fachada exterior del Bloque 2 | 073, 074\*, 075, 188, 194, 196\* | Frente del edificio con pérgola de acceso y, más adelante en el rollo, la fachada completa de hormigón con balcones | 188/194/196 → **GAL**; 073-075 (pérgola de un acceso) → GAL; 074 → DESC (duplicado vertical) |
| Cocina de la unidad | 080, 082\*, 083, 084, 086, 146, 150-HDR, 232-234, 238-241 | Cocina completamente equipada: mesada de cuarzo negro, muebles de madera, anafe, horno instalado, bacha. 150-HDR y 237 muestran el horizonte/mar de fondo por la ventana | 084, 150-HDR, 237 → **GAL**; el resto son detalles repetidos (mismo mueble desde 3-4 ángulos) → DESC salvo 1-2 de apoyo |
| Living/comedor | 089, 091, 093, 097, 106-HDR, 108-HDR, 117-HDR, 154-HDR | Living amplio, piso claro, ventanales corredizos a la terraza, columna estructural negra | 089, 108-HDR, 154-HDR → **GAL** (son la prueba de "vista desde adentro") |
| Baños | 094, 096, 168, 170, 217, 222, 225-Editar | Baño completo con sanitarios, bacha de apoyo ovalada, ducha con mampara de vidrio | 217 → GAL; resto DESC (todos el mismo baño, distintos ángulos) |
| Dormitorios/placares/pasillos | 133\*, 164-HDR, 174-HDR, 176, 179, 182, 185 | Dormitorio sin amueblar (solo placard instalado), pasillo interno | 176 → GAL; resto DESC (vacíos y repetitivos, no aportan) |
| Terraza y parrillero | 122-HDR, 126, 130, 134, 199, 205, 211, 215, 235 | Terraza con piso de porcelanato, parrillero de obra empotrado, macetones de hormigón con paisajismo, vista abierta al verde | 122-HDR, 130, 199, 235 → **GAL**; resto DESC |
| Escalera interna | 156 | Escalera de caracol/recta del dúplex, toma cenital | GAL — es un ambiente que no estaba cubierto en ningún render |
| **Vista al horizonte con skyline** | **229** | Desde el balcón/terraza de la unidad, se distingue **la línea de edificios de Punta del Este sobre el mar** | **GAL — la foto más importante de todo el lote junto con la 0053 del drone** |

\* Portrait/duplicado del mismo encuadre en horizontal — se descartan por
redundancia, no por mala calidad.

**Lectura general:** de las 54 fotos del A7 IV, **cerca de 30 son variantes
del mismo ángulo repetidas 2-4 veces** (cocina desde 4 puntos, baño desde 3,
dormitorio vacío desde 4). Es normal en una sesión de fotografía
profesional — el fotógrafo entrega la sesión completa y la curaduría es
tarea nuestra. De 54, **quedan ~18-20 aprovechables** para el recorrido.

### Fotografía adicional (`DSC*`, 8 fotos, Sony FX3)

| Archivo | Qué muestra | Uso |
|---|---|---|
| `DSC05094` | Pasillo interno con placard, mismo ambiente que aparece en el video | GAL |
| `DSC05102`, `DSC05104` | Fachada del Bloque 2 con luz rasante de atardecer (17:08h) — mejor luz que las del A7 IV, tomadas más tarde | **GAL** |
| `DSC05108`, `DSC05110`, `DSC05114` | Terraza cubierta interior, tres ángulos del mismo punto | 108 → GAL; 110/114 DESC (duplicado) |
| `DSC05116` | Detalle de mueble en penumbra, difícil de identificar qué es | DESC |
| `DSC05117` | Detalle del parrillero empotrado, recorte muy cerrado | DESC |

Esta cámara (FX3, cuerpo de cine) coincide en horario y ambientes con el
video `CAETANO Punta ballena 16 9 FHD.mp4` — son casi con certeza tomas del
mismo operador/sesión que filmó el video, usadas también para sacar fotos
fijas de respaldo.

---

## 3. Series panorámicas: **no hay ninguna aprovechable**

Se revisó el EXIF de las 74 fotos (`DateTimeOriginal`, GPS lat/lon/alt,
`GPSImgDirection`/yaw cuando existía) buscando el patrón típico de una
panorámica manual: varias fotos tomadas en 1-3 segundos, mismo punto GPS,
yaw rotando en pasos regulares.

- **El A7 IV y el FX3 no graban GPS** (cámaras sin GPS integrado) — no hay
  forma de agrupar sus fotos por posición, solo por timestamp. Los
  intervalos entre disparos son de **8 a más de 100 segundos**, consistente
  con un fotógrafo caminando y recomponiendo cada toma, no con una serie de
  giro sistemático (que sería de 1-3s entre cuadros).
- **El drone sí graba GPS, pero no graba `GPSImgDirection` (yaw) en el
  EXIF** de estos archivos. Agrupando por proximidad GPS igual:
  - `0053`+`0054`+`0055` están a menos de 20m entre sí y en menos de 60s,
    pero son **de dos cámaras físicas distintas** del mismo drone (Hasselblad
    principal + FC9284 secundaria) — es un bracket de lentes, no un giro de
    cámara.
  - `0035`+`0036` y `0023`+`0025` son pares landscape+portrait del mismo
    punto — dos fotos, no una serie.
  - No hay ningún punto con **más de 2 fotos** en el mismo lugar y momento.

**Conclusión: ninguna panorámica 360° real es reconstruible con este
material.** Ni el fotógrafo de arquitectura ni el piloto de drone
capturaron con la técnica de "girar y disparar cada X grados" que hace
falta para coser un equirectangular. Es material de fotografía real
estática, no de escaneo. Si se quiere una 360 real del Bloque 2 (que ya
está terminado y accesible), **hay que volver a filmar con cámara 360 o
contratar un Matterport** — no se puede fabricar con lo que hay.

---

## 4. El video (`CAETANO Punta ballena 16 9 FHD.mp4`)

- **Duración:** 82.8 segundos.
- **Resolución real:** 1920×1080 (Full HD, cumple lo que dice el nombre).
- **Códec/bitrate:** H.264 a **20.2 Mbps** — muy por encima de lo necesario
  para web (1080p web-quality anda entre 4 y 8 Mbps). Por eso pesa 209 MB
  para menos de un minuto y medio y media.
- **Contenido** (extraído con `ffmpeg` cada 8s): abre con una **aérea de
  drone** del complejo completo desde la costa, sigue con un recorrido a
  pie por el interior de la misma unidad de las fotos (cocina → living →
  terraza → escalera → dormitorio con placard), con una toma de la terraza
  donde se ve el horizonte con el skyline de Punta del Este a lo lejos. Es,
  en los hechos, **un making-of/recorrido de la sesión fotográfica**, no un
  video editado con intro/textos.
- **Sirve como intro real** del recorrido (Nivel 1 de la escalera ya
  contempla "video de intro tipo slideshow"; esto es mejor que un
  slideshow porque es filmación real, no fotos animadas) — pero conviene
  recortarlo (sacar tomas repetidas del mismo ambiente) y comprimirlo antes
  de subirlo.
- **Peso estimado comprimido para web:** a 6 Mbps (buena calidad,
  imperceptible la pérdida) → **~62 MB**. A 4 Mbps (aceptable para intro
  corta) → **~41 MB**. Cualquiera de las dos es razonable para streaming
  progresivo; el original de 209 MB no lo es.

---

## 5. Los dos PDFs

### `Baleia imagenes reales.pdf` (23 páginas, 27 MB)

Brochure armado en Canva (no es el vectorial `brochure-v6.pdf` que ya
estaba en `tools/baleia/material/docs/`). Reutiliza el texto y los planos
de unidad del brochure original, pero **reemplaza la portada, la foto del
Bloque 2 y la foto de la galería interior por las fotos reales** de esta
sesión (la del acceso Ubicación, el mapa y los renders de Amenities siguen
siendo los de siempre — no hay fotos reales de amenities todavía, siguen
siendo render nocturno de pileta/laguna). Confirma:
- El complejo es de **5 bloques**, diseño escalonado, acceso vehicular
  minimizado (ya sabido).
- Planos de las **9 unidades del Bloque 2** (A-E dúplex, F-I de 1
  dormitorio) — mismos números que ya estaban en
  `tools/baleia/out/baleia_unidades.csv`, no hay superficies nuevas.
- Contacto comercial: **Caetano Negocios Inmobiliarios + Dacal Bienes
  Raíces**, `+598 95 559 230`.

### `Baleia prueba brochure (1).pdf` (25 páginas, 24 MB) — **el importante**

Es una versión hermana del anterior (misma estructura, alguna página usa
renders en vez de foto real donde el anterior ya tenía foto real — parecen
ser dos exports del mismo diseño Canva en momentos distintos). Pero trae
**dos páginas finales que no están en el otro PDF y que no existían en
ningún lado del repo**: una lista de precios real.

**`BLOQUE 2 — DISPONIBLE · Entrega Diciembre 2026`**, fechada
**septiembre 2026**, firmada por Caetano Negocios Inmobiliarios
(`dcaetano@caetano.com.uy`):

| Unidad | Tipología | Dorm. | m² total | Precio (USD, cochera incluida) | Estado |
|---|---|---|---|---|---|
| 201 | Dúplex | 2 | 163.42 | 364.861 | Disponible |
| 202 | Dúplex | 2 | 160.50 | 358.638 | Disponible |
| 203 | Dúplex | 2 | 160.50 | 358.638 | Disponible |
| 204 | Dúplex | 2 | 160.50 | 358.638 | Disponible |
| 205 | Dúplex | 2 | 160.50 | 358.638 | Disponible |
| 206 | 2 amb. (reventa) | 1 | 84.45 | 235.000 | Disponible (reventa) |
| 207 | 2 amb. (reventa) | 1 | 82.50 | 235.000 | Disponible (reventa) |
| 208-209 | 1 dormitorio | 1 | — | — | **Vendidas** |

Condiciones comerciales que también aparecen y **no estaban documentadas
en ningún lado**: precio = m² cubierto USD 2.700 + semicubierto USD 1.350 +
descubierto USD 675 + cochera USD 10.000 fijo; forma de pago 50% anticipo +
12 cuotas mensuales al 6% anual; gastos de ocupación 4% aparte; entrega
diciembre 2026; precios sujetos a modificación sin previo aviso.

**Esto resuelve 3 de los 8 puntos pendientes que listaba
`tools/baleia/README.md`** ("Qué falta pedirle al cliente"): **estado**,
**precio/moneda** y **condiciones de financiación** — aunque solo para el
Bloque 2 (Bloque 1, 4 y 5 siguen sin datos de unidad; el punto de
**orientación** por unidad sigue sin aparecer en ningún documento).

---

## 6. Qué tomas de la lista de 21 quedaron cubiertas

Contra `docs/07-BALEIA-360/1-Lista-de-Tomas.md`, con fotografía real (no
panorámica, ver sección 3):

| # | Toma | ¿Cubierta? |
|---|---|---|
| 1, 2 | Aéreas de masterplan (90m y 35m sobre Bloque 3, viendo los 5 bloques) | **No.** Las aéreas del drone están centradas en el Bloque 2 o son vistas lejanas hacia la costa; ninguna muestra el escalonado de los 5 bloques a la vez |
| 3, 4 | Acceso exterior / circulación entre bloques | **No** |
| 5, 7, 8, 9 | Exterior de Bloque 1, 3, 4, 5 | **No** — solo existe Bloque 2 construido |
| 6 | Exterior de Bloque 2 | **Sí**, y de sobra (fachada completa, oblicua, aérea, atardecer) |
| 10-13 | Amenities (piscina, piscina infantil, rincón de fuego, laguna) | **No** — siguen siendo renders, cero fotos reales |
| 14 | Terraza de dúplex con vista al mar | **Parcial** — hay terraza real con parrillero y vista abierta, y una toma (`7IV01229`) donde se ve el skyline de Punta del Este, pero no es exactamente el encuadre "yaw 0 = mar" que pide la spec |
| 15 | Living con vista al mar a través de la apertura | **Parcial** — hay living con ventanales y vista al verde/horizonte, el mar no siempre se distingue nítido en el encuadre |
| 16 | Dormitorio principal | **Parcial** — dormitorio fotografiado pero vacío, sin amueblar, no se ve bien la relación con la apertura |
| 17 | Cocina | **Sí** — cocina completa, equipada, con vista de fondo en 2 tomas |
| 18-21 | Terraza/living/dormitorio/cocina de B3-D (1 dormitorio) | **No** — no hay ninguna unidad de Bloque 3 fotografiada (ni siquiera existe construida) |

**Resumen:** de 21 tomas pedidas, **3 quedan resueltas con foto real (6, 17,
y parcialmente 14/15)**. El resto sigue pendiente — y varias (1, 2, 10-13)
ni siquiera son fotografiables hoy porque el objeto que muestran (el
conjunto completo, los amenities) todavía no está construido.

---

## 7. Optimización web

Se generaron versiones WebP de 26 fotos seleccionadas (la curaduría de la
sección 2) en dos tamaños — completo (2000px de ancho) y miniatura
(480px) — en `tools/baleia/material-real/web/full/` y `.../thumb/`, con
nombres descriptivos en vez de los de cámara (`01_aerea_contexto_costa_lejos.webp`,
`11_vista_terraza_peninsula_skyline.webp`, etc. — ver la tabla de la
sección 2 para el mapeo completo original→nuevo nombre).

| | Tamaño |
|---|---|
| 26 fotos originales (JPG) | 439.7 MB |
| Mismas 26, WebP completo (2000px, q78) | 8.1 MB |
| Mismas 26, WebP miniatura (480px, q70) | 0.5 MB |
| **Reducción** | **98.2%** |
| Las 74 fotos originales sin optimizar | 1.2 GB |

Nada de esto se subió a `apps/` — quedó en `tools/baleia/material-real/`
para que quien arme la galería lo integre cuando corresponda.

---

## 8. Dónde está Baleia ahora en la escalera de niveles

`docs/04-PRODUCCION/2-Escalera-de-Niveles-de-Material.md` lo tenía en
**Nivel 1** (brochure + renders bajo 3000px), con la salvedad de que
faltaba Nivel 2 (panorámicas) para poder subir.

**Formalmente, Baleia sigue en Nivel 1** — la escalera es acumulativa y
Nivel 2 (panorámicas 360, de render o reales) sigue sin existir. Ninguna
de las 74 fotos ni el video son panorámicas equirectangulares (sección 3).

Pero el diagnóstico real es más interesante que "sigue en Nivel 1":

- **El ingrediente completo de Nivel 3** ("+ Drone del terreno") ya está en
  la mano: hay fotografía aérea real del predio, no solo del terreno vacío
  sino del Bloque 2 construido, con el skyline de Punta del Este visible
  — mejor prueba de la que pedía ese nivel.
- **Hay un adelanto del Nivel 4** ("obra terminada: fotografía real") pero
  incompleto: existe una unidad del Bloque 2 fotografiada de punta a punta
  en foto plana de alta calidad — falta que sea *panorámica* para que
  cuente como Nivel 4 real, y falta que sea así para más de una unidad.
- **Nivel 2 sigue siendo el cuello de botella**, pero cambió qué conviene
  pedir: antes la recomendación era encargar panorámicas de *render* al
  estudio 3D (Bloque 1, 4 y 5 siguen en pozo, ahí sigue siendo la única
  opción). Para el **Bloque 2**, que ya está terminado y accesible, **ya no
  tiene sentido pedir panorámicas de render — conviene ir directo a
  fotografiar en 360 real (cámara 360 o Matterport)** la unidad modelo y el
  edificio, saltando el Nivel 2 sintético por completo para ese bloque.

**Recomendación concreta:** contratar una sesión de 360 real (cámara
insta360/theta o escaneo Matterport) en la unidad del Bloque 2 ya
fotografiada — sigue en pie y accesible — antes de que se entregue y se
amueble con mobiliario del comprador. Es la oportunidad más barata que va
a existir de tener Nivel 4 real en al menos un bloque, mientras que Bloque
1, 3, 4 y 5 siguen dependiendo de renders (Nivel 2) hasta que se
construyan.

---

## 9. Qué sigue faltando

1. **Ninguna panorámica 360°, ni de render ni real**, para ningún bloque ni
   amenity — el recorrido interactivo real sigue sin poder empezar a
   armarse funcionalmente (solo hotspots informativos con foto, no
   navegación 360).
2. **Amenities sin fotografiar** — piscina, piscina infantil, rincón de
   fuego y laguna siguen siendo 100% render, pese a que la lista de tomas
   los pide con prioridad alta (tomas 10 y 13 son "mínimo viable").
3. **Bloque 1, 3, 4 y 5** sin ninguna foto real — siguen en pozo. Si se
   quiere material real de ellos hay que esperar a que avance la obra (ya
   se sabe por el brochure que 1 y 3 son "próximamente").
4. **La toma aérea de conjunto** (los 5 bloques escalonados vistos juntos)
   no se puede lograr todavía con drone real porque los otros 4 bloques no
   están construidos — seguirá dependiendo del render hasta que haya más
   obra en pie.
5. **Orientación por unidad** — sigue sin aparecer en ningún documento
   (brochure, PDFs nuevos, ni la lista de precios).
6. **Confirmar con el fotógrafo/estudio** si existe intención de volver a
   filmar en 360 (cámara dedicada) el Bloque 2 mientras la unidad esté
   vacía y accesible — es la ventana de oportunidad más barata para saltar
   directo a Nivel 4 en ese bloque, y se cierra en cuanto se entregue.
7. **El video pesa 209 MB sin necesidad** (20.2 Mbps de bitrate) — antes de
   subirlo a cualquier lado, recomprimir a 4-6 Mbps (ver sección 4).
