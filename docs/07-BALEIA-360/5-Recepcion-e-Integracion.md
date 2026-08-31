# Baleia — cómo se reciben e integran las panorámicas

> Documento interno. El sistema **ya está construido y probado de punta a
> punta**: cuando lleguen los archivos, integrarlos es correr un comando, no
> desarrollar nada.

---

## El comando

```bash
cd tools/baleia

# 1) El recorrido base (masterplan + renders + unidades). Ya existía.
.venv/bin/python scripts/build_tour.py

# 2) Las panorámicas entregadas, encima.
../../packages/pipeline/.venv/bin/python scripts/integrate_panoramas.py \
    --in ~/Downloads/baleia-360 --publish
```

**Ojo con el intérprete:** el paso 2 corre con el venv de
`packages/pipeline`, no con el de `tools/baleia`. Necesita `py360convert` y
`numpy`, que el venv de Baleia no tiene (tiene las librerías de PDF).

**Antes de procesar nada, conviene ver qué va a hacer:**

```bash
../../packages/pipeline/.venv/bin/python scripts/integrate_panoramas.py \
    --in ~/Downloads/baleia-360 --dry-run
```

`--dry-run` lista, archivo por archivo, a qué escena va, con qué título y qué
hotspot del masterplan va a quedar apuntándole. No toca nada. Es lo primero
que hay que correr cuando llega una entrega: si algún archivo aparece bajo
`desconocidas`, el nombre está mal y conviene pedir que lo renombren antes de
gastar tiempo de procesamiento.

### Flags

| Flag | Para qué |
|---|---|
| `--dry-run` | Ver el plan sin tocar nada |
| `--publish` | Además de `out/tour/`, copiar a `apps/viewer/public/baleia/` y reescribir `public/tour.json` (lo que abre el visor en dev) |
| `--min-width N` | Bajar el piso de resolución. **Default 8192**, que es el piso contractual de la spec, no el del pipeline (4096) |
| `--skip-validation` | Generar tiles igual aunque la validación rechace. El veredicto queda escrito en `validation.json` de todos modos |
| `--strict-horizon` | Que la heurística de horizonte torcido también rechace, no sólo advierta |
| `--relink-blocks` | Que `h-B1..h-B5` salten a la panorámica del bloque en vez de abrir la ficha comercial. **Apagado por defecto**, ver abajo |
| `--tile-size`, `--face-size`, `--format` | Parámetros del tiler. Los defaults están bien |

---

## Qué hace, paso a paso

1. **Lee el nombre de cada archivo** y lo busca en la tabla `POINTS` del
   script, que es la lista de tomas de `1-Lista-de-Tomas.md` en código.
2. **Valida** con `packages/pipeline`: relación 2:1 exacta, ancho ≥ 8192, y la
   heurística de horizonte torcido. Deja el veredicto en
   `out/tour/scenes/{slug}/validation.json` **siempre**, apruebe o no.
3. **Genera los tiles** de cubemap multiresolución (6 caras × N niveles) y las
   previsualizaciones (`poster` 2048 px, `preview` 512, `thumbnail` 64).
4. **Agrega la escena al `tour.json`** con `kind: "panorama"`, la fuente de
   tiles y el `initialView` que fija la lista de tomas (yaw 0 = al mar).
5. **Re-enlaza los hotspots** del masterplan que correspondan.
6. Con `--publish`, copia todo y reescribe las URLs a `./baleia/…`.

### Reglas de comportamiento que vale la pena conocer

**Un archivo con nombre desconocido no se descarta.** Entra igual como escena
(slug derivado del nombre, sin enlace a ningún hotspot) y se reporta bajo
`desconocidas`. Misma regla dura que el resto del repo: nada desaparece en
silencio por un dato raro.

**Un archivo rechazado no genera tiles ni escena**, pero sí deja su
`validation.json` con el detalle de qué check falló. Ese archivo es material
para devolver, no para arreglar de nuestro lado.

**El horizonte torcido advierte pero no rechaza.** El check del pipeline es
una heurística declarada como tal: busca el borde de mayor contraste de la
banda central y asume que es el horizonte. En un complejo de bloques largos y
horizontales ese borde puede ser perfectamente el alero de una losa. Rechazar
una entrega buena por una heurística es peor que dejar pasar una torcida, que
se ve a simple vista en el `poster.webp`. `--strict-horizon` la endurece.

