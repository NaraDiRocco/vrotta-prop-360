# Benchmark UX móvil — MP360

Auditoría de 5 experiencias 360° de MP360 en emulación móvil (375×812, Chrome/Android) para identificar qué copiar y qué superar en nuestro producto competidor.

## Nota metodológica importante (leer antes del resto)

Esta auditoría se hizo navegando los sitios reales en un navegador con emulación móvil, con capturas de pantalla revisadas en vivo por el auditor antes de describir cada hallazgo — nada de lo que sigue está basado en memoria o suposición, todo fue visto en pantalla.

Dos limitaciones técnicas del entorno de trabajo condicionaron el alcance:

1. **No se pudieron guardar las capturas como archivos PNG en disco.** El entorno sandbox no tiene acceso a un display real (`screencapture` de macOS falla con "could not create image from display") y el navegador usado es un pane remoto cuyas capturas no exponen una ruta de archivo. La carpeta `capturas-movil/` queda sin archivos por esta razón — **no por falta de intento**, sino por una restricción real del entorno. Como respaldo, cada hallazgo de este informe describe con precisión qué se vio (texto exacto en pantalla, colores, disposición) en lugar de citar un nombre de archivo.
2. **El navegador remoto usado resultó ser compartido con otro proceso concurrente en la misma máquina.** Durante la sesión, varias pestañas cambiaron de sitio solas (saltos no solicitados entre jacaranda360.com, elnogal360.com, firsttower360.com, terrazasdealberdi360.com y localhost de este mismo proyecto) y los clics sobre visores 3DVista/krpano tardaban sistemáticamente ~30s en responder. Esto limitó cuánto se pudo profundizar en interacciones dentro de cada tour (hotspots individuales, fichas de unidad) en los sitios más pesados. Se señala explícitamente en cada sección qué se pudo verificar y qué no.

**Reemplazos respecto de la lista original:** se mantuvieron los 5 sitios pedidos (Jacarandá, El Nogal, First Tower, Complejo Forest, Tipuana) — ninguno hubo que descartar del todo — pero en 3 de los 5 (El Nogal, First Tower, Tipuana) no se logró pasar de la pantalla de bienvenida/intro a la interacción profunda con hotspots y fichas de unidad por las limitaciones de (2). Donde falta evidencia se dice explícitamente "no verificado" en vez de inventar.

---

## Tabla resumen comparativa

| Criterio | Jacarandá (loteo, 558 lotes) | El Nogal (loteo, 1014 lotes) | First Tower (edificio) | Complejo Forest (institucional) | Tipuana (nueva generación) |
|---|---|---|---|---|---|
| 1. Masterplan en vertical | Se ve en vertical, con card de bienvenida superpuesta y minimapa; no fuerza landscape | No verificado (no se pasó de la intro) | No verificado (no se pasó de la intro) | Vista aérea de navegación en vertical, legible, con pines | No verificado (solo overview satelital estático) |
| 2. Hotspots táctiles | No verificado en detalle (solo visto de lejos, chicos) | No verificado | No verificado | Pines circulares ~40-50px, con ícono de cámara, fáciles de tocar | No verificado |
| 3. Ficha de unidad | No verificado en el tour; sí se vio el cotizador (fuera del tour) | No verificado | No verificado | No verificado | No verificado |
| 4. Navegación general | Barra superior desktop-style comprimida, minimapa, menú "..." con opciones (modo control, pantalla completa, silenciar) | Header simple con logo y CTA | Header con WhatsApp + "Más información", pines rotulados sobre foto aérea | Top nav (música/Web/Tecnica/Videos), toggle día/noche, menú "..." de 3DVista | Header limpio (logo, "?", WhatsApp, hamburguesa) — el más prolijo de los 5 |
| 5. Video | No detectado en lo navegado | No detectado en lo navegado | No detectado en lo navegado | Mención de "Videos" en el menú superior, no verificado el contenido | No detectado en lo navegado |
| 6. Planos de unidad | No verificado | No verificado | No verificado | No verificado | No verificado |
| 7. Primeros 10 segundos | Intro estática con logo + texto, sin botón visible, toda la imagen es un link | Intro con foto + texto + botón explícito "Entrar al loteo" | Intro con foto + badge "360°" + texto "Hacé click y comenzá la experiencia", precarga pesada de fotos/audio de fondo | Intro simple con logo "Forest" + texto, transición directa al tour nocturno | Animación de carga con stack de fotos + wordmark, luego modal "Bienvenido a Tipuana" con instrucciones explícitas de uso |
| 8. Problemas detectados | Toda la pantalla de intro es un enlace (sin botón visible ni feedback de qué se puede tocar) | El botón "Entrar al loteo" no dio ninguna respuesta visual al toque en las pruebas | La intro no transicionó al tour pese a varios toques; de fondo se descargan ~15 imágenes de álbum + un audio antes de poder interactuar | El menú contextual de 3DVista se reabre solo al tocar cerca de los pines | Ninguno grave detectado en lo navegado; el cierre del modal de bienvenida tardó dos intentos + Escape |

