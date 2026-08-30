> **DOCUMENTO PARA EL CLIENTE — listo para copiar y enviar tal cual.**
> Este es el pedido de material estándar para arrancar cualquier proyecto de recorrido 360° interactivo. No hace falta que tengan todo antes de empezar, pero cuanto más completo llegue el material, más rápido y más barato sale la producción. Donde algo sea opcional o tengan una alternativa, está indicado.

# Brief de material — Recorrido 360° interactivo

## Cómo usar este documento

Está organizado por categorías. Para cada ítem encontrás:
- **Qué es** y **para qué lo usamos**.
- **Formato y especificación técnica** exacta.
- Si es **obligatorio** u **opcional**.
- **Qué pasa si no lo tienen** — el plan B y su costo en tiempo o dinero.

Si el proyecto es un **loteo/barrio**, un **edificio** o un **complejo de viviendas**, además de este brief general les vamos a enviar (o ya les enviamos) la variante específica con los puntos adicionales de cada tipo.

---

## 1. Material gráfico (planos)

### 1.1 Masterplan / plano general
**Qué es:** el plano de conjunto del proyecto completo, con la ubicación de todas las unidades, calles, accesos, amenities y espacios comunes.
**Para qué lo usamos:** es la base sobre la que armamos el mapa de navegación del recorrido — el "mapa madre" desde donde el usuario elige qué unidad ver.
**Formato:** vectorial (DWG, DXF, AI, PDF vectorial) con capas separadas por tipo de elemento (unidades, vías, verde, amenities). Escala indicada.
**Obligatorio.**
**Si no lo tienen:** lo armamos nosotros a partir de una imagen satelital o de un plano en baja calidad, pero pierde precisión geométrica y suma **entre 3 y 7 días hábiles** y un costo adicional de relevamiento/redibujo.

### 1.2 Plantas por unidad / tipología
**Qué es:** el plano de cada tipología de unidad (o de cada unidad, si son todas distintas), con cotas y superficies.
**Para qué lo usamos:** se muestran en la ficha de cada unidad dentro del recorrido, y sirven de referencia para armar las cámaras de los renders interiores.
**Formato:** PDF vectorial o imagen de alta resolución (mínimo 2000 px en el lado mayor), un archivo por tipología, nombrado con el mismo código que van a tener en el listado de unidades (ver sección 8).
**Obligatorio** (al menos una planta por tipología).
**Si no lo tienen:** si el estudio de arquitectura tiene el archivo fuente (Illustrator, InDesign, AutoCAD), lo pedimos directamente — ahorra tiempo. Si no existe ninguna planta digital, hay que generarla desde el modelo 3D o desde el legajo de obra, lo que suma **entre 2 y 5 días hábiles** según la cantidad de tipologías.

### 1.3 Cortes y vistas técnicas
**Qué es:** cortes longitudinales/transversales del edificio o del terreno.
**Para qué lo usamos:** en complejos con desnivel, para entender la topografía y ubicar correctamente las cámaras de las panorámicas; también se puede mostrar como material de referencia dentro del recorrido.
**Formato:** PDF o imagen, igual criterio que las plantas.
**Opcional en loteos y edificios sin desnivel; recomendado en complejos.**
**Si no lo tienen:** trabajamos con la planta y fotos/drone del terreno para inferir la topografía; en terrenos con pendiente marcada esto puede generar imprecisiones en la ubicación de las cámaras.

---

## 2. Renders

### 2.1 Renders exteriores
**Qué es:** imágenes fotorrealistas de las fachadas, el conjunto y los espacios exteriores.
**Para qué lo usamos:** como imágenes estáticas complementarias dentro del recorrido (portada, fichas, galería) y como referencia de materialidad y color para toda la producción.
**Formato:** JPG o PNG, mínimo 3000 px en el lado mayor, alta calidad de compresión (mínimo 90%).
**Obligatorio si el proyecto está en pozo** (no hay obra construida para fotografiar).
**Si no lo tienen:** si tienen el modelo 3D, los generamos nosotros (ver documento de especificación técnica para el estudio de renders); si no hay modelo 3D, hay que modelarlo primero, lo que suma semanas y un presupuesto aparte.

### 2.2 Renders interiores
**Qué es:** imágenes fotorrealistas del interior de cada tipología (living, dormitorios, cocina, baños).
**Para qué lo usamos:** como panorámicas 360° navegables interior (ver sección 3) y como imágenes fijas de referencia.
**Formato:** igual a exteriores.
**Obligatorio para edificios y complejos en pozo; opcional en loteos** (salvo que incluyan modelos de vivienda tipo).
**Si no lo tienen:** mismo plan B que 2.1.

