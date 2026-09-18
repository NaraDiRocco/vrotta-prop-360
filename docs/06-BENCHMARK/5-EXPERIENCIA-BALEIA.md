# La experiencia de Baleia — el caminito, diseñado con lo que hay (06-09-2026)

Documento de diseño, no de código. Define la experiencia interactiva completa del recorrido de Baleia (Punta Ballena, Uruguay) a partir del pedido textual del cliente:

> "Lo importante es que sea interactivo. Tenemos también la posibilidad de ir mostrando diferentes fotos, ya sean renders o ya sean fotos reales. Creo que el caminito desde el acceso al complejo, después el bloque, después los amenities, el video, poder consultar, ver los detalles y demás."

**Insumos leídos**: `docs/08-MATERIAL-REAL/README.md` (inventario, la restricción principal), `docs/06-BENCHMARK/1-UX-Movil-MP360.md`, `2-Features-Desktop-MP360.md`, `3-PLAN-EXPERIENCIA.md`, `4-Urbania3D.md`, `tools/baleia/README.md`, `docs/07-BALEIA-360/*`, `apps/viewer/src/` completo, `tools/baleia/out/tour/tour.json`, `tools/baleia/out/baleia_unidades.csv`. Se miraron una por una las 26 fotos web, los pares antes/después de IA, el primer y el último cuadro de los videos generados, y los planos 3D.

**Qué hereda del plan anterior y qué cambia.** `3-PLAN-EXPERIENCIA.md` (30-08) diseñó el visor para un proyecto en pozo: masterplan + 7 renders, cero fotos. Sus decisiones estructurales siguen en pie y no se repiten acá (deep links por hash, plano girado a pantalla completa, ficha de tres alturas, CTA de WhatsApp con deep link, tres pestañas abajo, cero modal de bienvenida, Atrás por capas, presupuesto de carga). Lo que cambia es el material: **el Bloque 2 está construido y fotografiado**, hay precios reales, hay video real. Este documento diseña el recorrido que ese material permite, y que ningún competidor del benchmark puede ofrecer con renders.

---

## 0. La premisa y el inventario de uso

### La frase que ordena todo

> **Baleia es el único recorrido del benchmark donde lo que ves ya existe.** Cada decisión de diseño de abajo sirve para que el visitante lo note sin que se lo digamos, y para que cuando algo no exista todavía (amenities, bloques 1/3/4/5) lo sepa sin sentirse engañado.

MP360 y Urbania venden renders. Urbania incluso genera sus vuelos de cámara con IA (`4-Urbania3D.md`, §1). Nosotros tenemos una unidad terminada, con luz de sol real, polvo de obra alrededor y el skyline de Punta del Este en la ventana. Esa asimetría es la ventaja, y la experiencia la tiene que hacer visible.

### El material, ordenado por para qué sirve

| Material | Cantidad | Estado | Dónde vive en la experiencia |
|---|---|---|---|
| Fotos reales curadas (WebP 2000px + thumb 480px) | 26 | Listo, `tools/baleia/material-real/web/` | Bienvenida, Tramo 1, Tramo 2 (exterior + interior), Tramo 5 |
| Aéreas de drone | 12 (6 curadas en las 26) | Listo | Bienvenida, Tramo 1, slider Tramo 2 |
| Video real (reel editado, 83 s, ~50 planos) | 1 | **Fuera del repo** (`elementos baleia/`), 209 MB sin comprimir | Tramo 4, recomprimido a 4-6 Mbps |
| Tomas crudas largas del video | ? | **Sin descargar** | Tramo 4 v2 (capítulos largos) |
| Videos generados con IA (10 s, 1080p, 3,6 MB c/u) | 2 | Listo, `tools/baleia/media/video/` | **No en la v1** — ver §2, la geometría del conjunto no es fiel al masterplan |
| Pares foto real / amueblado virtual IA | 3 pares (fachada atardecer, aérea de balcones ×2 variantes, terraza) | Listo, `~/Desktop/Baleia ia/output/images/` | Slider antes/después, Tramo 2 |
| Planos 3D de tipologías | 7 imágenes (A, B-D, C-E, F, G, H, I) cubren las 9 | Listo, misma carpeta | Ficha de unidad, Tramo 5 |
| Planos PDF por unidad | 9 (A-I) | En `~/Downloads/`, hay que moverlos a `tools/baleia/material/` | Botón "Descargar plano" en la ficha |
| Masterplan + 11 polígonos (5 bloques, 5 amenities, perímetro) | 1 | Listo, en el visor | Tramo 1, pestaña Plano, minimapa |
| Renders (exteriores, ninguno de interior) | 7 | Listo, en el visor | Tramo 3 (amenities), acceso en Tramo 1 |
| Precios y estado reales del Bloque 2 | 9 unidades | En el CSV y `availability.json` | Ficha, lista, mensaje de WhatsApp |
| Logos oficiales (SVG, PNG blanco y negro) | 6 archivos | En `~/Downloads/baleia-logo*` | Shell de arranque, barra |
| Panorámicas 360 | **0** | Descartado fabricarlas con este material | No se promete. Ver §7 |
| Fotos reales de amenities | **0** | No existen los amenities | Tramo 3 resuelto con renders etiquetados, §4 |
| Aérea de los 5 bloques juntos | **0** | Imposible hasta que haya más obra | Se reemplaza con masterplan + render, §1 |

**Regla del documento**: nada de lo que sigue necesita material que no esté en esta tabla. Donde una idea mejoraría con material nuevo, está marcada **[Necesita: …]** y al lado dice qué se hace mientras tanto.

---

## 1. El recorrido, paso a paso

### La forma: un riel de seis tramos sobre el mapa

El caminito es **lineal por diseño y libre por construcción**. Se recorre en orden (es una historia: llegás, entrás al edificio, ves lo que va a rodearlo, lo ves en movimiento, elegís, escribís), pero cada tramo es una escena con su propio hash (`#/scene/llegada`, `#/scene/bloque-2`, …) y el masterplan está siempre a un toque. Nadie queda preso del orden.

