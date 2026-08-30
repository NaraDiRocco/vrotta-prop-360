# Spike de rendimiento — ¿aguanta Photo Sphere Viewer cientos de polígonos?

**Veredicto: sí. PSV aguanta 600 polígonos con holgura. El techo práctico está en
~1000-1200, y lo que lo fija no es el dibujo sino el DOM y el refresco de
disponibilidad.** El diseño del visor se sostiene sin culling, sin drill-down y
sin canvas propio. Detalle abajo.

---

## Cómo correrlo

```bash
pnpm --filter @r360/viewer dev
# → http://localhost:5173/spike/
```

Parámetros por query string:

| Parámetro | Valores | Default | Qué hace |
|---|---|---|---|
| `n` | 100 / 300 / 600 / 1000 | `300` | cantidad de polígonos sintéticos |
| `densify` | `1` / `0` | `1` | densificar con `densifyRing` |
| `step` | grados | `2` | paso de densificación |
| `layout` | `patch` / `sphere` | `patch` | sector de 140°x55° (loteo real) o esfera completa |
| `cull` | `1` / `0` | `0` | no montar los polígonos fuera del FOV |
| `stress` | `1` / `0` | `1` | rotación continua |

Ejemplo: `/spike/?n=600&layout=patch&densify=1&step=2`

La panorámica es un equirectangular 2:1 generado en canvas dentro de la página
(`panorama.ts`) — grilla de colores con marcas de yaw/pitch, sin descargar nada.
El HUD muestra todo en vivo y el botón **simular cambio de estado** hace el
refresco masivo. Desde consola hay un puente para automatizar:
`__spike.setN()`, `.setDensify()`, `.setLayout()`, `.setStep()`, `.setCull()`,
`.bulkUpdate()`, `.syncBench(frames)`, `.metrics()`.

## Metodología

El FPS por `requestAnimationFrame` **no es medible de forma confiable** en un
navegador controlado por herramientas: si la pestaña no está componiendo, rAF se
congela y el número da 0 o queda pegado en el último valor. Así que la medición
que decide el veredicto es `syncBench()`: un bucle cerrado que barre la cámara
por el sector y cronometra `MarkersPlugin.renderMarkers()`, que es exactamente el
trabajo que PSV hace por frame y por marcador — visibilidad, proyección
esfera→pantalla y reescritura del `d` de cada `<path>`. Eso da **ms de CPU por
frame atribuibles a los polígonos**, contra un presupuesto de 16.7 ms a 60 fps.

- Equipo: MacBook Apple Silicon, Chrome, viewport 1280x720 a `devicePixelRatio` 2.
- Layout `patch`: los N polígonos dentro de un sector de 140°x55° bajo el
  horizonte — cómo se ve un loteo real. **El ~90 % de los polígonos está en
  pantalla al mismo tiempo**, que es el peor caso. Con distribución sobre toda la
  esfera sólo ~1/8 está visible y los números salen ~5x mejores: sería hacerse
  trampa al solitario.
- Cada fila: 40 frames de calentamiento, luego dos tandas de 150 frames; se toma
  la mejor media.
- El FPS por rAF que sí se pudo observar directamente en pantalla a N=600 fue de
  **48-58 fps**, consistente con el modelo de CPU, pero es un número ruidoso.

---

## Resultados

### A. Densificado a 2°, sin culling — el caso de producción

| N | Vértices | Vért/polí | `densifyRing` | Montaje | **CPU/frame** | p95 | Refresco (1 render) | Refresco (render x N) |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 1 458 | 14.6 | 0.7 ms | 1.7 ms | **0.18 ms** | 0.3 ms | 1.6 ms | 2.1 ms |
| 300 | 2 730 | 9.1 | 1.6 ms | 3.7 ms | **0.47 ms** | 0.6 ms | 1.5 ms | 22.3 ms |
| 600 | 4 806 | 8.0 | 2.9 ms | 6.4 ms | **0.95 ms** | 2.0 ms | 3.4 ms | 71.5 ms |
| 1000 | 7 963 | 8.0 | 2.3 ms | 9.6 ms | **1.64 ms** | 3.3 ms | 6.5 ms | 183.4 ms |

El costo por frame es **lineal en N** (~1.6 µs por polígono) y el montaje inicial
también (~10 µs por polígono). Nada explota.

### B. Sin densificar — el costo real del teselado

| N | Vértices | CPU/frame sin densificar | CPU/frame con 2° | Sobrecosto |
|---:|---:|---:|---:|---:|
| 100 | 798 | 0.13 ms | 0.18 ms | +38 % |
| 300 | 2 399 | 0.37 ms | 0.47 ms | +27 % |
| 600 | 4 805 | 0.85 ms | 0.95 ms | +12 % |
| 1000 | 7 963 | 1.58 ms | 1.64 ms | +4 % |

Barrido del paso de densificación a N=600:

| `step` | Vértices | Vért/polí | `densifyRing` | CPU/frame |
|---|---:|---:|---:|---:|
| sin densificar | 4 805 | 8.0 | — | 0.99 ms |
| 2° | 4 806 | 8.0 | 2.6 ms | 1.05 ms |
| 1° | 7 848 | 13.1 | 3.7 ms | 1.19 ms |
| 0.5° | 13 003 | 21.7 | 2.2 ms | 1.73 ms |
| 0.25° | 23 566 | 39.3 | 4.4 ms | 2.21 ms |

