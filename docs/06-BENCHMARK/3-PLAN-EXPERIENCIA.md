# Plan de experiencia — ganarle a MP360 en móvil (30-08-2026)

Plan de producto para que nuestro recorrido sea claramente mejor que el del competidor, con foco en el visitante real: un comprador potencial, en el celular, que llegó por un link de WhatsApp o desde la web del proyecto. Diseño y especificación; no implementación.

**Insumos leídos**: `docs/06-BENCHMARK/1-UX-Movil-MP360.md` (auditoría móvil), `docs/06-BENCHMARK/2-Features-Desktop-MP360.md` (auditoría desktop), todo `apps/viewer/src/`, `packages/core/src/types.ts` y `status.ts`, y el recorrido real `tools/baleia/out/tour/tour.json`. Aviso de método que hereda este plan: en 3 de los 5 sitios la auditoría móvil no pasó de la bienvenida y lo marca como "no verificado" — esos puntos se toman acá como indicios, no como hechos.

**El hallazgo que ordena el plan** (auditoría móvil, conclusión textual): *"Ningún sitio de los 5 resolvió de forma verificable el problema central del masterplan horizontal en pantalla vertical con una solución más sofisticada que 'dejarlo chico y que el usuario haga zoom' — es el punto de mayor oportunidad de diferenciación."* Esa solución nosotros **ya la tenemos** (`plan-orientation.ts`, 4,7x de superficie). Este plan no la re-propone: la explota — todo §2 y §4 están diseñados asumiendo que el plano ocupa la pantalla entera, cosa que ningún competidor puede asumir.

**Realidad del material**: Baleia es 1 masterplan + 7 renders + plantas de 13 de 20 unidades. Cero panorámicas. Todas las escenas hoy son `floorplan` (Leaflet sobre imagen plana). El plan entero asume ese escenario como el caso principal, y marca qué escala solo cuando lleguen panorámicas.

**Estado real del visor hoy** (para no diseñar contra un producto imaginario):
- Deep links por hash (`#/scene/{slug}/unit/{code}`) ya funcionan — es una ventaja enorme sobre 3DVista, hay que explotarla, no construirla.
- Rotación del plano apaisado en pantalla vertical ya resuelta (`plan-orientation.ts`, 4,7x de superficie). Se construye sobre eso.
- La ficha existe (hoja inferior en móvil), la galería existe (tira horizontal), la leyenda de estados existe.
- **`availability.json` ya trae precio** (`p: {a, c} | null`) y el visor **no lo muestra en ningún lado**. Es el hueco más barato de cerrar y el de más impacto.
- No hay ningún CTA de contacto. El visitante que quiere consultar no tiene nada que tocar.
- La pantalla de arranque es un texto plano "Cargando recorrido…".

---

## Principio rector

MP360 pone dos puertas antes de dejarte tocar nada y no te dice nunca cuánto falta para que cargue. Nuestra apuesta es la inversa y se resume en una frase que ordena todas las decisiones de abajo:

> **Del link de WhatsApp a "le escribí al vendedor con la unidad exacta en la mano" en menos de 60 segundos, sin ninguna pantalla intermedia.**

Cada sección de este plan es un tramo de ese recorrido.

---

## 1. El primer minuto

### Segundo a segundo (link genérico, ej. desde la bio o la web)

| t | Qué se ve | Qué lo produce |
|---|---|---|
| 0,0–0,3 s | Fondo del proyecto (color de marca) + logo + nombre "Baleia · Punta Ballena" + barra de progreso fina. Nunca texto pelado sobre negro. | Shell HTML inline, sin esperar JS. |
| 0,3–1,0 s | Aparece el masterplan **borroso** ocupando toda la pantalla (girado si corresponde). La barra avanza de verdad. | La miniatura `.thumb.webp` del masterplan (~15 KB), escalada con `filter: blur`. Convención de thumbs ya existente. |
| 1,0–2,0 s | El plano se enfoca (llegó el master). Se dibujan los polígonos de bloques y amenities, en gris neutro un instante y con color de estado apenas resuelve `availability.json`. | fetch paralelo ya implementado en `main.ts`. |
| ~2,0 s | Un **chip de orientación** entra desde abajo: "**5 bloques · 20 unidades · Tocá un bloque para verlas**". Se va solo a los 5 s o al primer toque. | Único onboarding. No hay modal, no hay puerta, no hay "click para empezar". |
| 2–4 s | En segundo plano se precargan los thumbs de los 7 renders. | `<link rel=prefetch>` disparado post-first-paint. |