```
┌──────────────────────────────┐
│ Baleia              [◱] [☰]  │  ← barra mínima: logo, compartir, menú
│                              │
│                              │
│      CONTENIDO DEL TRAMO     │  ← scroll vertical = profundizar en el tramo
│      (foto / slider / mapa)  │
│                              │
│                              │
│  ● ● ○ ○ ○ ○   Tramo 2 de 6  │  ← riel: seis puntos, nombre, progreso
│  [ Siguiente: los amenities →]│  ← un solo botón grande, siempre visible
├──────────────────────────────┤
│  ⌂ Recorrido  ▦ Plano  ☰ Unidades │  ← pestañas de `nav.ts`, el Recorrido reemplaza a "Vistas"
└──────────────────────────────┘
```

**Regla de gestos** (vale para todo el recorrido, se aprende una vez):

- **Vertical = profundidad.** Scrolleás hacia abajo dentro de un tramo y aparecen sus capas (la foto grande, después el slider, después la galería, después el texto).
- **Horizontal = hermanos.** Swipe entre fotos de una misma serie, entre unidades de un mismo bloque. Nunca entre tramos: el cambio de tramo es un botón explícito ("Siguiente: …"), para que el swipe de las fotos no cambie de capítulo por error.
- **Toque = entrar.** Un bloque, una unidad, una foto: se abren.
- **Atrás = salir de la última capa**, en el orden que ya definió `3-PLAN-EXPERIENCIA.md` §2. Nunca saca del recorrido de un salto.

**Los seis tramos**, con lo que el visitante ve, toca, aprende y cómo pasa al siguiente. El orden del cliente se respeta con un cambio: "consultar" y "detalles" se invierten (5 = detalles, 6 = consultar), porque la consulta buena necesita la unidad ya elegida. "Consultar" no se pierde por eso: hay un acceso a WhatsApp en cada tramo (ver §6).

### Tramo 1 — La llegada

**Qué ve.** Tres imágenes reales en secuencia vertical, de lejos a cerca:

1. `01_aerea_contexto_costa_lejos` — el predio entre el monte y la costa, a 122 m de altura. Caption: "El terreno, entre el bosque y la Ruta 10. Foto real, 2 sep 2026."
2. `04_aerea_skyline_punta_del_este` — sobre la azotea del Bloque 2, con el skyline de Punta del Este nítido sobre el mar. Sobre la foto, una **etiqueta tocable** anclada al skyline: "Punta del Este". Es la idea de First Tower (contexto sobre la portada, sin interacción) aplicada a la única cosa que Baleia vende de verdad: la vista.
3. El **masterplan girado a pantalla completa** (ya construido, `plan-orientation.ts`), con un trazo animado que dibuja el camino desde el acceso **A** (esquina de Carlos Páez Vilaró) bajando hacia los bloques, en 1,5 s. Los cinco bloques ya visibles con su estado: **B2 "Construido · Entrega dic 2026"**, B1 y B3 "Próximamente", B4 y B5 en contorno sin etiqueta comercial (no hay dato; no se inventa). Abajo, la leyenda del terreno en una línea: "El terreno baja de oeste a este: el Bloque 1 es el más alto, el 5 el más bajo. Los amenities, abajo, contra la Ruta 10." (verificado contra el corte topográfico, brochure pág. 9).

**Qué toca.** La etiqueta "Punta del Este" (abre una línea: "Distancia y tiempos: pedir al cliente" — o nada, si no se confirma el dato; no inventar kilómetros). Los polígonos del plano (abren la ficha de bloque, como hoy). El render `acceso` aparece como cuarta capa, **enmarcado y etiquetado "Render del proyecto"** (ver §5): es la única imagen de este tramo que no es foto, y se ve distinta a propósito.

**Qué aprende.** Dónde está, que se ve la Punta, que hay cinco bloques escalonados y uno ya construido.

**Cómo sigue.** Botón "Siguiente: el Bloque 2, construido →". En el plano, B2 pulsa una vez cuando el botón entra en pantalla: el visitante entiende adónde va antes de tocar.

### Tramo 2 — El bloque (afuera y adentro)

El tramo más largo y el corazón del recorrido: es la prueba de que esto existe. Tiene dos mitades con scroll continuo.

**Mitad A — afuera.**

1. Apertura: `02_aerea_bloque2_oblicua_cercana` (la HERO del inventario) a pantalla completa con un push-in lento. Caption: "Bloque 2. Tres niveles, nueve unidades. Foto real."
2. **Slider antes/después**: `24_fachada_bloque2_atardecer_angulo` (la fachada hoy, foto real) contra la misma fachada, mismo ángulo, con el paisajismo terminado. Rótulos: izquierda "Hoy · foto real", derecha "Con el paisajismo terminado". Mecánica en §3.1 — reemplaza al par anterior (render del proyecto contra una foto de otra distancia, que no comparaba bien porque las dos imágenes no compartían cámara); antes de ese par hubo dos deslizadores "foto real vs. IA", que se sacaron por el mismo motivo que se explica en §3.1.
3. Serie de fachada, swipe horizontal: `07`, `08`, `09`, `23`. Contador "2/4". Con la luz del atardecer (`23`, `24`, tomadas a las 17:08) al final, porque es la que mejor luce.

**Mitad B — adentro: el paseo por la unidad terminada.**

No es una galería: es un **paseo con orden de casa**. Once fotos, cada una con un rótulo de ambiente y una frase que enseña algo que se ve en la foto (no una ficha técnica; sólo lo que la imagen muestra):

| # | Foto | Ambiente | Lo que enseña la caption |
|---|---|---|---|
| 1 | `16_living_comedor_amplio` | Living | "Living-comedor de un dúplex. Piso de madera, ventanales corredizos a la terraza." |
| 2 | `14_living_ventanales_vista_verde` | Living | "Los ventanales dan al este: la vista, no el estacionamiento." |
| 3 | `17_cocina_equipada_completa` | Cocina | "Cocina entregada así: mesada de cuarzo negro, horno y anafe instalados." |
| 4 | `18_cocina_vista_horizonte_mar` | Cocina | "Desde la cocina, el horizonte." |
| 5 | `21_escalera_interna_duplex` | Escalera | "La escalera del dúplex: dos plantas." |
| 6 | `20_dormitorio_placard_vacio` | Dormitorio | "Dormitorio con placard instalado. Sin amueblar: así se entrega." |
| 7 | `19_bano_completo_ducha` | Baño | "Baño completo, mampara de vidrio, sanitarios colocados." |
| 8 | `12_terraza_pergolotecho_parrillero` | Terraza | "Terraza con parrillero de obra." |
| 9 | `22_parrillero_empotrado_detalle` | Terraza | "El parrillero, de cerca." |
| 10 | `13_terraza_sillon_vista_verde` | Terraza | "Y la terraza mira al verde." |
| 11 | `11_vista_terraza_peninsula_skyline` | La vista | **"Desde esta terraza: Punta del Este sobre el mar. Sin retoque."** |

