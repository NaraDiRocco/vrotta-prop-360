# Auditoría de la experiencia de Baleia, ya construida (06-09-2026)

Auditoría del recorrido andando en `http://localhost:5183`, mirado como comprador que entra desde un anuncio, en el celular, con datos móviles y treinta segundos de paciencia. No revalida el diseño de `5-EXPERIENCIA-BALEIA.md`: lo contrasta con lo que hay en pantalla. Donde el diseño no funciona en la práctica, se dice.

**Deuda conocida que no se cuenta como hallazgo**: 206/207 en "Bloqueado" (contradicción entre listas de precios, sin resolver) y el video sin capítulos (nadie marcó los tiempos).

## 0. Cómo se auditó, y qué no se pudo ver

- Viewports: **375×812**, **440×956** (iPhone 16 Pro Max) y **1440×900**. Se recorrieron los seis tramos (`#/scene/llegada` … `#/scene/consultar`), la bienvenida (con la marca local `r360:bienvenida-vista` borrada), la ficha de bloque y de unidad abiertas desde el riel, la pestaña Unidades y el plano.
- **El panel del navegador estuvo en `document.visibilityState === "hidden"` durante toda la sesión.** Los clics sintéticos daban timeout; se disparó todo desde JS (`element.click()`, cambios de hash, `history.back()`) y se midió leyendo el DOM y `getComputedStyle`. Por eso, todo lo que dependa de `requestAnimationFrame`, transiciones CSS, `IntersectionObserver` o scroll suave **no se pudo comprobar**, y va marcado así: el barrido inicial del deslizador (el `--ba-pct` quedó en `100%` después de un `scrollIntoView`, que es exactamente lo que pasa cuando el observer no dispara), el push-in de la apertura, el blur-up, el chip de orientación, el fundido de la bienvenida.
- Las capturas salieron frescas en cuatro momentos (bienvenida en 375, tope del Tramo 1 en 375, Tramo 6 en 375, plano en 375) y en una ocasión mostraron un cuadro viejo (la pantalla de Consultar mientras el DOM ya estaba en Bloque 2 con la ficha abierta). Ninguna capa `[hidden]` con `display` distinto de `none` apareció en ningún tramo ni tamaño: la familia del bug del velo negro está limpia hoy.
- Pesos: `transferSize` volvió 0 en todo (Vite sirve desde cache), así que los pesos citados son los de disco en `apps/viewer/public/baleia/`.

---

## 1. El recorrido, como comprador

**Segundo 0-3.** Pantalla negra, "Baleia" en texto, barra fina, "Cargando el plano…" (el texto miente: lo que se está midiendo es la foto de la bienvenida, `main.ts:203`). Aparece la aérea del bloque a pantalla completa, "El Bloque 2 ya está construido." y "Foto real · 2 sep 2026". Bien: es una foto, es una frase, es un botón. Pero **no hay logo ni lugar**: en ningún punto de la bienvenida dice Punta Ballena, Uruguay ni aparece la marca (`welcome.ts` no la monta; el SVG existe en `tools/baleia/material/marca/`). El comprador que viene de un anuncio no sabe dónde está parado.

**Segundo 5.** La foto funde a la terraza y el título grande se reemplaza por la caption entera: **"Desde esta terraza: Punta del Este sobre el mar. Sin retoque."** en tres líneas a 26 px; los botones saltan hacia abajo. El argumento comercial ("ya está construido") vivió cinco segundos. "Sin retoque." como titular de portada lee raro.

**Toca "Empezar el recorrido".** Arriba dice **"Masterplan"** (la barra sigue mostrando el nombre de la escena de abajo, `ui.ts:402`). Debajo, "TRAMO 1 DE 6 · La llegada" y una foto de 375×250. En 375×812 el contenido tiene **581 px de alto**: barra (52) + pie del riel con puntos y "Siguiente" (119) + pestañas (60) = **231 px de chrome, el 28 % de la pantalla**, con dos barras de navegación apiladas. La foto más importante de la llegada ocupa menos de un tercio de la pantalla.