A los 2 segundos el visitante ya está tocando el plano. MP360 a los 2 segundos todavía está mostrando la primera de sus dos puertas.

**Por qué un chip y no un modal de bienvenida**: la auditoría móvil encontró que la mayor brecha del sector es "decirle al usuario, en el primer segundo, qué puede hacer con el dedo" — y que el único que lo hace bien (Tipuana, con su "Tocá un lote para ver superficie y características") lo hace en un modal que encima atrapó al auditor: la X no respondió al toque y solo cerró con Escape, tecla que en un teléfono no existe. La lección es doble: la instrucción explícita del gesto **sí** (nuestro chip la lleva), el modal que hay que cerrar **no**. El chip no bloquea nada, no necesita cierre (se va solo o con el primer toque), y el plano coloreado con leyenda ya explica el resto. Es el onboarding de Tipuana sin su trampa.

**Contexto sin interacción**: lo mejor de First Tower en móvil es que su portada ya etiqueta el entorno (comercios, accesos, edificios vecinos) antes de cualquier toque. Nuestro equivalente barato: los hotspots informativos del masterplan (Laguna, Piscina, Acceso — ya existen en el tour de Baleia) muestran su **etiqueta visible de entrada** al zoom de encuadre, no solo al tocar. El masterplan se lee como un mapa anotado desde el primer segundo, sin costo de material nuevo.

**Datos comerciales en el primer pantallazo**: si hay precios públicos, el chip agrega "· desde USD 185.000" (mínimo de los `p` disponibles). Es la información que un comprador quiere antes que ninguna otra, y mostrarla de entrada filtra a favor: el que sigue navegando ya sabe dónde está parado.

### El caso de oro: link directo a una unidad

El vendedor (o la pareja del visitante) manda `…#/scene/masterplan/unit/B2-A`. Hoy eso ya abre la ficha. El plan lo eleva a experiencia diseñada:

1. Misma carga de arriba, pero el chip de orientación **no aparece** (el destino ya está decidido).
2. El plano hace zoom animado al bloque B2 con el polígono resaltado (ya existe `focusUnit`).
3. La ficha de B2-A sube en estado "peek" (ver §4): título, estado, precio, CTA. Un toque más y está entera.

Esto convierte cada link compartido en una landing de la unidad. Ningún tour de 3DVista puede hacerlo.

### Anti-requisitos del arranque

- Cero modal de bienvenida, cero "hace click y comenzá la experiencia", cero video de intro, cero audio.
- Cero pedido de datos antes de mostrar nada (ni email, ni nombre).
- El crédito propio ("Recorrido por …") va chico, en la ficha de contacto o el footer del plano, no fijo sobre la escena como el de mp360.

---

## 2. Navegación en móvil

### El modelo: dos niveles, no un árbol

El recorrido tiene exactamente dos niveles de profundidad y la navegación debe hacerlos físicos:

- **Nivel 1 — el plano** (masterplan). Es "el mapa". Siempre se vuelve acá.
- **Nivel 2 — una vista** (render) **o una ficha** (bloque/unidad). Siempre a un gesto de volver al plano.

Nada de menú hamburguesa ni barra superior con siete ítems (el patrón MP360). En móvil los controles van **abajo**, donde llega el pulgar.

### Layout propuesto (viewport vertical)

```
┌──────────────────────────────┐
│ Baleia          [◱ compartir]│  ← barra superior mínima: nombre + share.
│                              │     Sin botones de acción acá arriba.
│                              │
│         MASTERPLAN           │
│      (polígonos tocables)    │
│                              │
│ [leyenda estados]            │  ← como hoy, abajo-izquierda
├──────────────────────────────┤
│  ⌂ Plano   ▣ Vistas 7  ☰ Unidades │  ← barra inferior fija, 3 pestañas
└──────────────────────────────┘
```

- **⌂ Plano**: vuelve al masterplan desde cualquier lado. Es el "home" físico.
- **▣ Vistas (7)**: abre la galería de renders como **hoja inferior con grilla de 2 columnas** (reemplaza la tira horizontal actual, que en 375 px muestra 2,5 thumbs y esconde el resto). El número anticipa cuánto hay.
- **☰ Unidades**: la lista/filtros de §3.

El CTA de contacto **no** vive en esta barra: vive en la ficha, donde hay contexto (ver §6). Un botón "Contacto" flotante permanente sin unidad elegida genera consultas vacías ("hola, info") que son exactamente lo que el mensaje prellenado viene a matar.

### Dentro de un render

