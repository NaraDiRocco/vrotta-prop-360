# Video de Baleia — qué es cada archivo

Todos los originales están **fuera del repo** (`elementos baleia/`, `~/Desktop/Baleia ia/`).
Acá quedan sólo las versiones optimizadas para servir por web.

## `video/baleia-recorrido-real.mp4` — el recorrido real (Tramo 4)

Filmación real del predio y de la unidad terminada del Bloque 2, del **2 de
septiembre de 2026**. Abre con una aérea de drone y sigue con un paseo a pie:
cocina, living, terraza, escalera, dormitorio, y una toma donde se ve el
horizonte con el skyline de Punta del Este.

Es un **reel ya editado**: tiene un corte cada 1,5 a 2 segundos (unos 50 planos
en 83 s), medido con detección de escena. No es una toma continua. Las tomas
crudas largas existen pero todavía no se descargaron; valen más que el reel,
porque el reel ya descartó el 90 % de cada plano.

| Archivo | Resolución | Peso |
|---|---|---|
| original (fuera del repo) | 1080p a 20,2 Mbps | 200 MB |
| `baleia-recorrido-real.mp4` | 1080p | 28,1 MB |
| `baleia-recorrido-real.720.mp4` | 720p | 10,4 MB |
| `baleia-recorrido-real.poster.jpg` | 1280 px | 0,1 MB |

Se sirve la versión 720 en móvil y la 1080 en escritorio. Ambas con
`+faststart`: arrancan sin bajar el archivo entero. El póster es el cuadro
aéreo de apertura, para que el reproductor no muestre un rectángulo negro.

## `video/baleia-recorrido-real.vertical.mp4` — el mismo recorrido, corte vertical (celular)

La dueña pidió que las imágenes del recorrido fueran de altura completa en
celular; el video era la única pieza donde eso pedía material nuevo (el
horizontal de arriba, en 9:16, queda con bandas negras arriba/abajo o
recortado feo a los costados). **Es OTRO CORTE, no el horizontal rotado**:
dura 49,7 s contra los 82,8 s del horizontal, y tiene la marca "Baleia ·
Punta Ballena · Uruguay" incrustada en los primeros segundos del video —el
horizontal no la tiene.

| Archivo | Resolución | Peso | Bitrate |
|---|---|---|---|
| `baleia-recorrido-real.vertical.mp4` | 1080x1920 | 18,1 MB | 3,0 Mbps |
| `baleia-recorrido-real.vertical.720.mp4` | 720x1280 | 7,2 MB | 1,2 Mbps |
| `baleia-recorrido-real.vertical.poster.jpg` | 720x1280 | — | — |

Mismo criterio de compresión que el horizontal (720 en móvil, `+faststart`
verificado). Se emite en el manifiesto como `Scene.portrait`
(`packages/core/src/types.ts`), no como `mobileUrl`: `mobileUrl` es "mismo
corte, más liviano" y el reproductor dimensiona la caja con las medidas del
horizontal — un archivo 1080x1920 ahí queda encajonado. `portrait` trae sus
propias dimensiones y su propio póster para que el visor arme la caja con
las medidas reales de esta fuente (ver `build_tour.py::build_video_scene`,
decisión 18, y `apps/viewer/src/tour-rail.ts::renderVideo`).

## `video/baleia-01-principal.mp4` y `-02-respiracion.mp4` — el conjunto materializándose

Generados con **Higgsfield** a partir de la aérea real del Bloque 2 en obra
(los prompts están en `~/Desktop/Baleia ia/prompt-higgsfield-torres.md`).
10 segundos cada uno, de 48 MB a 3,5 MB.

**No abren el recorrido, y es a propósito.** La geometría del conjunto que
aparece al final no es el masterplan real: la IA la inventó, no leyó los
planos. Verificado mirando el último cuadro contra el masterplan. Sirven como
pieza atmosférica, nunca como representación del proyecto (ver
`docs/06-BENCHMARK/5-EXPERIENCIA-BALEIA.md` §2).

Para que puedan usarse como apertura habría que regenerarlos con un cuadro
final fiel — un render del conjunto desde el mismo ángulo que la aérea real —
que hoy no existe.
