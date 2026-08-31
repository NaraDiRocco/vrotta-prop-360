# Baleia — tres caminos para conseguir las panorámicas

> Documento interno. En orden de preferencia. Los precios son **[Estimado]**
> salvo donde se cite fuente, y salen de `04-PRODUCCION/1-Quien-Hace-Que-y-Cuanto-Cuesta.md`
> — repreguntar a 2-3 proveedores antes de cotizarle en firme a nadie.
>
> Los tres caminos **no son excluyentes**. El (c) se puede arrancar mañana sin
> depender de que el (a) o el (b) respondan, y es lo que se recomienda hacer.

---

## Camino (a) — El estudio que hizo los renders exporta las panorámicas

**La opción preferida, con diferencia.** El modelo 3D ya existe: los 7 renders
de `tools/baleia/material/renders/` salieron de algún lado, y ese lado es un
archivo de escena con el complejo modelado, texturado e iluminado. Cambiar
una cámara a panorámica equirectangular **no es rehacer el trabajo**: es
cambiar el tipo de cámara y la resolución de salida, y volver a renderizar.
En Blender son 3 clicks (Panoramic → Equirectangular → 12288×6144), en
Twinmotion y Lumion es un modo de exportación que ya viene en el menú — está
documentado paso a paso en `01-CLIENTE/3`, sección 2.

**Qué hay que conseguir primero:** saber **quién es el estudio**. El sitio del
proyecto no lo identifica, así que el dato sale de Dacal (ver el mail 1 de
`3-Mails-Listos-Para-Enviar.md`).

**Costo [Estimado]:** una panorámica sale **30-60% más cara** que el mismo
punto en render fijo, porque en 360 hay que modelar también lo que está
detrás de la cámara (regla práctica de `04-PRODUCCION/1`). Con un render fijo
de estudio de nivel medio en el orden de **USD 800-2.000**, cada panorámica
cae en el rango **USD 1.000-3.000**. Pero **este número es para tomas
nuevas**. En el caso de Baleia la mayoría de las tomas del set son puntos que
el estudio ya tiene resueltos como escena, así que la conversación realista no
es "cotizame 14 renders" sino **"cotizame la re-exportación en 360 de las
cámaras que ya tenés, más las tomas nuevas"** — y esa distinción vale mucha
plata. Hay que plantearla explícitamente en el mail, porque un estudio que
recibe "necesito 14 panorámicas" cotiza 14 panorámicas.

**El costo real oculto:** las **8 tomas de interior**. No hay un solo render
interior en el material. Si el estudio nunca modeló los interiores, esas 8
tomas son modelado + ambientación nuevos, no re-exportación. Preguntarlo
antes de pedir presupuesto.

**Plazo [Estimado]:** si el modelo está vivo y los interiores existen,
**1-2 semanas** desde el sí. Si hay que modelar interiores, **4-8 semanas**.
La demora que más duele no es la de render: es el ida y vuelta hasta que el
estudio contesta, y las rondas de corrección si la primera entrega no cumple
la spec.

**Riesgo:** el estudio puede haber cerrado el proyecto hace meses, tener el
archivo en un disco sin backup, o simplemente no querer volver a abrirlo por
un trabajo chico. También puede pedir autorización de la desarrolladora, que
es un actor que hoy ni siquiera tenemos identificado.

**Nuestro trabajo si sale [Estimado, de la escalera de niveles]:**
integración **USD 3.500-6.000** (Nivel 2), en función de la cantidad de
puntos. Técnicamente ya está resuelto: el pipeline y el script de integración
existen y están probados (ver `5-Recepcion-e-Integracion.md`) — lo que se
cobra es la integración, la curaduría y las rondas de corrección, no
desarrollo nuevo.

---

## Camino (b) — Nos dan el modelo 3D y renderizamos nosotros en Blender

**Segunda opción.** Si el estudio prefiere no volver a intervenir pero sí
ceder el archivo, generamos las panorámicas nosotros. Blender es gratuito, el
pipeline de tiles ya está construido y la spec de export está escrita.

**Ventaja real:** deja de depender del calendario de un tercero. Y una vez
que el modelo está en nuestras manos, **una toma nueva cuesta horas, no una
negociación**: si el equipo comercial pide "¿y desde el Bloque 4?" tres
semanas después, se resuelve el mismo día. Eso es difícil de conseguir por
cualquier otro camino.