```
┌──────────────────────────────┐
│ ← Plano    Terrazas    3/7   │  ← volver + nombre + posición en la serie
│                              │
│         RENDER               │
│    (pan/zoom con un dedo)    │
│                              │
│  ‹                        ›  │  ← flechas laterales discretas
├──────────────────────────────┤
│  ● ● ○ ● ● ● ●               │  ← puntitos de posición, tocables
└──────────────────────────────┘
```

- **Swipe horizontal pasa al render siguiente/anterior** (orden por `sort`). Es el gesto de galería que todo el mundo trae aprendido de Instagram. Conflicto con el pan de Leaflet: se resuelve con umbral — un arrastre que arranca con el render **sin zoom** (zoom == minZoom) y es dominantemente horizontal navega; con zoom hecho, todo gesto es pan. Regla simple de implementar y de predecir.
- Las flechas ‹ › cubren a quien no descubre el swipe.
- "3/7" comunica que esto es una serie finita: invita a verla entera.

### Exprimir el plano a pantalla completa (la ventaja que nadie más tiene)

La rotación ya ganó 4,7x de superficie; lo que sigue es cobrar esa ganancia en decisiones que los competidores — con su plano en estampilla — no pueden tomar:

- **Etiquetas legibles al zoom de encuadre.** Con el plano entero en pantalla, los rótulos de bloques y amenities entran sin pisarse: se dibujan de entrada (ver §1, contexto sin interacción). En un plano al 11% de la pantalla eso sería papilla — por eso ninguno de los 5 sitios lo hace.
- **Las etiquetas superpuestas no giran con el plano.** Al rotar la imagen, cualquier texto propio de la imagen queda de costado (mal menor, ya asumido); pero los rótulos que dibuja el visor (labels de Leaflet, tooltips) deben quedar **siempre horizontales** — los dibuja el DOM sobre el mapa, no la imagen, así que sale gratis si se especifica. Agregar además una **flecha de norte** discreta que sí gira con el plano, para que la rotación nunca desoriente ("¿la laguna quedaba arriba o a la derecha?").
- **La ficha en peek convive con el plano.** Como el plano ocupa todo el alto, una hoja al 30% le tapa poco: unidad resaltada y ficha visibles a la vez, sin elegir entre contexto y datos. Con el plano chico del competidor, cualquier panel lo tapa entero.
- **Objetivos de toque más grandes de nacimiento.** Un bloque de Baleia rotado y encuadrado mide cientos de px; el zoom-gating de §3 casi nunca se activa. La rotación es también una feature de puntería.

### Feedback al toque, regla dura

El peor bug móvil del benchmark después del modal-trampa: el botón "Entrar al loteo" de El Nogal no da ninguna señal al toque, y en Complejo Forest tocar cerca de un pin abre un menú que tapa todo. Regla para todo el visor: **cualquier toque produce una respuesta visible en menos de 100 ms** — polígono tocado destella el borde antes de que abra la ficha, pestaña tocada se marca al instante aunque la hoja tarde, botón con acción asíncrona muestra estado de carga. Y nada de menús contextuales propios sobre la escena: no tenemos y no se agrega.

### El gesto de volver (botón Atrás / swipe-back del sistema)

Regla: **Atrás deshace la última capa visible, nunca saca del recorrido de un salto.** Orden de cierre:

1. Lightbox abierto → lo cierra.
2. Ficha abierta → la cierra (vuelve al plano/render que estaba atrás).
3. Hoja de galería o lista de unidades abierta → la cierra.
4. En un render → vuelve al masterplan.
5. En el masterplan → recién ahí sale (comportamiento normal del navegador).

Implementación: hoy solo las escenas escriben historia (`pushState`); la ficha usa `replaceState` y los overlays no tocan la historia, así que Atrás desde una ficha se lleva puesta la escena. Hay que hacer que **abrir ficha/overlay empuje una entrada de historia** y que `popstate` cierre en el orden de arriba. Es el detalle que separa "web que se siente app" de "web que te escupe afuera".

### Una sola mano, en números

- Todo control tocable habitual (pestañas, cierre de ficha, flechas, chips de filtro) vive en el **tercio inferior** de la pantalla.
- Área mínima de toque: **44×44 px** para todo, incluida la × de cerrar (hoy es de 26×26 en `styles.css` — agrandarla).
- La hoja de ficha se cierra con **arrastre hacia abajo** además de la ×.

---

## 3. Encontrar una unidad

### Dos caminos, siempre

- **Camino espacial** (el plano): "quiero ese bloque que da a la laguna". Ya existe.
- **Camino de datos** (la lista): "quiero 2 dormitorios de menos de 120 m² disponible". No existe y es la pestaña **☰ Unidades**.