El orden termina en la foto más importante del lote. Es la recompensa por haber llegado hasta acá, y es la que el visitante va a compartir.

**Navegación del paseo**: swipe horizontal entre fotos; arriba, una **tira de ambientes** ("Living · Cocina · Escalera · Dormitorio · Baño · Terraza · Vista") que marca dónde está y permite saltar. **[Necesita: confirmar con el fotógrafo qué unidad se fotografió.]** El inventario dice "probablemente un dúplex tipo A-E, a confirmar". Cuando se confirme, la tira de ambientes se reemplaza por el **plano 3D de esa tipología como minimapa**, con un punto que se mueve al ambiente de cada foto — es el mismo mecanismo de "ubicación en piso" que Urbania muestra en la ficha, pero sobre foto real. Hasta entonces, la tira de texto, y la ficha dice "Unidad modelo del Bloque 2" sin asignarle letra.

**Qué toca.** El slider antes/después. El swipe del paseo. Al final, el botón **"Ver las 9 unidades del Bloque 2"** abre la ficha de bloque (hoja inferior, ya construida) con la grilla y los precios. Y un segundo botón, discreto: **"Coordinar una visita"** — porque la unidad está construida y se puede visitar, algo que ningún proyecto en pozo puede ofrecer (ver §6).

**Cómo sigue.** "Siguiente: los amenities →". Antes de pasar, una línea de transición honesta: "Lo que sigue todavía no está construido. Lo mostramos como proyecto."

### Tramo 3 — Los amenities (y el conjunto)

Es el tramo donde el material cambia de naturaleza (de foto a render) y el diseño lo dice. El detalle del tratamiento está en §4; acá, la secuencia:

1. **Dónde están, en real.** El masterplan hace zoom animado al extremo bajo (D piscina, E piscina infantil, F rincón de fuego, G laguna, más el clubhouse) con etiquetas visibles. Caption: "El sector de amenities, en el punto más bajo del terreno, junto a la Ruta 10."
2. **Cómo va a quedar.** El render `amenities` (piscina, fuego y laguna, nocturno) **enmarcado**, con la chapa "Render del proyecto". Luego `complejo-laguna` (el conjunto entero visto desde la laguna: la única imagen que muestra los cinco bloques a la vez, porque no existe ninguna aérea real de los cinco) y `complejo-pergola`.
3. **Qué hay hoy.** Un toque en "Ver el sector hoy" muestra `01_aerea_contexto_costa_lejos` con el área de amenities resaltada sobre la foto. Es la contracara honesta del render: hoy es monte y tierra. **[Necesita: una aérea real del extremo bajo del predio, encuadrada al sector de amenities.]** Con las 12 aéreas de hoy, la 01 es la única que abarca el sector, y desde muy lejos. Mientras tanto, se usa esa.

**Qué toca.** Cada amenity en el plano (hoy los cuatro saltan al mismo render; queda así y se explicita: "Los cuatro amenities aparecen en esta vista"). El interruptor "Proyecto / Hoy" (§4).

**Qué aprende.** Qué va a haber, dónde, y que todavía no está. Sin fecha: **la fecha de los amenities no está en ningún documento del proyecto; no se inventa.** Se pide (§7).

**Cómo sigue.** "Siguiente: el video →".

### Tramo 4 — El video

El reel real de 83 s (`CAETANO Punta ballena 16 9 FHD.mp4`), recomprimido a 4-6 Mbps (41-62 MB). **Nunca es puerta**: es un tramo más, y sólo empieza a descargar cuando el visitante llega a él. Poster: un cuadro real del propio video (la aérea de apertura), no un render.

**Diseño del reproductor**, porque un `<video>` pelado no es interactivo:

- **Arranca silenciado y en loop al entrar en pantalla** (política de autoplay móvil). Un toque activa el sonido si el video lo tiene; si no tiene banda, no se ofrece el botón.
- **Capítulos tocables** debajo del video, con miniatura real: "Aérea · Cocina · Living · Terraza · Escalera · Dormitorio · La vista". Tocar un capítulo hace seek. El reel tiene un corte cada 1,5-2 s; los capítulos agrupan esos cortes por ambiente. **[Necesita: marcar los timestamps una vez, con el archivo en la mano.]** El video está fuera del repo; el inventario lo describió con cuadros cada 8 s, no con la lista de cortes.
- **Scrub por arrastre horizontal sobre el video** (no sólo sobre la barra). En un reel de planos cortos, arrastrar es la forma de "hojearlo".
- Vertical en el teléfono: el video es 16:9; se muestra a lo ancho con los capítulos debajo, sin forzar landscape. Botón de pantalla completa para quien quiera girar.

**El otro video, el generado con IA**: no entra en la v1. Ver §2 para el razonamiento y qué hacer con él.

**Qué aprende.** Que hay una obra viva y que se filmó de verdad. **Cómo sigue.** "Siguiente: elegí tu unidad →".

### Tramo 5 — Los detalles (elegir la unidad)

Acá vive el "camino de datos" del plan anterior, concentrado en lo que hoy es vendible: el Bloque 2.

