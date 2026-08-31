# Baleia — lista de tomas 360°

> Documento interno + base del pedido al renderista. La versión que se
> reenvía tal cual (con la parte técnica) es `4-Especificacion-Tecnica-Baleia.md`.
>
> Esta lista no es genérica: sale de mirar el masterplan (página 6 del
> brochure), el corte topográfico (página 9), los 11 hotspots ya extraídos en
> `tools/baleia/out/baleia_hotspots.geojson` y los 7 renders de
> `tools/baleia/material/renders/`.

---

## 1. Lo que hay que saber del terreno antes de ubicar una cámara

Todo lo de esta sección está **[Verificado]** contra el brochure salvo donde
diga lo contrario.

- El terreno tiene **más de 15.000 m²** y **más de 250 m de longitud**
  (brochure, pág. 3 y 4). Es una franja larga y angosta.
- Está **en el punto más alto del Camino de la Ballena**, sobre la **falda
  este** (brochure, pág. 3). El lado largo oeste da a **Carlos Páez Vilaró**;
  el lado largo este, a la **Ruta 10 Interbalnearia**.
- **El terreno baja de oeste a este.** El corte topográfico de la página 9 lo
  muestra sin ambigüedad: **Bloque 1 es el más alto y Bloque 5 el más bajo**,
  cada uno apoyado en un escalón del terreno. El sector de amenities
  (clubhouse, piscina, piscina infantil, rincón de fuego, laguna) está en el
  extremo **más bajo**, contra la Ruta 10.
- **La vista se mira hacia el este/sureste**: mar, **isla Gorriti**, la
  península de Punta del Este y los **amaneceres** (brochure, pág. 4). La
  skyline de Punta se ve efectivamente en el horizonte del render
  `complejo3.jpg` — no es una promesa de folleto, está renderizada.
- Cada bloque es una barra con el **parking del lado de arriba** (oeste) y
  **galerías, terrazas y parrilleros del lado de abajo** (este, el lado de la
  vista). Eso es lo que hace que "todas las unidades tengan vista": cada
  bloque mira por encima del techo verde del bloque de más abajo.
- **Playa de las Grutas a 350 m** y aeropuerto de Punta del Este a 5 minutos
  (brochure, pág. 3).
- **[Estimado, no verificado]** el desnivel total. El corte de la pág. 9 no
  está acotado. A ojo, sobre 250 m de largo, la pendiente dibujada da del
  orden de **20-30 m de caída total**. *Hay que pedir la cota de cada bloque:*
  es el dato que define la altura de cámara de la toma aérea y si desde
  Bloque 1 se ve realmente por encima de Bloque 2 o no.

**Convención de orientación que se usa en toda esta lista y en la spec:**
**yaw 0 = el centro horizontal exacto del equirectangular = mirando al mar
(este)**, en toda toma que tenga vista. Fijar esto de entrada es lo que
permite que el visor abra cada escena ya encuadrada en lo que vende, sin que
nadie tenga que ajustar 20 escenas a mano después.

---

## 2. Cuántas tomas

Tres niveles. El corte no es arbitrario: cada uno corresponde a algo que el
recorrido puede o no puede prometer.

| Set | Tomas | Qué habilita |
|---|---|---|
| **Mínimo viable** | **8** | El recorrido es un recorrido 360° de verdad (Nivel 2 de la escalera). Se entra al conjunto, a los dos amenities que se ven en todo el material y a una unidad de cada tipología. **No** se puede comparar bloque contra bloque. |
| **Recomendado** | **14** | Se puede recorrer bloque por bloque y comprobar el escalonado — que es *el* argumento de venta de Baleia. Cada bloque tiene su punto y cada tipología su terraza. |
| **Completo** | **20** | Se recorre una unidad ambiente por ambiente, no sólo el living. Es el paquete que sostiene una venta a distancia sin visita física. |

El salto de 8 a 14 es el que más valor agrega por peso: son 6 tomas
exteriores (5 bloques + circulación + 2 terrazas, menos el bloque 1 y 5 que
ya estaban), todas del mismo modelo y de la misma escena de render, o sea
las más baratas de producir de toda la lista.

---

## 3. Las tomas, una por una

Altura de cámara: **1,60 m sobre el nivel de piso terminado** en todo lo
peatonal e interior (altura de ojos, la que ya recomienda
`01-CLIENTE/3`). Se fija un único valor a propósito: si cada toma tiene su
altura, el recorrido "salta" de altura al cambiar de punto y se siente mal.

`M` = mínimo viable · `R` = recomendado · `C` = completo.

