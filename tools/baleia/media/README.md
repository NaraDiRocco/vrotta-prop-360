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