Con 20 unidades el camino espacial alcanza; con 600 lotes el de datos es el principal. Se diseña la lista para que a escala chica sea un índice cómodo y a escala grande sea el buscador.

### La pestaña Unidades (hoja inferior, ~85% de alto)

```
┌──────────────────────────────┐
│ ─── (asa de arrastre)        │
│ 20 unidades · 14 disponibles │
│ [Disponibles ✓] [Tipología ▾] [m² ▾] [Precio ▾]   │ ← chips de filtro
│──────────────────────────────│
│ BLOQUE 2                     │
│ ● B2-A  Dúplex   176 m²  USD 240.000  ›│
│ ● B2-F  1 dorm    97 m²  USD 145.000  ›│
│ ◐ B2-B  Dúplex   173 m²  Reservado    ›│
│ BLOQUE 3                     │
│ ● B3-D  1 dorm    96 m²  Consultar    ›│
│ …                            │
└──────────────────────────────┘
```

- **Orden**: disponibles primero dentro de cada grupo; el punto de color es el estado (mismos tokens de siempre).
- **Fila** = código · tipología · m² · precio (o "Consultar" si `p` es null, o el estado si no está disponible). Toque → ficha (§4). El encabezado de grupo ("Bloque 2") toca → ficha del bloque.
- **Filtros como chips**, no como formulario: "Disponibles" es un toggle (encendido por defecto **no** — mostrar todo con estado visible genera más confianza que esconder lo vendido; que lo encienda quien quiera); tipología y m²/precio abren un selector simple. Todo filtro activo se refleja **también en el plano**: los polígonos que no matchean bajan a contorno gris al 30%. Filtrar la lista y filtrar el mapa son la misma acción (esto es lo que El Nogal hace bien; nosotros lo hacemos sin diálogo aparte).
- **Búsqueda por código**: campo de búsqueda que aparece recién cuando hay más de ~40 unidades. Con 20, es ruido.

**Datos necesarios**: tipología ya está (`attrs.tipologia`); dormitorios conviene agregarlo como attr (`dormitorios: 1|2`) al CSV de onboarding — es dato, no cambio de contrato. Precio ya viaja en availability.

### Escala 600 lotes (diseño ahora, implementación cuando toque)

- La lista se virtualiza y agrupa por manzana/etapa (la jerarquía `Group` del contrato ya lo soporta).
- Filtros ganan el rango de precio con slider y el resumen vivo "132 lotes cumplen".
- En el plano, **zoom por niveles**: lejos se ven las manzanas como bloques con contador ("M4 · 12 disp."); tocar una manzana hace zoom a ella; los lotes individuales se vuelven tocables recién pasado un umbral de zoom.

### El problema del dedo sobre el lote chico

Tres capas de defensa, todas baratas:

1. **Zoom-gating** (el de arriba): si en el zoom actual el lote promedio en pantalla mide menos de ~44 px, el toque no selecciona un lote — hace zoom 2x centrado en el toque. Nunca se selecciona "lo que salga" por error.
2. **Toque tolerante**: pasado el umbral, un toque que no cae dentro de ningún polígono selecciona el polígono cuyo borde esté a menos de 12 px. Errar por un pelo no puede ser "no pasó nada".
3. **Desambiguación honesta**: si dentro del radio de tolerancia hay 2+ candidatos, aparece una mini-hoja con esas 2-3 filas (formato de la lista) para elegir. Mejor un toque más que una selección equivocada.

En Baleia (polígonos = bloques grandes) nada de esto se activa; queda especificado para que la misma mecánica sirva en un loteo.

---

## 4. La ficha de unidad en móvil

### Hoja inferior de tres alturas

La ficha actual es una hoja de altura fija (62%). Pasa a tres estados, con asa de arrastre:

- **Peek (~30%)**: lo esencial + CTA. Es lo que aparece al tocar un polígono o llegar por deep link. El plano sigue visible arriba: nunca se pierde el contexto de "dónde está".
- **Media (~60%)**: + datos completos + planta.
- **Full (~92%)**: para leer todo y ver la grilla de unidades de un bloque.

Arrastrar el asa mueve entre estados; arrastrar hacia abajo desde peek cierra; la × cierra desde cualquiera.

### Contenido y orden (unidad)