**La densificación a 2° es prácticamente gratis, y a más lotes es más gratis
todavía.** Es contraintuitivo pero tiene una explicación simple: `densifyRing`
subdivide en función del tamaño *angular* de la arista, y en un loteo denso cada
lote mide menos de 2°, así que no se subdivide nada. Los 8.0 vértices por
polígono a N=600 y N=1000 son los vértices originales.

Corolario para el editor: quien paga la densificación es el **lote grande visto
de cerca**, que es justamente donde se nota el error de la recta en pantalla. El
paso de 2° está bien elegido; bajar a 0.5° duplica el costo por frame sin ganancia
visible.

### C. Culling por FOV — la mitigación, medida

Densificado a 2°, re-evaluando el conjunto montado cada 250 ms (el re-culling
entra dentro de la medición del frame):

| N | Nodos en DOM | CPU/frame sin culling | CPU/frame con culling | Ganancia |
|---:|---:|---:|---:|---:|
| 100 | 72 / 100 | 0.18 ms | 0.13 ms | −28 % |
| 300 | 156 / 300 | 0.47 ms | 0.20 ms | −57 % |
| 600 | 439 / 600 | 0.95 ms | 0.56 ms | −41 % |
| 1000 | 743 / 1000 | 1.64 ms | 1.16 ms | −29 % |

Funciona, pero **no hace falta todavía**: compra ~0.4 ms a N=600 a cambio de un
`setMarkers` completo cada 250 ms, de perder el hover mientras se remonta y de
una complejidad que hay que mantener. Queda documentado y medido para el día que
haga falta, no antes.

### D. Memoria

`performance.memory` reporta entre 8 y 27 MB de heap JS según el momento del GC,
sin correlación estable con N y sin crecimiento al remontar decenas de veces con
distintos N. No hay fuga de marcadores. La memoria no es el límite.

---

## El hallazgo que más importa: cómo se refresca la disponibilidad

Las dos últimas columnas de la tabla A son el mismo trabajo hecho de dos formas:

- `updateMarker(cfg, false)` para los N y **un solo** `needsUpdate()` al final:
  **6.5 ms** a N=1000.
- `updateMarker(cfg, true)`, es decir dejando que cada llamada repinte:
  **183.4 ms** a N=1000 — 28 veces más lento, y un bloqueo del hilo principal de
  casi dos décimas de segundo en cada refresco.

El camino ingenuo es el default de la API. A 600 lotes ya cuesta 71 ms, o sea un
tirón visible cada 60 segundos, para siempre, en todos los recorridos. Por eso
`src/availability.ts` difiende contra `availability.json` y sólo toca las
unidades que cambiaron, y `src/scenes.ts` pasa `render: false` en el bucle.

## Un pie de bala encontrado de paso

`densifyRing(ring, 0)` **cuelga la pestaña**: `densifyEdge` calcula
`ceil(omega / stepDeg)` = `Infinity` pasos y entra en un bucle infinito. Es fácil
de pisar desde una query string o desde un campo de configuración del editor. El
spike y `src/polygons.ts` lo blindan por su lado, pero convendría que
`@r360/core` valide `stepDeg > 0` en origen (fuera del alcance de esta carpeta).

---

## Veredicto y presupuesto

Un móvil de gama media es entre 4x y 6x más lento que este equipo en JS de un
solo hilo. Aplicando 5x sobre el presupuesto de 16.7 ms por frame:

| N | CPU/frame medido | Estimado gama media (5x) | % del presupuesto de 60 fps |
|---:|---:|---:|---:|
| 100 | 0.18 ms | ~0.9 ms | 5 % |
| 300 | 0.47 ms | ~2.4 ms | 14 % |
| **600** | **0.95 ms** | **~4.8 ms** | **28 %** |
| 1000 | 1.64 ms | ~8.2 ms | 49 % |

**¿PSV aguanta 600 polígonos? Sí, y sin pelearla:** a 600 lotes los marcadores se
comen algo más de un cuarto del presupuesto de frame en un teléfono de gama
media, dejando el resto para el render de three.js y el compositor. La
densificación a 2° se puede dejar prendida siempre.

**El techo está en ~1000-1200 polígonos por escena.** A N=1000 los marcadores ya
consumen la mitad del presupuesto y aparecen dos problemas que no son de dibujo:
1000 nodos SVG vivos en el DOM (que encarecen cualquier reflow de la página
anfitriona en un embed) y un refresco de disponibilidad que, si se hace mal, es
un bloqueo de 183 ms.

Plan si algún proyecto pasa ese techo, en este orden:

1. **Refresco disciplinado** — ya implementado. Es lo primero porque es gratis y
   es el costo más grande medido en todo el spike.
2. **Culling por FOV** — medido acá, −41 % de CPU por frame a N=600. Es el
   siguiente escalón, contenido y reversible.
3. **Drill-down por manzana** — a partir de ~1500 lotes. Deja de ser una
   optimización y pasa a ser una decisión de producto: nadie elige entre 1500
   polígonos en una pantalla de teléfono, así que agrupar por manzana y entrar
   mejora el rendimiento y la usabilidad a la vez.

**Canvas/WebGL propio: no.** No hay ningún número acá que lo justifique, y
costaría el hit-testing, los tooltips y la accesibilidad que el SVG del plugin ya
da resueltos.
