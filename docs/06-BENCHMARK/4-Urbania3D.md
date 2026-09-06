# Benchmark Urbania3D — referencia directa del cliente (06-09-2026)

Auditoría de **urbania3d.app**, el producto que el cliente mandó como captura de referencia ("quiero algo de primer nivel así"), comparado con lo ya auditado de MP360 (`1-UX-Movil-MP360.md`, `2-Features-Desktop-MP360.md`) y con nuestro propio plan (`3-PLAN-EXPERIENCIA.md`).

## Nota metodológica (leer antes del resto)

Todo lo que sigue se vio en pantalla, navegando el sitio real y su demo de producto, con inspección de DOM, `network requests` y JS de la página — nada es de memoria. Dos limitaciones a declarar:

1. **No se pudieron guardar capturas como archivos PNG en disco** (misma limitación de entorno que los informes de MP360: el navegador remoto no expone una ruta de archivo para sus capturas). La carpeta `capturas-urbania/` queda sin archivos por esta razón. Cada hallazgo describe con precisión qué se vio en vez de citar un nombre de archivo.
2. **A mitad de la sesión, el panel de navegador remoto pasó a un estado "oculto"** fuera de mi control (posiblemente el usuario minimizó el panel de su lado). En ese estado, `screenshot`, lectura de DOM y ejecución de JS siguieron funcionando, pero los clics/gestos sintéticos (`left_click`, drag, scroll) empezaron a fallar por timeout. Esto **bloqueó la auditoría móvil interactiva a mitad de camino**: llegué a la pantalla de entrada en 375×812 y la describo con precisión, pero no pude atravesar el gate "Ingresar" — los clics disparados por JavaScript (`element.click()`, eventos de puntero/touch sintéticos) sí ejecutan el handler, pero el video de intro que dispara a continuación no avanza, consistente con que Chrome no trata un clic generado por script como "gesto de usuario" válido para autoplay. Por eso, todo lo de la sección "3. Móvil" más allá de la pantalla de entrada es **inferido de la auditoría de escritorio** (misma SPA, mismas rutas, mismo dato), marcado explícitamente como "no verificado en 375×812" y no como hecho confirmado. Recomiendo repetir esa parte puntual en una sesión con el panel visible.

Donde no hay evidencia directa, se dice "no verificado" en vez de inventar — mismo estándar que los informes de MP360.

---

## 0. Qué es urbania3d.app y cuál demo corresponde a la captura del cliente

`urbania3d.app` es el **sitio de marketing** del producto (Astro + Cloudflare, sin relación con el motor del showroom en sí). Ahí se identifica la empresa: "Urbania — El Showroom Virtual que usan los mejores Desarrolladores Inmobiliarios de LATAM", fundada por estudiantes de arquitectura de Rosario (confirmado por notas de Forbes Argentina, Punto Biz, La Capital, etc. citadas en la propia landing).

El testimonio de **Lucas Salim (CEO Grupo PROACO)**, **Luciano Lorenzoni (Gerente de Marketing, PROACO)** y **Horacio Vigano (Gerente de Transformación Digital, PROACO)** confirma la relación con PROACO, y este último cuenta el origen del proyecto de la captura: *"Cómo llegaron los chicos a Proaco fue muy gracioso: nos retaron a que eran capaces de digitalizar **Pocito** en 20 días (...) estuvo presente en Casa FOA."*

En el portfolio (`urbania3d.app/portfolio`, 50+ proyectos reales enlazados) el proyecto correspondiente es **`pocito.urbania3d.app`** ("Pocito Social Life", PROACO, Córdoba, categoría "Edificios de +20 Pisos") — y al entrar coincide exactamente con la captura descripta por el cliente: tres torres sobre un zócalo comercial en contexto urbano, botones **"Torre 2"** y **"Mall & Parking"** arriba a la derecha, flechas ‹ › a los costados, zoom +/− abajo a la izquierda y WhatsApp abajo a la derecha. Esta es la demo auditada en detalle.