```
┌──────────────────────────────┐
│ ───                        × │
│ B2-A · Dúplex                │  ← qué es
│ ● Disponible   USD 240.000   │  ← puedo? cuánto?   ┐ esto es
│ ┌──────────────────────────┐ │                     │ el "peek"
│ │ 💬 Consultar por B2-A    │ │  ← CTA (§6)         ┘
│ └──────────────────────────┘ │
│ ────────────────────────────│
│ Superficie total    176 m²   │
│ Cubierta            120 m²   │  ← media
│ Dormitorios         2        │
│ Bloque              B2 ›     │
│ ┌──────────────────────────┐ │
│ │   [PLANTA - imagen]      │ │  ← tocar = pantalla completa
│ │   ⤢ Ver planta grande    │ │
│ └──────────────────────────┘ │
│ ◱ Compartir esta unidad      │  ← full
└──────────────────────────────┘
```

Decisiones:

- **El precio va segundo, no último.** Es la pregunta real del comprador. Con `p: null`, en su lugar va "Precio a consultar" — y el CTA se vuelve aún más importante.
- **El CTA está dentro del peek**: visible sin scrollear, siempre. En estados media/full queda **pegado (sticky) al borde inferior de la hoja** mientras se scrollea el contenido.
- "Bloque B2 ›" reemplaza al link "← Bloque…" de arriba: la jerarquía se navega hacia arriba desde los datos, no desde un botón suelto.
- La nota del brochure ("algunas páginas muestran dos unidades juntas") se mantiene — la honestidad sobre el material es una decisión correcta ya tomada.
- Unidad sin planta (7 de 20): "Planta disponible a pedido" **dentro del CTA alternativo** — "💬 Pedir planta de B3-H" prellena ese pedido por WhatsApp. Un faltante de material convertido en motivo de contacto.

### La planta a pantalla completa

Hoy el lightbox es un `<img>` estático: en un teléfono una planta A4 apaisada se ve chica y no se puede recorrer. Pasa a **visor de imagen real**:

- Pinch-zoom y pan (reutilizar `FloorplanRenderer`/Leaflet, que ya hace exactamente esto con imágenes planas; la planta es una escena efímera sin hotspots).
- **Rotación automática si la planta es apaisada y el teléfono vertical** — misma regla y mismo módulo `plan-orientation.ts` que ya resolvió el masterplan. La ganancia medida (4,7x) aplica igual acá.
- Fondo blanco (las plantas vienen sobre blanco), botón cerrar de 44 px, cierre por Atrás.

### Ficha de bloque

Igual estructura; el "peek" muestra "Bloque 2 · 9 unidades · 6 disponibles · desde USD 145.000" y el CTA general del proyecto. En media/full, la grilla de unidades actual, pero cada celda con **precio o estado** además del color, y ordenada disponibles-primero.

---

## 5. Comunicar el estado comercial (y el precio) sin arcoíris

### El problema

Estado ya usa 5 colores (verde/ámbar/rojo/violeta/gris). Codificar precio con más matices sobre el mismo plano — lo que hace Jacarandá con 8 colores — vuelve la leyenda un manual. Dos variables categóricas por color en la misma capa no funcionan.

### La solución: una variable por capa, dos capas conmutables

**Capa por defecto — Estado** (la de hoy, intocada). Responde "¿qué puedo comprar?".

**Capa Precio — un toggle en la leyenda**: `[Estado | Precio]`. Al activarla:

- Solo las unidades **disponibles** se pintan, con una **rampa secuencial de un solo tono** (ej. verde-agua claro → azul petróleo oscuro = barato → caro). 3-4 tramos, calculados por cuantiles de los `p` presentes o definidos por el proyecto.
- Todo lo no disponible cae a contorno gris tenue. Es correcto además de legible: el tramo de precio de un lote vendido no le sirve a nadie.
- La leyenda muta a los tramos con sus rangos reales: "▮ hasta USD 160 k · ▮ 160–220 k · ▮ más de 220 k".

Por qué le gana al esquema de Jacarandá: su color codifica precio **siempre**, y entonces el estado (¿está libre?) queda relegado a una segunda leyenda confusa ("disponibles: varios colores"). Nosotros mantenemos cada pregunta en su capa, y el modo precio es *más* legible que el suyo porque una rampa de un solo tono se ordena sola a la vista (más oscuro = más caro), mientras que amarillo/rosa/bordó no tienen orden natural — hay que memorizar la tabla.

**Refuerzos no cromáticos** (los dos mundos, siempre):
- Con zoom suficiente, el polígono muestra su **etiqueta con el dato de la capa activa**: "B2-A" en modo estado, "USD 240 k" en modo precio.
- Los `pattern` de `STATUS_TOKENS` (diagonal para reservado, etc.) ya están definidos y no se usan en los rellenos: aplicarlos como trama SVG en los polígonos. Daltonismo e impresión resueltos con un dato que ya existe.

