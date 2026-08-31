> **DOCUMENTO PARA REENVIAR TAL CUAL AL ESTUDIO DE RENDERS DE BALEIA.**
> Es la especificación general de `01-CLIENTE/3-Especificacion-Tecnica-para-Estudio-de-Renders.md`
> con los valores concretos ya decididos para este proyecto: nombres de
> archivo reales, orientación de cámara, alturas y lista de tomas.
> **Reemplaza a ese documento para Baleia, no se manda además de él.**

# Baleia — especificación técnica para las panorámicas 360°

Punta Ballena, Uruguay. Complejo de 5 bloques.

Este documento tiene todo lo necesario para renderizar y entregar. Si algo no
está claro, **preguntar antes de renderizar**: una toma mal encuadrada se
descubre después de horas de render y hay que rehacerla entera.

---

## 1. Parámetros no negociables

| Parámetro | Valor |
|---|---|
| Resolución **mínima** | **8192 × 4096 px** |
| Resolución **ideal** | **12288 × 6144 px** |
| Relación de aspecto | **2:1 exacta** (ancho = 2 × alto, sin un píxel de diferencia) |
| Proyección | Equirectangular esférica (360° horizontal × 180° vertical) |
| Horizonte | Nivelado — **pitch 0°**, sin inclinación de cámara |
| Formato de archivo | **PNG 16-bit**, o **EXR** (preferido si van a hacer ajuste tonal después) |
| Postproducción | **Ninguna** que toque los bordes izquierdo y derecho de la imagen: son el mismo punto del espacio y tienen que empalmar sin costura |

**El mínimo de 8192 px no es negociable y se verifica automáticamente.**
Nuestro pipeline rechaza y devuelve cualquier archivo por debajo de eso: a
menos resolución, cuando el visitante hace zoom en la vista al mar (que es
justo lo que va a hacer), ve píxeles.

**Por qué importa cada punto:** el visor interpreta la imagen como una esfera
completa. Si la relación no es exactamente 2:1, la imagen se deforma al
proyectarse. Si el horizonte no está a pitch 0, el visitante ve el mar
torcido al girar. Si hay recorte o ajuste de perspectiva en los bordes,
aparece una costura visible donde la imagen da la vuelta.

---

## 2. Orientación de cámara — **la regla propia de Baleia**

> **El centro horizontal exacto de la imagen equirectangular tiene que mirar
> al MAR (este).**

En un equirectangular, el centro horizontal de la imagen es el frente de la
cámara. Toda toma que tenga vista al mar se exporta con la cámara mirando al
este, de modo que **el mar quede en el centro de la imagen**.

Esto no es un capricho estético: el visor abre cada escena mirando al centro
de la panorámica. Si todas las tomas comparten la misma referencia, el
visitante recorre el complejo entero y **el mar siempre está adelante**, sin
tener que buscarlo girando. Si cada toma tiene una orientación distinta, hay
que corregir 20 escenas a mano de nuestro lado y la sensación de recorrido se
rompe.

**Las dos únicas excepciones**, marcadas en la tabla de la sección 5:

- `ACCESO_EXTERIOR_01` — mira **hacia el complejo** (tierra adentro, hacia el
  este pero desde afuera del acceso), porque la toma es la llegada.
- `G_AMENITY_01` (laguna) — mira **hacia el oeste, de vuelta al complejo**.
  Es el mismo encuadre del render `complejo1.jpg` que ya está aprobado.

**Altura de cámara: 1,60 m** sobre el nivel de piso terminado en todas las
tomas peatonales e interiores. Un único valor para todas, a propósito: si
cada punto tiene su altura, el recorrido "salta" al cambiar de escena. La
única excepción es el rincón de fuego (`F_AMENITY_01`), a **1,20 m**, porque
es un espacio para estar sentado y a 1,60 se ve desde arriba.

Las alturas de las tomas aéreas están en la tabla de la sección 5.