1. **La grilla de 9 unidades**, cada celda con número comercial, tipología, m² y **precio o estado**: 201 · Dúplex · 163 m² · USD 364.861; 202-205 · Dúplex · 160,50 m² · USD 358.638; 206 y 207 · 1 dormitorio · USD 235.000; 208 y 209 · Vendidas. La celda no oculta lo vendido: dos vendidas sobre nueve es un dato de venta, no un hueco.
2. **La ficha de unidad** (hoja de tres alturas, ya diseñada en el plan §4), con lo nuevo que el material permite:
   - **Plano 3D de la tipología** (`unidad-A-plano-3D-minimalista`, etc.) como imagen principal, con pinch-zoom. Nota visible cuando el plano cubre dos letras ("B-D", "C-E"): "Plano de las unidades B y D."
   - **"Descargar plano en PDF"** — el PDF por unidad ya existe. Urbania lo tiene y lo cobra como feature; nosotros tenemos el archivo.
   - Precio, y debajo las **condiciones tal como están en la lista**: "50% de anticipo + 12 cuotas mensuales al 6% anual. Gastos de ocupación 4% aparte. Cochera incluida. Entrega diciembre 2026." Y la línea del brochure, textual: "Precios de lista, septiembre 2026, sujetos a modificación."
   - **"Ver la unidad modelo"**: un enlace de vuelta al paseo del Tramo 2, ya que la unidad fotografiada es la prueba material de lo que se compra. Si se confirma qué letra es, en esa ficha aparece "Esta es la unidad fotografiada."
   - Lo que **no** se muestra porque no existe: orientación por unidad (el brochure no la da), dormitorios de las 1 dormitorio más allá del nombre, cotas.
3. **Filtros** como chips (`units-panel.ts`, ya construido): "Disponibles", "Dúplex / 1 dormitorio". Con 9 unidades es un índice; el componente escala.

**Bloques 1 y 3**: aparecen en la pestaña Unidades como grupos "Próximamente", con las 11 plantas del Bloque 3 visibles sin precio (el material las tiene; ocultar información no gana confianza). Sin CTA de compra: el CTA dice "Avisame cuando salga a la venta" (variante de mensaje, §6). **Bloques 4 y 5**: no aparecen en la lista; en el plano son contorno.

**Cómo sigue.** Con la unidad abierta, el CTA de la ficha es el Tramo 6. Sin unidad elegida, "Siguiente: consultar →" lleva al cierre general.

### Tramo 6 — Consultar

El cierre por WhatsApp con la unidad identificada. Diseño completo en §6. En una línea: un botón, un mensaje prellenado con número de unidad, tipología, m², precio, condiciones y el deep link a lo que el visitante estaba mirando; y dos variantes que sólo Baleia puede ofrecer: **"Quiero visitarla"** (está construida) y **"Mandame el plano en PDF"** (existe).

---

## 2. La bienvenida: los primeros ocho segundos

### El problema a resolver

Hay dos videos de 10 s generados con IA que arrancan de la aérea real del bloque en obra y hacen "crecer" el conjunto encima. Son atmosféricos y pesan poco (3,6 MB). Pero **la geometría del conjunto que aparece no es la del masterplan**: mirando el último cuadro, los bloques generados se apilan hacia la costa en un esquema que no coincide con la franja de 250 m que baja de oeste a este con cinco barras escalonadas. Ponerlo como apertura significa que lo primero que ve el comprador es una versión inventada del proyecto — y en un recorrido cuyo argumento es "esto existe", abrir con una invención es contradecirse en el segundo uno.

**Decisión: la bienvenida es 100% fotografía real. El video de IA no abre el recorrido.** Se resuelve la tensión a favor de la honestidad, y con el material real alcanza para abrir bien.

### Segundo a segundo