**Scrollea.** Segunda foto, la del skyline: en 375 px el skyline de Punta del Este es una franja de píxeles gris sobre el mar, y la etiqueta "Punta del Este" está **debajo del horizonte, sobre los árboles** (`top: 38%` fijo en `tour-rail.css:.r360-rail__tag`; en la foto el mar termina al 33 % del alto). Al tocarla, el texto que aparece es: "La distancia y los tiempos de viaje no están en el material del proyecto: los confirma el vendedor." Eso es una nota de producción, no una respuesta para un comprador.

**Toca "Abrir el masterplan".** Aterriza en un **plano de 123 px de ancho** flotando en un fondo gris claro (`rgb(221,221,221)`) dentro de una interfaz oscura. Cinco rectángulos sin nombre (no hay etiquetas permanentes: `tooltips: 0`, sólo `sticky` al hover, `floorplan.ts:279`); los amenities miden 25×13 y 11×10 px. Es igual en 440×956 (mismo 123×497). No entiende qué es y vuelve.

**Tramo 2.** 4,7 pantallas de scroll en 375 (2.712 px). Cada deslizador mide **563 y 500 px de alto en un viewport de 581**: nunca se ve entero con su caption, y el asa queda en el medio de una imagen que ocupa toda la pantalla. La tira de ambientes (Living · Cocina · … · La vista) mide **587 px y el contenedor 375**: "Terraza" y "La vista", los dos mejores, están fuera de pantalla sin ninguna señal (scrollbar oculta, sin degradado). La chapa **"Foto real · 2 sep 2026" aparece 17 veces** en el tramo, una por foto. Al final, una nota: "Qué letra de tipología se fotografió está a confirmar con el fotógrafo."

**Toca una foto para verla grande.** Se abre una capa negra con la misma foto a **343×229 px, más chica que en el riel (375×250)**, sin pinch-zoom (el `PinchZoom` de `ui.ts` no se usa en `tour-rail.ts:openFoto`), sin pasar a la siguiente, sin girar las apaisadas. "Toque = entrar" entrega menos que no tocar. En escritorio sí paga (1053×702).

**Toca "Ver las 9 unidades del Bloque 2".** Se abre la hoja en `peek` (262 px) **sobre el riel** (`railHidden: false`), y en esos 262 px entra: "Bloque 2 · Disponible · 9 unidades · 5 disponibles · desde US$ 358.638 · [Consultar por el Bloque 2]". **La grilla de unidades empieza en y=862: fuera de pantalla.** El botón prometió unidades y muestra un CTA. El hash pasa a `#/scene/masterplan/unit/B2` pero detrás está el riel, no el plano ("el plano nunca se fue" del diseño §3.3 no ocurre acá).

**Tramo 3.** Seis renders idénticos en formato (329×219, enmarcados), tres de ellos bajo el título "Otras vistas del proyecto" con el nombre de archivo como caption ("Pérgola junto a la piscina"). "Ver el sector en el plano" abre el plano entero, sin zoom al sector. El "Hoy" del conmutador es la misma aérea lejana que abrió el Tramo 1.

**Tramo 4.** Un `<video>` de 375×211 con controles nativos, silenciado, que **no arranca solo** (no hay `autoplay` ni `play()` al entrar; el diseño §1 lo pedía) y una línea de texto. El mejor material del proyecto, en una caja del 26 % de la pantalla. Fuente 720p de 10,9 MB en móvil bien elegida (`<source media>`).

**Tramo 5.** Grilla con códigos **B2-A … B2-I**. La lista de precios del cliente y el vendedor hablan de **201 … 209**; el diseño §6 pedía el número comercial como principal. "Bloque 3 · 11 unidades · **0 disponibles**" se lee como agotado, no como próximamente. **B3-K no tiene estado** (falta en `availability.json`): celda sin texto y más baja que las demás (49 px contra 63), al lado de diez "Próximamente".

**Ficha de B2-A.** Precio, estado, CTA, superficies, la página del brochure y el plano acotado. No hay "Quiero visitarla" (diseño §6), no hay "Descargar plano en PDF" (los 7 PDF están en `tools/baleia/material/planos/unidad/src-pdf/`, 224-292 KB cada uno, y no se publican), no hay plano 3D, no hay vuelta al paseo. El mensaje de WhatsApp dice "unidad B2-A" y "163.42 m²" con punto (`contact.ts:195` pega el número crudo) mientras la interfaz dice "163,42 m²".