---

## 3. Nomenclatura de archivos — **obligatoria**

```
[PUNTO]_[TIPO-DE-VISTA]_[NUMERO].png
```

El nombre de archivo **no es una etiqueta, es el dato que carga cada
panorámica en su lugar del recorrido**. Un archivo bien nombrado entra solo;
uno mal nombrado entra como escena suelta, sin conexión con el plano, y hay
que renombrarlo y recargarlo.

Los códigos `B1`..`B5`, `A`, `D`, `E`, `F`, `G` y `B2-A`/`B3-D` **son los
mismos del masterplan del brochure (página 6) y de la planilla de unidades.**
No cambiarlos, no abreviarlos, no traducirlos.

**La lista completa de nombres válidos es la columna "Archivo" de la sección
5.** No hay que inventar ninguno: si hace falta un nombre que no esté ahí,
consultarnos antes de renderizar.

Detalles:

- **Mayúsculas y guiones exactamente como figuran.** `B2-A_INT-LIVING_01.png`,
  no `b2a_living_1.png` ni `B2 A Living.png`.
- **El `_01` final** es el número de toma. Si de un mismo punto entregan dos
  variantes (por ejemplo día y amanecer), la segunda va `_02`. Nunca dos
  archivos con el mismo nombre.
- **Sin espacios, sin acentos, sin ñ** en el nombre de archivo.

---

## 4. Exportación por software

Igual que en la especificación general. Lo único que cambia es la
resolución y la orientación, ya fijadas arriba.

### Blender
1. Cámara → **Object Data Properties → Lens → Type: Panoramic**.
2. Dentro de Panoramic → **Panorama Type: Equirectangular**.
3. Cámara perfectamente nivelada: **rotación en el eje de inclinación (pitch)
   en 0**, sin tilt. Girar en Z hasta que el mar quede al frente (ver
   sección 2).
4. Motor: Cycles (recomendado) o Eevee.
5. Output Properties → Resolution **12288 × 6144** (o 8192 × 4096 mínimo),
   Aspect Ratio 1:1.
6. Formato: **PNG 16-bit RGB** u **OpenEXR 32-bit float**.
7. Renderizar y exportar. **No recortar ni reescalar después.**

### Twinmotion
1. Ubicar la cámara en el punto, nivelada (sin tilt vertical).
2. **Export → Panorama → 360° Equirectangular**.
3. Resolución **12288 × 6144** (o 8192 × 4096).
4. Formato PNG, calidad máxima.
5. **Sin efectos de postproceso dependientes de cámara** (viñeteado,
   distorsión de lente).

### Lumion
1. Modo **360 Panorama**.
2. Cámara a la altura indicada en la tabla, nivelada.
3. Resolución de salida **12288 × 6144** (o 8192 × 4096).
4. PNG de máxima calidad.
5. Sin viñeteado ni profundidad de campo.

### 3ds Max + V-Ray o Corona
No está en la especificación general, así que va acá: usar la **cámara VR
spherical / panorámica 360° equirectangular**, que es una opción estándar de
ambos motores. En V-Ray, `VRayCamera` con `Type: Spherical` y `override FOV
360°`; en Corona, `CoronaCameraMod` con `Projection: Spherical`. Fijar la
resolución 2:1 a mano — **el preset de aspecto por defecto no es 2:1 y es el
error más común en este flujo**.

### SketchUp + Enscape
Enscape exporta panorámicas 360 desde su propia barra
(*Create Panorama* → *Export Panorama*), pero **la resolución por defecto está
muy por debajo de nuestro mínimo**: hay que subirla explícitamente en
*Enscape Settings → Capture → Resolution*. Verificar el archivo resultante
antes de entregar.

---

## 5. Las tomas

`M` = mínimo (8 tomas: el recorrido funciona) · `R` = recomendado (14) ·
`C` = completo (20). **Si el presupuesto o el tiempo aprietan, avisen y
hacemos sólo el mínimo** — está elegido para que el recorrido cierre igual.

