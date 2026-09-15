# Levantar el proyecto en otra máquina

Qué hacer después de `git clone`, y —más importante— **qué NO viene en el
clon** y cómo conseguirlo.

---

## 1. Lo que el repositorio NO trae

Cuatro cosas quedan fuera a propósito, y sin ellas el recorrido no se ve:

| Qué | Peso | Por qué no está | Cómo se consigue |
|---|---|---|---|
| `elementos baleia/` | **2,8 GB** | Originales del cliente. GitHub no es para esto. | Copiar a mano desde la máquina original o desde donde los guarde el cliente. |
| `apps/viewer/public/baleia/` | 70 MB | Generado. | Se regenera (paso 4). |
| `tools/baleia/out/` | 121 MB | Generado. | Se regenera (paso 4). |
| `apps/viewer/dist/` | 71 MB | Compilado. | `pnpm --filter @r360/viewer build`. |

**Lo que SÍ viaja** y alcanza para reconstruir el recorrido:

- `tools/baleia/material/` — fotos, planos, renders y marca, ya optimizados.
- `tools/baleia/material-real/` — las 26 fotos de obra curadas para web.
- `tools/baleia/material-360/` — **las 15 panorámicas 8192×4096 ya procesadas
  y nombradas**, listas para el pipeline. Son la entrega, no el crudo.
- Todo el código, los scripts y los documentos.

Los `.insp` crudos de la cámara (255 MB, el ZIP de Albisu) tampoco están: ya
no hacen falta, porque las panorámicas procesadas sí viajan. Si algún día hay
que reprocesarlas —por ejemplo con el export nivelado de Insta360 Studio—, se
corre `stitch_insp.py` sobre el ZIP original.

---

## 2. Requisitos

- **Node** 20+ y **pnpm**
- **Python 3.9** para el pipeline de panorámicas. El `pyproject` de
  `packages/pipeline` lo pide explícitamente (`>=3.9,<3.10`); con 3.12 la
  instalación del paquete falla.
- **ffmpeg** en el PATH. `build_tour.py` lo usa para medir el video y **no
  tiene forma de saltearlo**: sin ffmpeg, corta con un error de "archivo no
  encontrado" que no dice que falta ffmpeg.

---

## 3. Instalar

```bash
pnpm install
```

El visor sirve para desarrollar sin nada más:

```bash
pnpm --filter @r360/viewer exec vite --port 5183
```

Pero hasta el paso 4 va a abrir sin recorrido: el `tour.json` publicado no
está en el repositorio.

---

## 4. Reconstruir el recorrido

```bash
# 1. El venv del pipeline, con Python 3.9 (NO con el 3.12 del sistema)
python3.9 -m venv packages/pipeline/.venv
packages/pipeline/.venv/Scripts/python.exe -m pip install -e packages/pipeline

# 2. El recorrido base: masterplan, renders, unidades, video
cd tools/baleia
.venv/Scripts/python.exe scripts/build_tour.py

# 3. Las panorámicas encima
../../packages/pipeline/.venv/Scripts/python.exe scripts/integrate_panoramas.py \
    --in material-360 --publish
```

En Linux o macOS, `Scripts/python.exe` es `bin/python`.

`--publish` copia a `apps/viewer/public/baleia/` y reescribe
`public/tour.json`, que es lo que abre el visor en desarrollo.

---

## 5. Lo que se sabe que falla

- **`tools/baleia/out/baleia_hotspots.geojson` en cp1252.** `build_tour.py`
  lo lee como UTF-8 y corta con `UnicodeDecodeError` en "Rincón de fuego". El
  archivo está en `out/`, que no se versiona, así que en un clon nuevo se
  regenera y el problema puede no aparecer. Si aparece, se convierte a UTF-8.
- **Sin ffmpeg**, el paso 2 corta sin explicar por qué (ver §2).
- **Con Python 3.12**, `pip install -e packages/pipeline` falla por la
  restricción de versión del `pyproject`.

---

## 6. Ver el recorrido desde otro dispositivo

El build estático se sirve con cualquier servidor:

```bash
cd apps/viewer/dist && python -m http.server 8080 --bind 0.0.0.0
```

Y se abre desde el teléfono en `http://<ip-de-la-maquina>:8080`.

Para un link público hace falta un túnel (`cloudflared tunnel --url
http://127.0.0.1:8080`). **Ojo:** en algunas redes el DNS del router no
resuelve `api.trycloudflare.com` y el túnel falla con "no such host" aunque
internet funcione. Se arregla usando un DNS público (1.1.1.1 u 8.8.8.8).