En Baleia (polígonos = bloques): el modo precio pinta el bloque por su tramo **mínimo** disponible y la etiqueta dice "desde USD 145 k". En un loteo con polígono por lote, aplica directo.

**Dato/contrato**: los tramos pueden calcularse client-side desde availability (cero cambio de contrato) o fijarse en `theme`. Propuesta: cuantiles automáticos con override opcional `theme.priceBands` — cambio **aditivo y opcional** de `TourManifest`, no rompe nada existente. Decirlo en el PR que toque `types.ts`.

---

## 6. Contacto y conversión

Lo mejor del benchmark es el WhatsApp prellenado de Jacarandá. Lo copiamos y lo mejoramos en las tres cosas que a ellos les faltan: **contexto de unidad real** (ellos prellenan un tramo de color, no un lote), **link de vuelta al recorrido**, y **presencia en el momento justo** (dentro de la ficha, no en un cotizador aparte que encima se les rompe).

### El CTA

Un solo botón primario, verde WhatsApp, con el código de la unidad en el texto: **"💬 Consultar por B2-A"**. Vive en el peek de la ficha (§4). Nada de formularios propios: en este mercado el formulario es fricción y WhatsApp es el canal donde la conversación va a pasar de todos modos.

### El mensaje prellenado

```
Hola! Estoy viendo Baleia y me interesa la unidad B2-A.
• Dúplex · 176 m² · 2 dormitorios
• Precio de lista: USD 240.000
• Estado: Disponible
La estoy viendo acá: https://baleia.uy/tour#/scene/masterplan/unit/B2-A
```

- **El deep link es la mejora clave sobre Jacarandá**: el vendedor abre el link y ve exactamente lo que el comprador ve; y si reenvía el chat, el tercero cae en la landing de la unidad (§1). El mensaje se vuelve un artefacto navegable, no solo texto.
- Variantes: sin precio público → la línea de precio se reemplaza por "Quisiera saber el precio."; unidad sin planta → "¿Me pasás la planta?"; ficha de bloque → "me interesan las unidades del Bloque 2 (6 disponibles)".
- URL: `wa.me/<numero>?text=<encodeURIComponent(...)>`. Emitir antes un evento `r360:cta` (mismo patrón que `r360:availability`) con `{unitCode, kind}` para métricas del panel.
- Disclaimer corto bajo el botón cuando hay precio: "Valores de lista, a confirmar por el vendedor." — la lección del disclaimer de Jacarandá, en una línea.

### Compartir (el segundo funnel)

El gesto "se lo mando a mi pareja" convierte tanto como el contacto (ya está reconocido en el comentario de `scenes.ts`). Botón **◱ Compartir** en la barra superior (comparte la escena actual) y al pie de la ficha (comparte la unidad): usa `navigator.share` con la URL del hash; fallback copiar-link. Texto: "Mirá esta unidad en Baleia: …". Cada share siembra una landing de unidad.

### Cambio de contrato — explícito

`TourManifest` no tiene datos de contacto. Propuesta:

```ts
// TourManifest, campo nuevo OPCIONAL:
contact?: {
  whatsapp: string;          // E.164, ej. "+59891234567"
  messageTemplate?: string;  // opcional, con placeholders {code} {label} {price} {url}
}
```

- **Aditivo y opcional**: manifiestos existentes siguen válidos; sin `contact`, el visor simplemente no muestra CTA (comportamiento de hoy). Afecta a panel (formulario del proyecto: cargar el número) y a builder (`build_tour.py`: emitirlo). Es EL cambio de contrato que este plan pide; el resto del plan no toca `types.ts` salvo el opcional `theme.priceBands` de §5.
- El número va en `tour.json` y no en availability: es dato del proyecto, no dato comercial vivo. Cachea bien.

### Qué NO es la v1 de conversión

Cotizador de financiación (anticipo/cuotas): recién cuando un proyecto real cargue planes de pago. Diseñar el cotizador antes de tener el dato es inventar números — el error que ya se corrigió en el seed. Cuando exista, vive dentro de la ficha (no en un dominio aparte) y termina en el mismo mensaje de WhatsApp con el desglose.

---

## 7. Carga y percepción de velocidad

MP360: ~492 requests y cero feedback. Nosotros ya somos livianos (1 imagen por escena + 2 JSON); el trabajo acá es **hacer sentir** esa ventaja.

### Reglas