**Tramo 6.** Tres botones verdes del mismo peso. Funciona. El mensaje genérico sale así: "Estoy viendo el recorrido de Baleia (consultar). Me gustaría hacer una consulta." — el paréntesis es el `title` del tramo en minúsculas.

**¿Dónde abandona?** En dos lugares: en la segunda foto del Tramo 1 (nada lo empuja a seguir; el "Siguiente" está ahí pero la pantalla no le dio ninguna razón) y en el primer deslizador del Tramo 2, que ocupa toda la pantalla y, si el barrido no corrió, muestra sólo la foto real sin explicar qué hacer. **¿Qué le falta para escribir?** Una unidad con número que pueda repetir por teléfono, un precio a la vista antes del Tramo 5, y la certeza de que puede ir a verla: el "Quiero visitar" existe pero en el riel, no en la ficha donde eligió.

---

## 2. Problemas concretos

Ordenados por gravedad. Todos observados; la evidencia es DOM/estilos salvo que diga "captura".

### Rotos

1. **El conmutador Estado/Precio y la leyenda de precios no se ven nunca, en ningún tamaño.** `syncLegendOffset` (`floorplan.ts:209-224`) recorre todo `body *` en `absolute/fixed` que toque el borde inferior y toma el `top` más alto: `.r360-ui` (`inset: 0`) y el propio riel califican, así que `--r360-legend-h` vale **1052 px en 375×812, 1052 en 440×956 y 990 en 1440×900**. El toggle queda en `top: -154` (fuera de pantalla por arriba). Y cuando aparezca hay un segundo bug esperando: con dos precios distintos (358.638 y 364.861) `deriveBands` (`price-layer.ts:62-115`) genera la leyenda **"hasta USD 359 k · USD 359 k–359 k · más de USD 359 k"**. Con 2 precios no hay tres tramos: hay que colapsar a "un precio / dos precios" o esconder la capa.
2. **B3-K sin estado**: `public/baleia/availability.json` tiene B3-A…B3-J en `proximamente` y omite B3-K. En el Tramo 5 y en la pestaña Unidades la celda sale vacía y más baja. Dato, no código.
3. **Plano en móvil ilegible**: `fitBounds` sobre el perímetro (`floorplan.ts:308`) deja el plano girado en **123×497 px** tanto en 375×812 como en 440×956; bloques de 77×52, amenities de 25×13 y 11×10 (el objetivo mínimo del proyecto es 44). Fondo del stage gris claro en UI oscura. Sin nombres sobre los bloques. Todos los tramos tienen un botón que aterriza acá ("Ver el plano", "Abrir el masterplan", "Ver el sector en el plano"). Captura fresca en 375 lo confirma.
4. **"Ver las 9 unidades" no muestra unidades**: la hoja de bloque abre en `peek` y la grilla queda a 600 px de la parte visible (`ui.ts:PANEL_SNAPS`, `peek: 0.32`). Debería abrir en `mid`, o scrollear a la grilla, o —mejor— abrir la hoja de unidades del Tramo 5 que ya existe.
5. **La foto grande es más chica que la chica** en 375 y 440: `.r360-rail__layer img { max-height: 78vh }` con `padding: 16px` sobre una foto 3:2 da 343×229. Sin pinch, sin swipe, sin rotación. Es la única interacción "toque = entrar" del recorrido y no entrega nada.
6. **El video no arranca al entrar** (diseño §1 Tramo 4). `tour-rail.ts:495-510`: `controls + muted + loop`, sin `autoplay` ni observer. Además `preload = 'none'` en la línea 499 y `'metadata'` en la 510: la segunda pisa a la primera; el navegador igual descargó hasta `readyState 4` con el video fuera de vista.
7. **El masterplan de 1,08 MB baja detrás de la bienvenida**: `controller.start()` (`main.ts:110-111`) monta la escena de arranque mientras la bienvenida tapa todo; en la lista de recursos de la etapa de bienvenida aparece `masterplan.webp`. El presupuesto "< 1 MB antes del primer toque" del diseño §2 no se cumple: son ~0,7 MB de fotos + 1,08 MB de plano que nadie pidió todavía. (Medido por presencia en `performance.getEntriesByType('resource')`, no por bytes: el `transferSize` de Vite es 0.)