El portfolio en sí es un activo de venta fuerte para Urbania: 50+ showrooms reales navegables, agrupados por categoría (Edificios +20 pisos, loteos, housing, industrial/comercial, hoteles, y una categoría **"Versión Lite"** — un tier de producto más económico/simple que no auditamos en detalle pero vale night para pricing propio).

---

## 1. El motor técnico — qué es realmente, con evidencia de red y DOM

**Hipótesis del brief**: que las flechas ‹ › fueran una secuencia de renders orbitales (una vuelta al edificio, cuadro por cuadro). **Resultado: parcialmente confirmada, pero no es una secuencia de fotogramas clásica — es algo más nuevo y más barato.**

### Lo que NO es
- **No es Three.js ni WebGL ni ningún motor 3D en tiempo real.** Se verificó exhaustivamente: `document.querySelectorAll('canvas')` devuelve **cero** en todas las vistas exteriores (masterplan, torres, plantas). No hay geometría 3D corriendo en el cliente.
- **No es 3DVista** (el motor detrás de los 5 sitios de MP360). No hay tiles de panorama cubemap, no hay cursor `grabbing.cur`, no hay menú "..." con "3DVista Player vX".
- **No es una secuencia de decenas/cientos de fotogramas JPG** arrastrados como un turntable de e-commerce (tipo Sketchfab o fotografía de producto 360°). Se comprobó arrastrando de a poco y de a mucho: los mismos 2-3 blobs de video se reutilizan sin generar requests nuevas, es decir, el "abanico" de posiciones de cámara es chico y fijo, no continuo.

### Lo que SÍ es: un grafo de posiciones de cámara fijas, unidas por video

La arquitectura real, confirmada por inspección de `<video>`/`<img>` en vivo y por `performance.getEntriesByType('resource')`:

- Es una **SPA de React** (bundle Vite: `index-*.js`, `react-*.js`, `query-*.js` de React Query, `i18n-*.js`) con **Service Worker** (`workbox-window`) y **Sentry** para error tracking — arquitectura de producto real, no un truco de landing.
- El contenido de cada escena exterior sale de una **API de contenido propia**: `GET /api/v1/public/project-content/masterplan-tree/106?locale=es` (28 KB de JSON) — un árbol de "puntos" (`points/573`, `points/576`, etc.) que describe qué imagen o video corresponde a cada posición de cámara. Es, ni más ni menos, la implementación real del "Panel de cliente" que promete el marketing: el contenido es data, no código hardcodeado por proyecto.
- Cada "posición de cámara" de descanso es una **imagen estática de alta resolución** (JPG, 2560×1440, entre ~415 KB y ~1 MB en los casos medidos: `pocito-convertido-de-png_xgkmap.jpg` 516 KB, `1-convertido-de-jpeg_w8read.jpg` 1,03 MB, `ComfyUI_00125[...].jpg` 415 KB, `ComfyUI_00006[...].jpg` 671 KB).
- Moverse entre dos posiciones (arrastre lateral o flecha ‹ ›) **reproduce un clip de video corto** (~4 segundos, 1920×1080) que hace de "cámara en movimiento", y al terminar dicho clip la vista vuelve a quedar fija sobre la imagen estática de destino. Confirmado con `video.duration ≈ 4.04s` y `video.currentTime === video.duration` (video terminado y en pausa) inmediatamente después de la transición.
- Hay un **clip de video dedicado para ir "para atrás"** (`reverso_mqfb4r.mp4`), en vez de simplemente reproducir el mismo clip al revés — es decir, cada tramo del recorrido tiene ida y vuelta grabadas/generadas por separado.
- **El nombre de los archivos delata el pipeline de producción**: son literalmente prompts de generación de video por IA guardados como nombre de archivo, ej.: `Firefly_vSingle_continuous_shot._High-altitude_start._Fast_forward_dolly-in_with_progressive_acceler...mp4`, `..._vertical_axis._Fixed_radius_fixed_height...mp4`, `...flight_descent_toward_center._Penetrate_geometry._As...mp4`, y varios `ComfyUI_0000N` (ComfyUI es la herramienta de nodos más usada para generación de video/imagen por difusión). Esto es una prueba bastante directa de que el "vuelo" alrededor del edificio **no es una toma real de dron ni un render 3D tradicional (3ds Max/Corona) por cuadro**, sino **video generado por IA** a partir de las imágenes fijas — probablemente generado una vez por par de puntos y subido al pipeline de contenido.
- El video de intro completo (`Intro_POCITO_wnata1.mp4`) pesa **14,47 MB** — un solo archivo, bastante pesado para ser lo primero que baja un celular con datos móviles (ver §5).

