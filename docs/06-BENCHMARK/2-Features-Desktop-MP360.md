# Benchmark MP360 — Desktop / Features (30-08-2026)

Foco de este informe: experiencia de **escritorio** y **funcionalidades** de los recorridos 360 hechos por MP360 (mp360.com.ar), competidor de referencia directo de nuestro producto. El análisis de UX móvil / responsive lo cubre otro informe en paralelo (`docs/06-BENCHMARK/capturas-movil/`).

Metodología: navegación real con herramientas de browser automatizado (viewport grande, intento de 1440x900), lectura del árbol de accesibilidad/DOM de cada sitio, inspección de `network requests` para contar escenas y tipo de recursos, y capturas de pantalla. **Nota de honestidad metodológica importante**: durante esta sesión el entorno de navegador estuvo compartido con otro proceso/agente (probablemente el que hace la auditoría móvil en paralelo), que en varios momentos navegó las mismas pestañas hacia otras URLs sin que yo lo pidiera, y hubo timeouts recurrentes de 30s en clicks sobre paneles WebGL pesados. Esto limitó la profundidad de interacción en algunos sitios (no pude completar todos los flujos multi-paso ni capturar todas las fichas de unidad). Donde no pude confirmar algo con datos reales, lo digo explícitamente en vez de estimarlo. Las capturas de pantalla se vieron en pantalla durante la sesión pero **no se guardaron como archivos PNG en disco** (las herramientas de navegador usadas no lo permiten) — cada sección indica qué imagen correspondería con un nombre sugerido, para si se quiere rehacer la captura manualmente.

Todos los sitios auditados comparten un dato técnico clave: están construidos sobre **3DVista Virtual Tour Pro** (se confirma literalmente en el menú contextual de cada tour: "3DVista Player v:2358", "v:2251", opciones "Cambiar el modo de control a pulsar y mover", "Mostrar en pantalla completa", "Silenciar"). El motor de panoramas (tiles jpg en cubemap, `panorama_<ID>/{u,d,l,r,f,b}/<nivel>/<x>_<y>.jpg`) es el mismo en todos los proyectos; lo que cambia entre proyectos es la capa de interfaz que MP360 construye encima.

---

## 1. Jacarandá 360° (jacaranda360.com) — loteo, 558 lotes

**Captura sugerida:** `01-jacaranda-intro.png`, `02-jacaranda-vista-aerea-menu.png`, `03-jacaranda-cotizador-panel.png`

### Estructura del recorrido
- Pantalla de entrada: fondo aéreo del loteo desenfocado con overlay oscuro, logo "JACARANDÁ · El Ceibal", título "Descubrí Jacarandá" y texto: *"En esta experiencia interactiva podés conocer los lotes disponibles, ver opciones de financiación y recorrer el entorno del barrio, junto con sus principales características."* Al pie, crédito "Solución digital por **mp360.com.ar**" (presente en todos los sitios auditados, siempre en el mismo lugar).
- Al hacer click se abre un modal "Bienvenido a Jacarandá" con foto de portada y texto: *"En esta experiencia interactiva podés recorrer el barrio, conocer los lotes disponibles, ver planes de financiación y acceder a toda la información del proyecto en un solo lugar. Explorá el plano, mirá distintas vistas 360° y, cuando quieras, contactate con un asesor para avanzar."*
- Barra superior fija con menú: **Servicios, Ubicación, Vistas en altura, Vistas peatonales (dropdown), Imágenes, Plano, Nosotros, Contáctate con...**, botón "Cotizá tu lote" (pill, arriba a la izquierda) y botón naranja de contacto arriba a la derecha. Hay además un botón "¿CÓMO USAR ESTA EXPERIENCIA?" fijo arriba a la derecha (ayuda/onboarding contextual).
- La escena inicial es una vista aérea 360° del loteo completo con etiquetas superpuestas tipo banderín: "Ingresos desde RN9", "Paseo Comercial Proyectado", "Ver vista 360° desde este punto" (con ícono "360°"), y un mini-mapa navegable abajo a la derecha con puntos clicables.
- Se detectaron al menos **7 panoramas distintos precargados** en la sesión (IDs únicos: D36EED82, D088B476, D0EDD59C, 69AE5ED6, D080896E, 225C1DBE, D0A49CB4), correspondientes a vistas en altura + vistas peatonales; no pude confirmar el número total exacto de escenas del tour completo por las limitaciones de interacción ya mencionadas.
- Leyenda fija abajo a la izquierda sobre la escena: **"Lotes disponibles (varios colores)"** y **"Lotes reservados"** — el color de cada lote en el plano/panorama codifica directamente su tramo de precio (ver Cotizador).