### Se ven mal o confunden

8. **Barra superior "Masterplan" con el riel abierto**, en todos los tramos y tamaños. Y **cero marca**: ni logo ni "Baleia" en el riel ni en la bienvenida. El ícono de compartir es `⎄` (U+2384, símbolo de composición), no un ícono de compartir. También en la ficha ("⎄ Compartir esta unidad").
9. **Tira de ambientes desbordada sin señal**: 587 px de contenido en 375/440 de ancho, `scrollbar-width: none`, sin degradado ni auto-scroll al ambiente activo. "Terraza" y "La vista" no existen para quien no arrastra la tira.
10. **Etiqueta "Punta del Este" mal anclada**: `top: 38%` fijo; el horizonte de la foto `04` está al 31-33 % del alto (perfil de brillo por filas de la imagen). La píldora tapa el bosque y señala abajo del skyline. Captura fresca en 375 coincide.
11. **La bienvenida cambia el titular por la caption** (`welcome.ts:118-121`): "Desde esta terraza: Punta del Este sobre el mar. Sin retoque." en tres líneas de 26 px cada cinco segundos, y el bloque de botones salta de altura. El diseño §2 decía "Desde la terraza de una unidad: Punta del Este." y que el titular se mantuviera.
12. **Fotos verticales recortadas al tercio**: `09_fachada_bloque2_vertical` (2000×3000) y `24_…_atardecer` (2000×2994) van en slots 3:2 con `object-fit: cover`. `24` además ya es el "Hoy" del primer deslizador: la misma foto dos veces en el mismo tramo. `01_aerea_contexto` abre el Tramo 1 y es el "Hoy" del Tramo 3.
13. **La chapa 17 veces en el Tramo 2**, y en el Tramo 1 la caption repite lo que la chapa ya dice ("…Foto real, 2 sep 2026." justo arriba de "Foto real · 2 sep 2026"). La fecha como prueba funciona una vez por tramo; diecisiete veces es ruido.
14. **Textos de producción en la pantalla del comprador**: "Qué letra de tipología se fotografió está a confirmar con el fotógrafo", "La distancia y los tiempos de viaje no están en el material del proyecto: los confirma el vendedor", "La fecha de entrega de los amenities no está en el material del proyecto: se pregunta al vendedor", "La cuota exacta la confirma el vendedor: la fórmula completa no está publicada", "El video todavía no está publicado… cuando entre al manifiesto aparece acá". Honestidad no es publicar el backlog. Se dice lo que se sabe y se calla lo que no, sin explicar por qué.
15. **Numeración y formatos**: B2-A en grilla, ficha y WhatsApp (el vendedor habla de "la 201"); "163.42 m²" en el mensaje vs "163,42 m²" en pantalla; "160,5 m²" vs "163,42 m²" (decimales inconsistentes, `maximumFractionDigits: 2`); "Bloque 3 · 11 unidades · 0 disponibles"; pestaña Unidades "20 unidades · 5 disponibles" contando el Bloque 3 como stock; el mensaje genérico "(consultar)".
16. **Duplicados de navegación**: pie del riel (puntos + Siguiente, 119 px) encima de la barra de pestañas (60 px); píldora "☰ Unidades · 20 · 5 disp." sobre el plano al lado de la pestaña "Unidades"; "Ver el plano" al pie de cada tramo al lado de la pestaña "Plano".

### Escritorio (1440×900)

17. **Las series no se pueden recorrer con mouse**: `.r360-rail__track` es scroll horizontal con `scrollbar-width: none`, sin flechas (0 botones), `cursor: auto`. Sólo con trackpad, o con teclado después de hacer foco en la pista. El paseo de 11 fotos es invisible para quien usa mouse.
18. **Deslizadores de 930 y 827 px de alto** en un viewport de 669: nunca se ve la comparación entera. Las pestañas inferiores se estiran a 480 px cada una: una barra de teléfono en un monitor.

---

## 3. Lo tibio

Lo que funciona y no impresiona.