### 2.3 Renders / tomas aéreas
**Qué es:** vista aérea del conjunto o del lote, en render o en foto de drone.
**Para qué lo usamos:** portada del recorrido y contexto general (ubicación respecto al entorno).
**Formato:** igual a exteriores.
**Recomendado, no obligatorio.**
**Si no lo tienen:** se puede reemplazar por una toma satelital de referencia (menor calidad) o coordinar un vuelo de drone si el terreno ya existe.

---

## 3. Panorámicas 360°

**Qué es:** las imágenes esféricas (equirectangulares) que arman el recorrido navegable interactivo — la pieza central del producto.
**Para qué lo usamos:** es el recorrido en sí. Cada punto de vista (exterior, interior de unidad tipo, amenity) se carga como una panorámica navegable con los polígonos clickeables encima.

**Especificación técnica exacta (obligatoria, sin excepciones):**
- Resolución **mínima: 8192 × 4096 px**. Resolución **ideal: 12288 × 6144 px**.
- Relación de aspecto **2:1 exacta** (ancho = 2 × alto). Cualquier otra relación rompe la proyección esférica.
- **Horizonte nivelado** (pitch 0°) — la línea de horizonte tiene que quedar perfectamente horizontal en el centro vertical de la imagen.
- **Sin postproducción que rompa la costura** (stitching) — nada de viñetados, recortes ni ajustes locales de perspectiva sobre el borde izquierdo/derecho de la imagen.
- Formato de archivo: **PNG 16-bit** o **EXR** (preferido). JPG de máxima calidad solo si el software no permite otro formato.

**Origen del material según etapa del proyecto:**
- **Proyecto en pozo** (sin obra o con obra incipiente): las panorámicas salen de **renders del modelo 3D**, exportados directamente en formato equirectangular (ver documento técnico aparte para el estudio de renders).
- **Terreno y entorno** (loteos, previo a construcción): se generan con **drone** (fotografía panorámica esférica aérea).
- **Obra terminada**: se toman con **cámara 360° real** en sitio.

**Obligatorio** — sin panorámicas no hay recorrido.
**Si no lo tienen:** las producimos nosotros. Si el proyecto está en pozo, necesitamos el modelo 3D (ver sección 2) para generarlas; si no hay modelo 3D, primero hay que modelarlo. Si el proyecto tiene obra o terreno accesible, coordinamos una visita con cámara 360° o vuelo de drone — esto se cotiza aparte según cantidad de puntos y ubicación geográfica.

---

## 4. Video

**Qué es:** un video institucional o de recorrido, en formato tradicional (no interactivo).
**Para qué lo usamos:** como material complementario para redes, landing o presentaciones comerciales — no forma parte del recorrido interactivo en sí, pero se puede embeber como sección del sitio.
**Formato:** MP4, H.264, mínimo 1920×1080, 30fps.
**Opcional.**
**Si no lo tienen:** no bloquea el proyecto. Se puede producir aparte (cotización independiente) o directamente omitir esta sección.

---

## 5. Fotografía real y de obra

**Qué es:** fotos del estado actual del terreno, del avance de obra, o del edificio terminado.
**Para qué lo usamos:** como galería complementaria y para transmitir avance de obra real (genera confianza en preventa).
**Formato:** JPG, mínimo 3000 px en el lado mayor.
**Opcional, salvo que el proyecto ya tenga obra avanzada** (ahí se recomienda fuerte, porque es la prueba más efectiva de que el proyecto existe).
**Si no lo tienen:** coordinamos una sesión de fotografía nosotros, cotizada aparte.

---

## 6. Datos comerciales

**Qué es:** el listado completo de unidades con superficies, tipologías, estados comerciales, precios y condiciones de financiación.
**Para qué lo usamos:** es lo que alimenta el estado en vivo de cada polígono clickeable — disponible, reservado o vendido — y la ficha comercial de cada unidad.
**Formato:** planilla según nuestra plantilla estándar (ver documento aparte "Plantilla de listado de unidades").
**Obligatorio.**
**Nota sobre precios:** el precio puede quedar oculto al público si así lo prefieren — igual lo necesitamos cargado en nuestra base para uso interno del equipo comercial.
**Si no lo tienen:** sin este listado no se puede activar el estado comercial en vivo; el recorrido se puede lanzar igual mostrando solo la navegación 3D, pero sin colores de disponibilidad, y se agrega en cuanto esté listo.