**Los amenities se re-enlazan solos.** Hoy `h-A/D/E/F/G` saltan al *render*
donde ese amenity se ve (era lo más parecido a "entrar" sin panorámicas).
Cuando llega la panorámica del mismo punto, el hotspot pasa a apuntarle. El
render sigue en la galería, no se pierde nada.

**La piscina cubre a la piscina infantil** mientras no llegue una toma
dedicada de `E`: `D_AMENITY_01` reclama `h-E` sólo si nadie más lo reclamó.
Si después llega `E_AMENITY_01`, la toma dedicada gana.

**Los bloques NO se re-enlazan por defecto**, y esto es una decisión, no un
olvido. Los hotspots `h-B1..h-B5` hoy abren la **ficha comercial** del bloque
(superficies, unidades, estado). Cambiarlos a "saltar a la panorámica" canjea
la ficha por la vista: se gana el 360 y se pierde el dato que convierte. La
respuesta correcta es un botón **"Ver en 360°"** dentro de la ficha, que es un
cambio del visor — está listado como lo primero a construir en
`6-Que-Cambia-en-la-Experiencia.md`. Mientras tanto, las panorámicas de
bloque se llegan desde la galería, y `--relink-blocks` está disponible si el
cliente prefiere explícitamente el salto directo.

---

## La prueba de punta a punta — **hecha, con estos resultados**

Se probó todo el circuito con panorámicas sintéticas generadas por
`pano-make-test` (el generador del propio pipeline: una grilla equirectangular
con marcas de yaw y pitch y franjas de color por cuadrante), haciendo de
sustituto de las reales.

**Entrada:** 6 archivos en una carpeta, elegidos para ejercitar todos los
caminos del script:

| Archivo | Ancho | Qué caso prueba |
|---|---|---|
| `MASTERPLAN_AEREA_01.png` | 8192 | Toma sin hotspot asociado |
| `B1_EXTERIOR_01.png` | 8192 | Bloque: **no** debe re-enlazar `h-B1` |
| `D_AMENITY_01.png` | 8192 | Re-enlace de `h-D` **y** reclamo de `h-E` |
| `G_AMENITY_01.png` | 8192 | Re-enlace de `h-G`, con `initialView` a 180° |
| `RECEPCION_INT-LOBBY_01.png` | 8192 | Nombre **desconocido**: no debe descartarse |
| `B5_EXTERIOR_01.png` | **4096** | Por debajo del mínimo: **debe rechazarse** |

**Resultado — todo lo esperado, sin excepciones:**

- **5 de 6 integradas.** `B5_EXTERIOR_01` rechazada por `min_resolution`, sin
  generar tiles ni escena, con su `validation.json` escrito. Exit code 1.
- **126 tiles por panorámica** (6 caras × 3 niveles, cara de 2048 px, tiles de
  512), **630 tiles en total**.
- **`RECEPCION_INT-LOBBY_01` no se perdió**: entró como escena
  `p-recepcion-int-lobby`, sin enlace, y salió reportada bajo `desconocidas`.
- **Re-enlaces**: `h-D` → `p-piscina` (toma dedicada), `h-E` → `p-piscina`
  (cubierto por la toma vecina), `h-G` → `p-laguna`. **`h-B1` quedó intacto
  en `{kind: "unit"}`**, como corresponde sin `--relink-blocks`.
- El `tour.json` pasó de **8 a 13 escenas**; el visor mostró **"Vistas 12"**.
- **Tiempo:** **22 segundos** de reloj para las 6 (≈4 s por panorámica de
  8192 px) en un MacBook, con el tiler paralelizado.
- **Peso:** **≈840 KB por escena** con estas panorámicas sintéticas. **Ojo:
  son colores planos y comprimen muchísimo mejor que un render fotorrealista.
  [Estimado]** para material real a 8192 px: del orden de **3-5 MB por
  escena**, o sea **45-75 MB** para el set completo de 14-20 tomas.

**Verificación en el navegador** (vite dev en `localhost:5183`):

- Se abrió el masterplan, se clickeó el hotspot **G** (laguna): saltó a la
  panorámica, título "Laguna", contador `11/12`, tiles cargando.
- Se volvió al masterplan con la flecha de atrás: volvió a la escena inicial
  con todos sus polígonos y el hash en `#/scene/masterplan`.