- **El riel es un feed, no una experiencia.** Tarjetas apiladas con la foto en una caja de 250 px, título arriba, texto abajo, botón al pie. Es la estructura de un post de blog. Urbania (`4-Urbania3D.md`) pone el render a pantalla completa y transiciona con un clip; nosotros tenemos mejor material (real) y lo mostramos más chico que ellos. Con el 28 % de la pantalla en chrome, ninguna foto puede impresionar.
- **La llegada no llega.** Dos fotos, un cuadro de texto con viñetas y un render. No hay movimiento hacia el bloque: el "trazo animado del acceso a los bloques" y "B2 pulsa una vez cuando el botón entra en pantalla" del diseño no están; hay un botón que abre el plano de 123 px.
- **Los amenities son una galería de renders con marco.** El marco cumple la regla (foto a sangre / render enmarcado) pero seis marcos iguales seguidos anestesian. "Otras vistas del proyecto" es un volcado. El conmutador Proyecto/Hoy está bien pensado y la ejecución es un botón que reemplaza una imagen por otra sin transición ni señal de que son el mismo lugar.
- **El video es una caja.** Sin autoplay, sin pantalla completa sugerida, sin nada alrededor. Ochenta y tres segundos de filmación real de una obra terminada, tratados como un adjunto.
- **La ficha no cierra la venta.** Precio y CTA, bien. Pero sin visita, sin PDF, sin número comercial y sin una sola foto (la unidad fotografiada está a un tramo de distancia y la ficha no la menciona).
- **Consultar** son tres botones verdes iguales. El diferencial ("Quiero visitar", porque está construido) no se distingue de "Mandame el plano".
- **Textos correctos y fríos.** "El acceso al complejo, como está proyectado." "Pérgola junto a la piscina." "Los cuatro amenities aparecen en esta vista." Ninguna frase hace querer vivir ahí. El material lo permite: hay sol de las cuatro de la tarde en hormigón visto y el mar en la ventana de la cocina.

---

## 4. Cuatro ideas que lo llevan a otro nivel

Todas con material que existe hoy en `apps/viewer/public/baleia/` o en `tools/baleia/material/`.

### Idea 1 — Pantalla por pantalla: el riel deja de ser feed

Cada pieza del tramo ocupa **toda la pantalla** (`scroll-snap-type: y mandatory` sobre `.r360-rail__scroll`, cada tarjeta `100%` del alto útil), la foto a sangre de borde a borde y la caption **sobre la foto**, abajo, con el degradado que ya usa la bienvenida. El pie del riel se funde con la barra de pestañas: los seis puntos y el "Siguiente" viven en la misma franja de 60 px (el chrome baja de 231 a 112 px: **la foto pasa de 250 a ~650 px de alto en 375×812**). La chapa aparece una vez por tramo, en la primera foto, y después sólo si la naturaleza cambia (foto → render). Sin material nuevo, es el mismo contenido ordenado como una historia y no como una página. **Por qué cambia la experiencia**: es la diferencia entre mirar fotos y estar en el lugar; y es lo que el cliente vio en Urbania y llamó "primer nivel" (imagen a pantalla completa, un gesto por paso).

### Idea 2 — La Punta como protagonista

Baleia vende una sola cosa que ningún render puede vender: la vista real. Hoy son dos fotos en cajas de 250 px donde el skyline es una línea gris. Propuesta: en `04` y `11` (2000 px de ancho, sobra detalle), **tocar "Punta del Este" acerca la cámara al skyline** (transform sobre la imagen ya cargada, 600 ms, hasta ~2,5×, recorte centrado en el horizonte) y la etiqueta queda pegada a la ciudad, no al bosque. La misma foto `11` es la que se comparte (imagen de vista previa) y la que cierra el paseo del Tramo 2 ya lo hace; sumarle el acercamiento la convierte en la pieza que el visitante manda. Y en la bienvenida, la segunda foto entra **ya acercada al skyline** con la caption corta del diseño ("Desde la terraza de una unidad: Punta del Este."), sin reemplazar el titular. **Por qué**: le da al comprador la prueba de la promesa en un gesto, con el material más fuerte del lote, y nadie del benchmark tiene esa foto.

### Idea 3 — La ficha que cierra: 201, visita, PDF, la unidad modelo