---

## 7. Identidad de marca

**Qué es:** logo, paleta de colores, tipografía y manual de marca (si existe).
**Para qué lo usamos:** para que el recorrido y su interfaz (colores de botones, estados, tipografía) respeten la identidad del proyecto o la desarrolladora.
**Formato:** logo en vectorial (AI, EPS o SVG) con versión para fondo claro y oscuro; códigos de color en HEX; nombre de las tipografías (con archivos de fuente si no son de Google Fonts).
**Obligatorio el logo; opcional el resto.**
**Si no lo tienen:** usamos una paleta y tipografía neutras de nuestro sistema por defecto, ajustable después.

---

## 8. Textos y copy

**Qué es:** los textos descriptivos del proyecto, de las tipologías y de los amenities.
**Para qué lo usamos:** fichas de unidad, textos de bienvenida, descripciones de amenities dentro del recorrido.
**Formato:** documento de texto (Word o Google Docs), un párrafo por sección.
**Opcional** (podemos redactar nosotros a partir del brochure, con revisión de ustedes).
**Si no lo tienen:** los redactamos nosotros en base al brochure y a la información comercial, sujeto a aprobación antes de publicar.

---

## 9. Datos legales y contractuales

**Qué es:** disclaimers obligatorios (imágenes ilustrativas, superficies sujetas a aprobación municipal, etc.), número de matrícula o registro si aplica, y cualquier leyenda legal que el proyecto deba mostrar por normativa.
**Para qué lo usamos:** se incluyen como pie de página o pop-up legal dentro del recorrido, para que la pieza cumpla con lo que exige cada jurisdicción.
**Formato:** texto plano, provisto por su equipo legal o inmobiliaria.
**Obligatorio.**
**Si no lo tienen:** no publicamos el recorrido sin esta validación — es responsabilidad del cliente proveerla; nosotros no redactamos disclaimers legales.

---

## 10. Accesos y contactos

**Qué es:** quién es el estudio de arquitectura, quién el estudio de renders (si ya tienen uno contratado), quién administra el CRM o la base de leads, y quién es el referente que autoriza cambios de estado comercial.
**Para qué lo usamos:** para coordinar directamente con cada proveedor (por ejemplo, pedirle al renderista el modelo 3D o las panorámicas ya generadas) y para saber a quién avisarle cuando se vende o reserva una unidad.
**Formato:** nombre, empresa, mail y teléfono de cada contacto.
**Obligatorio.**
**Si no lo tienen:** lo definimos en la reunión de kickoff (ver guion aparte).

---

## 11. Ubicación y georreferencia

**Qué es:** dirección exacta, coordenadas GPS del predio, y polígono del terreno si lo tienen digitalizado (mensura, agrimensura).
**Para qué lo usamos:** para ubicar el proyecto en mapas, generar el contexto satelital y, si hay agrimensura digital, importar directamente los límites de lotes/unidades como polígonos base (ahorra semanas de dibujo manual).
**Formato:** coordenadas en decimal (lat, long); polígonos en **GeoJSON** si existen.
**Obligatoria la dirección/coordenadas; opcional el GeoJSON** (pero recomendadísimo si existe).
**Si no lo tienen:** dibujamos los polígonos manualmente sobre la imagen satelital o el masterplan — funciona bien para pocas unidades, pero en loteos de cientos o miles de lotes esto puede sumar **varias semanas** de trabajo. Vale la pena preguntarle al agrimensor antes de asumir que no existe.

---

## Resumen — qué es imprescindible para arrancar

| Categoría | Nivel |
|---|---|
| Masterplan / plano general | Obligatorio |
| Plantas por tipología | Obligatorio |
| Panorámicas 360° (o material fuente para generarlas) | Obligatorio |
| Listado de unidades (datos comerciales) | Obligatorio |
| Logo | Obligatorio |
| Disclaimers legales | Obligatorio |
| Dirección / coordenadas | Obligatorio |
| Contactos de proveedores | Obligatorio |
| Renders exteriores/interiores | Obligatorio si es pozo |
| Cortes técnicos | Recomendado en complejos |
| GeoJSON de agrimensura | Recomendado si existe |
| Video, fotografía, copy redactado | Opcionales |

Cualquier duda sobre un ítem puntual, la resolvemos en la reunión de kickoff.