**Costo [Estimado]:** cero de licencia (Blender). El costo es tiempo propio:
**2-5 días de trabajo** para levantar el modelo, verificar que los materiales
y la iluminación llegaron completos, ubicar 14-20 cámaras y renderizar. Más
tiempo de render de máquina, que a 12288×6144 en Cycles es del orden de
**30-90 minutos por panorámica** en una máquina con GPU decente
**[Estimado, no medido en este proyecto]** — o sea una noche para el set
completo.

**Plazo [Estimado]:** **1-2 semanas** desde que llega el archivo.

**El riesgo grande, y hay que decirlo:** **un modelo 3D casi nunca sobrevive
intacto al cambio de software.** Si el estudio trabaja en 3ds Max + V-Ray o
Corona y nosotros abrimos en Blender, lo que llega por FBX/OBJ son la
geometría y las UVs; los materiales, las luces y el setup de render **se
pierden o llegan rotos**. Reconstruir eso hasta que el resultado se parezca a
los renders que el cliente ya aprobó puede ser más caro que pagarle al
estudio la re-exportación. Este camino es claramente bueno **si el estudio
trabaja en Blender o en SketchUp**, y es una apuesta si trabaja en 3ds Max.

**Por eso el mail al estudio pregunta primero qué software usan.** No es
cortesía: cambia cuál de los dos caminos conviene.

**Consecuencia práctica:** si nos dan el modelo, pedir **también** los
archivos de textura y, si es posible, una imagen de referencia de cada render
ya aprobado. Sin referencia no hay forma de saber si lo que sale de Blender
"es" Baleia.

---

## Camino (c) — No hay modelo: drone sobre el terreno real

**No es un premio consuelo, y conviene arrancarlo mañana aunque el (a) esté
en marcha.**

El razonamiento es concreto: **el edificio no existe, pero el terreno sí, y
la vista —que es lo que Baleia vende— es real y fotografiable hoy.** El
brochure no vende plantas: vende "el punto más alto del Camino de la
Ballena", "vistas a la isla Gorriti, la Punta, el mar y sus amaneceres", "350
metros de la Playa de las Grutas". **Todo eso ya está ahí.** Un panorama 360°
tomado con drone a 35 m sobre la cota de Bloque 3 muestra exactamente el mar,
exactamente la isla y exactamente la península que va a ver el comprador — sin
un solo polígono renderizado.

**Y hay algo que el render no puede dar:** credibilidad. El visitante sabe
distinguir una ilustración de una foto. Un render de la vista al mar es una
promesa; una foto 360 de la vista al mar desde el terreno es un hecho. Es
justamente el argumento del Nivel 3 de la escalera
(`04-PRODUCCION/2-Escalera-de-Niveles-de-Material.md`).

### Qué se puede prometer con esto

- **La vista.** Real, verificable, en 360°, a la hora del día que se elija
  (los amaneceres del brochure son fotografiables: hay que ir temprano).
- **El contexto.** Casapueblo, la Ruta 10, la playa, el arbolado existente, la
  distancia real a Punta del Este. Nada de eso está en los renders.
- **La topografía.** El escalonado del terreno se ve desde el aire aunque no
  haya un solo bloque construido. Es la prueba física del argumento de venta.
- **El estado del predio hoy**, que para un comprador de pozo es información
  y no un problema — sobre todo si hay movimiento de suelos empezado.

### Qué NO se puede prometer, y hay que decirlo antes de contratar

- **Ningún interior.** Cero. Ni living, ni terraza, ni cocina. Las tomas 14 a
  21 de la lista **no se resuelven por este camino de ninguna forma.**
- **Ninguna fachada, ningún amenity.** La piscina, la laguna y el rincón de
  fuego no existen todavía. Un drone no puede fotografiar un render.
- **La vista exacta desde cada unidad.** Se puede volar a la cota aproximada
  de cada bloque y decir honestamente "esta es la vista desde la altura del
  Bloque 3". No es lo mismo que "esta es la vista desde tu balcón", y
  **presentarlo como si lo fuera es exactamente el tipo de cosa que hace que
  un comprador desconfíe de todo el resto del recorrido.**
- Por lo tanto: **el drone sube el proyecto a un Nivel 1 muy bueno, no a
  Nivel 2.** El producto sigue siendo "masterplan interactivo + galería + una
  vista aérea 360 real", no "recorrido 360". Vender esto como recorrido 360°
  sería mentir.

### Cómo se hace, en concreto

Casi todos los drones DJI actuales tienen un modo **"Sphere Panorama"** nativo
que arma una esférica 360 por stitching automático de varias fotos. Sale
gratis con el vuelo, y para nuestro pipeline es lo único que hace falta: sale
un equirectangular 2:1 que entra directo por
`tools/baleia/scripts/integrate_panoramas.py`. **Pedirlo explícitamente en la
contratación**, además de las tomas individuales en RAW y el video 4K —
si no se pide, no viene.