- Se clickeó el hotspot **D**: el visor ofreció el desambiguador ("Hay más de
  un lote acá": D y F se superponen), se eligió **Piscina** y entró a
  `p-piscina`.
- **Los dos `initialView` se verificaron a ojo y son correctos**: `p-piscina`
  abrió centrada en la marca `yaw 180` del panorama de prueba (que en la
  proyección del cubemap es el frente, yaw 0 del visor — lo esperado para
  `yaw: 0`), y `p-laguna` abrió sobre la costura, o sea 180° girada, lo
  esperado para su `yaw: π`.
- **0 errores de consola. 0 requests de tile fallidas** (verificado con
  `performance.getEntriesByType('resource')`).
- El recorrido se **dejó exactamente como estaba**: se borró
  `out/tour/scenes/`, se regeneró y republicó el tour base, y se restauraron
  los dos archivos versionados. `git status` quedó limpio salvo el script
  nuevo.

### Lo que la prueba encontró y todavía no está resuelto

**Las panorámicas entran a la galería sin miniatura.** El visor deriva la
miniatura de la escena de `source.url` (`apps/viewer/src/ui.ts`,
`renderGallery`), y una escena de tiles no tiene `url`, tiene `base`: el
`<img src>` queda en `""`. Se comprobó en el navegador — las 7 escenas de
render traen su `.thumb.webp` y las 5 panorámicas traen `src: ""`.

Es un bug del **visor**, no del script. El script ya deja el archivo listo:
emite `poster.thumb.webp` en la carpeta de cada escena, con la misma
convención de nombre (`X.webp` → `X.thumb.webp`) que el visor ya usa para
todo lo demás. Arreglarlo es una línea en `renderGallery`. Está anotado como
lo segundo a construir en `6-Que-Cambia-en-la-Experiencia.md`.

---

## Estructura que queda en disco

```
tools/baleia/out/tour/
  tour.json                       ← ahora con las escenas panorama
  availability.json
  masterplan.webp
  media/renders/…  media/plantas/…
  scenes/
    p-piscina/
      tiles/
        tiles.json                ← faceSize, tileSize, levels, base
        front/0/0_0.webp  front/1/…  front/2/…
        right/  back/  left/  up/  down/
      poster.webp                 ← 2048 px, fallback y preview grande
      poster.thumb.webp           ← 400 px, para la galería (ver arriba)
      preview.webp                ← 512 px
      thumbnail.webp              ← 64 px
      validation.json             ← el veredicto, apruebe o no
      manifest.json               ← trazabilidad: archivo fuente, tiles, fecha
    p-laguna/  p-b1/  …
```

`out/` no está versionado: correr los scripts siempre lo regenera.

---

## Cómo se ve una escena panorama en el `tour.json`

```jsonc
{
  "id": "sc-p-piscina",
  "slug": "p-piscina",
  "kind": "panorama",
  "name": "Piscina",
  "source": {
    "base": "./scenes/p-piscina/tiles",   // RELATIVO al tour.json
    "faceSize": 2048, "tileSize": 512, "levels": 3, "format": "webp"
  },
  "initialView": { "yaw": 0, "pitch": 0, "fov": 90 },  // yaw/pitch en radianes, fov en grados
  "sort": 120
}
```

El `base` es **relativo al `tour.json`**, no absoluto. Es la diferencia con lo
que escribe `pano-run` (que emite `/t/{tenant}/{proyecto}/v{N}/…`, pensado
para la raíz de un bucket R2) y es lo que hace que el recorrido funcione
servido desde `/baleia/`, desde un embed o desde un preview del panel. El
razonamiento completo está en el docstring del script, decisión 1.

---

## Cuando llegue una entrega — checklist

1. `--dry-run` primero. ¿Hay `desconocidas`? Pedir renombrado antes de seguir.
2. Correr sin `--publish` y leer el reporte: `rechazadas` es la lista de
   archivos a devolver al estudio, con el check que falló.
3. Abrir el `poster.webp` de cada escena aprobada y **mirarla**. La validación
   automática no ve si el encuadre está mal, si falta un mueble o si el mar
   quedó de espaldas.
4. Verificar los `initialView`: si el estudio no respetó la regla de "yaw 0 =
   al mar", hay que corregir el yaw de esas escenas en la tabla `POINTS` del
   script en vez de pedir un re-render — es más barato.
5. `--publish` y revisar en el navegador escena por escena.
6. Recién ahí, avisarle al cliente.