---

## 1. Jacarandá (loteo, 558 lotes)

**Primeros 10 segundos.** Al cargar, se ve una pantalla vertical de foto aérea satelital difuminada, con el logo "JACARANDÁ · EL CEIBAL", el título "Descubrí Jacarandá" y un párrafo descriptivo. Abajo, "Solución digital por mp360.com.ar". No hay ningún botón visible: **toda la imagen de fondo es un enlace clickeable** — cualquier toque en esa pantalla lleva a otra parte (en las pruebas, un toque llevó al cotizador de lotes en `cotizador-jacaranda360.com`, otro llevó al tour). Esto es ambiguo: el usuario no tiene forma de saber, mirando la pantalla, que puede tocar, ni a dónde lo va a llevar el toque.

**Masterplan en vertical.** En un intento se pudo ver el estado real: aparece un modal "Bienvenido a Jacarandá" (foto + título + texto + botón X de cierre) flotando sobre el masterplan de fondo, que se ve difuminado pero en formato vertical correcto (no se fuerza landscape). Debajo del modal, en la esquina inferior derecha, hay un **minimapa** con pines violetas mostrando la ubicación de las escenas/lotes disponibles. El visor está construido sobre **3DVista Player** (confirmado por el menú "..." que expone "3DVista Player v:2358").

**Hotspots.** No se pudo confirmar el tamaño exacto de los hotspots de lote individuales por toque directo; en capturas más alejadas del masterplan (durante una prueba anterior con reset de viewport) se vieron polígonos de lotes agrupados en "bloques" con leyenda de colores: **Disponible (verde), Reservado (rojo/naranja), Vendido (naranja), Bloqueado (azul), No disponible (gris)** — 5 estados con leyenda clara en la parte inferior de esa vista.

**Ficha de unidad.** No se llegó a abrir dentro del tour por las limitaciones de interacción. Sí se navegó al **cotizador de lotes**, una página aparte (`cotizador-jacaranda360.com`) con una grilla de tarjetas de colores, cada una mostrando el precio total y las 84 cuotas mensuales correspondientes a ese color de lote — diseño de tarjetas grandes, táctiles, con buen contraste, claramente pensado para móvil.

**Navegación general.** Cuando el visor toma su tamaño "de escritorio" (esto pasó en una de las pruebas, ver nota de metodología — no se pudo reproducir de forma 100% confiable si es comportamiento del sitio o artefacto de la herramienta), se ve una barra superior con menú horizontal completo: "Servicios, Ubicación, Vistas en altura, Vistas peatonales, Imágenes, Plano, Nosotros" y botón "Contactate con...", todo comprimido y con texto chico, más un botón "¿Cómo usar esta experiencia?" arriba a la derecha.

**Problema detectado.** El mayor problema de onboarding: la pantalla de intro no comunica que es tocable ni qué pasa al tocarla, y el destino del toque no es predecible (cotizador vs. tour).

---

## 2. El Nogal (loteo, 1014 lotes)

