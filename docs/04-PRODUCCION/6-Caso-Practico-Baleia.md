# Caso práctico: Baleia (Punta Ballena, Uruguay)

> Guía interna. Aplica el guion de destape de material (`4-Guion-Para-Destapar-Material.md`) y la escalera de niveles (`2-Escalera-de-Niveles-de-Material.md`) al caso real que ya tenemos entre manos.

## Punto de partida

Material en nuestras manos hoy: brochure PDF de 37 páginas vectorial, 5 renders de exterior a 1920px, plantas por unidad, masterplan. Con eso ya construimos un masterplan interactivo funcionando — estamos en **Nivel 1** de la escalera (ver documento 2), con la salvedad de que los renders están por debajo de la resolución recomendada (1920px vs. 3000px mínimo).

**No tenemos:** panorámicas 360°, fotos de obra, ni el modelo 3D.

**Contactos a activar:** el **estudio de arquitectura** que diseñó Baleia (probablemente el mismo que generó los renders y el brochure, a confirmar con la pregunta 1-2 del guion de destape) y **Dacal** — el contacto comercial/desarrollador del proyecto con el que ya tenemos relación. *(Confirmado en la auditoría del sitio: **Dacal Bienes Raíces** es una inmobiliaria argentina —oficinas en La Plata y Puerto Madero— que **comercializa** Baleia junto con **Suevia** y **Punta Ballena Inmobiliaria**. Es decir: Dacal vende, no construye ni diseña. El sitio del proyecto **no identifica al estudio de arquitectura ni a la desarrolladora**, así que averiguar quién hizo el brochure y los renders es literalmente el primer paso — y hay que hacerlo a través de Dacal, que es el único contacto que tenemos.)*

**Consecuencia práctica:** al ser Dacal una comercializadora y no la dueña del proyecto, puede no tener acceso directo al modelo 3D ni autoridad para cederlo. Es probable que tenga que pedírselo a la desarrolladora. Conviene preguntarlo de entrada para no perder una semana esperando algo que Dacal no puede dar por sí sola.

---

## Qué pedirle a cada uno, y en qué orden

### Paso 1 — A Dacal (antes que a nadie): identificar quién tiene el modelo 3D

No conviene escribirle directo al estudio de arquitectura sin confirmar primero, a través de Dacal, quién generó los 5 renders que ya tenemos — puede ser el propio estudio de arquitectura, o un renderista tercerizado que ellos contrataron. Escribirle a la persona equivocada hace perder días.

**Mail tipo a Dacal:**

> Asunto: Baleia — necesitamos identificar al proveedor del modelo 3D
>
> Hola [nombre],
>
> Para sumar el recorrido 360° interior de Baleia al masterplan interactivo que ya está funcionando, necesitamos generar panorámicas 360° a partir del modelo 3D del proyecto.
>
> Antes de escribirle a nadie más: ¿quién generó los renders que nos pasaron? ¿Fue el mismo estudio de arquitectura o un renderista aparte? Y una pregunta más — ¿existen renders adicionales a los 5 que tenemos, aunque no hayan entrado en el brochure final? A veces hay más tomas de las que terminan en el material de marketing, y nos sirven directamente si ya existen.
>
> Con esa info les escribimos directo a ellos para pedir el modelo 3D o, si prefieren no cederlo, que generen las panorámicas ellos mismos siguiendo una especificación técnica que les vamos a enviar.
>
> Gracias,
> [firma]

### Paso 2 — Al estudio de arquitectura/renders (una vez identificado): pedir el modelo o las panorámicas

Dos variantes de mail según la respuesta del Paso 1.

**Variante A — si acceden a compartir el modelo 3D** (la opción más rápida y barata, porque generamos las panorámicas nosotros o coordinamos con nuestro propio renderista):

> Asunto: Baleia — modelo 3D para generar panorámicas 360°
>
> Hola,
>
> Estamos sumando un recorrido 360° interactivo al masterplan de Baleia, y para eso necesitamos generar panorámicas 360° a partir del modelo 3D que usaron para los renders que ya nos pasó Dacal.
>
> ¿Podrían compartirnos el archivo del modelo (en cualquier formato — SketchUp, 3ds Max, Twinmotion, no hace falta que sea un programa en particular)? Con eso generamos las panorámicas nosotros, sin volver a molestarlos.
>
> Si prefieren no ceder el archivo fuente, con gusto les enviamos la especificación técnica exacta para que ustedes mismos exporten las panorámicas — nos sirve igual.
>
> Gracias,
> [firma]

**Variante B — si no ceden el modelo, pedirles que generen las panorámicas ellos** (reenviar tal cual el documento técnico ya armado):

> Asunto: Baleia — especificación técnica para panorámicas 360°
>
> Hola,
>
> Les adjuntamos la especificación técnica exacta para generar las panorámicas 360° de Baleia a partir del modelo 3D — incluye resolución, formato y nomenclatura de archivo.
>
> Para priorizar bien el trabajo, la lista mínima de tomas que necesitamos es: 1 panorámica aérea del conjunto, 1 a nivel de acceso/circulación entre los bloques del complejo, 1 exterior representativa por bloque, y 1 panorámica por ambiente principal (living, dormitorio, cocina) de cada tipología de unidad. Si el complejo tiene amenities comunes, sumar 1 panorámica por cada uno.
>
> Cualquier duda sobre la especificación, quedamos a disposición antes de que empiecen a renderizar.
>
> Adjunto: `01-CLIENTE/3-Especificacion-Tecnica-para-Estudio-de-Renders.md`
>
> Gracias,
> [firma]

### Paso 3 — En paralelo (no depende de los pasos anteriores): drone del terreno

Independiente de lo que respondan el estudio de arquitectura o Dacal sobre el modelo 3D, se puede coordinar ya mismo un vuelo de drone sobre el predio en Punta Ballena — sube el proyecto a Nivel 3 sin depender de terceros lentos. Ver documento 1, sección 3, para contactos en Uruguay (Otero.uy, dazzdrones, o directo a través de la Asociación Uruguaya de Drones).

---

## Qué se puede entregar mientras se espera respuesta

No hace falta parar la producción a la espera de las panorámicas. Con el material actual (Nivel 1) ya se puede avanzar y entregar:

1. **Mejorar la galería de renders existente** — aunque estén a 1920px, se pueden usar como están para la galería y el video de intro (Nivel 1 completo), dejando aclarado al cliente que en cuanto lleguen versiones de mayor resolución se reemplazan sin costo adicional de integración.
2. **Completar la ficha comercial de cada unidad** con los datos de las plantas por unidad que ya tenemos — no depende de ningún tercero.
3. **Dejar preparada la estructura de navegación 360°** en el visor (los puntos de hotspot, la lógica de transición entre panorámicas) usando placeholders, para que cuando lleguen las panorámicas reales sea un reemplazo directo y no un desarrollo desde cero.
4. Si se coordina el drone en paralelo (Paso 3), integrar esa toma aérea en cuanto esté lista — no depende de que se resuelva primero el tema del modelo 3D.

De esta forma, mientras se espera la respuesta de Dacal y del estudio de arquitectura, el proyecto sigue avanzando en todo lo que no depende de ellos, y el salto a Nivel 2 se vuelve un simple reemplazo de material en cuanto llega, en vez de un desarrollo nuevo.