### Hotspots
- Hotspots de navegación en forma de banderín/etiqueta rectangular semi-transparente con texto (ej. "Ver vista 360° desde este punto") acompañados de un ícono circular "360°" — se ven a distancia sobre la escena, apuntando en perspectiva hacia el punto real del terreno (no son íconos flotantes genéricos, están orientados con la geometría de la imagen).
- Hotspots informativos de tipo etiqueta con ícono (ej. un peatón para "Paseo Comercial Proyectado").
- Los lotes individuales dentro del plano aparecen como polígonos coloreados con un número superpuesto (visto en zoom de la vista aérea: numeración de lote dentro de cada manzana, colores que van de amarillo pálido a bordó/gris según precio).
- No pude confirmar con certeza el comportamiento de click sobre un lote individual (ficha de unidad) por los timeouts del entorno — es un punto pendiente de verificar en una próxima sesión.

### Ficha de unidad / lote
No se pudo abrir una ficha de lote individual dentro del tour por las limitaciones ya mencionadas. Sí se documentó en detalle el **panel de cotización** (ver abajo), que cumple una función equivalente: al elegir un color/tramo de precio se muestra el desglose financiero completo.

### Video
No se detectó video 360 ni video tradicional en la sesión inicial; la intro es una imagen aérea estática desenfocada, sin reproducción de video.

### Planos y plantas
- El plano general está integrado directamente sobre la imagen aérea 360 (no es una pantalla aparte): los lotes se ven como polígonos de techo/parcela con numeración, coloreados según su tramo de precio.
- Mini-mapa de navegación fijo abajo a la derecha (independiente del "Plano" del menú superior) con puntos clicables violeta sobre fondo gris esquemático del loteo.
- Existe una opción de menú dedicada "Plano" que no pude verificar en detalle (ver limitaciones).

### Cotizador / simulador
Jacarandá tiene el cotizador embebido **dentro del propio tour** (panel lateral izquierdo, se abre con el botón "Cotizá tu lote" de la barra superior) y **además** un sitio standalone en **cotizador-jacaranda360.com**. Documenté el flujo completo en el sitio standalone:

1. **Pantalla única** (no hay wizard de varios pasos): título "Cotiza tu lote en Jacarandá", subtítulo "Seleccioná un lote para ver las opciones de pago".
2. Grilla de **8 tarjetas de color** = 8 tramos de precio de lote, cada una con precio de lista y cuota:
   - Amarillo: $24.750.000 — 84 cuotas de $177.000
   - Verde: $27.200.000 — 84 cuotas de $221.000
   - Rosa: $29.900.000 — 84 cuotas de $214.000
   - Celeste: $32.890.000 — 84 cuotas de $235.000
   - Violeta: $36.200.000 — 84 cuotas de $259.000
   - Mostaza: $39.800.000 — 84 cuotas de $285.000
   - Bordó: $43.800.000 — 84 cuotas de $313.000
   - Gris: $48.200.000 — 84 cuotas de $345.000