1. **Nunca un spinner solo.** Siempre contenido degradado (thumb borroso) + progreso real. El texto "Cargando recorrido…" actual muere.
2. **Orden de aparición fijo y jerárquico** — cada cosa aparece apenas puede, sin esperar a la siguiente:
   `shell con marca (0,3 s) → masterplan borroso (0,5–1 s) → polígonos grises → colores de estado → masterplan nítido → prefetch de renders`.
   Los polígonos no esperan a availability (ya es así: fallback gris) ni a la imagen full-res: la geometría viene en `tour.json`, que ya está.
3. **La barra de progreso mide lo que domina**: la descarga del master del masterplan (fetch con `ReadableStream` para progreso real + `blob:` URL al overlay). Con `Content-Length` presente es exacto; sin él, se anima hasta 90% y cierra al load.
4. **Cambio de escena instantáneo percibido**: al tocar "Vistas → Terrazas", el thumb (ya prefetcheado, ~15 KB) se muestra borroso al instante y el render full lo reemplaza al llegar. El swipe entre renders prefetchea el vecino siguiente.
5. **Presupuesto**: primer toque útil (plano tocable) < 2 s en 4G media; masterplan nítido < 4 s. Medirlo en CI con throttling y hacerlo un número del repo, no una intención.
6. **Cuando lleguen panorámicas** (tiles cubemap, `tiledCubemap.ts` ya listo): mismo patrón — preview equirectangular de baja como placeholder inmediato, tiles progresivos encima, indicador discreto "mejorando calidad…" en la esquina, jamás pantalla negra.

---

## 8. Qué NO hacer

**No copiar de MP360:**

- **Doble puerta de entrada** (intro + gate "hacé click para comenzar"). Nuestra intro es el producto cargando. Y su variante peor, la de Jacarandá en móvil: toda la pantalla de intro es un enlace sin rótulo y de destino impredecible (a veces el tour, a veces el cotizador). Todo lo tocable nuestro se ve como tocable y dice a dónde va.
- **Precarga glotona antes de la primera interacción** (First Tower baja ~15 imágenes en alta + un audio de fondo apenas cargás, en datos móviles). Nuestro prefetch es de **thumbs** (~15 KB cada uno) y recién después del primer paint del masterplan (§1); las imágenes grandes se bajan cuando el visitante las pide. El presupuesto de §7 es también un techo de consumo de datos ajenos.
- **Video de intro con audio narrado**. En móvil con datos es peso muerto, el autoplay con audio está bloqueado igual, y nuestro material (renders) luce más como escena tocable que como video. Si el proyecto tiene un video, va como una vista más en la galería, jamás como puerta.
- **Precio-por-color como única codificación permanente** (el arcoíris de 8 colores). Resuelto en §5 con capas.
- **Cotizador en sitio aparte** (cotizador-jacaranda360.com): parte el funnel en dos dominios y así se les rompió la comparación entre tramos. Todo vive en el recorrido; para campañas, se comparte un deep link.
- **Menú superior de 7 ítems + hamburguesa duplicada**. Tres pestañas abajo.
- **Crédito de agencia fijo sobre la escena**. Discreto en la ficha de contacto.

**Tentaciones que no valen el costo (por ahora):**