**Conclusión sobre la técnica**: no es la "secuencia orbital de renders, cuadro por cuadro" que anticipaba el brief — es más inteligente y más liviana que eso: **un puñado de renders fijos de alta calidad + clips de video de ~4 s generados por IA que conectan esos puntos**, con ida y vuelta grabadas por separado, todo orquestado por un grafo de datos (`masterplan-tree`) en vez de código por proyecto. El "sentimiento" de arrastre es el de una transición cinemática de cámara, no el de un objeto que rota bajo el dedo — el usuario no controla el framerate ni la posición angular exacta, dispara una animación de 4 segundos que termina donde termina.

**Por qué nos importa para Baleia**: es una alternativa real y barata a las panorámicas cubemap para el día que Baleia tenga varios renders del mismo edificio desde ángulos distintos — en vez de invertir en tiles panorámicos reales, un puñado de clips de transición (IA o incluso animática 3D liviana) entre 2-4 renders fijos podría dar una sensación de "vuelo alrededor del edificio" con una fracción del peso. Vale la pena anotarlo como ítem de backlog para cuando lleguen más renders por escena (nuestro plan ya lo prevé en abstracto en §7.6, esta es la técnica concreta que lo resolvería barato).

### Las unidades SÍ tienen 360° real — pero es de un tercero

El botón **"Tour 360°"** de la ficha de unidad no es del mismo motor: abre un `<iframe>` a **`kuula.co/share/collection/7Mj63`** — Kuula es un servicio SaaS de hosting/visor de panorámicas 360° (competidor liviano de 3DVista/Matterport). Es decir: Urbania construyó su propio motor de "flythrough" exterior con video generado por IA, pero **terceriza el recorrido interior real de la unidad modelo a Kuula** en vez de tener motor propio de panoramas. Esto es un dato de arquitectura de producto interesante: separar "exterior cinemático propio" de "interior panorámico de terceros" en vez de forzar todo a un solo motor.

---

## 2. La experiencia completa en escritorio