3. Por defecto viene seleccionado el tramo "Amarillo" y debajo se despliega el detalle: **"LOTE AMARILLO" → Cuota mensual $177.000 (84 cuotas sin interés) → Precio lista $24.750.000 → Anticipo 40% = $9.900.000 → Contado 15% dto. = $21.038.000**.
4. Botón **"Continuar con esta cotización"**: es un `<a>` que abre WhatsApp (`wa.me/5493884624099`) con un mensaje pre-armado: *"Hola, estaba cotizando un lote en Jacarandá 360° y quería continuar con esta cotización. Te comparto el detalle: Precio: $24.750.000 / Anticipo (40%): $9.900.000 / 84 cuotas de: $177.000 / Precio contado (15% dto.): $21.038.000 / Color: Amarillo"**. Es decir: el cotizador no termina en un formulario propio ni en un PDF — termina siempre en WhatsApp, con el detalle numérico ya cargado en el mensaje para que el vendedor no tenga que volver a preguntar nada.
5. Disclaimer legal fijo: *"Esta cotización es solo informativa y no genera ningún compromiso de pago ni reserva. Los valores mostrados pueden variar."*
6. **Comportamiento notado (posible bug/atajo de producto)**: al hacer click en una tarjeta de color *distinta* a la ya seleccionada, en vez de actualizar el panel de detalle in-place, el sitio redirige por completo a jacaranda360.com (el tour principal). No pude confirmar si es una feature intencional (cross-link al tour) o un bug de navegación.

### Conversión
- Botón de contacto naranja fijo arriba a la derecha en el tour principal (visible en toda la sesión de navegación).
- Botón "Cotizá tu lote" siempre visible en la barra superior.
- El cotizador termina 100% en WhatsApp con mensaje prellenado (ver arriba) — es el cierre de funnel más fuerte que vimos en todo el benchmark: cero fricción entre "vi el precio" y "hablo con un vendedor con el precio ya en el chat".

### Producción
- Fotografía aérea nítida, sin costuras visibles evidentes en las vistas revisadas.
- Marca del desarrollador ("Jacarandá · El Ceibal") integrada como logo propio en la intro y en la barra superior.
- Crédito "Solución digital por mp360.com.ar" visible permanentemente.
- No se detectó música/audio ambiente en esta sesión (a diferencia de First Tower, ver más abajo).

### Rendimiento
- En la carga inicial del tour se registraron **492 requests** (tope de lectura de la herramienta; el número real puede ser mayor). Desglose por tipo: **302 archivos .jpg** (tiles de panorama), **174 .png** (íconos/UI/mapas), 6 .js, 3 .css, 3 .woff2 (fuentes), 1 .cur (cursor de "grabbing" del visor 3D). Es decir, la carga está dominada casi en su totalidad por imágenes (tiles panorámicos en múltiples resoluciones/caras de cubo), con un app-shell de código muy liviano (solo 6 JS y 3 CSS). No pude medir el peso total en KB/MB porque la herramienta de red disponible no expone tamaños de respuesta, solo URLs y status.
- No pude medir con precisión el tiempo hasta interactividad por los timeouts del entorno, pero la primera escena navegable apareció en pocos segundos en las cargas que sí completaron.

---

## 2. El Nogal · Los Alisos 360° (elnogal360.com) — loteo, 1014 lotes, "arquitectura nueva"

**Captura sugerida:** `04-nogal-intro.png`, `05-nogal-plano-filtros.png`

Este es el sitio técnicamente más interesante de todo el benchmark: a diferencia de Jacarandá (que usa la interfaz nativa de 3DVista con overlays propios encima), El Nogal envuelve el mismo motor de panoramas (`elnogal360.com/360/media/panorama_...`) en una **capa de UI completamente custom, construida en el DOM** (no en canvas), con componentes reales tipo React/Vue: diálogos, roles ARIA, botones nombrados, radiogroups. Esto la hace mucho más auditable/accesible que las demás, y confirma lo que se comenta en el brief: es una arquitectura nueva.