Altura, salvo aclaración: **1,60 m**. Orientación (yaw 0), salvo aclaración:
**al mar (este)**.

### Conjunto

| Archivo | Set | Cámara | Altura | Tiene que verse |
|---|---|---|---|---|
| `MASTERPLAN_AEREA_01.png` | **M** | Sobre el eje del terreno, a la altura de Bloque 3 | **90 m sobre la cota de B3** | Los 5 bloques escalonados, los amenities y la laguna, la Ruta 10 y, en el horizonte, el mar, isla Gorriti y la península |
| `MASTERPLAN_AEREA-BAJA_01.png` | C | Mismo eje, sobre Bloque 3 | **35 m** | El escalonado de cerca, los techos verdes, los parkings |
| `ACCESO_EXTERIOR_01.png` | **M** | Acceso desde Carlos Páez Vilaró (punto A del masterplan) | 1,60 m | **Excepción de orientación: mira hacia el complejo, no al mar.** El portal, el camino interior bajando, Bloque 1 a la derecha |
| `CIRCULACION_EXTERIOR_01.png` | R | Camino interior, entre Bloque 2 y Bloque 3 | 1,60 m | El parking integrado al parque, el camino bajando, los dos bloques a los costados |

### Un exterior por bloque

Los cinco con el mismo criterio: **cámara en el césped del lado de la vista
(este), a unos 8 m del frente del bloque.** El visitante ve la fachada, gira
180° y se encuentra con el mar. **En las tomas de B1 a B4 tiene que verse el
mar por encima del techo verde del bloque de más abajo** — es la prueba
visual del escalonado y es el argumento de venta central del proyecto.

| Archivo | Set |
|---|---|
| `B1_EXTERIOR_01.png` | **M** (el bloque más alto) |
| `B2_EXTERIOR_01.png` | R |
| `B3_EXTERIOR_01.png` | R |
| `B4_EXTERIOR_01.png` | R |
| `B5_EXTERIOR_01.png` | **M** (el más bajo, el más cerca del mar y de los amenities) |

### Amenities

| Archivo | Set | Cámara | Altura | Tiene que verse |
|---|---|---|---|---|
| `D_AMENITY_01.png` | **M** | Cabecera de la piscina, sobre el deck | 1,60 m | La piscina completa, el clubhouse, y la piscina infantil al lado |
| `E_AMENITY_01.png` | opcional | Piscina infantil | 1,60 m | La piscina infantil y su relación con la grande. **Sólo si la piden expresamente**: la toma de la piscina ya la cubre |
| `F_AMENITY_01.png` | C | Rincón de fuego, entre las pérgolas | **1,20 m** | Las pérgolas, los fogones, la laguna al fondo |
| `G_AMENITY_01.png` | **M** | Deck perimetral de la laguna | 1,60 m | **Excepción de orientación: mira al oeste, de vuelta al complejo** (el encuadre del render `complejo1.jpg`). La laguna adelante y el complejo entero detrás |

### Interiores — una unidad tipo de cada tipología

Dos tipologías: **dúplex** (unidad tipo: **B2-A**) y **1 dormitorio** (unidad
tipo: **B3-D**). No hacen falta las 20 unidades.

**En los ocho puntos, yaw 0 = la abertura a la terraza.** Lo primero que ve
el visitante al entrar tiene que ser la vista, no una pared.

| Archivo | Set | Ambiente |
|---|---|---|
| `B2-A_TERRAZA_01.png` | R | Terraza del dúplex, con el parrillero propio y el mar |
| `B2-A_INT-LIVING_01.png` | **M** | Living/comedor, con la abertura a la terraza y el mar a través de ella |
| `B2-A_INT-DORM_01.png` | C | Dormitorio principal |
| `B2-A_INT-COCINA_01.png` | C | Cocina |
| `B3-D_TERRAZA_01.png` | R | Terraza del 1 dormitorio |
| `B3-D_INT-LIVING_01.png` | **M** | Living/comedor |
| `B3-D_INT-DORM_01.png` | C | Dormitorio |
| `B3-D_INT-COCINA_01.png` | C | Cocina |

