# Baleia — Render de la fachada desde el encuadre de la foto real

> **RESUELTO el 17/09/2026.** El resultado es
> `DSC05104-render-atardecer.webp`, ya enchufado como lado derecho del
> deslizador en `build_tour.py`. Lo que funcionó NO fue el prompt de la
> sección 1 de este archivo: fue reiluminar la imagen de paisajismo que ya
> estaba alineada. Ver la sección "Qué funcionó" al final antes de volver a
> generar nada.

Imagen de entrada: `ENTRADA-render-fachada.jpg` (1365×2048, 2:3) — es
`DSC05104.jpg` reescalada, sin retoque ni recorte.

**Qué se busca y por qué.** El deslizador antes/después del Tramo 2 compara la
fachada del Bloque 2 hoy contra su estado terminado. El render del estudio
(`material/renders/complejo4.jpg`) no sirve: está tomado desde más lejos y con
otro ángulo, así que al cruzar el divisor el edificio salta. La imagen de
paisajismo que hay (`DSC05104-paisajismo-baleia.webp`) sí tiene el ángulo
exacto, pero **se lee como foto**: es la foto real con pasto agregado, y por eso
la transición no se siente.

Lo que falta es una imagen que **se vea render** —que cante "esto es
proyecto"— pero desde el encuadre exacto de la foto. Así el edificio no se mueve
y lo que cambia es el lenguaje de la imagen: foto → render. Eso es lo que hace
hermosa la transición.

**La regla dura: la geometría no se toca.** Si el modelo mueve la losa, cambia
la altura de la baranda, agrega un piso o corre las aberturas, la imagen se
descarta. El valor de este par es que el edificio cae en el mismo píxel.

---

## 1) PROMPT PRINCIPAL

Architectural visualization render of the exact same building, same camera, same
framing, same lens: a low two-storey residential block of board-formed concrete
seen from below at an oblique corner angle, the cantilevered upper slab reaching
across the top of the frame, a frameless tempered-glass railing running along
the upper terrace, a recessed ground-floor loggia behind full-height dark-framed
glass doors, and a long linear concrete planter edging the paved terrace in the
foreground. Render the finished state: the raw site becomes a manicured deep
green lawn meeting the paved terrace in a clean edge, the linear planters are
full of native ornamental grasses and low silver-green shrubs, the flat roof
carries a green roof of soft ornamental grasses breaking the skyline, warm
interior lighting glows behind the glass on both floors, a slim continuous LED
strip lines the underside of each slab edge, the concrete is clean and evenly
board-marked, the glass is spotless and reflects the sky, slatted timber screens
and pale curtains are visible inside the openings. Light: calm twilight, blue
hour, a smooth sky gradient from deep blue at the top to pale rose and lilac near
the horizon, soft diffuse ambient light, no direct sun, no hard shadows, no lens
flare. Background: soft dark eucalyptus and pine canopy, gently rendered, slight
atmospheric depth. Palette of cool warm-grey concrete, deep green, pale rose
sky, warm amber interior light. Style: high-end architectural CGI in the manner
of V-Ray or Corona, physically based materials, clean matte finish, perfectly
level horizon, no chromatic aberration, no photographic grain, hyper-detailed,
crisp, serene, the look of a studio presentation render.

## 2) NEGATIVE PROMPT

photographic lens flare, sun flare, harsh sunlight, hard shadows, blown
highlights, photo grain, construction debris, rubble, loose rocks, bare dirt,
exposed soil, wooden stakes, cables, hoses, scaffolding, formwork, machinery,
people, workers, vehicles, text, captions, watermark, logo, UI, extra floors,
extra balconies, added storeys, changed roofline, moved windows, distorted
geometry, warped slabs, bent railings, different camera angle, wider shot,
zoomed out, cropped differently, tilted horizon, fisheye, cartoon, illustration,
oversaturated colors, HDR look, blur, low quality

## 3) AJUSTES

- **Modo:** imagen a imagen / restyle, **no** texto a imagen. La foto de entrada
  manda el encuadre.
- **Fidelidad estructural: alta.** En Higgsfield, la opción que preserva la
  composición al máximo. Si expone `denoise`/`strength`, empezar en **0.40** y
  no pasar de 0.55: más arriba el modelo reinterpreta la geometría. Si queda
  demasiado parecido a la foto (sigue leyéndose como foto), subir de a 0.05.
- **Relación de aspecto: 2:3 vertical.** El original ya es 2:3 exacto
  (2832×4240), así que no hay que recortar. Es la proporción que usa el
  deslizador.
- **Salida:** la mayor resolución disponible. Con 1365×2048 alcanza; más es
  mejor. El pipeline la reescala después.
- **Generar 3 o 4 variaciones** y elegir con este criterio, en este orden:
  1. La losa superior, la baranda de vidrio y las aberturas caen donde están en
     la foto.
  2. No apareció ningún piso ni balcón de más.
  3. Se lee como render, no como foto: cielo de atardecer limpio, sin destello,
     luz interior encendida.
  4. El césped llega al borde del pavimento sin cortes raros.

## 4) Cómo verificarla antes de usarla

Abrir la generada y `24_fachada_bloque2_atardecer_angulo.webp` en dos pestañas y
alternar rápido entre las dos. El edificio tiene que quedar quieto. Si parpadea
o se corre, descartar y volver a generar con la fidelidad más alta.

## 5) Cuando esté lista

Dejarla en esta carpeta y avisar. El pipeline la toma como lado derecho del par
`slider-paisajismo` en `build_tour.py` (`BEFORE_AFTER_PAIRS`), reemplazando a
`DSC05104-paisajismo-baleia.webp`. Los rótulos del deslizador pasan a decir
"Render del proyecto" en lugar de "Con el paisajismo terminado", porque ahí sí
es un render y conviene declararlo.


---

## Qué funcionó, y qué no (17/09/2026)

Modelo: **Nano Banana Pro** (`nano_banana_2`) vía el CLI de Higgsfield. Es el
único de los candidatos que ofrece `aspect_ratio: 2:3`, la proporción del par.
Flux Kontext solo llega a 3:4 y habría recortado. 4 créditos por imagen en 4k.

**No funcionó: generar el render desde la foto original.** Probado dos veces,
con el prompt descriptivo de la sección 1 y con una versión reescrita como
instrucción de edición. Las dos imágenes salieron hermosas y las dos
inservibles: el modelo reinterpreta la perspectiva. El edificio quedaba más
chico, la esquina corrida y la pendiente del techo mucho más pronunciada. Al
cruzar el divisor, saltaba.

**Funcionó: reiluminar la imagen que ya estaba alineada.**
`DSC05104-paisajismo-baleia.webp` ya tenía el ángulo exacto (porque salió de
esta misma foto) y ya tenía césped y plantas; lo único que le faltaba era
dejar de leerse como fotografía. Usándola como entrada y pidiendo **solo** el
cambio de luz —cielo de atardecer, quitar el destello, encender la luz
interior, tira de LED bajo las losas— el modelo no tuvo margen para mover la
geometría. El prompt exacto quedó en `prompt-reiluminar-atardecer.txt`.

**La regla que sale de esto:** cuantas menos cosas se le piden cambiar, mejor
conserva la estructura. Si hace falta otro par, el camino es en dos pasos —
primero una imagen alineada con el estado terminado, después la reiluminación —
y no una sola generación que tenga que resolver las dos cosas.

**Verificación que hay que hacer siempre:** componer la mitad izquierda de la
foto con la mitad derecha de la generada y mirar la costura. Si el borde de la
losa, la baranda y el pavimento no continúan, la imagen se descarta.