### Estructura del recorrido
- Intro: imagen aérea del loteo, badge verde "Experiencia 360°", título *"Un entorno natural para proyectar tu próxima vivienda."*, texto *"Recorré El Nogal con una experiencia inmersiva 360°. Conocé sus vistas, lotes y detalles principales antes de visitarlo."*, botón **"Entrar al loteo"**.
- Un banner rotativo (carrusel) arriba muestra distintos mensajes de valor: se vieron al menos dos variantes — *"A 10 minutos de San Salvador de Jujuy"* (con botón "Ver ubicación") y *"Todos los servicios esenciales"* (con botón "Ver servicios") — rotando automáticamente antes incluso de entrar al tour.
- **10 escenas nombradas** confirmadas en el árbol de navegación: **Acceso, Vista noroeste, Vista de lotes, Vista noreste, Vista este, Vista peatonal 1, Vista peatonal 2, Vista peatonal 3, Vista peatonal 4, Vista peatonal 5**. Navegación entre panoramas con flecha "Panorama anterior" / "Panorama siguiente" además de acceso directo por nombre.
- **Plano interactivo** dedicado (`img "Plano del loteo El Nogal · Los Alisos"`) con puntos clicables por nombre de escena ("Ir a Acceso", "Ir a Vista noroeste", etc.) y un botón "Ver el plano completo". Texto de ayuda: *"Tocá un punto para ir a esa vista"*.
- Menú superior: **Proyectá tu cuota, Servicios, Ubicación, Vistas, Imágenes, Dudas frecuentes, Agostini** (marca del desarrollador), + botón "Cotizá tu lote" y menú hamburguesa para mobile-style con los mismos ítems duplicados.
- **Widget de "Avances de obra"**: muestra *"80% de obras iniciales"* con detalle *"Cordón cuneta y red de agua interna terminadas"* y una checklist (Cordón cuneta / Red de agua interna). Es una feature que no vimos en ningún otro sitio del benchmark: comunicar el estado de avance de la obra física directamente dentro del tour.
- Datos de contacto fijos: teléfono `+54 9 3884 62-4099` (tel:) y email `consultas@agostinidi.com.ar` (mailto:).

### Hotspots / disponibilidad de lotes
- Panel "Disponibilidad": contador de lotes **disponibles** vs. **vendidos** (se registró el número "973" en uno de los contadores, no pude confirmar a cuál corresponde con certeza por el corte de la lectura).
- Texto explícito: *"Los colores de los lotes disponibles indican su plan comercial."* — a diferencia de Jacarandá (que codifica **precio exacto** por color), acá el color codifica el **plan de financiación**, no el precio en sí.
- **3 planes comerciales**, cada uno filtrable con su propio botón ("Filtrar por Plan 1/2/3"):
  - Plan 1: 132 cuotas de $199.000
  - Plan 2: 132 cuotas de $218.000
  - Plan 3: 131 cuotas de $241.000
  - Aclaración: *"Valores de referencia. La cotización final la confirma un asesor."*
- **Diálogo "Filtrar lotes"** dedicado y completo: switch "Solo disponibles" (*"Oculta los lotes vendidos"*), radiogroup con los 3 planes de arriba, botones "Limpiar filtros" y "Listo". Es un sistema de filtrado real (no solo visual), algo que no encontramos tan explícito en los otros sitios.

### Ficha de unidad / lote
No pude completar la entrada al tour (la app quedó bloqueada detrás del botón "Entrar al loteo" por los timeouts repetidos del entorno de navegación en esta sesión), así que no pude documentar el contenido exacto de la ficha de un lote individual. Es un pendiente a repetir en otra sesión.

### Cotizador / simulador de cuotas
Confirmado que existe un ítem de menú dedicado **"Proyectá tu cuota"** (presente tanto en el menú principal como en el menú hamburguesa), que por el nombre y la aclaración de "Valores de referencia. La cotización final la confirma un asesor." sugiere un simulador interactivo con inputs (posiblemente plazo/anticipo) más rico que el cotizador de tarjetas fijas de Jacarandá — pero no pude abrir el panel y confirmar sus campos exactos por las limitaciones ya mencionadas. Es el pendiente más importante de este informe.

### Video
No se pudo confirmar la presencia de video (no llegué a entrar al tour).