### Conjunto y contexto

| # | Archivo | Set | Dónde va la cámara | Altura | Mira a (yaw 0) | Tiene que verse | Por qué importa para vender |
|---|---|---|---|---|---|---|---|
| 1 | `MASTERPLAN_AEREA_01` | M | Sobre el eje del terreno, a la altura de Bloque 3 (centro geométrico del predio) | **90 m sobre el nivel de Bloque 3** | Este (mar) | Los 5 bloques escalonados, el sector de amenities y la laguna, la Ruta 10, y en el horizonte el mar, isla Gorriti y la península | Es la única imagen que prueba las tres promesas del brochure a la vez: "punto más alto", "escalonado" y "todas con vista". Reemplaza al plano como puerta de entrada al recorrido |
| 2 | `MASTERPLAN_AEREA-BAJA_01` | C | Mismo eje, sobre Bloque 3 | **35 m** | Este | El escalonado leído de cerca, los techos verdes, los parkings integrados | A 90 m el escalonado se aplana. A 35 m se lee el desnivel real entre bloque y bloque |
| 3 | `ACCESO_EXTERIOR_01` | M | Hotspot **A** del masterplan (esquina noroeste, acceso desde Carlos Páez Vilaró) | 1,60 m | **Tierra adentro (oeste→este, hacia el complejo)**: es la única toma cuyo yaw 0 **no** es el mar | El portal de acceso, el camino interior bajando, Bloque 1 a mano derecha | Es el primer frame de la visita y prueba la promesa de "presencia mínima de vehículos" que el brochure hace en la pág. 6 |
| 4 | `CIRCULACION_EXTERIOR_01` | R | Camino interior, entre Bloque 2 y Bloque 3 | 1,60 m | Este | El parking integrado al parquizado, el camino bajando, dos bloques a los costados | Responde la pregunta que nadie hace en voz alta: "¿esto se ve a auto estacionado o a parque?" |

### Un exterior por bloque

Mismo criterio para los cinco: **cámara en el césped del lado de la vista
(este), a unos 8 m del frente del bloque**, para que el visitante vea la
fachada, gire 180° y se encuentre con el mar. Es la toma que convierte
"escalonado" de palabra a hecho.

| # | Archivo | Set | Bloque | Tiene que verse | Por qué importa |
|---|---|---|---|---|---|
| 5 | `B1_EXTERIOR_01` | M | 1 (el más alto) | La fachada de B1 y, al girar, el mar **por encima del techo verde de B2** | Es la prueba visual del escalonado. Si esta toma funciona, el argumento entero de Baleia queda demostrado |
| 6 | `B2_EXTERIOR_01` | R | 2 | Ídem sobre B3 | B2 es uno de los dos bloques con planos de unidad publicados (9 unidades en el CSV): es el que se va a vender primero |
| 7 | `B3_EXTERIOR_01` | R | 3 | Ídem sobre B4 | El otro bloque con planos publicados (11 unidades) |
| 8 | `B4_EXTERIOR_01` | R | 4 | Ídem sobre B5 | |
| 9 | `B5_EXTERIOR_01` | M | 5 (el más bajo) | La fachada de B5, el mar sin nada delante, y los amenities a un lado | Es el bloque más cerca del mar y de la piscina. Es la contracara comercial de B1: "el de arriba" contra "el de abajo" |

### Amenities

Los cuatro amenities (`D` piscina, `E` piscina infantil, `F` rincón de fuego,
`G` laguna) están agrupados en el extremo bajo, y hoy los cuatro hotspots del
masterplan saltan al **mismo** render (`back-amenities-v2.jpg`), porque es el
único donde se los ve. Con panorámicas se separan.

| # | Archivo | Set | Dónde | Altura | Mira a (yaw 0) | Tiene que verse | Por qué importa |
|---|---|---|---|---|---|---|---|
| 10 | `D_AMENITY_01` | M | Cabecera de la piscina, sobre el deck | 1,60 m | Este (laguna y mar) | La piscina completa, el clubhouse, y la piscina infantil pegada al lado | La piscina es el amenity que se mira primero en cualquier recorrido inmobiliario. Cubre además el hotspot `E` mientras no llegue una toma dedicada |
| 11 | `E_AMENITY_01` | C | Piscina infantil | 1,60 m | Este | La piscina infantil y su relación con la grande | Sólo vale la pena si el proyecto apunta a familias con chicos. Si no, sale de la lista y `D` la cubre |
| 12 | `F_AMENITY_01` | C | Rincón de fuego, entre las pérgolas | **1,20 m** (es la única excepción a los 1,60: es un espacio para estar sentado, y a 1,60 se ve desde arriba y pierde la escala) | Este | Las pérgolas, los fogones, la laguna al fondo | Es el amenity más difícil de explicar con una foto plana y el que más gana con 360 |
| 13 | `G_AMENITY_01` | M | Deck perimetral de la laguna | 1,60 m | **Oeste (de vuelta al complejo)** — es el encuadre exacto del render `complejo1-v2.jpg`, que ya probó que lee bien | La laguna en primer plano y el complejo entero detrás | Es la única toma desde donde se ve el conjunto completo a nivel de peatón. Cierra el recorrido |