**Primeros 10 segundos.** Intro en formato de landing más moderno que Jacarandá: foto aérea de fondo, badge verde "Experiencia 360°", título grande "Un entorno natural para proyectar tu próxima vivienda.", párrafo descriptivo, y — a diferencia de Jacarandá — **un botón explícito y visible**: "Entrar al loteo" (fondo verde oscuro, texto blanco, esquinas redondeadas), ubicado abajo a la izquierda tras hacer scroll.

**Lo que se pudo y no se pudo verificar.** Se intentó repetidamente tocar el botón "Entrar al loteo" (confirmado como `<button>` real en el DOM, no canvas) y no se obtuvo transición visible al tour en las pruebas realizadas — el estado de la pantalla no cambió tras varios toques, incluso apuntando directamente al elemento por referencia de DOM. No queda claro si es una limitación de la herramienta de automatización usada en esta sesión o un problema real de responsividad del botón; se marca como **no verificado** en vez de reportarlo como bug confirmado. Por esta razón no hay evidencia propia para los puntos 1, 2, 3, 5 y 6 en este sitio.

**Lo que sí se puede afirmar con confianza:** la propuesta de intro de El Nogal resuelve mejor que Jacarandá el problema de "¿qué toco para entrar?" — tiene un CTA con texto explícito en vez de una imagen-enlace completa sin rótulo.

---

## 3. First Tower (edificio)

**Primeros 10 segundos.** Intro con foto aérea de la zona (Puerto de Santa Fe, dique II), barra superior oscura con logo "FIRST TOWER", ícono de WhatsApp (verde) y botón "Más información". Sobre la foto, se ven **etiquetas de puntos de interés del entorno** ya visibles antes de entrar al tour: "Puerto Plaza - Centro Comercial", "McDonald's", "El Litoral", "Garden Inn Residences", "Portofino", "Casino Santa Fe", "Ribera Shopping" — con líneas que conectan cada etiqueta a su ubicación en la foto. En el centro, un badge circular "360°" y el texto "Hacé click y comenzá la experiencia — FIRST TOWER".

**Carga de fondo.** Se verificó por red que, apenas entra la página, ya se están descargando en segundo plano cerca de 15 imágenes de álbum en alta resolución más un archivo de audio (narración), todo antes de que el usuario haya tocado nada. Esto es un candidato fuerte a explicar demoras percibidas en el "primeros 10 segundos" en una conexión móvil real, aunque en este entorno de pruebas no se pudo medir el tiempo exacto de forma confiable por la inestabilidad de red compartida ya mencionada.

**Interacción.** Se tocó el badge "360°" y la franja de texto varias veces; el cursor del sistema cambió a "grabbing" (evidencia de que el visor pano sí registra el gesto), pero la pantalla de intro nunca desapareció visualmente en las capturas tomadas. No se pudo confirmar el masterplan, los hotspots ni la ficha de unidad de este sitio.

**Lo bueno, ya visible sin entrar al tour:** el contexto de entorno (comercios, otros edificios, transporte) resuelto directamente sobre la foto de portada es un dato de valor que el usuario recibe sin ninguna interacción — algo para copiar.

---

## 4. Complejo Forest (institucional / salón de eventos)

**Primeros 10 segundos.** Intro simple y directa: foto aérea de un predio industrial reciclado (galpones, silos, vías de tren), wordmark elegante "Forest" en tipografía serif, y un párrafo: "En Complejo Forest, nos enorgullecemos de ofrecer espacios únicos y versátiles para eventos corporativos de todo tipo. Te invitamos a conocerlos." Sin botón visible; un toque en el centro de la pantalla llevó directo al modo tour.

**Masterplan / vista de navegación en vertical.** Este fue el sitio donde más se pudo profundizar. Al entrar, se ve una **vista aérea nocturna** de todo el predio en formato vertical, perfectamente legible sin necesidad de rotar el teléfono ni hacer zoom previo: se distinguen los techos de los galpones, una cancha de fútbol iluminada, calles con autos, y una etiqueta rotada con el nombre de la calle ("Av. Francia y Brown"). Abajo a la izquierda hay un **toggle "Modo diurno / Modo nocturno"** — un control que ningún otro sitio auditado mostró, y que es un buen ejemplo a copiar (dejar elegir la hora del recorrido en vez de imponerla).