### Producción
- Misma arquitectura de tiles de 3DVista por debajo (`/360/media/panorama_...`), pero con una capa de producto propia mucho más pulida a nivel de accesibilidad/semántica que la de Jacarandá.
- Marca del desarrollador ("Agostini") integrada como ítem de menú propio.

### Rendimiento
- Se observó carga de tiles panorámicos (`.jpg`) más recursos `res_*.png` (iconografía) y un hotspot PNG por escena (`_HS_...png`), consistente con el mismo motor 3DVista que Jacarandá. No pude obtener conteo total de requests para esta sesión por el corte anticipado de la interacción.

---

## 3. First Tower 360° (firsttower360.com) — edificio, Puerto de Santa Fe (Dique II)

**Captura sugerida:** `06-firsttower-video-intro.png`, `07-firsttower-vista-aerea-contexto.png`

### Estructura del recorrido
- **Intro en video** (confirmado por el texto de accesibilidad *"Your browser does not support the video tab"*, propio de un `<video>` HTML5): una toma aérea/dron del edificio al atardecer, con el texto *"Bienvenido a la experiencia FIRST TOWER"* superpuesto y el respaldo institucional *"Respaldo → CAM · Construimos confianza"* (constructora).
- Banner de cookies con **ACEPTAR / RECHAZAR** explícitos (a diferencia de Jacarandá/El Nogal, donde no vimos banner de cookies).
- Tras la intro, la primera escena es una **vista aérea de contexto urbano** con etiquetas señalando puntos de interés cercanos: *"Puerto Plaza · Centro Comercial", "McDonald's", "El Litoral", "Garden Inn Residences", "Portofino", "Casino Santa Fe", "Ribera Shopping"* — un uso interesante del entorno 360 para vender la **ubicación** del edificio, no solo el edificio en sí (incluye incluso edificios competidores como referencia de zona, ej. "Garden Inn Residences" y "Portofino").
- Antes de poder rotar la cámara aparece un overlay explícito: ícono circular **"360°"** + texto *"Hace click y comenzá la experiencia FIRST TOWER"* — un gate deliberado que obliga a un click consciente antes de habilitar el drag/rotate (a diferencia de Jacarandá, que entra directo al modo interactivo).
- Barra superior fija: logo FIRST TOWER, botón de **WhatsApp** (ícono verde, integrado en el header en vez de flotante), botón **"Mas información"**.

### Audio
Se detectó un archivo de audio narrado en español (`audio_..._es.mp3`) cargado junto con la escena — confirma **narración/audio ambiente en español** integrado al tour, algo que no se vio en Jacarandá ni pudimos confirmar en El Nogal.

### Producción
- Fotografía de intro en video de alta calidad (dron, atardecer).
- Múltiples "álbumes" de fotos por escena detectados en las requests (`album_<ID>_0.jpg` hasta `_5.jpg`), sugiriendo galerías de fotos reales (no solo panorámicas) integradas a distintos puntos del tour — probablemente renders de amenities o unidades.
- Mismo motor 3DVista por debajo (mismo cursor `grabbing.cur`, misma estructura de `media/`).

### Limitaciones de esta sesión
No pude atravesar el gate de "Hace click y comenzá la experiencia" por timeouts repetidos del entorno (la escena tarda en volverse interactiva y los clicks se perdieron varias veces), así que no llegué a documentar hotspots internos, ficha de unidad, plano de plantas ni conversión más allá del header. Vale la pena repetir esta sesión con más margen de tiempo.

### Rendimiento
No se pudo medir con precisión por el corte de sesión; se confirmó de todos modos que la carga incluye video de intro + tiles panorámicos + álbumes de fotos + audio, es decir, de los sitios auditados, First Tower es candidato a ser el más pesado en la carga inicial (video + audio + fotos + panoramas, todo junto).

---

## 4. Terrazas de Alberdi 360° (terrazasdealberdi360.com) — edificio, desarrollo de Pilay