| t | Qué se ve | Con qué |
|---|---|---|
| 0,0-0,3 s | Fondo oscuro de marca, el logo blanco (`baleia-logo.svg`) y "Punta Ballena" debajo. Barra de progreso fina. Nunca texto pelado sobre negro. | Shell HTML inline, sin esperar JS. |
| 0,3-1,0 s | La aérea `02_aerea_bloque2_oblicua_cercana` entra **borrosa** (thumb de 480 px, ~15 KB) a pantalla completa y se enfoca cuando llega la versión de 2000 px. Empieza un push-in imperceptible (escala 1,00 → 1,06 en 8 s). | Blur-up ya previsto en el plan §7. |
| 1,5 s | Una sola línea, grande, abajo a la izquierda: **"El Bloque 2 ya está construido."** Debajo, en chico: "Foto real · 2 de septiembre de 2026". | La fecha es la del EXIF. Es la primera chapa de procedencia (§5) y funciona como argumento. |
| 2,5 s | Un botón único y rotulado: **"Empezar el recorrido"**. Debajo, un enlace secundario: "Ir directo al plano". Abajo, el riel de seis puntos con los nombres: el visitante sabe cuánto dura esto antes de entrar (el problema #1 de Jacarandá era no saber qué pasa al tocar; el de Urbania, una intro de 14 MB). | El riel es el mismo componente del recorrido. |
| 5,0 s (si no tocó) | Fundido a `11_vista_terraza_peninsula_skyline` con la caption: **"Desde la terraza de una unidad: Punta del Este."** Push-in igual de lento. | Dos fotos, en loop cruzado cada 5 s. Nada más. |
| 8,0 s | Si todavía no tocó, no pasa nada más: el loop sigue. No hay autoplay al recorrido, no hay cuenta regresiva. | Anti-requisito: cero gate, cero video, cero audio. |

**Peso total de la bienvenida**: dos thumbs (~30 KB) de entrada, dos fotos completas (~720 KB) que llegan detrás. Menos de 1 MB antes del primer toque; el Tramo 1 se precarga (thumbs) mientras el visitante lee.

**Tres casos que saltean la bienvenida** (ya previsto en el plan; se confirma):
- Deep link a unidad (`#/scene/…/unit/201`): directo a la ficha en peek sobre el plano.
- Deep link a un tramo (`#/scene/bloque-2`): directo al tramo.
- Visitante que ya la vio (flag local): directo a donde dejó, o al plano.

### Qué hacer con el video de IA

No se tira: se le da un lugar donde su naturaleza (una proyección) coincide con lo que muestra. Dos condiciones para que entre, en este orden:

1. **Regenerarlo con un cuadro final fiel.** El propio `prompt-higgsfield-torres.md` lo prevé: "si hay end frame disponible, usar una foto del bloque terminado con encuadre similar para forzar la transformación real". Para el conjunto, el end frame tiene que ser el **render aprobado del complejo desde el mismo ángulo** — no existe hoy un render aéreo desde el punto de la aérea 0031 **[Necesita: un render del conjunto desde el ángulo de la aérea real, al estudio 3D]**. Sin eso, el modelo sigue inventando.
2. **Ubicarlo en el Tramo 3**, como la transición "Hoy → Proyecto" del sector, con la chapa "Recreación con IA sobre foto real · no es el proyecto definitivo" (§5). Ahí el visitante ya vio lo real, ya sabe que los amenities son proyecto, y un video que "hace crecer" el conjunto es coherente con lo que se le está contando.

Mientras no se cumpla la condición 1, la variante "respiración" (la más quieta) puede usarse **sólo** como fondo de la pantalla de compartir o de la página de "Qué es real", nunca como imagen del proyecto. Lo más honesto y más simple: no usarlo hasta que exista el end frame fiel.

---

## 3. La interactividad, gesto por gesto

El cliente insiste en "interactivo". Lo que sigue son los controles concretos, móvil primero (375 px de ancho, una mano, pulgar en el tercio inferior). Todo respeta las reglas duras del plan anterior: objetivos de 44×44 px, respuesta visible al toque en menos de 100 ms, nada de menús contextuales sobre la escena.

### 3.1 El deslizador antes/después

Versión revisada (esta edición, segunda vuelta): la idea validada seguía en pie, pero el par que la implementaba no. Antes de éste hubo dos deslizadores presentados como "foto real vs. IA": comparaban una foto real contra una recreación con IA de la MISMA foto, con mobiliario y paisajismo agregado encima. Rotular eso "IA" hacía sospechar que el edificio era inventado, cuando lo único inventado eran los muebles — un autogol comercial. Se reemplazaron por un deslizador render del proyecto vs. foto de lo construido, que a su vez se descartó porque las dos imágenes estaban tomadas desde distancias distintas: el deslizador no comparaba bien. La versión que queda es **un solo deslizador, la fachada del Bloque 2 hoy contra el mismo ángulo con el paisajismo terminado**: la imagen de "después" se generó A PARTIR de la foto de "antes", así que el ángulo calza por construcción — es la comparación que sí funciona, y sigue sin nombrar IA en ningún rótulo: lo único que cambia entre las dos imágenes es el paisajismo, no el edificio, y decirlo así es más honesto que ponerle una chapa que sugiera que el edificio es inventado.

- **El par**: `24_fachada_bloque2_atardecer_angulo` (la fachada del Bloque 2 hoy, foto real, de `material-real/`) contra la imagen generada de `generado-ia/paisajismo/DSC05104-paisajismo-baleia.webp`. Comparten cámara por construcción: mismo ángulo, mismo destello de sol. La diferencia entre las dos es la que importa: la de "después" tiene césped y canteros plantados donde la foto real tiene tierra y escombros — falta el paisajismo, no el edificio.
- **Composición**: las dos imágenes superpuestas, la de "después" recortada por una máscara vertical cuyo borde es el divisor. Un asa circular de 44 px sobre el divisor, con dos flechas. Rótulos fijos en las esquinas superiores: **"Hoy · foto real"** (izquierda) y **"Con el paisajismo terminado"** (derecha); el rótulo del lado que queda tapado se atenúa.
- **Primer contacto**: al entrar en pantalla, el divisor hace un **barrido automático de foto real completa a la mitad, en 1,2 s**, una sola vez — nunca al revés: el estado de arranque y de reposo seguro es siempre la foto real completa (nunca la imagen de "después" por defecto). Enseña el gesto sin texto. Con `prefers-reduced-motion`, arranca a la mitad, quieto.
- **Arrastre en cualquier punto de la imagen**, no sólo en el asa: el dedo tapa el asa. Arrastre horizontal mueve el divisor; el scroll vertical de la página sigue funcionando (umbral: si el gesto arranca con más componente vertical que horizontal, es scroll).
- **Toque simple** (sin arrastre): alterna entre las dos imágenes completas con una transición de 400 ms. Para quien quiere ver las dos enteras.
- **Doble toque**: vuelve a la mitad.
- **Formato**: las dos imágenes son verticales (2:3, como la foto original) y entran enteras en el teléfono — no hace falta recortarlas ni el botón "Ver completo" (ese camino sigue existiendo en el componente para un par horizontal, pero este par no lo usa).
- **Escritorio**: mismo comportamiento con el mouse; teclas ← → mueven el divisor 5 %.
- **Ninguna de las dos imágenes está restringida**: las dos son públicas y ninguna necesita esconderse fuera del slider. Lo que sigue vigente es la regla general del recorrido: la foto es la norma, así que si se comparte el tramo, la imagen de vista previa es siempre la foto real.

### 3.2 Recorrer muchas imágenes sin que sea una galería

El problema: 26 fotos como grilla es un álbum, y un álbum se hojea y se abandona. Cuatro mecanismos, ya usados arriba:

1. **Secuencia con sentido** (Tramo 2): las fotos van en el orden en que se recorre una casa y cada una enseña una cosa. El contador "7/11" y la tira de ambientes dicen dónde estás y cuánto falta.
2. **El minimapa de la unidad** (cuando se confirme la tipología): el plano 3D con un punto que se mueve al ambiente de la foto activa. Tocar un ambiente en el plano salta a su foto. Es la forma de que el visitante "camine" el dúplex sin panorámicas.
3. **Comparación en vez de acumulación** (los sliders): dos fotos del mismo punto valen más que ocho distintas.
4. **Etiquetas sobre la foto** (Tramo 1): puntos tocables anclados a lo que se ve. Sólo para lo verificable en la imagen — "Punta del Este" en el skyline, "Ruta 10" en la aérea. Nada de distancias inventadas.

Y una regla de descarte: **las fotos que no enseñan nada nuevo no entran** aunque sean buenas. De las 26 web, el recorrido usa 20; `03`, `05`, `10`, `15`, `25`, `26` quedan como respaldo en la pestaña Plano ("Todas las fotos"), no en el caminito.

### 3.3 De un bloque a una unidad, y volver

Tres puntos de entrada a la misma ficha, un solo camino de vuelta:

- **Desde el plano**: toque en el polígono B2 → destello del borde (< 100 ms) → hoja de bloque en peek ("Bloque 2 · 9 unidades · 7 disponibles · desde USD 235.000 · Entrega dic 2026") → toque en una celda → hoja de unidad, con "← Bloque 2" arriba.
- **Desde el Tramo 2**: botón "Ver las 9 unidades" → misma hoja de bloque.
- **Desde la pestaña Unidades**: fila de la lista → hoja de unidad.
- **Volver**: arrastrar la hoja hacia abajo, la ×, o Atrás del sistema. Siempre una capa por vez. El plano nunca se fue: con la hoja en peek (30 %) el bloque resaltado sigue a la vista porque el plano ocupa toda la pantalla (la ventaja de `plan-orientation.ts`).

**Orientación permanente**: dentro del recorrido, arriba a la derecha, un **minimapa del masterplan** de 64 px de alto con el bloque o sector del tramo actual resaltado. En un complejo de cinco barras iguales perderse es fácil; el minimapa es el "estás acá". Toque → pestaña Plano con ese sector encuadrado.

### 3.4 Lo que NO es interactividad

Girar el teléfono para "mirar alrededor", giroscopio, música, partículas sobre el render, hotspots que pulsan sin parar. Nada de eso. La interactividad de Baleia es **elegir qué mirar y comparar** — y que cada toque responda.

---

## 4. El problema de los amenities

**El problema, con precisión**: el 80 % del recorrido es fotografía real. Los amenities (piscina, piscina infantil, rincón de fuego, laguna, clubhouse) son 100 % render, y el conjunto de cinco bloques sólo existe como render `complejo-laguna`. Si un render se muestra igual que una foto, el visitante que acaba de ver la unidad real puede asumir que la piscina también está — y cuando descubra que no, va a dudar de todo lo anterior, incluida la foto del skyline. La confianza que gana lo real se pierde entera con una sola mezcla sin aviso.

**La propuesta: dos naturalezas, dos tratamientos visuales, un interruptor.**

### Foto y render nunca se ven igual

| | Foto real | Render del proyecto |
|---|---|---|
| Encuadre en pantalla | **A sangre**, borde a borde | **Enmarcado**: margen de 12 px y un filete de 1 px del color de marca |
| Chapa de procedencia (§5) | "Foto real · 2 sep 2026", esquina inferior izquierda | "Render del proyecto", esquina superior izquierda, con ícono de plano |
| Caption | Lo que se ve | Lo que va a haber, en futuro: "Acá va a estar la piscina" |
| Miniatura en el riel y en la galería | Normal | Con el mismo filete |

Es una regla que se **siente** sin leerse: la foto ocupa todo; el proyecto está "en un cuadro". En dos tramos el visitante ya lo asocia.

### El interruptor "Proyecto / Hoy"

En el Tramo 3, arriba del render, un conmutador de dos posiciones:

- **Proyecto** (por defecto): el render enmarcado.
- **Hoy**: la aérea real del sector (`01_aerea_contexto_costa_lejos` con el área de amenities resaltada por un trazo sobre la foto). Caption: "El sector, hoy. Los amenities se construyen con las etapas siguientes."

Es la misma idea del toggle día/noche de Complejo Forest y Urbania (dejar elegir la vista), pero aplicada a la única variable que acá importa: el tiempo. Y es barato: dos imágenes que ya existen.

**[Necesita: aérea real encuadrada al extremo bajo del predio.]** Hoy la 01 es lejana y el sector es una porción chica. Con una aérea dedicada a 35-50 m sobre el sector de amenities, el "Hoy" se vuelve una pieza fuerte. Es una toma de drone de una mañana; ver §7.

### Lo que no se dice porque no se sabe

Fecha de entrega de los amenities, etapa en que se construye cada uno, si el clubhouse entra con el Bloque 2. **Nada de eso está en el brochure ni en la lista de precios.** El tramo no lo inventa: el conmutador "Hoy" ya deja claro que no están, y la pregunta queda para el WhatsApp ("¿Cuándo se entregan los amenities?" es una variante de mensaje, §6). Cuando el cliente dé la fecha, entra como una línea en la caption del render.

### Amenities en la ficha de unidad

En la ficha de cada unidad del Bloque 2 no aparece ninguna imagen de amenity. La ficha es lo que se compra: unidad, plano, precio, condiciones. Los amenities son del proyecto, viven en el Tramo 3.

---

## 5. La honestidad como diferenciador

MP360 y Urbania muestran renders y los llaman "experiencia". Baleia puede mostrar hormigón visto real con sombras de las cuatro de la tarde. Convertirlo en decisión de diseño es tres cosas: **etiquetar todo, contar lo real, y no esconder lo que falta.**

### 5.1 Las chapas de procedencia

Dos, y sólo dos. Van como una caption, no como descargo legal: sin asterisco, sin gris de letra chica, sin "las imágenes son ilustrativas". Ya no hay una tercera para IA: los dos deslizadores "foto real vs. IA" que la necesitaban se sacaron (ver §3.1), y el único par que queda hoy, la fachada de hoy contra el paisajismo terminado, no restringe ninguno de los dos lados ni pone chapa de IA (ver §3.1: sus rótulos son fijos y describen qué cambia, no de dónde salió la imagen).

| Chapa | Cuándo | Dónde | Al tocarla |
|---|---|---|---|
| **Foto real · 2 sep 2026** | Las 26 fotos, el video de 83 s | Esquina inferior izquierda, sobre la imagen, tipografía de caption | "Fotografía y drone del 2 de septiembre de 2026 en el predio. Sin retoque de arquitectura." |
| **Render del proyecto** | Los 7 renders, el masterplan | Esquina superior izquierda, con el filete de marco (§4) | "Imagen del proyecto arquitectónico. Lo construido puede diferir en detalles." |

La fecha en la chapa de foto no es decoración: **fecha = prueba**. Un render no tiene fecha de captura; una foto sí. Cuando se vuelva a fotografiar (amenities, otros bloques) la chapa cambia sola y el visitante ve que el recorrido envejece con la obra.

La chapa de "Foto real" se dibuja como máximo una vez por tramo (repetirla en cada foto de una serie es ruido, no información). La de "Render del proyecto" **no se deduplica**: va en TODO render, siempre — la foto es la norma del recorrido, el render la excepción, y una tira de renders sin chapa se lee, cuatro pantallas después, como fotos del edificio terminado.

### 5.2 Contar lo real, literalmente

En el menú (☰), una entrada **"Qué es real en este recorrido"**, una pantalla:

> **26 fotografías** del 2 de septiembre de 2026 (Sony A7 IV, FX3 y drone DJI), **1 video** real de 83 segundos, **9 planos** de unidad del proyecto, **7 renders** del proyecto y **1 comparación** entre la fachada de hoy y el paisajismo terminado. Panorámicas 360: todavía no.

Nadie del benchmark puede publicar esta pantalla. Es la ventaja convertida en texto verificable.

### 5.3 Estado por bloque, visible en el plano

Cada polígono de bloque lleva una etiqueta de estado que es la verdad del brochure y nada más:

- **B2**: "Construido · Entrega dic 2026" (chip lleno, color de marca).
- **B1, B3**: "Próximamente" (chip contorno). El token `proximamente` hoy no existe en `UNIT_STATUSES` y cae en gris con warning (`tools/baleia/README.md`, §3.1). **Para publicar hay que darlo de alta como estado real** — es la única deuda de contrato de este documento, y es de dato, no de diseño.
- **B4, B5**: sin chip. Contorno del polígono, sin relleno. Al tocarlos, la ficha dice "Etapa futura. Sin información comercial todavía." Es lo único que se puede decir.

### 5.4 Lo que no se esconde

- Las **2 unidades vendidas** (208, 209) se ven vendidas en la grilla y en el plano.
- El **dormitorio vacío** se muestra vacío, con la caption "Sin amueblar: así se entrega". Los renders de la competencia siempre están amueblados; la foto real del vacío es más creíble que cualquier render lleno.
- La **tierra removida** alrededor del bloque en la foto "Hoy" del slider se deja tal cual: es el "antes".
- La **nota de precio** del brochure va textual: "sujetos a modificación sin previo aviso".

---

## 6. El cierre: la consulta con la unidad en la mano

Lo mejor del benchmark es el WhatsApp prellenado de Jacarandá (`2-Features-Desktop-MP360.md`); Urbania, en cambio, cierra con un "Solicitar información" que probablemente sea formulario (`4-Urbania3D.md`, §5). Nuestro módulo `contact.ts` ya arma mensaje + deep link; este diseño lo completa con el dato real y con dos variantes que sólo Baleia puede ofrecer.

### El botón

Uno, verde WhatsApp, en el peek de la ficha (visible sin scroll, sticky en media/full): **"Consultar por la 201"**. Y en cada tramo del recorrido, sin unidad elegida, el mismo botón dice "Consultar por Baleia" y prellena el tramo desde donde se escribe.

### El mensaje (unidad disponible)

```
Hola! Estoy viendo el recorrido de Baleia y me interesa la unidad 201 del Bloque 2.
• Dúplex · 2 dormitorios · 163,42 m² (cochera incluida en el precio)
• Precio de lista: USD 364.861
• Condiciones publicadas: 50% anticipo + 12 cuotas al 6% anual · Entrega dic 2026
La estoy viendo acá: https://<dominio>/#/scene/masterplan/unit/201
```

Todo sale de la lista de precios de septiembre 2026. Nada más.

### Las variantes

| Situación | Cambia |
|---|---|
| Unidad vendida (208, 209) | "Vi que la 208 está vendida. ¿Hay algo similar disponible?" |
| Bloque 1 o 3 | "Me interesa el Bloque 3 cuando salga a la venta. ¿Me avisan?" |
| Sin unidad, desde un tramo | "Estoy viendo el recorrido de Baleia (los amenities). ¿Cuándo se entregan los amenities?" — la pregunta que el tramo dejó abierta a propósito |
| **"Quiero visitarla"** (botón secundario en Tramo 2 y en la ficha de B2) | "Me interesa la unidad 201. ¿Puedo coordinar una visita al Bloque 2?" — **la unidad está construida; ningún proyecto en pozo puede ofrecer esto** |
| **"Mandame el plano"** (enlace en la ficha) | "¿Me pasás el plano en PDF de la 201?" — o descarga directa del PDF; las dos cosas, porque el pedido por WhatsApp abre la conversación |

### Los datos que hay que cerrar antes de publicar el CTA

1. **El número que recibe.** El brochure publica `+598 95 559 230` (Caetano Negocios Inmobiliarios, con Dacal). `tour.json` hoy tiene `contact: null`: **hay que cargarlo**, y confirmar con el cliente que ese número es el que atiende leads del recorrido.
2. **La numeración comercial.** La lista de precios usa 201-209; el CSV usa B2-A..I. El visitante y el vendedor hablan de "la 201". El mapeo A→201, F→206, G→207 está verificado por superficie; B-E→202-205 son indistinguibles (mismo precio y m²); **H/I→208/209 es posicional y de baja confianza** (`tools/baleia/README.md`, §3.1). Publicar con el número comercial como principal y la letra como secundaria ("201 · Unidad A"), y **confirmar la tabla con Caetano antes de salir**.
3. La línea bajo el botón: "Valores de lista de septiembre 2026, a confirmar por el vendedor."

### Compartir

Botón ◱ en la barra y al pie de la ficha (`navigator.share`, fallback copiar). La imagen de vista previa (OG) de cualquier link es **siempre una foto real**: la aérea 02 para el proyecto, la 11 (skyline) para una unidad. Nunca un render ni una imagen de IA.

---

## 7. Qué falta y qué se hace mientras tanto

### Se puede lanzar ya, con lo que hay

Todo lo de §1 a §6 salvo lo marcado **[Necesita]**. En concreto, la v1 publicable tiene: bienvenida real, seis tramos, dos sliders, paseo de 11 fotos con tira de ambientes, video real recomprimido con capítulos, grilla de 9 unidades con precios reales, planos 3D y PDF por unidad, chapas de procedencia, interruptor Proyecto/Hoy con la aérea lejana, WhatsApp con unidad y visita. **Sin panorámicas y sin prometerlas.**

Trabajo previo de datos, no de diseño, antes de la v1:

| Tarea | Quién | Bloquea |
|---|---|---|
| Recomprimir el video de 83 s a 4-6 Mbps y traerlo al repo | Nosotros | Tramo 4 |
| Marcar los timestamps de capítulos del reel | Nosotros, con el archivo | Capítulos del Tramo 4 |
| Mover los 9 PDF de planos de `~/Downloads/` a `tools/baleia/material/` con nombre por unidad | Nosotros | "Descargar plano" |
| Cargar `contact.whatsapp` en `tour.json` | Nosotros, con confirmación del cliente | Todo el §6 |
| Dar de alta el estado `proximamente` en `packages/core` (auditar admin y Supabase) | Nosotros | Etiqueta de B1/B3 |
| Campos aditivos en el manifiesto: procedencia de cada imagen (`foto` / `render` / `ia`), fecha de captura, par antes/después, capítulos de video | Nosotros | Las chapas de §5 y los sliders — sin dato no hay etiqueta |
| Confirmar la tabla letra ↔ número comercial (sobre todo H/I ↔ 208/209) | Caetano | Números en ficha y WhatsApp |

### Hay que pedir o producir (y qué se hace mientras)

| Falta | Para qué | Mientras tanto | A quién / cómo |
|---|---|---|---|
| **Qué unidad se fotografió** (letra) | Minimapa del paseo sobre el plano 3D; "esta es la unidad fotografiada" en la ficha | Tira de ambientes en texto; ficha dice "unidad modelo del Bloque 2" | Fotógrafo (sesión del 2/9) o Caetano; es un mensaje |
| **Panorámicas 360 reales de la unidad terminada** (cámara 360 o Matterport) | Nivel 4 real en B2; "Ver en 360" en la ficha | El paseo de fotos planas. No se promete 360 en ningún texto | Contratar antes de la entrega (dic 2026): la unidad vacía y accesible es la ventana más barata que va a existir. `docs/08-MATERIAL-REAL`, §8 |
| **Aérea 360 esférica del terreno** (modo Sphere Panorama del DJI) y **aérea del sector de amenities** | Escena aérea navegable; el "Hoy" del Tramo 3 en serio | Aérea 02 fija en la bienvenida; aérea 01 lejana en el interruptor | Mismo piloto de drone, medio día; pedir el modo esférico explícitamente (`2-Tres-Caminos.md`, camino c) |
| **Fecha de entrega y etapa de cada amenity** | Caption del Tramo 3 | El conmutador "Hoy" y la pregunta en WhatsApp | Caetano / desarrolladora |
| **Render del conjunto desde el ángulo de la aérea real** | End frame fiel para regenerar el video de IA; o directamente la pieza "Hoy → Proyecto" como slider aéreo | El video de IA no se usa; `complejo-laguna` muestra el conjunto | Estudio 3D (identificarlo: mail 1 de `3-Mails-Listos-Para-Enviar.md`) |
| **Fotos reales de amenities** | Reemplazar renders del Tramo 3 | Renders enmarcados y etiquetados | Imposible hasta que se construyan; agendar sesión cuando haya obra |
| **Aérea de los 5 bloques juntos** | Reemplazar el render de conjunto | Masterplan + `complejo-laguna` | Imposible hasta que haya más obra |
| **Orientación por unidad**, **cotas de cada bloque** | Ficha; verificar el escalonado | No se muestra | Desarrolladora / brochure técnico |
| **Datos de B4 y B5**; precios y estado de B1 y B3 | Ficha y lista | Contorno sin dato; "Próximamente" | Caetano |
| **Tomas crudas largas del video** | Capítulos largos por ambiente en el Tramo 4 (v2) | El reel de 83 s | Descargar del enlace del videógrafo |
| **Confirmar techo verde en B2** | Tercer estado del slider aéreo | Slider de dos estados (obra / amueblado) | Desarrolladora |

### Lo que no entra, y por qué

- **Panorámicas de render** para B2: ya no tienen sentido; el bloque existe y se fotografía en 360 real. Siguen siendo la única opción para B1, B3, B4, B5 y amenities (`docs/07-BALEIA-360/`), pero eso es otro nivel del producto, no esta experiencia.
- **Comparador lado a lado**: Urbania lo tiene (`4-Urbania3D.md`, §2). Con 7 unidades disponibles de 2 tipologías y 3 precios distintos, la grilla del Tramo 5 ya es la comparación. Se reevalúa cuando salgan B1 y B3.
- **Recorrido continuo tipo Matterport**: requiere escaneo de la unidad; es la misma sesión 360 de arriba, y si se contrata Matterport, viene incluido. Diseñar para eso recién con el archivo.
- **Cotizador de cuotas**: las condiciones son una fórmula simple (50 % + 12 cuotas al 6 % anual) y podrían calcularse, pero el brochure no aclara si el 6 % es sobre saldo ni cómo se computan los gastos de ocupación. **Sin la fórmula exacta del vendedor, mostrar una cuota es inventar un número.** Se muestran las condiciones textuales y la cuota se pregunta por WhatsApp.

### Cómo saber si funcionó

Además de las métricas del plan anterior (§9): **% de sesiones que completan el Tramo 2** (si la gente no llega a la foto del skyline, el paseo es largo), **% que mueve un slider** (si nadie lo toca, el barrido inicial no enseñó), **% de CTAs que son "Quiero visitarla"** (la métrica que ningún proyecto en pozo puede tener), y **cuántos links compartidos apuntan a la foto 11** (si es la que la gente manda, la apertura está bien elegida).

---

## Anexo — el recorrido en una tabla

| Tramo | Hash | Ve | Toca | Aprende | Material |
|---|---|---|---|---|---|
| 0 Bienvenida | `/` | Aérea 02 → skyline 11, "El Bloque 2 ya está construido." | Empezar / Ir al plano | Existe, se ve la Punta | 2 fotos reales, logo |
| 1 Llegada | `#/scene/llegada` | Aéreas 01, 04 con etiqueta, masterplan con camino animado, render acceso enmarcado | Etiqueta, polígonos | Dónde está, 5 bloques, cuál existe | 2 fotos, plano, 1 render |
| 2 El bloque | `#/scene/bloque-2` | Aérea 02, 2 sliders, 4 fachadas, paseo de 11 fotos | Sliders, swipe, "Ver las 9 unidades", "Visitarla" | Cómo es de verdad, qué se entrega | 18 fotos, 3 imágenes IA |
| 3 Amenities | `#/scene/amenities` | Plano del sector, renders enmarcados, aérea "Hoy" | Proyecto/Hoy, amenities en el plano | Qué va a haber y que aún no está | 3 renders, 1 foto, plano |
| 4 Video | `#/scene/video` | Reel real con capítulos | Play, capítulos, scrub | Obra viva | Video 83 s |
| 5 Detalles | `#/scene/unidades` | Grilla de 9, ficha con plano 3D, PDF, precio, condiciones | Filtros, ficha, descargar | Qué se compra y cuánto | 7 planos 3D, 9 PDF, precios |
| 6 Consultar | ficha / `#/scene/consultar` | Botón con la unidad | WhatsApp, visita, plano | — | Mensaje prellenado + deep link |