### Entrada
Pantalla de bienvenida de pantalla completa: render aéreo de las 3 torres + zócalo comercial (el mismo que la captura del cliente), logo/isotipo del proyecto centrado, y **un solo botón rotulado "Ingresar"** — sin ambigüedad de "toda la pantalla es un link" (el problema #1 de Jacarandá en el benchmark de MP360). Arriba: "Menú" (hamburguesa) y un ícono de código QR (para pasar el link a otro dispositivo, presumiblemente).

Al tocar "Ingresar" se dispara el video de intro (flyover satelital de la ciudad completa, con marca de agua PROACO apareciendo). A los ~5 s aparece un botón discreto **"Omitir intro"** — mejor que MP360 (ningún sitio del benchmark daba la opción de saltar su intro) pero peor que nuestro propio principio ("cero video de intro"): acá el video existe igual, sólo que es saltable.

### Masterplan / exterior
Tras la intro (o al saltearla), la vista aterriza en la escena de las 3 torres con:
- Toggle **Día ☀ / Noche 🌙** arriba a la derecha (la misma idea que destacamos como lo mejor de Complejo Forest en el benchmark de MP360 — acá confirma que no es una rareza sino una expectativa cada vez más estándar en la categoría). En una prueba, tocar "Noche" arrancó una transición (cross-fade visible) pero volvió a "Día" sin completarse — **no verificado si es bug real o un hipo de carga puntual**, lo marco con pinza.
- Botones **"Torre 2"** y **"Mall & Parking"** arriba a la derecha (exactamente lo que describió el cliente) — accesos directos a las otras áreas del proyecto sin tener que "encontrarlas" en la escena.
- Etiquetas flotantes **"Torre 1", "Torre 2", "Torre 3", "Mall & Parking"** superpuestas directamente sobre el render, visibles sin necesidad de tocar nada — mismo principio que destacamos de First Tower en el benchmark de MP360 ("contexto sin interacción"), aplicado acá al propio edificio en vez de al entorno.
- Zoom +/− abajo a la izquierda, flechas ‹ › a los costados para cambiar de posición de cámara (el mecanismo descripto en §1), logo del desarrollador (PROACO) arriba a la izquierda, WhatsApp flotante abajo a la derecha.
- Un ícono más abajo a la derecha (al lado del WhatsApp) que parece de "reencuadre/norte" — no se confirmó su función exacta, no es el botón de descarga que menciona el brief (ese aparece más abajo, dentro de la ficha de unidad, no en la vista exterior).

### Navegación piso por piso ("Plantas")
Tocar "Torre 2" dispara **otro clip de video** (una "subida" por la torre) y aterriza en una vista **cenital real de planta de piso**: 15 unidades numeradas (34-01 a 34-15) con pin de estado (verde = disponible, rojo = no disponible) superpuesto directamente sobre el render de planta. A la derecha, un **riel vertical de selección de piso** (26° a 35°, más "Terraza") permite saltar a cualquier piso sin volver atrás — navegación piso-por-piso real, con jerarquía espacial genuina (no un plano único aplanado como el de los loteos de MP360).

### Ficha de unidad
Tocar un pin abre una tarjeta compacta in-place: código, estado (pill de color), **precio en USD** (ej. "Unidad 34-15 · Disponible · USD 129.341"), botón **"Solicitar información"**, superficie total, dormitorios, baños, piso, y dos atajos: **"Ver Ficha"** y **"Tour 360°"**. Precio y CTA están arriba de todo, sin scroll — comparable en jerarquía a lo que nuestro propio plan (§4) ya diseñó para Baleia.

**"Ver Ficha"** abre la vista completa con pestañas: **Galería · Vistas · Plano 3D · Tour 360° · Comparador**. Ahí aparece además: superficie cubierta, un botón **"Descargar PDF"** (ficha técnica descargable — la feature #11 listada en el marketing, confirmada real), un ícono de compartir, "Aviso Legal", y un mini-mapa "Ubicación en piso" (thumbnail que marca dónde está esa unidad dentro del piso completo — buen detalle de orientación que no vimos en ningún sitio de MP360).

- **"Tour 360°"**: panorama real embebido de **Kuula** (ver §1) del departamento modelo, con instrucción explícita en pantalla ("HAGA CLIC Y ARRASTRE PARA MIRAR ALREDEDOR") — la misma lección que ya identificamos como la mejor práctica de Tipuana en el benchmark de MP360, aplicada acá de nuevo.
- **"Comparador"**: pantalla real de comparación lado a lado ("Elegir unidad B" para sumar una segunda unidad a comparar). **Esto contradice una premisa de nuestro propio plan** (`3-PLAN-EXPERIENCIA.md`, §8: *"Comparador de unidades lado a lado. Nadie del benchmark lo tiene..."*) — MP360 no lo tenía, pero **Urbania sí**, y es justamente la referencia que el cliente mandó como "nivel a alcanzar". No implica que haya que construirlo ya, pero cambia el dato de partida: si el cliente compara contra Urbania, la ausencia de comparador ya no es "nadie lo tiene", es "el que más nos gusta, lo tiene".

### Buscador de unidades (`/units`)
Un buscador de datos real, en tres pasos:
1. **Elegí un área**: tarjetas por torre/sector con contador de disponibilidad en vivo — "Torre 2 · 106 disponibles" (botón "Explorar" activo), "Mall & Parking" y "Torre 1" marcadas **"100% Vendido"** (deshabilitadas), y una sección "Próximamente" para fases futuras. Toggle "Solo con disponibilidad" arriba.
2. **Tipologías**: "1 Dormitorio · 91 disponibles" / "2 Dormitorios · 15 disponibles".
3. **Vista/orientación**: "Vista Sur · 31 disponibles" / "Vista Oeste · 17" / "Vista Norte · 43".
4. **Grilla final**: catálogo completo y paginado — **"Mostrando 1–12 de 390 Unidades"** — con buscador de texto libre ("Buscar unidades..."), selector de orden ("Piso menor a mayor"), botón **"Comparar unidades"**, y cada tarjeta con: **carrusel de fotos propio de esa unidad** (ej. "2/3"), precio en USD, torre/piso, dormitorios, m², baños, tag "Balcón", y accesos directos "Ver Ficha" / "Tour 360°".

Esto es sustancialmente más rico que el "camino de datos" que documentamos en cualquier sitio de MP360 — ninguno de los 5 auditados llegó siquiera a mostrar una ficha de unidad completa, y acá hay 390 unidades reales, con foto y precio propios, filtrables y comparables desde la grilla.

### Robustez de deep-linking (hallazgo por accidente)
Navegar directo a `pocito.urbania3d.app/masterplan` **sin pasar antes por `/`** produce una **pantalla en blanco** y un error de consola (`CancelledError`, un fetch de React Query cancelado) — la SPA depende de estado/contexto que se establece en la home y no resuelve de forma confiable una carga en frío de una ruta interna. Es la debilidad exactamente inversa a la ventaja que ya tenemos: nuestros deep links por hash (`#/scene/{slug}/unit/{code}`) están diseñados para funcionar en frío — acá queda confirmado en un competidor de referencia directa del cliente que esa ventaja es real y no trivial.

### Menú y secciones
El menú lateral expone: Inicio, Masterplan, Áreas, Unidades, Unidad Modelo, Amenities, Pocito Corporativo, Avances de Obra, Ubicación (mapa satelital), Contacto. Es decir, en un solo proyecto residencial conviven secciones de vivienda y de oficinas ("Pocito Corporativo") — el mismo showroom sirve a dos públicos distintos del mismo desarrollo.

**Avances de obra** es acá una **sección de primer nivel** (`/work-progress`), no un widget secundario como en El Nogal (MP360) — coherente con que es una feature explícitamente vendida en el marketing ("07 · Carga de avance de obra").

### Multi-idioma
Confirmado en el sitio de marketing: selector de 6 banderas (ES/EN/PT/IT/FR/DE). **No verificado si el showroom del proyecto (`pocito.urbania3d.app`) en sí también tiene selector de idioma** — no until llegué a ver uno en las vistas auditadas, y no alcancé a revisar el menú completo hasta el fondo. Vale la pena repetir la verificación en una próxima sesión antes de asumir que el showroom hereda el multi-idioma del marketing.

---

## 3. Móvil (375×812) — lo verificado y lo no verificado

### Lo verificado con evidencia directa: la pantalla de entrada

La solución de Urbania al problema "edificio alto en pantalla vertical" en la intro **no es una rotación ni un achicamiento del mismo encuadre horizontal** — es un **recorte vertical curado**: la misma escena de las 3 torres se reencuadra para centrar y llenar el alto completo de la pantalla con **una sola torre** (la del medio), con el isotipo superpuesto a la altura del piso medio del edificio y el botón "Ingresar" flotando sobre la fachada. No es zoom+pan programático sobre el mismo asset panorámico (no vimos evidencia de eso) — es una composición vertical distinta, deliberadamente diseñada para el formato, probablemente un asset o crop dedicado para mobile más que una transformación en vivo.

Es una idea genuinamente buena para una **toma única de portada** (nuestro masterplan de Baleia no tiene este problema porque ya lo resolvimos con rotación completa del plano, no con recorte de una sola pieza) — pero **no resuelve el problema equivalente al nuestro**, que es una escena con *varios* elementos que hay que poder comparar entre sí (3 torres + mall, en su caso; bloques de un masterplan, en el nuestro). Recortar a una sola torre funciona como imagen de portada; no es una solución de *navegación* del conjunto.

Header mobile: pill "☰ Menú" arriba a la izquierda + ícono circular de pantalla completa arriba a la derecha — minimalista, coherente con la idea general del sector de reducir el header a lo esencial en pantallas chicas.

### Lo NO verificado (limitación de entorno, ver nota metodológica)

No pude atravesar el gate "Ingresar" en el viewport móvil por la caída del panel de navegador a mitad de sesión (los clics sintéticos no satisfacen la política de autoplay de video del navegador). Por lo tanto, **no verificado en 375×812**: si el masterplan interactivo (3 torres + mall) se ve completo o recortado, cómo se comportan las flechas ‹ › y el zoom táctil, cómo se ve la navegación piso-por-piso, la ficha de unidad, el comparador y el buscador de unidades en mobile. Dado que es la misma SPA y las mismas rutas que en escritorio (confirmado por el código: es un único bundle React responsive, no un subdominio "m." aparte), es razonable esperar que el contenido y las features sean las mismas con layout adaptado — pero **eso es una inferencia, no una observación**, y se marca como tal.

**Recomendación concreta**: repetir específicamente esta sección en una sesión con el panel de navegador visible de punta a punta, priorizando: (a) cómo se ve/usa el masterplan de 3 torres en vertical una vez pasada la intro, (b) si las transiciones de video de 4 s se sienten pesadas/lentas en emulación de red móvil, (c) el buscador de unidades y el comparador en mobile.

---

## 4. Qué hacen mejor que MP360 (concreto)

1. **Catálogo completo, real y filtrable de 390 unidades**, con foto y precio propios por unidad, buscador de texto y orden — ningún sitio de MP360 auditado llegó siquiera a una ficha de unidad completa.
2. **Comparador de unidades lado a lado real** — la propia auditoría de MP360 lo marcó como ausente en los 5 sitios; Urbania lo tiene y funciona.
3. **Navegación piso-por-piso con planta cenital real y riel de pisos** — más granular y espacialmente honesto que el plano único aplanado de los loteos de MP360.
4. **Un solo CTA de entrada, rotulado y sin ambigüedad** ("Ingresar"), con intro saltable a los 5 s — resuelve de mejor manera el problema #1 que identificamos en Jacarandá (toda la pantalla es un link sin rótulo) y el problema del doble gate de First Tower (acá hay un solo gate, opcionalmente salteable).
5. **PDF descargable por unidad** y comparador in-app — cierran mejor el ciclo de "llevarme la info" que cualquier sitio de MP360.
6. **Avances de obra como sección propia**, no un widget que se pisa con el menú contextual (el problema de El Nogal en MP360).
7. **Multi-idioma real** (6 banderas) al menos en el sitio de marketing — MP360 no tenía ninguno.
8. **Etiquetas de contexto directamente sobre el propio edificio** (Torre 1/2/3, Mall & Parking) visibles sin interacción — aplican la misma idea que First Tower usaba para el entorno, pero sobre el activo principal.

## 5. Qué hacen mal / oportunidades para superar

1. **Video de intro de 14,47 MB** antes de la primera interacción real — es peor en peso que el problema que señalamos en First Tower (MP360) de precarga de ~15 imágenes + audio. Que sea saltable mitiga, no elimina: en una conexión móvil real, ese archivo probablemente ya empezó a bajar antes de que el usuario llegue a tocar "Omitir intro". **Nuestra decisión de plan (cero video de intro, thumb borroso + progreso real) queda reforzada, no cuestionada, por este hallazgo.**
2. **Deep-linking fragil**: cargar en frío una ruta interna (`/masterplan`) rompe con pantalla en blanco. Nuestra arquitectura de hash ya resuelve esto — es una ventaja estructural real frente a la referencia que el cliente más admira, vale la pena decírselo explícitamente en la conversación con el cliente.
3. **CTA de unidad es "Solicitar información", no un mensaje de WhatsApp prellenado con el dato de la unidad** — a diferencia de la joya del benchmark de MP360 (el cotizador de Jacarandá, que arma el mensaje de WhatsApp con precio/anticipo/cuota ya escritos). **No verificado a qué lleva exactamente "Solicitar información"** (no lo abrí para no arriesgar el estado de la sesión ni completar un formulario con datos) — pero por el rótulo, es más probable que sea un formulario propio que un deep-link a WhatsApp con contexto, lo que sería peor que nuestro propio plan de §6 (WhatsApp prellenado con unidad + precio + link de vuelta). A confirmar en una próxima sesión antes de afirmarlo como hecho.
4. **Toggle Día/Noche no completó la transición en una prueba** (volvió solo a "Día") — no verificado si es bug real o carga puntual, pero si se repite es exactamente el tipo de "toque sin feedback confiable" que señalamos como problema de El Nogal en MP360.
5. **Torres/áreas 100% vendidas quedan con "Explorar" deshabilitado** — no se pudo verificar si al menos permiten ver unidades históricas/plantas de referencia o si cierran el acceso por completo; si es lo segundo, es una oportunidad de diferenciación (mostrar "vendido" sin ocultar información es más honesto y más útil para quien compara el desarrollador con otros proyectos del mismo).

## 6. Qué hacen mejor que nosotros (Baleia hoy), concretamente

Con la salvedad de que Baleia hoy es 1 masterplan + 7 renders + plantas de 13/20 unidades y cero panorámicas (ver `3-PLAN-EXPERIENCIA.md`, "Realidad del material") — no es una comparación pareja en contenido, pero sí en expectativa de producto:

- **360° real de la unidad modelo** (vía Kuula) — nosotros no tenemos panorámicas todavía.
- **Catálogo completo searchable/ordenable de cientos de unidades con foto propia** — nuestro plan ya diseña la pestaña Unidades (Etapa 4) pero Urbania ya lo tiene en producción con más pulido (buscador de texto, orden, fotos por unidad).
- **Comparador de unidades** — no está en nuestro plan; el dato de que la referencia directa del cliente sí lo tiene cambia la premisa de "nadie del benchmark lo tiene" que usamos para deprioritizarlo en `3-PLAN-EXPERIENCIA.md` §8.
- **PDF descargable por unidad** — no está en nuestro plan actual.
- **Navegación piso-por-piso con planta cenital** — no aplica a Baleia hoy (no es un edificio en torre con plantas repetidas de este tipo en el tour), pero es una idea a tener lista si algún proyecto futuro la necesita.

## 7. Conclusión para nuestro producto

Tres cosas para llevarse:

1. **La hipótesis de "secuencia orbital de renders" del brief no era exacta, pero apuntaba en la dirección correcta**: la técnica real (renders fijos + video de transición de 4 s, generado por IA, con ida y vuelta separadas) es una idea legítima y barata para cuando Baleia tenga más de un render por escena desde ángulos distintos — mucho más liviana que tiles panorámicos reales, y no requiere motor 3D. Vale la pena anotarla como técnica candidata en el backlog de "cuando lleguen panorámicas" de nuestro plan.
2. **Nuestras dos apuestas estructurales ya tomadas se confirman, no se cuestionan**: cero video de intro (el de Urbania pesa 14 MB) y deep-linking robusto por hash (el de Urbania se rompe en frío). Esto vale la pena decírselo al cliente en estos términos concretos si compara ambos productos.
3. **El comparador de unidades deja de ser "nadie lo tiene"**: la referencia que más le gusta al cliente lo tiene. No es urgente re-priorizar el plan por esto solo, pero es un dato que cambia la conversación si el cliente lo pide puntualmente — ya no hay que explicar por qué "ningún competidor lo tiene", porque el que él señaló como ejemplo, sí.

La brecha más grande a favor nuestro sigue siendo la que ya identificó `3-PLAN-EXPERIENCIA.md`: precio y CTA de contacto visibles de entrada, con contexto exacto de la unidad. Urbania lo hace bien (precio en el pin, en la tarjeta y en la ficha) — es la prueba de que ya vamos en la dirección correcta con la Etapa 1 de nuestro plan, y que no hay que inventar nada nuevo ahí, sólo ejecutar lo que ya está diseñado.