**Captura sugerida:** `08-alberdi-intro-obra.png`

### Estructura del recorrido
- Intro también en video (mismo patrón: *"Your browser does not support the video tab"*), con drone real del **terreno en obra** (pozos de fundación, maquinaria, obradores) — es decir, a diferencia de Jacarandá/El Nogal que muestran el loteo terminado o casi, acá el 360 se vende sobre una obra en etapa temprana de excavación/fundaciones.
- Branding elegante tipo serif dorado: "TERRAZAS DE ALBERDI" con un ícono de estrella, atribución *"Un desarrollo urbanístico de PILAY"* (constructora/marca), y el mismo crédito *"Solución digital por mp360.com.ar"* al pie.
- Banner de cookies ACEPTAR/RECHAZAR igual que First Tower.
- Se ven dos puntos de color (oliva y crema) cerca del centro de la pantalla de intro, probablemente selectores de idioma o de "modo día/noche" — no pude confirmar su función exacta.

### Producción
- Mismo motor de 3DVista (estructura `media/panorama_...`, `media/album_...`).
- Se detectaron **múltiples archivos "_HS_" (hotspot) por panorama** — al menos 8 íconos de hotspot distintos para una sola escena inicial —, lo que sugiere una escena de intro particularmente rica en puntos interactivos (probablemente marcando amenities futuros, unidades disponibles, etc. sobre el render/dron del terreno en obra).

### Limitaciones de esta sesión
Por la inestabilidad del entorno compartido (la pestaña de navegador fue redirigida por un proceso externo a otro sitio del benchmark, Complejo Forest, en medio de la interacción), no pude entrar al tour interactivo de Terrazas de Alberdi ni documentar hotspots, ficha de unidad, plano de plantas o cotizador. Es el sitio con menor profundidad de auditoría de todo el informe — recomiendo repetirlo en una sesión dedicada.

---

## 5. Complejo Forest 360° (complejoforest360.com) — institucional / eventos corporativos (hallazgo oportunista)

**Captura sugerida:** `09-forest-tours-guiados-vivo.png`

No estaba priorizado en el plan de auditoría, pero un aterrizaje accidental en este sitio (por la inestabilidad de pestañas ya mencionada) permitió un hallazgo importante que aplica potencialmente a **toda la plataforma MP360**, porque es una feature nativa de 3DVista Virtual Tour Pro:

### Tours Guiados en Vivo (Live Guided Tour)
El menú contextual del visor incluye la opción **"Empezar Sesión Guiada como anfitrión"**, y el DOM de la página expone un sistema completo de videollamada integrada al tour:
- Botones: "Unirse", "Solicitar Voz y Control", "Seguir al anfitrión", "Mostrar ventanas de video", "Abandonar la llamada", "Colgar la llamada actual".
- Flujo de conexión: pantalla *"Unirse a la Sesión Guiada en Vivo:"* con aclaración *"- Sesión en modo silencioso - (Webcam y micrófono no permitidos)"*, campo de texto "Introduce tu nombre..." y botón "Conectar".
- Estados de la llamada: *"Llamando... (Por favor, espera que responda)"* → *"Bienvenido a la sala. La sesión está a punto de comenzar..."*.
- Tutorial propio: *"Bienvenido a Tours Guiados en Vivo — Tómate un momento para ver cómo funciona."*
- Incluso tiene un formulario de reporte de errores integrado ("Por favor, rellena tu reporte de error", con campo de email y descripción, botón "Enviar reporte") y un disclaimer de responsabilidad ("Acepto que el uso de esta herramienta está bajo mi responsabilidad.").

Esto confirma que MP360 tiene disponible (activada al menos en este proyecto) la funcionalidad de **tour guiado remoto en vivo**: un vendedor puede iniciar una sesión, un cliente se conecta por link, y el vendedor "conduce" la navegación del 360 en tiempo real mientras hablan (por fuera del propio widget, probablemente por teléfono o WhatsApp en simultáneo, ya que la webcam/micrófono del visor están deshabilitados — "sesión en modo silencioso").

