# Baleia — qué cambia en la experiencia cuando lleguen las panorámicas

> Documento interno. Distingue tres cosas que suelen mezclarse: **lo que se
> desbloquea solo** (ya está construido y probado), **lo que hay que
> construir** para aprovecharlas de verdad, y **lo que sigue sin poder
> hacerse** aunque lleguen.

---

## 1. Lo que se desbloquea solo

Nada de esto requiere escribir código nuevo: está construido y verificado con
panorámicas sintéticas (ver `5-Recepcion-e-Integracion.md`).

### El recorrido deja de ser un mapa y pasa a ser un recorrido

Hoy Baleia es un **masterplan interactivo con galería**: un plano con
polígonos clickeables y siete renders que se abren como imágenes planas. Es
Nivel 1 de la escalera. Con panorámicas pasa a **Nivel 2**: el visitante se
para adentro del proyecto y mira alrededor. Es la diferencia entre "te muestro
cómo es" y "estás acá".

Comercialmente eso cambia el producto de rango: de USD 1.500-2.800 a
USD 3.500-6.000 según la escalera (`04-PRODUCCION/2`).

### Los amenities dejan de ser un render compartido

Hoy los cuatro hotspots de amenities (`D` piscina, `E` piscina infantil, `F`
rincón de fuego, `G` laguna) saltan **todos al mismo render**
(`back-amenities-v2.jpg`), porque es el único donde se ven los cuatro. Es lo
mejor que se podía hacer sin panorámicas, y es evidentemente un parche: el
visitante clickea "rincón de fuego" y le aparece una vista aérea del sector
entero.

Con panorámicas, cada amenity tiene **su punto**, a la altura de los ojos, y
el re-enlace es automático.

### Se puede navegar de un punto a otro dentro de la escena

El visor **ya soporta hotspots dentro de una panorámica**: geometrías
esféricas (`polygon_sph`, `point_sph`) dibujadas como marcadores sobre la
esfera, con el mismo sistema de acciones que en el plano
(`{kind:'goto'}` salta de escena, `{kind:'unit'}` abre la ficha). Está
implementado en `apps/viewer/src/scenes.ts::PanoramaRenderer`.

O sea: **desde la panorámica del Bloque 1 se puede clickear el Bloque 2 que
se ve al fondo y caminar hasta ahí.** El recorrido deja de ser "un menú de
vistas" y pasa a ser un recorrido encadenado, que es lo que hace que la gente
se quede.

**Lo que falta para eso no es código: son las coordenadas.** Hay que dibujar
esos hotspots esféricos punto por punto sobre cada panorámica (a qué yaw y
pitch está el Bloque 2 visto desde el Bloque 1). Eso es trabajo de edición
manual, una vez, con el material en la mano — no se puede hacer antes.

### La escena inicial puede pasar a ser la vista aérea

Hoy el recorrido arranca en el plano (`start: "masterplan"`). Con la aérea
360 disponible, arrancar ahí es una línea de configuración: el visitante abre
el link y lo primero que ve es el terreno con el mar de fondo, y el plano
pasa a ser una capa de consulta en vez de la puerta de entrada. Vale la pena
probar las dos y quedarse con la que retenga mejor.

### La vista real desde cada bloque, comparable

Esto es lo que más peso comercial tiene y hoy directamente **no existe**. El
brochure afirma que todas las unidades tienen vista al mar y a la península.
Con un exterior 360 por bloque, el visitante **verifica** esa afirmación
bloque por bloque, y —más importante— **compara**: qué se ve desde el Bloque 1
contra qué se ve desde el Bloque 5. Esa comparación es exactamente la
conversación que sostiene una diferencia de precio entre bloques, y hoy no se
puede tener.

---

## 2. Lo que hay que construir para aprovecharlas

En orden de impacto sobre lo que cuesta hacerlo.

### (1) Botón "Ver en 360°" en la ficha de la unidad — **lo primero**

Hoy los hotspots `h-B1..h-B5` del masterplan abren la **ficha comercial** del
bloque. Cuando llegue la panorámica de ese bloque hay que elegir: o el
polígono abre la ficha, o salta al 360. Las dos cosas no entran en un click.

Elegir es perder algo, así que **no hay que elegir**: la ficha tiene que
tener un botón que lleve a la panorámica de ese bloque. El click sigue
abriendo el dato comercial (que es lo que convierte) y desde ahí se entra a la
vista.

Requiere: un campo que asocie una unidad o grupo con una escena, y el botón en
`sheet.ts`. Es chico. Mientras no exista, el script de integración deja los
hotspots de bloque como están (y ofrece `--relink-blocks` para el caso en que
el cliente prefiera explícitamente el salto directo, aceptando perder la
ficha).

### (2) Miniatura de las escenas panorama en la galería — **bug conocido**