- **Tours guiados en vivo con videollamada** (lo #2 del benchmark). Costo enorme (señalización, presencia, control remoto) para un caso que nuestro deep link cubre al 80%: el vendedor manda links de unidad por WhatsApp mientras hablan, y ambos ven lo mismo. Si algún día se hace, la versión barata es "seguir sesión" (el visitante sigue el hash del vendedor por un canal liviano), no videollamada. No en este plan.
- **Comparador de unidades lado a lado**. Nadie del benchmark lo tiene y con 20 unidades la ficha + Atrás alcanza. Barato de simular: el share de dos links. Reevaluar a escala loteo.
- **Multi-idioma**. Punta Ballena atrae brasileños: es real, pero es infraestructura transversal (manifiesto, panel, visor). Decisión: dejar los strings del visor centralizados en un módulo (costo ~0 hoy) y el idioma como etapa futura; no bloquear nada por esto.
- **Widget de avance de obra**. Buena idea de El Nogal, pero es dato que alguien tiene que mantener; sin proceso de carga del lado del desarrollador, nace mentiroso. Cuando el panel tenga sección "hitos de obra", el visor la muestra como una vista más ("Obra · agosto 2026" en la galería, con fotos). No inventar el widget antes que el dato.
- **Toggle día/noche** (lo mejor de Complejo Forest en móvil: elegir la atmósfera en vez de imponerla). La idea es buena y barata *de UI*, pero cara *de material*: exige dos versiones de cada escena. En Baleia hay un solo render por vista (uno es "al atardecer"). Decisión: no fabricar el material; **si** un proyecto entrega pares día/noche de una misma escena, el visor los muestra como un toggle en esa escena (es solo un `setUrl` del overlay). Especificado, no prometido.
- **Música/audio ambiente**: no.
- **Gamificación, minimapa 3D, giroscopio obligatorio**: no.

---

## 9. Plan por etapas

Ordenado por impacto en la experiencia por unidad de esfuerzo. Cada etapa deja el producto entero y demostrable con Baleia. Esfuerzo relativo: S < M < L (S ≈ una sesión larga de trabajo).

### Etapa 1 — El dinero sobre la mesa (conversión mínima) · **S-M**
La brecha más grande con el benchmark, con el dato ya disponible.
- Mostrar **precio** en ficha, tooltip y grilla de bloque (leerlo de `availability`, que ya lo trae; `chipFor`/`unitFacts` hoy lo ignoran).
- Campo `contact` en `TourManifest` (cambio de contrato aditivo — coordinar con panel y builder) + **CTA de WhatsApp prellenado con deep link** (§6), con sus variantes (sin precio / sin planta / bloque).
- Botón **Compartir** (Web Share API + fallback).
- Evento `r360:cta` para medición.
- Toca: `types.ts`, `ui.ts`, `polygons.ts`, `build_tour.py`, panel (form de proyecto).

### Etapa 2 — El primer minuto y la carga · **M**
- Boot con marca + thumb borroso del masterplan + barra de progreso real (§1, §7).
- Chip de orientación con conteo y "desde USD…"; supresión en deep link.
- Deep link a unidad con zoom + ficha en peek.
- Prefetch de thumbs de renders; blur-up al cambiar de escena.
- Etiquetas de bloques y amenities visibles al zoom de encuadre + flecha de norte (§1, §2): el masterplan como mapa anotado.
- Toca: `main.ts`, `scenes.ts`, `floorplan.ts`, `styles.css`, plantilla HTML del standalone.

### Etapa 3 — Navegación que se siente app · **M**
- Barra inferior de 3 pestañas; galería como hoja en grilla (§2).
- Ficha de tres alturas con asa, arrastre y CTA sticky (§4).
- **Historia/Atrás por capas** (overlays en `pushState`, cierre en orden) — el punto más delicado de la etapa.
- Swipe entre renders con umbral zoom==min; flechas y puntitos.
- Objetivos de toque a 44 px y regla de feedback < 100 ms en todo lo tocable (§2).
- Toca: `ui.ts`, `styles.css`, `scenes.ts`.

### Etapa 4 — La planta digna y la lista de unidades · **M**
- Visor de planta a pantalla completa con pinch-zoom y rotación automática (§4, reutiliza Leaflet + `plan-orientation.ts`).
- Pestaña **Unidades**: lista agrupada, filas con precio/estado, chips de filtro, filtros reflejados en el plano (§3).
- "Pedir planta de X" para las 7 unidades sin imagen.
- `dormitorios` como attr en el CSV de onboarding de Baleia (dato, no contrato).
- Toca: `ui.ts`, `floorplan.ts`, nuevo `unit-list.ts`, CSV/builder.

### Etapa 5 — Capa de precio y refuerzos visuales · **S-M**
- Toggle Estado/Precio en la leyenda con rampa secuencial por cuantiles (§5); opcional `theme.priceBands`.
- Tramas SVG de `STATUS_TOKENS.pattern` en los rellenos.
- Etiquetas por zoom con el dato de la capa activa.
- Toca: `polygons.ts`, `floorplan.ts`, `main.ts` (leyenda), quizá `types.ts` (aditivo).

### Etapa 6 — Escala y futuro · **L** (cuando haya proyecto que lo pida)
- Zoom-gating, toque tolerante y desambiguación para lotes chicos (§3) — especificados acá, se implementan con el primer loteo real.
- Búsqueda por código, lista virtualizada, filtros por rango.
- Con panorámicas: carga progresiva de tiles con placeholder (§7) y escena de **contexto de ubicación** al estilo First Tower (etiquetas de puntos de interés de Punta Ballena sobre la aérea) — la única idea de MP360 que vale la pena copiar entera.
- Centralización de strings para idioma futuro (hacerla de paso en las etapas 3-4, no como etapa propia).

### Qué mirar para saber si funcionó
- % de sesiones móviles que tocan al menos un bloque en los primeros 30 s.
- % de sesiones que abren una ficha de unidad; % de fichas que terminan en `r360:cta`.
- Tiempo hasta primer toque útil (< 2 s objetivo).
- Cantidad de aperturas por deep link de unidad (proxy de shares y de links de vendedor): es la métrica que ningún competidor con 3DVista puede siquiera tener.