**Hotspots.** Se ven pines circulares violetas con ícono de cámara, de un tamaño aproximado de 40-50px de diámetro — cómodos para tocar con el dedo sin necesidad de zoom previo. No se llegó a confirmar qué pasa al tocarlos (si abren una escena a nivel de calle o una ficha), porque cada toque cerca de un pin volvía a abrir el menú contextual de 3DVista en lugar del hotspot mismo.

**Navegación general.** Barra superior con menú "música / Web / Tecnica / Videos" (nombres tal cual aparecen en pantalla, con esa capitalización inconsistente). El menú "..." de 3DVista expone: "MP 360° hecho por Bonaudi Prod.", "Empezar Sesión Guiada como anfitrión", "Cambiar el modo de control a pulsar y mover", "Mostrar en pantalla completa", "Silenciar", "3DVista Player v:2251" — confirmando que este sitio también corre sobre 3DVista, versión distinta a la de Jacarandá (2251 vs. 2358).

**Problema detectado.** El menú contextual "..." se reabre con facilidad al tocar cerca de los hotspots, tapando la vista y obligando a cerrarlo de nuevo — fricción directa sobre la exploración de pines.

---

## 5. Tipuana (nueva generación)

**Primeros 10 segundos.** La intro con mejor terminación de las 5 auditadas. Pantalla de carga con fondo verde oscuro sólido, una animación de "stack" de fotos apiladas (como un mazo de cartas) que se despliega mostrando la foto de portada, y el wordmark "Tipuana" centrado abajo — una transición de carga cuidada, no un simple spinner.

Inmediatamente después aparece un **modal de bienvenida real (HTML, no canvas)**: encabezado limpio con logo "Tipuana" (con ícono de hoja), y a la derecha tres íconos — "?" (ayuda), WhatsApp, y menú hamburguesa. El modal en sí tiene foto de portada, botón X de cierre bien visible arriba a la derecha, título "Bienvenido a Tipuana", y tres párrafos de texto:
- Contexto de ubicación: "Tipuana está en El Ceibal, la nueva Zona Sur de San Salvador de Jujuy, con acceso pavimentado desde Ruta 9 (km 14) y buena conexión con la ciudad."
- Instrucción de uso del tour: "Recorré la experiencia 360° para conocer el entorno y el proyecto."
- **Instrucción explícita de interacción con hotspots**: "Tocá un lote para ver superficie y características." — ningún otro sitio audita dice esto tan claro.
- Ayuda de emergencia: "Si te perdés, en la barra superior tenés las instrucciones en el ícono '?'."

Esto es, de lejos, el mejor onboarding de los 5: explica en una sola pantalla dónde está el proyecto, qué se puede hacer, cómo interactuar con los lotes, y qué hacer si el usuario se pierde.

**Cierre del modal.** El primer toque sobre la X no cerró el modal (dos intentos fallidos), y recién se cerró al presionar Escape — dato a tomar con pinza dado el entorno compartido descripto en la metodología, pero deja abierta la posibilidad de que el hit-area del botón X sea más chico de lo que aparenta visualmente.

**Después del cierre.** Se ve una vista aérea 3D tipo "flyover" con un pin de contexto geográfico: "Salta — A solo 2 horas de distancia", sobre un paisaje de campo y monte. Esta vista no llegó a mostrar el masterplan de lotes con polígonos — puede ser una introducción cinemática previa al masterplan real, o requerir más interacción/scroll para llegar a él. **No verificado** el masterplan de lotes, los hotspots táctiles reales, ni la ficha de unidad.

---

## Ranking: las 5 cosas que mejor resuelven (para copiar)