En la ficha de cada unidad del Bloque 2: título **"201 · Unidad A"** (mapeo A→201, F→206, G→207 verificado por superficie en `tools/baleia/README.md` §3.1; B-E→202-205 y H/I→208/209 con la nota de confirmación con Caetano **antes de publicar**), debajo del precio dos acciones que sólo Baleia puede ofrecer —**"Quiero visitarla"** (la unidad está construida) y **"Descargar el plano (PDF)"** (`tools/baleia/material/planos/unidad/src-pdf/Unidad A.pdf`, 224-292 KB, copiar a `public/baleia/media/planos/`)—, el **plano 3D de la tipología** (`generado-ia/planos-3d/unidad-*-plano-3D-minimalista.webp`) como imagen principal con la chapa "Plano 3D · recreación sobre el plano real" y el acotado debajo, y un enlace **"Ver la unidad modelo fotografiada →"** que vuelve al paseo del Tramo 2 en la foto del living. El mensaje de WhatsApp pasa a decir "la 201" y "163,42 m²". **Por qué**: es el momento en que el comprador decide escribir, y hoy la ficha le da menos que el tramo anterior. Urbania cobra el PDF como feature; nosotros tenemos el archivo.

### Idea 4 — El plano que se entiende con el dedo

En móvil el plano se **encuadra al ancho** (no al alto): el terreno queda ~375×1515 y se recorre con el pulgar hacia abajo, en el mismo sentido en que baja el terreno (oeste→este, B1 arriba, amenities abajo: la orientación ya está resuelta en `plan-orientation.ts`). Etiquetas **permanentes** "B1 … B5" y el estado en chip sobre cada bloque (`bindTooltip({ permanent: true })` o marcador propio), fondo del stage `#11161d` como el resto de la interfaz, y al entrar desde el Tramo 1 **B2 pulsa una vez** (el diseño lo pedía; es un `@keyframes` sobre el `path`). "Ver el sector en el plano" del Tramo 3 hace `fitBounds` a los cuatro amenities, que ya tienen polígono. **Por qué**: hoy cada botón "Ver el plano" del recorrido lleva a una franja de 123 px sobre gris; es el lugar donde el comprador se ubica y elige, y ahora es el lugar donde se pierde.

---

## 5. Prioridades

### Ahora (horas, sin decisión de diseño)

- Arreglar `--r360-legend-h` (medir sólo la leyenda y la barra de pestañas, no todo `body *`) y colapsar `deriveBands` cuando hay menos de tres precios distintos (§2.1).
- Agregar B3-K a `availability.json` (§2.2).
- Barra superior: mostrar el logo/nombre "Baleia" con el riel abierto, no "Masterplan"; reemplazar `⎄` por un ícono de compartir (§2.8). Logo también en la bienvenida, con "Punta Ballena · Uruguay".
- Bienvenida: mantener el titular, caption corta del diseño para la segunda foto (§2.11).
- "Ver las 9 unidades": abrir la hoja en `mid` o directo sobre la grilla (§2.4).
- Video: `autoplay muted playsinline` + `play()` al entrar en pantalla, botón de pantalla completa visible; sacar el `preload = 'none'` muerto (§2.6).
- Tira de ambientes: degradado en el borde derecho + `scrollIntoView` del ambiente activo (§2.9).
- Etiqueta "Punta del Este" a `top: 26-28%` (§2.10).
- Chapa una vez por serie, no por foto; sacar la fecha de la caption del Tramo 1 (§2.13).
- Reescribir los textos de §2.14 en voz de comprador: "Unidad modelo del Bloque 2" y nada más; "Distancias y tiempos: te los pasa el vendedor"; "Fecha de amenities: consultá al vendedor"; "La cuota exacta te la arma el vendedor".
- Formatos: coma decimal en el mensaje de WhatsApp; "Bloque 3 · 11 unidades · próximamente"; pestaña Unidades "9 unidades en venta · 5 disponibles" (§2.15).
- Escritorio: flechas ‹ › en las series y `cursor: grab` (§2.17).
- No pedir `masterplan.webp` hasta que se cierre la bienvenida o el visitante toque "plano" (§2.7).

### Vale la pena aunque cueste (días)