### Interiores por tipología

El CSV verificado (`tools/baleia/out/baleia_unidades.csv`) tiene **20
unidades en 2 tipologías**: dúplex (B2-A a B2-E, B3-A a B3-C) y 1 dormitorio
(B2-F a B2-I, B3-D a B3-K). **Una unidad tipo de cada una alcanza** — no hace
falta renderizar las 20, y pedirlas sería quemar presupuesto en material que
el visitante no va a mirar dos veces.

Unidades elegidas: **B2-A** (dúplex) y **B3-D** (1 dormitorio). Son las dos
que tienen imagen de ubicación en el material actual, así que la ficha del
visor ya sabe mostrar dónde están dentro del bloque.

En los cuatro puntos, **yaw 0 = la abertura a la terraza**. La primera cosa
que el visitante ve al entrar a la unidad tiene que ser la vista, no una
pared.

| # | Archivo | Set | Ambiente | Tiene que verse | Por qué importa |
|---|---|---|---|---|---|
| 14 | `B2-A_TERRAZA_01` | R | Terraza del dúplex | La terraza, el parrillero propio, y el mar desde el nivel de la unidad | **Es la toma más importante de la lista después de la aérea.** "Vista al mar" es una promesa hasta que alguien la mira parado en la terraza |
| 15 | `B2-A_INT-LIVING_01` | M | Living/comedor | El living, la abertura a la terraza, y a través de ella el mar | La primera pregunta del comprador es "¿cómo se vive adentro?" |
| 16 | `B2-A_INT-DORM_01` | C | Dormitorio principal | El dormitorio y su relación con la abertura | |
| 17 | `B2-A_INT-COCINA_01` | C | Cocina | La cocina y su continuidad con el living | |
| 18 | `B3-D_TERRAZA_01` | R | Terraza del 1 dormitorio | Ídem 14, para la otra tipología | El comprador de 1 dormitorio no puede quedarse mirando la terraza del dúplex: son 12 de las 20 unidades |
| 19 | `B3-D_INT-LIVING_01` | M | Living/comedor | Ídem 15 | |
| 20 | `B3-D_INT-DORM_01` | C | Dormitorio | | |
| 21 | `B3-D_INT-COCINA_01` | C | Cocina | | |

**Conteo:**

- **M = 8** → tomas 1, 3, 5, 9, 10, 13, 15, 19.
- **R = M + 6** (tomas 4, 6, 7, 8, 14, 18) = **14**.
- **C = R + 6** (tomas 2, 12, 16, 17, 20, 21) = **20**.
- La toma **11** (piscina infantil dedicada) queda fuera de los tres sets: es
  la única opcional de la lista, y sólo suma si el proyecto se posiciona para
  familias con chicos. Con ella, el completo son **21**.

---

## 4. Lo que esta lista NO puede resolver sola

Honestidad sobre lo que hay que preguntar antes de que nadie renderice:

1. **No hay un solo render interior en todo el material.** Los 7 son
   exteriores. Eso significa que las 8 tomas interiores (14-21) **pueden no
   existir todavía como escena modelada** — el estudio quizás nunca modeló
   los interiores porque el brochure no los necesitaba. Si es así, las 8
   tomas interiores no son "exportar de nuevo", son **trabajo nuevo de
   modelado y ambientación**, con otro precio y otro plazo. *Es la primera
   pregunta técnica que hay que hacerle al estudio.*
2. **Falta la cota de cada bloque** (ver sección 1). Sin eso, la altura de la
   toma aérea es una estimación.
3. **B1, B4 y B5 no tienen plantas de unidad publicadas** en el brochure. Si
   se vendieran unidades ahí con otra tipología, la lista de interiores crece.
4. **`F` (rincón de fuego) es la única geometría semi-manual** del masterplan
   (ver `tools/baleia/README.md`). Si su panorámica se va a enlazar desde ese
   hotspot, conviene redibujar el polígono a mano primero.