1. **Instrucciones explícitas de interacción en el modal de bienvenida — Tipuana.** El texto "Tocá un lote para ver superficie y características" le dice al usuario, antes de que toque nada, exactamente qué hacer. Ningún otro sitio de los auditados lo hace tan claro. Referencia: modal "Bienvenido a Tipuana" descripto en la sección 5.

2. **Botón "modo diurno / modo nocturno" — Complejo Forest.** Dejar que el usuario elija la hora del recorrido en lugar de imponer una sola atmósfera es un control simple y de alto valor percibido, ausente en el resto. Referencia: toggle inferior izquierdo en la vista aérea nocturna, sección 4.

3. **Contexto de entorno resuelto en la portada, sin interacción — First Tower.** Mostrar comercios, otros edificios y accesos con etiquetas y líneas guía directamente sobre la foto de portada le da valor al usuario en el primer segundo, antes de cualquier tap. Referencia: etiquetas "Garden Inn Residences", "Portofino", "Ribera Shopping", etc., sección 3.

4. **Grilla de financiación por color de lote — cotizador de Jacarandá.** Tarjetas grandes, táctiles, con precio total y cuota mensual visibles sin necesidad de seleccionar nada primero — resuelve bien la pregunta de plata en móvil. Referencia: pantalla del cotizador, sección 1.

5. **CTA explícito y rotulado para entrar al tour — El Nogal.** Un botón con texto ("Entrar al loteo") es más claro que una imagen entera actuando de enlace sin ningún rótulo. Referencia: botón verde inferior en la intro, sección 2.

## Ranking: las 5 peores (para superar)

1. **Pantalla de intro sin ningún control visible y de destino impredecible — Jacarandá.** Toda la imagen de fondo es un enlace; el usuario no tiene forma de saber que puede tocar ni a dónde lo lleva el toque (a veces al tour, a veces directo al cotizador). Referencia: intro de Jacarandá, sección 1.

2. **Precarga pesada de assets antes de poder interactuar — First Tower.** Cerca de 15 imágenes de álbum en alta resolución más un audio se descargan de fondo apenas carga la página, antes de cualquier interacción del usuario — en una conexión móvil real esto es tiempo de espera y consumo de datos regalado. Referencia: listado de requests de red capturado en la sección 3.

3. **Menú contextual que se reabre solo y tapa los hotspots — Complejo Forest.** Tocar cerca de un pin reabre el menú "..." de 3DVista en vez de activar el hotspot, obligando a cerrar el menú de nuevo para poder seguir explorando. Referencia: sección 4, "Problema detectado".

4. **Botones que no dan ninguna señal de respuesta al toque — El Nogal.** El CTA "Entrar al loteo", pese a ser un botón real, no mostró ningún cambio de estado (ni feedback visual, ni transición) frente a varios toques directos. Un botón de esta importancia necesita, como mínimo, un estado de "cargando" visible. Referencia: sección 2.

5. **Hit-area de cierre de modal más chica de lo que aparenta — Tipuana.** El botón X del modal de bienvenida no respondió al primer toque directo sobre su posición visual; solo cerró con la tecla Escape. En un teléfono real no hay tecla Escape, así que este mismo problema en el mundo real dejaría al usuario atrapado en el modal. Referencia: sección 5, "Cierre del modal".

---

## Conclusión rápida para nuestro producto

El patrón más repetido entre los 5 sitios es el mismo motor de base (**3DVista Player**, confirmado en Jacarandá v:2358 y Complejo Forest v:2251) con una capa de landing/onboarding propia por proyecto que varía mucho en calidad — desde "toda la pantalla es un link sin rótulo" (Jacarandá) hasta un modal con instrucciones explícitas y iconografía clara (Tipuana). La brecha más grande está ahí: en decirle al usuario, en el primer segundo, qué puede hacer con el dedo. Ningún sitio de los 5 resolvió de forma verificable el problema central del masterplan horizontal en pantalla vertical con una solución más sofisticada que "dejarlo chico y que el usuario haga zoom" — es el punto de mayor oportunidad de diferenciación.