- Idea 1 (pantalla por pantalla, chrome fusionado) — es la que cambia la sensación de nivel. Toca `tour-rail.ts`, `tour-rail.css`, `nav.ts`.
- Idea 4 (plano al ancho, etiquetas, B2 pulsa, sector de amenities) — `floorplan.ts`, `plan-orientation.ts`.
- Idea 3 (ficha que cierra) — `ui.ts`, `contact.ts`, copiar 7 PDF y 7 planos 3D a `public/baleia/media/`, campos aditivos en `tour.json`. Requiere confirmar la tabla letra↔número con Caetano antes de publicar; hasta entonces, "201 · Unidad A" sólo para A, F, G y letra sola para el resto.
- Idea 2 (la Punta) — `tour-rail.ts` (zoom sobre la imagen ya cargada) y `welcome.ts`.
- Capa de foto grande: reutilizar `PinchZoom` de `ui.ts`, swipe entre hermanas, rotación de apaisadas como el lightbox de plantas (§2.5).
- Deslizadores: limitar el alto a ~70 % del viewport (`max-height` y `object-fit: cover` centrado) para que entren con su caption; en escritorio, columna de 620 px con alto acotado (§2.18).
- Amenities: el conmutador Proyecto/Hoy con fundido cruzado y las dos imágenes apiladas (no reemplazo de nodo), y "Otras vistas del proyecto" como una sola serie horizontal con marco, no tres tarjetas.

### Descartar, o necesita material que no tenemos

- **Capítulos del video**: necesitan los timestamps marcados con el archivo en la mano (deuda conocida). Mientras tanto: autoplay silenciado + pantalla completa. Nada más.
- **Minimapa del paseo sobre el plano 3D**: necesita saber qué letra se fotografió. Mientras tanto: la tira de ambientes, corregida (§2.9).
- **"Hoy" del sector de amenities en serio**: necesita una aérea del extremo bajo del predio (una mañana de drone). Mientras tanto: la `01` lejana con el área resaltada por un trazo sobre la foto, que hoy no está (el diseño §4 lo pedía y se implementó sin el trazo).
- **Comparador lado a lado**: con cinco unidades disponibles de dos precios, la grilla ya compara. No vale el costo hasta que salga el Bloque 3.
- **El video de IA**: sigue afuera hasta tener un cuadro final fiel (render del conjunto desde el ángulo de la aérea). No hay alternativa con lo que hay; no usarlo es la decisión correcta.
- **Panorámicas 360**: no existen y no se fabrican con este material. Sesión de cámara 360 en la unidad modelo antes de diciembre 2026 (`docs/08-MATERIAL-REAL/README.md` §8).
- **Cotizador de cuotas**: la fórmula del 6 % no está publicada. No se muestra una cuota.

---

## Anexo — medidas crudas

| Medida | 375×812 | 440×956 | 1440×900 |
|---|---|---|---|
| Alto útil del riel (`.r360-rail__scroll.clientHeight`) | 581 | 725 | 669 |
| Chrome fijo (barra + pie riel + pestañas) | 231 | 231 | 231 |
| Foto de apertura del Tramo 1 (alto) | 250 | 293 | 413 |
| Deslizadores del Tramo 2 (alto) | 563 / 500 | 660 / 587 | 930 / 827 |
| Scroll del Tramo 2 (pantallas) | 4,7 | 4,2 | 5,7 |
| Tira de ambientes (contenido / contenedor) | 587 / 375 | 587 / 440 | — |
| Plano en pestaña Plano (imagen) | 123×497 | 123×497 | 993×245 |
| Bloques en el plano | 77×52 | 77×52 | 105×160 |
| `--r360-legend-h` (debería ser ~40-100) | 1052 | 1052 | 990 |
| Capa de foto grande (imagen) | 343×229 | — | 1053×702 |
| Hoja de bloque en `peek` (alto / y de la grilla) | 262 / 862 | — | — |

Archivos leídos: `apps/viewer/src/{tour-rail.ts, tour-rail.model.ts, tour-rail.css, welcome.ts, welcome.css, ui.ts, main.ts, boot.css, styles.css, beforeafter.ts, beforeafter.css, floorplan.ts, price-layer.ts, contact.ts, nav.ts, units.css}`, `apps/viewer/public/baleia/{tour.json, availability.json}`, `docs/06-BENCHMARK/{1,2,4,5}-*.md`, `docs/08-MATERIAL-REAL/README.md`, `tools/baleia/material/INVENTARIO.md`.