También se vio en el menú contextual de este sitio el crédito **"MP 360° hecho por Bonaudi Prod."** — sugiere que MP360 terceriza o co-produce el registro fotográfico/dron con un estudio de producción (Bonaudi Prod.) en al menos algunos proyectos.

### Intro
Imagen desenfocada con efecto "zoom blur" de un espacio de eventos, logo "Forest" y texto: *"En Complejo Forest, nos enorgullecemos de ofrecer espacios únicos y versátiles para eventos corporativos de todo tipo. Te invitamos a conocerlos."*

No se auditó en más profundidad por no ser parte del plan original y por el tiempo ya invertido en los sitios prioritarios.

---

## Qué tienen que nosotros no

Ordenado de mayor a menor impacto estimado en la experiencia de venta:

1. **Cierre de cotización directo a WhatsApp con mensaje prellenado (Jacarandá).** El cotizador no termina en un formulario genérico: arma un mensaje de WhatsApp con el precio, anticipo, cuota y color de lote ya escritos, listo para enviar. Elimina toda fricción entre "vi cuánto sale" y "ya le escribí al vendedor con el dato exacto en la mano" — probablemente el mecanismo de conversión más efectivo de todo el benchmark.

2. **Tours guiados en vivo con videollamada integrada (3DVista / visto en Complejo Forest).** Un vendedor puede tomar el control del recorrido y guiarlo en tiempo real para un cliente remoto conectado por link, mientras hablan por teléfono/WhatsApp en paralelo. Es una herramienta de venta asistida a distancia que ningún otro punto del funnel reemplaza — muy relevante para loteos/edificios donde el comprador está en otra ciudad.

3. **Codificación de color de lote = tramo de precio o plan de financiación, visible directamente sobre el plano/panorama (Jacarandá y El Nogal).** El comprador entiende de un vistazo qué franja de precio tiene cada lote sin tener que clickear uno por uno — reduce drásticamente la fricción de descubrimiento en loteos de cientos de lotes (558 y 1014 respectivamente).

4. **Sistema de filtros real sobre el plano (El Nogal).** Diálogo dedicado "Filtrar lotes" con switch "solo disponibles" y filtro por plan comercial (radiogroup), no solo una leyenda visual. Permite a un comprador acotar la búsqueda a lo que realmente puede pagar.

5. **Widget de "Avances de obra" dentro del tour (El Nogal).** Porcentaje de obra iniciada + checklist de hitos completados (cordón cuneta, red de agua). Genera confianza sobre un desarrollo que todavía no está terminado, sin que el comprador tenga que salir del tour a buscar esa información en otro lado.

6. **Uso del 360 de contexto urbano para vender ubicación, no solo el edificio (First Tower).** La primera escena aérea etiqueta explícitamente los puntos de interés cercanos (shopping, casino, otros edificios de la zona) — vende la zona antes de vender el edificio.

7. **Video de intro + audio narrado en español (First Tower).** Suma producción/valor percibido antes incluso de entrar al 360; el audio narrado es un canal que no estamos usando.

8. **Cotizador embebido en el propio tour además de standalone (Jacarandá).** El mismo cotizador vive tanto en un subdominio propio (para compartir por link corto en campañas) como integrado dentro del tour (para no sacar al usuario del contexto de exploración). Cubre dos casos de uso de marketing distintos con una sola pieza.

9. **Crédito de agencia/productora visible en el propio visor (Bonaudi Prod. en Complejo Forest).** Detalle menor, pero indica que MP360 sostiene relaciones de co-producción para el registro fotográfico, no solo entrega software.

## Qué hacen mal / oportunidades