---

## 6. Qué **NO** hacer

Cada punto de esta lista es un motivo de devolución. No se corrigen de nuestro
lado, porque arreglar una panorámica mal exportada siempre degrada la imagen.

- ❌ **No entregar por debajo de 8192 px de ancho.** Se rechaza automáticamente.
- ❌ **No entregar con relación distinta de 2:1.** Si el archivo quedó
  8192 × 4320, hay un error de configuración de resolución.
- ❌ **No inclinar la cámara.** Ni un grado. Aunque el encuadre "quede mejor"
  con un poco de tilt hacia abajo: en proyección esférica eso curva el
  horizonte y no hay forma de arreglarlo después.
- ❌ **No aplicar viñeteado, profundidad de campo, distorsión de lente ni
  grano.** Se ven bien en el preview plano y generan artefactos severos en la
  esfera — el viñeteado en particular deja manchas oscuras flotando en el
  cielo.
- ❌ **No recortar, reencuadrar ni reescalar** la imagen después del render.
- ❌ **No entregar JPG.** PNG 16-bit o EXR.
- ❌ **No entregar en 8-bit** si el render tiene cielo con degradé: se banda.
- ❌ **No renombrar los archivos** ni "mejorar" la nomenclatura. Los nombres
  de la sección 5 son literales.
- ❌ **No entregar el tour armado en un visor propio** (link de Twinmotion
  Cloud, de Lumion, de Kuula, etc.). Necesitamos **el archivo
  equirectangular**, no el visor — un link no se puede integrar al recorrido.
- ❌ **No comprimir en ZIP fragmentado** (`.z01`, `.z02`...). Un ZIP entero o
  una carpeta compartida.

---

## 7. Antes de entregar — checklist

Cinco minutos acá ahorran una semana de ida y vuelta.

- [ ] Abrir cada archivo y **mirar las propiedades**: ¿el ancho es ≥ 8192 y
      exactamente el doble del alto? (Verificar en el archivo, no en el
      setting de render: algunos motores reescalan al exportar.)
- [ ] **Horizonte recto** en el centro vertical de la imagen, sin inclinación.
- [ ] **El mar está en el centro horizontal** de la imagen (salvo las dos
      excepciones de la sección 2).
- [ ] **Costura:** mirar el borde izquierdo y el derecho. Tienen que empalmar
      sin salto de color ni desalineación.
- [ ] **Nombres de archivo** exactamente como la sección 5, sin espacios ni
      acentos.
- [ ] **Sin efectos de postproceso** de los listados en la sección 6.

**Sugerencia que ahorra tiempo a todos: manden primero una sola toma de
prueba.** La validamos el mismo día y confirmamos que la configuración está
bien antes de que le dediquen horas de render al resto. Es gratis y es la
diferencia entre una ronda de corrección y seis.

---

## 8. Cómo entregar

- **Un archivo por panorámica**, en una carpeta compartida (Drive, Dropbox,
  WeTransfer). Nada de mail: son archivos de 50-200 MB cada uno.
- Una **planilla simple** (CSV o Excel) con una fila por archivo entregado:
  nombre de archivo, qué punto es, y cualquier observación. Agiliza mucho la
  carga y sirve de acuse de recibo.
- Si pueden: **las coordenadas de cámara** de cada toma (posición y rotación
  en el modelo). Con eso, si más adelante piden ajustar un encuadre, se
  regenera esa toma puntual sin rehacer nada.
- Si pueden: **el archivo del modelo**. No es obligatorio, pero nos permite
  resolver una toma extra sin volver a molestarlos.