**Puntos de vuelo a pedir**, alineados con la lista de tomas:
1. **90 m sobre la cota de Bloque 3**, esférica 360 → sustituye la toma 1.
2. **35 m sobre la cota de Bloque 3**, esférica 360 → sustituye la toma 2.
3. **A la cota aproximada de Bloque 1 y de Bloque 5**, esféricas 360, a unos
   10-15 m sobre el terreno → es lo más cerca que se puede estar de las tomas
   5 y 9, rotuladas honestamente como "vista desde la altura del bloque".
4. Una esférica **a nivel del suelo, en el acceso** (se puede hacer con el
   drone apoyado o con una cámara 360 en trípode) → toma 3.

Con eso el set del drone son **5 panorámicas reales**.

**Costo [Estimado, con el dato flojo que tenemos]:** en Argentina, un día de
filmación con drone (4 baterías, ~2 h de vuelo) va del orden de
**$45.000-$180.000 ARS** según alcance, cifras de 2025 que hay que reajustar
([droneros.com.ar](https://www.droneros.com.ar/)). **Para Uruguay no hay
tarifa pública verificada**: los proveedores locales
([Otero.uy](https://www.otero.uy/alquiler-de-drones/),
[dazzdrones](https://web.dazzdrones.com/), y la Asociación Uruguaya de Drones)
cotizan a medida. Como orden de magnitud, un vuelo de medio día en Punta
Ballena debería caer en **USD 250-500**. **Hay que pedir tres cotizaciones
antes de prometerle un número al cliente.**

**Regulación (Uruguay, DINACIA):** los drones "menores" (hasta 25 kg) **no
requieren registro ni licencia**, y cualquier equipo fotográfico comercial
estándar (DJI Air / Mavic) entra ahí. O sea: **no hay traba regulatoria para
volar la semana que viene.** Igual conviene verificar el peso exacto del
modelo contra la resolución vigente y confirmar que no haya restricción de
espacio aéreo por la cercanía del aeropuerto de Punta del Este — **está a 5
minutos, así que esto no es un detalle: preguntarlo al piloto antes de
contratar.**

**Permiso del predio:** hace falta autorización para volar sobre el terreno.
Es otra cosa que hay que pedirle a Dacal, y es una pregunta mucho más fácil
de responder para una comercializadora que "cedeme el modelo 3D".

**Plazo:** **1-2 semanas** entre contratar, coordinar clima y recibir el
material. Es el camino más rápido de los tres, por lejos.

**¿Comprar drone propio?** `04-PRODUCCION/5` calcula el punto de equilibrio
en **3-5 proyectos** (DJI Air 3S ≈ USD 1.300 contra ≈ USD 300-500 por
tercerización). Para **un** proyecto en Punta Ballena, con un piloto que
habría que entrenar y un viaje que hacer, **tercerizar es claramente la
decisión correcta** — es exactamente el caso "fuera de zona habitual" que ese
documento marca como excepción.

---

## Comparación

| | (a) El estudio exporta | (b) Nos dan el modelo | (c) Drone |
|---|---|---|---|
| **Nivel de la escalera al que llega** | **2** (recorrido 360 real) | **2** | **1 muy bueno / 3 parcial** — no es Nivel 2 |
| **Cubre interiores** | Sí (si están modelados) | Sí (idem) | **No** |
| **Cubre amenities y fachadas** | Sí | Sí | **No** |
| **Cubre la vista real** | Renderizada | Renderizada | **Real, y es su ventaja** |
| **Costo directo [Est.]** | USD 1.000-3.000/toma nueva; mucho menos por re-exportación | USD 0 de licencia + 2-5 días propios | USD 250-500 el vuelo |
| **Plazo [Est.]** | 1-2 sem. (o 4-8 si hay que modelar interiores) | 1-2 sem. desde que llega el archivo | **1-2 sem., y arranca ya** |
| **Depende de terceros lentos** | Sí, totalmente | Sí para conseguir el archivo, después no | **No** |
| **Riesgo principal** | Que el estudio no responda o no exista el modelo | Que el modelo llegue sin materiales ni luces | Que se venda como algo que no es |

**Recomendación:** arrancar **(c) en paralelo, esta semana**, mientras se
persigue **(a)**. (c) no bloquea nada, no depende de nadie, entrega material
que ningún render puede dar, y **si (a) y (b) fracasan es lo único que queda
en pie**. Guardar (b) como respuesta a "no queremos volver a intervenir pero
te paso el archivo", y sólo aceptarlo con los materiales incluidos.