- **Gate de "hace click para empezar la experiencia" duplicado con la propia intro (First Tower).** Primero hay que salir del video de intro, y después hay otro click obligatorio sobre un ícono "360°" antes de poder rotar la cámara. Son dos pasos de fricción consecutivos antes de llegar a algo interactivo — se podría fusionar en uno.
- **Inconsistencia de arquitectura entre proyectos de la misma empresa.** Jacarandá usa la interfaz nativa de 3DVista (menos accesible, todo en canvas/WebGL, sin semántica DOM); El Nogal usa una capa custom en DOM real, mucho más rica y auditable. Da la sensación de que el "salto de arquitectura" que mencionan para El Nogal todavía no se aplicó parejo a todo el catálogo — para nosotros es una oportunidad: si arrancamos ya con arquitectura DOM-first en todos los proyectos, no vamos a tener ese problema de fragmentación interna.
- **Comportamiento errático del cotizador standalone de Jacarandá al cambiar de tarjeta de color.** En vez de actualizar el detalle in-place, redirige a todo el sitio del tour principal — probablemente no es la intención, y rompe el flujo de comparar rápido entre tramos de precio (hay que volver atrás y volver a entrar al cotizador).
- **Cero feedback de progreso de carga.** En ningún sitio vimos una barra de progreso o loader explícito mientras cargan los tiles panorámicos (que son decenas por escena) — la escena tarda en aparecer nítida sin que el usuario sepa si está cargando o si el sitio se colgó. Con cientos de requests de imágenes por escena, esto es un punto de fricción real, sobre todo en conexiones más lentas.
- **Doble menú redundante (menú superior + menú hamburguesa con los mismos ítems) en El Nogal**, aun en viewport de escritorio grande — sugiere que el menú hamburguesa mobile no se está ocultando correctamente en desktop, o que es un patrón deliberado pero redundante.
- **No se detectó multi-idioma en ningún sitio auditado.** Todos los textos vistos están en español rioplatense/argentino sin selector de idioma visible — si nuestro público objetivo incluye compradores internacionales, es un hueco que ellos tampoco cubren.
- **Falta de un "modo comparar" entre unidades/lotes.** En ningún sitio vimos la posibilidad de seleccionar dos o más lotes/unidades y compararlos lado a lado (precio, superficie, plan) — todo el flujo es de a un lote/unidad por vez.

---

## Resumen de cobertura de esta auditoría

| Sitio | Profundidad lograda |
|---|---|
| Jacarandá 360° (jacaranda360.com) | Alta — intro, menú, panel de lotes, red de requests |
| Cotizador Jacarandá (cotizador-jacaranda360.com) | Alta — flujo completo documentado vía DOM, incluye destino final (WhatsApp) |
| El Nogal · Los Alisos (elnogal360.com) | Media-alta — estructura, filtros, planes y menú documentados vía DOM; no se pudo entrar al tour interactivo ni abrir "Proyectá tu cuota" ni una ficha de lote |
| First Tower 360° (firsttower360.com) | Baja-media — intro en video, header y primera escena de contexto documentados; no se pudo atravesar el gate de entrada al 360 interactivo |
| Terrazas de Alberdi 360° (terrazasdealberdi360.com) | Baja — solo intro documentada, sesión interrumpida por inestabilidad del entorno |
| Complejo Forest 360° (complejoforest360.com) | Puntual — hallazgo oportunista de la feature de Tours Guiados en Vivo, no es parte del plan original |

**Limitación principal a reportar**: durante buena parte de la sesión, el entorno de navegador estuvo compartido con otro proceso (probablemente la auditoría móvil corriendo en paralelo), que redirigió pestañas activas hacia otras URLs sin que yo lo solicitara, y hubo timeouts recurrentes de 30 segundos en clicks sobre las escenas 360 (paneles WebGL pesados). Esto impidió completar los flujos de ficha de unidad, cotizador de El Nogal y la navegación interna de First Tower / Terrazas de Alberdi con el nivel de detalle que hubiera sido ideal. Recomiendo una segunda pasada dedicada, sin contención de entorno, enfocada específicamente en: (a) ficha de lote/unidad completa en los 4 sitios, (b) el simulador "Proyectá tu cuota" de El Nogal, y (c) los hotspots internos de First Tower y Terrazas de Alberdi.