La galería del visor deriva la miniatura de `source.url`
(`apps/viewer/src/ui.ts::renderGallery`). Una escena de tiles no tiene `url`,
tiene `base`: el `<img src>` queda en `""`. **Verificado en el navegador**
durante la prueba de integración: las 7 escenas de render traen su
`.thumb.webp` y las 5 panorámicas traen `src` vacío.

El archivo ya existe — el script de integración emite `poster.thumb.webp` en
la carpeta de cada escena, con la misma convención de nombre que el visor ya
usa. Falta que `renderGallery` (y `renderFilmstrip`) lo busquen cuando la
fuente es de tiles. Es una línea, pero sin ella la galería queda con huecos
grises justo en las escenas nuevas.

### (3) Hotspots de navegación entre panorámicas

El motor está (ver arriba). Falta:

- **Poder dibujarlos.** Hoy las coordenadas esféricas de un hotspot se
  escriben a mano en el manifiesto. Para 14-20 escenas con 2-4 saltos cada
  una, eso es inviable a mano: hace falta que el editor del panel deje
  clickear sobre la panorámica y marcar el punto.
- **Un criterio de diseño** de cuáles son los saltos que valen: del acceso al
  Bloque 1, de cada bloque al siguiente, de Bloque 5 a la piscina, de la
  piscina a la laguna. Es un grafo chico y hay que dibujarlo antes de cargarlo.

### (4) Transición entre escenas de tiles

Cuando el visor cambia de una panorámica de tiles a otra, **corta en seco**:
el adaptador de tiles no soporta cross-fade sin un cubemap de baja resolución
de arranque, y nuestro pipeline genera un preview *equirectangular*, no un
cubemap de 6 caras. Está documentado en `scenes.ts`.

Entre escenas de plano hay fundido de 900 ms; entre panorámicas hay un corte.
Con 3 escenas no molesta; con 20 y el visitante encadenando saltos, se nota.
Arreglarlo es generar también un cubemap chico (6 caras de ~256 px) en el
pipeline y pasarlo como `baseUrl`. No es difícil, es trabajo del pipeline.

### (5) Brújula / minimapa

`Scene.northOffset` existe en el contrato (`packages/core/src/types.ts`) y
**nadie lo usa todavía**. Con panorámicas y una regla de orientación fija
("yaw 0 = al mar"), tiene sentido real: una brújula chica, o mejor un
minimapa del masterplan con un cono que muestre hacia dónde está mirando el
visitante y desde qué bloque. En un complejo de 5 bloques iguales alineados,
**perderse es fácil** — el minimapa es lo que evita que el visitante deje de
entender dónde está y se vaya.

### (6) Reemplazo progresivo por fotografía real

Cuando Baleia empiece a construirse, cada panorámica de render puede
reemplazarse por una foto 360 real del mismo punto, una por una, sin rehacer
el recorrido: el `slug` de la escena es el mismo y los hotspots quedan donde
están. Es el salto a Nivel 4 de la escalera y **no requiere ningún desarrollo
nuevo** — sólo que se saquen las fotos desde los mismos puntos, que es otro
motivo para pedirle al estudio las **coordenadas de cámara** de cada toma (ver
`4-Especificacion-Tecnica-Baleia.md`, sección 8).

---

## 3. Lo que sigue sin poder hacerse

Honestidad, para no prometerle al cliente algo que las panorámicas no dan.

- **La vista desde *tu* unidad.** Una panorámica por bloque no es una
  panorámica por unidad. Desde el Bloque 3 la vista es "la del Bloque 3", no
  la del piso alto de la unidad F. Prometer lo segundo con lo primero es el
  tipo de cosa que un comprador detecta y que le hace desconfiar del resto.
- **Recorrer las 20 unidades.** El set cubre **una unidad tipo por tipología**
  (dos en total). Las otras 18 siguen siendo ficha + superficie + imagen de
  ubicación.
- **B1, B4 y B5 no tienen plantas publicadas** en el brochure, así que sus
  unidades no existen todavía como dato comercial — las panorámicas no
  resuelven eso. Sigue siendo material a pedir.
- **Estado, precio y financiación siguen faltando.** El `availability.json`
  de hoy tiene estados de **demostración** sintéticos, no reales. Un recorrido
  360° espectacular con la disponibilidad inventada es peor que un plano con
  la disponibilidad real. **Esto es más urgente que las panorámicas** y no
  depende de ningún estudio de renders: depende de una planilla que el equipo
  comercial de Dacal ya tiene.
- **Un recorrido continuo caminando** (tipo Matterport, con transición
  espacial entre puntos) no sale de panorámicas sueltas: eso es escaneo 3D de
  obra construida, Nivel 4, y hoy no hay obra.
