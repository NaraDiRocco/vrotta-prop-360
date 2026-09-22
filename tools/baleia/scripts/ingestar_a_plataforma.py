#!/usr/bin/env python3
"""Carga la Baleia REAL (la que vive en archivos) como un proyecto de la
PLATAFORMA (la que vive en Supabase).

Hasta hoy convivían dos Baleia que no se conocían entre sí:

  · La real: `build_tour.py` lee `out/baleia_unidades.csv` (20 unidades) y
    `out/baleia_hotspots.geojson` (11 polígonos) y escribe un `tour.json`
    completo a mano, con `"tenant": "baleia"` hardcodeado como texto, sin
    ids, sin tocar ninguna base.
  · La plataforma: un esquema multi-tenant (supabase/migrations/) cuyo
    publicador (`apps/worker/src/routes/publish.ts`) arma exactamente ese
    mismo `tour.json` LEYENDO TABLAS.

Este script es el puente que faltaba: toma las tres fuentes reales (el CSV
comercial, el GeoJSON de geometría y el manifiesto ya construido) y las
escribe como filas de `tenants`, `projects`, `groups`, `unit_types`,
`units`, `unit_prices`, `scenes` y `hotspots`, en ese orden.

    python3 tools/baleia/scripts/ingestar_a_plataforma.py \
        --tenant dacal --project baleia --subdominio baleia          # en seco
    SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
    python3 tools/baleia/scripts/ingestar_a_plataforma.py \
        --tenant dacal --project baleia --subdominio baleia --aplicar

NO copia media (los ~100 MB de fotos, tiles y video van por rsync aparte) y
NO publica: mover el puntero de versión es trabajo de `/api/publish`, que se
dispara después y a mano.

------------------------------------------------------------------------
DECISIONES QUE VALE LA PENA DEJAR EXPLÍCITAS
------------------------------------------------------------------------

1. NADA DE TENANT HARDCODEADO. `build_tour.py` escribe `"tenant": "baleia"`
   porque para él "baleia" es el nombre del proyecto y punto. En la
   plataforma el tenant es la INMOBILIARIA (Dacal, Caetano, quien sea) y el
   proyecto es Baleia: son dos cosas distintas y la decisión de quién es el
   tenant todavía no está tomada. Por eso acá todo viene por argumento
   (`--tenant`, `--project`, `--subdominio`) y el script no tiene un default
   para ninguno de los tres. Si mañana el mismo recorrido se carga bajo otro
   tenant, es otra corrida, no otra versión del script.

2. LOS 5 BLOQUES SON `groups`, NO `units`. Acá está la diferencia de modelo
   más grande entre las dos Baleia, y conviene entenderla antes de mirar los
   números del resumen.

   El masterplan no tiene un polígono por unidad (no hay plantas por piso en
   el material). Tiene uno por BLOQUE. `build_tour.py` resuelve eso haciendo
   pasar cada bloque por una "unidad" del sistema de disponibilidad
   (`units["B2"] = {typeCode: "bloque", ...}`, `hotspot.unitCode = "B2"`,
   `action: {kind:'unit'}`), y así el polígono se pinta con el mismo pipeline
   de estados que cualquier lote — ver el punto 2 de su docstring. Es un
   truco deliberado y bien documentado, pero es un truco: B2 no es una
   unidad, es el contenedor de nueve.

   El esquema de la plataforma tiene la pieza correcta para esto: `groups`
   (0004_structure.sql) y `hotspot_target_kind = 'group'`
   (0006_scenes_hotspots.sql). Así que acá los bloques se cargan como lo que
   son —cinco `groups` de `kind='bloque'`— y sus hotspots apuntan al grupo.
   Las 25 "unidades" del manifiesto se convierten en 20 `units` reales + 5
   `groups`.

   EL COSTO, QUE HAY QUE SABER: el publicador de hoy
   (`buildManifestFromSupabase`) sólo sabe traducir `target_kind='unit'` a
   una acción; para `target_kind='group'` emite `unitCode: null` y ninguna
   `action`. O sea: cargado así y publicado hoy, los cinco bloques del
   masterplan pierden el color de estado (el visor los toma por informativos,
   `isInformationalHotspot` en packages/core/src/status.ts) y dejan de ser
   clickeables. Eso NO es algo que este script pueda arreglar sin mentir
   sobre el modelo de datos: es un agujero del publicador, y está anotado
   como tal en el informe. Cargar los bloques como `units` para tapar ese
   agujero habría escondido el problema real y ensuciado `units` con cinco
   filas que no son unidades vendibles (y que además aparecerían en
   `availability.json`, que se arma leyendo `units` — ver 0013).

3. LOS AMENITIES SON HOTSPOTS DE ESCENA, EL PERÍMETRO ES INFORMATIVO. Los
   cinco amenities (A/D/E/F/G) llevan en el manifiesto `action: {kind:'goto',
   sceneSlug}` al render donde ese amenity se ve; eso es exactamente
   `target_kind='scene'` + `target_scene_id`, y el publicador SÍ sabe
   reconstruirlo. El perímetro del terreno no tiene acción ninguna:
   `target_kind='info'`, que es el único valor del enum que no exige target.

4. LA GEOMETRÍA SALE DEL GEOJSON, NO DEL MANIFIESTO — y se comparan. El
   GeoJSON es la fuente (lo produce `extract_geometry.py` y está verificado
   visualmente contra el plano); el manifiesto es una copia derivada. Se lee
   la geometría del GeoJSON con la misma conversión que usa `build_tour.py`
   (`anillo_a_px`: se descarta el vértice repetido del cierre y se redondea a
   5 decimales) y después se CONFRONTA contra la del manifiesto. Si difieren,
   el script aborta: significa que el `tour.json` quedó viejo respecto del
   GeoJSON, y cargar la geometría vieja o la nueva sin avisar sería elegir a
   ciegas cuál de las dos Baleia tiene razón.

5. LOS ESTADOS: TRES MAPEAN SOLOS, ONCE VIENEN VACÍOS. El CSV trae `estado`
   sólo para Bloque 2 (`disponible`, `bloqueado`, `vendido`, que son
   literalmente valores del enum `unit_status` y se copian tal cual). Las 11
   unidades de Bloque 3 tienen la columna VACÍA, porque de ese bloque no hay
   lista de precios todavía.

   Vacío no es "no mapea": es "no hay dato". Y la columna `units.status` es
   `not null` — la plataforma no tiene forma de decir "sin estado". El dato
   que falta en el CSV existe igual, sólo que en otro lado: el brochure marca
   Bloque 1 y Bloque 3 como "PRÓXIMAMENTE", y desde
   `0017_unit_status_proximamente.sql` ese es un estado de PRIMERA CLASE del
   enum. Así que se reusa esa misma regla, que ya está tomada y revisada en
   `build_tour.py` (`BLOCKS_PROXIMAMENTE`), en vez de inventar una nueva:
   `ESTADO_SIN_DATO_POR_BLOQUE`. Para cualquier OTRO bloque sin estado el
   script aborta y pide `--estado-faltante`: no se le adivina el estado a un
   bloque del que nadie dijo nada.

6. LOS CAMPOS EDITORIALES VAN A `projects.settings`, Y SE FUSIONAN. Los cinco
   tramos del recorrido (`photoTour`), el brochure (`brochurePages`), el logo
   (`brandLogo`) y el CTA de WhatsApp (`contact`) no tienen tabla propia: el
   publicador los saca de `projects.settings` con `pickManifestOverrides`
   (publish.ts). Son, en volumen, el trabajo entero del recorrido — perderlos
   sería perder el proyecto.

   `settings` es además donde el PANEL guarda su propia configuración
   (`initial_scene_id`, `allowed_domains`, ver 0012). Por eso este script
   nunca PISA la columna: lee la que hay, le encima sus claves y escribe la
   fusión. Correrlo no puede borrarle al panel una configuración que este
   script ni sabe que existe.

7. LAS URLS SE DESPEGAN DEL PREFIJO DE DESARROLLO. `apps/viewer/public/
   tour.json` tiene las rutas con `./baleia/` adelante porque el visor lo
   sirve desde la raíz de `public/` y la media cuelga de `public/baleia/`. En
   la plataforma el manifiesto y su media comparten carpeta
   (`t/{tenant}/{project}/v{N}/`, ver `r2Paths` en apps/worker), que es
   justamente la forma que tiene `out/tour/tour.json`. Así que toda ruta que
   empiece con el prefijo se le despega, recursivamente y en todo el
   documento (`--prefijo-publicado`, `./baleia/` por defecto; pasar cadena
   vacía lo desactiva). Es un barrido genérico sobre strings a propósito: un
   campo aditivo nuevo en el manifiesto (un póster, una miniatura) queda
   normalizado sin que haya que acordarse de agregarlo a una lista.

8. IDEMPOTENTE POR CLAVE NATURAL, CON UN LEE-Y-DECIDE EN VEZ DE UPSERT CIEGO.
   Se lee lo que ya hay, se compara columna por columna y recién entonces se
   inserta o se actualiza. Un upsert `merge-duplicates` de PostgREST habría
   sido una línea, pero pisa TODAS las columnas de la fila: sobre `tenants`
   le borraría el `settings` a un tenant que ya existe, y sobre `groups` ni
   siquiera es posible (su unicidad es un índice por expresión sobre
   `coalesce(parent_id, ...)`, que `on_conflict` no acepta). Además, leer
   primero es lo que permite decir en el resumen cuántas filas se crean,
   cuántas cambian y cuántas quedan igual, que es la diferencia entre "corrió
   bien" y "sé qué hizo".

   Claves naturales usadas: `tenants.slug`, `projects(tenant_id, slug)`,
   `groups(project_id, code)`, `unit_types(project_id, code)`,
   `units(project_id, code)`, `scenes(project_id, slug)`. `hotspots` no tiene
   ninguna (su único índice único es `(scene_id, unit_id)`, y nuestros
   hotspots no apuntan a unidades), así que se les graba el id de origen en
   `meta.sourceId` — el `h-B2`/`h-TERRENO` del manifiesto — y esa es la clave
   con la que se los vuelve a encontrar en la corrida siguiente.

9. LOS PRECIOS SE VERSIONAN, NO SE PISAN. `unit_prices` tiene vigencia
   (`valid_from`/`valid_to`, 0005) y ninguna clave única: es un historial, no
   una tabla de una fila por unidad. Reinsertar en cada corrida duplicaría el
   historial; sobrescribir la fila borraría el precio anterior, que es
   justamente lo que la tabla existe para conservar. Así que: si el precio
   vigente ya es el mismo (importe, moneda y visibilidad), no se toca nada; si
   cambió, se le pone `valid_to = now()` al vigente y se inserta el nuevo. Eso
   es idempotente Y deja el historial que la tabla promete.

   `mostrar_precio_publico` del CSV decide la VISIBILIDAD, no la existencia:
   `SI` → `'public'` (sale en `availability.json`), `NO` con precio cargado →
   `'on_request'`. B2-F y B2-G tienen precio real (USD 235.000) pero no se
   publica: `on_request` guarda el número para el panel y para el vendedor sin
   que `generate_availability_json` (0013) lo saque a la web, que es
   exactamente lo que pasa hoy en `availability.json` (`"p": null`).

10. EN SECO POR DEFECTO, Y EN SECO DE VERDAD. Sin `--aplicar` no se abre
   ninguna conexión de escritura y ni siquiera hacen falta las credenciales:
   el plan se arma entero con los archivos locales y se imprime. Si las
   credenciales ESTÁN, el modo seco igual las usa para leer (nunca para
   escribir) y comparar contra lo que ya hay, así el resumen dice "3 escenas
   cambian" en vez de "25 escenas". Esto va a correr contra una base de
   producción: el default tiene que ser el que no rompe nada.

11. VALIDAR ANTES DE ESCRIBIR, TODO JUNTO. Las validaciones no cortan en el
   primer error: se juntan todas y se imprimen juntas, y recién ahí se aborta
   sin haber escrito una sola fila. Un proyecto cargado a medias es peor que
   uno no cargado, y arreglar un dato por corrida es la forma más lenta que
   existe de arreglar cinco.

12. LO QUE NO ENTRA EN NINGUNA TABLA SE GUARDA IGUAL, APARTE. `Scene`
   (packages/core/src/types.ts) tiene cuatro campos opcionales que la tabla
   `scenes` no tiene columna para guardar: `procedencia` (la chapa de
   foto/render/IA, que es un valor de producto, no un adorno), y `poster`,
   `mobileUrl` y `portrait` del video. Se guardan en
   `settings.sceneExtras[slug]`, que `pickManifestOverrides` ignora en
   silencio (sólo levanta cinco claves conocidas, así que no hay riesgo de
   que esto se cuele al manifiesto). No los lee nadie todavía: están ahí para
   que la ingesta no PIERDA información que sí existe, y para que el día que
   el publicador aprenda a emitirlos no haya que volver a correr nada.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

HERE = os.path.dirname(os.path.abspath(__file__))
BALEIA_DIR = os.path.normpath(os.path.join(HERE, ".."))
REPO_DIR = os.path.normpath(os.path.join(BALEIA_DIR, "..", ".."))
CSV_POR_DEFECTO = os.path.join(BALEIA_DIR, "out", "baleia_unidades.csv")
GEOJSON_POR_DEFECTO = os.path.join(BALEIA_DIR, "out", "baleia_hotspots.geojson")
MANIFIESTO_POR_DEFECTO = os.path.join(REPO_DIR, "apps", "viewer", "public", "tour.json")

# Prefijo que el manifiesto publicado en `apps/viewer/public/` le antepone a
# todas sus rutas. Ver punto 7 del docstring.
PREFIJO_PUBLICADO = "./baleia/"

# ----------------------------------------------------------- contrato del esquema
# Estos cuatro conjuntos son copia del enum de Postgres, no una opinión: si
# alguno diverge, PostgREST rechaza el insert con un error de tipo mucho menos
# claro que el que da este script. Fuente:
# supabase/migrations/0001_extensions_and_enums.sql (+ 0017 para
# "proximamente") y packages/core/src/status.ts, que es la fuente de verdad de
# los estados comerciales.
ESTADOS_PLATAFORMA = (
    "disponible",
    "reservado",
    "vendido",
    "bloqueado",
    "no_disponible",
    "proximamente",
)
TIPOS_DE_PROYECTO = ("loteo", "edificio", "complejo", "mixto")
TIPOS_DE_ESCENA = ("panorama", "floorplan", "map", "video")
VISIBILIDADES = ("public", "on_request", "private")

# Cómo se escribe un estado en el CSV -> cómo se llama en el enum. Hoy los tres
# que trae el CSV son idénticos al enum, pero el CSV lo llena una persona
# mirando un brochure: "Reservada", "VENDIDO" o "no disponible" son formas que
# van a aparecer tarde o temprano y no tiene sentido que aborten una carga por
# una tilde o una mayúscula. Lo que NO se hace es adivinar: cualquier cosa
# fuera de esta tabla aborta.
ALIAS_DE_ESTADO = {
    "disponible": "disponible",
    "disponibles": "disponible",
    "reservado": "reservado",
    "reservada": "reservado",
    "vendido": "vendido",
    "vendida": "vendido",
    "bloqueado": "bloqueado",
    "bloqueada": "bloqueado",
    "no disponible": "no_disponible",
    "no_disponible": "no_disponible",
    "proximamente": "proximamente",
    "proximo": "proximamente",
}

# Estado de las unidades cuya columna `estado` viene vacía, POR BLOQUE. No es
# un default: es un dato real que está en el brochure y no en el CSV (el cartel
# "PRÓXIMAMENTE" sobre Bloque 1 y Bloque 3). Misma regla, misma justificación y
# mismos bloques que `BLOCKS_PROXIMAMENTE` en build_tour.py — si algún día
# cambia, tiene que cambiar en los dos lados. Un bloque que no esté acá y venga
# sin estado aborta la carga.
ESTADO_SIN_DATO_POR_BLOQUE = {
    "B1": "proximamente",
    "B3": "proximamente",
}

# Cómo se traduce el `kind` de cada feature del GeoJSON al `hotspot_target_kind`
# del esquema. Ver puntos 2 y 3 del docstring.
DESTINO_POR_TIPO_DE_FEATURE = {
    "bloque": "group",
    "amenity": "scene",
    "perimetro": "info",
}

# Las cinco claves del manifiesto que el publicador levanta de
# `projects.settings` (`pickManifestOverrides`, apps/worker/src/routes/
# publish.ts). `theme` no se emite: `build_tour.py` lo deja en None a
# propósito (no inventa bandas de precio; el visor las deriva por cuantiles).
CAMPOS_EDITORIALES = ("contact", "brandLogo", "photoTour", "brochurePages", "theme")

# Campos de `Scene` (packages/core/src/types.ts) que la tabla `scenes` no tiene
# dónde guardar. Ver punto 12 del docstring.
EXTRAS_DE_ESCENA = ("procedencia", "poster", "mobileUrl", "portrait")

# Formato de `projects.subdomain`, calcado del check de
# 0022_project_domains.sql. Se valida acá para dar el error en castellano
# ANTES de escribir, en vez de recibir una violación de constraint a mitad de
# la carga.
FORMATO_SUBDOMINIO = re.compile(r"^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$")
# `tenants.slug` y `projects.slug` no tienen check en el esquema, pero viajan
# en la URL pública (`/t/{tenant}/{project}/`), así que acá se exige lo mismo
# que se le exigiría a cualquier segmento de ruta.
FORMATO_SLUG = re.compile(r"^[a-z0-9][a-z0-9-]*[a-z0-9]$")


class ErrorDeDatos(Exception):
    """Algo de las fuentes locales no cuadra. Nunca llega a haber escritura."""


class ErrorDePlataforma(Exception):
    """PostgREST contestó algo que no es un 2xx."""


# ═════════════════════════════════════════════════════════ helpers puros
# Todo lo de esta sección es función pura sobre datos en memoria: no lee
# archivos, no abre sockets y no depende del reloj. Es lo que cubren los tests
# de `test_ingestar_a_plataforma.py`.


def slug(texto: str) -> str:
    """Misma normalización que `build_tour.py::slug`, y a propósito: de acá
    salen los `unit_types.code` ("duplex", "1-dormitorio") que tienen que
    coincidir con los `typeCode` que ya están escritos en el manifiesto. Si las
    dos funciones divergen, la ficha de una unidad deja de encontrar su tipo."""
    texto = texto.strip().lower()
    texto = unicodedata.normalize("NFKD", texto)
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = re.sub(r"[^a-z0-9]+", "-", texto).strip("-")
    return texto


def sin_tildes(texto: str) -> str:
    texto = unicodedata.normalize("NFKD", texto.strip().lower())
    return "".join(c for c in texto if not unicodedata.combining(c))


def despegar_prefijo(valor: Any, prefijo: str) -> Any:
    """Recorre el documento entero y le saca `prefijo` a toda ruta relativa que
    lo tenga, dejándola relativa al manifiesto (`./media/...`). Ver punto 7.

    Es recursivo y genérico sobre strings en vez de una lista de campos
    conocidos porque el manifiesto crece por campos aditivos: el `portrait` del
    video, el `thumbUrl` de una foto y el `poster` de mañana son todos rutas, y
    ninguno debería requerir tocar esta función."""
    if not prefijo:
        return valor
    if isinstance(valor, str):
        return "./" + valor[len(prefijo) :] if valor.startswith(prefijo) else valor
    if isinstance(valor, list):
        return [despegar_prefijo(v, prefijo) for v in valor]
    if isinstance(valor, dict):
        return {k: despegar_prefijo(v, prefijo) for k, v in valor.items()}
    return valor


def bloque_desde_texto(valor: str) -> Optional[str]:
    """"Bloque 2" -> "B2". Misma lectura que
    `build_tour.py::block_code_from_bloque_o_piso`: el CSV escribe el bloque en
    prosa y el código canónico —el que usan el GeoJSON, el manifiesto y los
    hotspots— es la forma corta."""
    m = re.search(r"(\d+)", valor or "")
    return "B{}".format(m.group(1)) if m else None


def anillo_a_px(coords: List[List[float]]) -> List[List[float]]:
    """Anillo exterior de un Polygon de GeoJSON -> `Hotspot.geometry` (Px[]).

    Idéntica a `build_tour.py::ring_to_px`, y tiene que seguir siéndolo: de esa
    identidad depende que la comparación del punto 4 del docstring signifique
    algo. GeoJSON repite el primer vértice al final para cerrar el anillo; el
    visor no lo espera repetido."""
    anillo = coords[:-1] if coords and coords[0] == coords[-1] else list(coords)
    return [[round(x, 5), round(y, 5)] for x, y in anillo]


def mapear_estado(
    estado_csv: str,
    bloque: Optional[str],
    estado_faltante: Optional[str] = None,
) -> str:
    """Estado del CSV -> valor del enum `unit_status`. Ver punto 5 del docstring.

    Tres casos y ninguno más: el estado está y se reconoce (se traduce), el
    estado no está y hay una regla para ese bloque (se aplica), o no se sabe
    (se levanta `ErrorDeDatos` y la carga entera se cae antes de escribir)."""
    crudo = (estado_csv or "").strip()
    if crudo:
        normalizado = ALIAS_DE_ESTADO.get(sin_tildes(crudo).replace("-", " ").replace("_", " ").strip())
        if normalizado is None:
            normalizado = ALIAS_DE_ESTADO.get(sin_tildes(crudo))
        if normalizado is None:
            raise ErrorDeDatos(
                'el estado "{}" no corresponde a ninguno de los de la plataforma ({}). '
                "Corregí el CSV o agregá el alias en ALIAS_DE_ESTADO.".format(
                    crudo, ", ".join(ESTADOS_PLATAFORMA)
                )
            )
        return normalizado

    if estado_faltante:
        return estado_faltante
    if bloque in ESTADO_SIN_DATO_POR_BLOQUE:
        return ESTADO_SIN_DATO_POR_BLOQUE[bloque]
    raise ErrorDeDatos(
        "no tiene estado en el CSV y su bloque ({}) no está en "
        "ESTADO_SIN_DATO_POR_BLOQUE. `units.status` es NOT NULL: la plataforma "
        "no sabe decir «sin dato». Cargá el estado en el CSV o pasá "
        "--estado-faltante si de verdad todas las unidades sin dato van al "
        "mismo estado.".format(bloque or "sin bloque")
    )


def numero_o_none(valor: str, campo: str, unidad: str) -> Optional[float]:
    crudo = (valor or "").strip()
    if not crudo:
        return None
    try:
        return float(crudo.replace(",", "."))
    except ValueError:
        raise ErrorDeDatos('{}: "{}" no es un número en la columna {}'.format(unidad, crudo, campo))


def fila_unidad(
    fila_csv: Dict[str, str],
    unidad_manifiesto: Optional[Dict[str, Any]],
    orden: int,
    estado_faltante: Optional[str] = None,
) -> Dict[str, Any]:
    """Una fila del CSV (+ lo que el manifiesto ya sabe de esa unidad) -> una
    fila de `units`.

    El reparto de responsabilidades entre las dos fuentes no es arbitrario: el
    CSV manda en lo COMERCIAL (estado, precio, superficies, bloque, tipología)
    porque es lo que se actualiza cuando se vende algo; el manifiesto manda en
    lo EDITORIAL (qué plano, qué axonometría, qué número comercial) porque esos
    datos los arma `build_tour.py` cruzando tablas de material que el CSV no
    conoce. Duplicarlos en el CSV habría sido pedirle a una persona que
    mantenga a mano lo que un script ya deriva.

    `_grupo` y `_tipo` viajan con guion bajo adelante: son códigos, no ids, y
    los resuelve la capa de escritura cuando ya creó los grupos y los tipos.
    Se limpian antes de mandar la fila a PostgREST."""
    codigo = (fila_csv.get("codigo_unidad") or "").strip()
    bloque = bloque_desde_texto(fila_csv.get("bloque_o_piso") or "")
    tipologia = (fila_csv.get("tipologia") or "").strip()

    try:
        estado = mapear_estado(fila_csv.get("estado", ""), bloque, estado_faltante)
    except ErrorDeDatos as e:
        raise ErrorDeDatos("{}: {}".format(codigo, e))

    manifiesto = unidad_manifiesto or {}
    # Los atributos salen del manifiesto tal cual: ya vienen curados y con las
    # claves que la ficha del visor sabe leer (`tipologia`,
    # `superficieCubiertaM2`, `numeroComercial`, `plano3d`, `planoPdf`). Lo que
    # NO se copia nunca es `notas_internas` del CSV: `tour.json` es público y
    # esas notas son de uso interno. Si el manifiesto no trae attrs, se
    # reconstruyen los dos mínimos desde el CSV para que la ficha no quede vacía.
    attrs = dict(manifiesto.get("attrs") or {})
    if not attrs:
        attrs = {"tipologia": tipologia}
        cubierta = numero_o_none(
            fila_csv.get("superficie_cubierta_m2", ""), "superficie_cubierta_m2", codigo
        )
        if cubierta is not None:
            attrs["superficieCubiertaM2"] = cubierta

    superficie_total = numero_o_none(
        fila_csv.get("superficie_total_m2", ""), "superficie_total_m2", codigo
    )

    fila = {
        "code": codigo,
        "status": estado,
        "area_total_m2": superficie_total,
        "attrs": attrs,
        # La columna es `jsonb not null default '{}'` y el publicador hace
        # `Array.isArray(u.media)`: un objeto vacío significa "sin galería" y la
        # clave desaparece del manifiesto, que es exactamente lo que pasa hoy
        # con las unidades de Bloque 3. Un `[]` en cambio emitiría `media: []`,
        # una clave presente y vacía — parecido, pero no lo mismo.
        "media": manifiesto.get("media") if isinstance(manifiesto.get("media"), list) else {},
        "sort": orden,
        "_grupo": bloque,
        "_tipo": slug(tipologia) if tipologia else None,
    }
    return fila


def fila_precio(fila_csv: Dict[str, str]) -> Optional[Dict[str, Any]]:
    """Fila del CSV -> fila de `unit_prices`, o None si esa unidad no tiene
    precio. Ver punto 9 del docstring para la visibilidad."""
    codigo = (fila_csv.get("codigo_unidad") or "").strip()
    importe = numero_o_none(fila_csv.get("precio", ""), "precio", codigo)
    if importe is None:
        return None
    moneda = (fila_csv.get("moneda") or "").strip()
    if not moneda:
        raise ErrorDeDatos("{}: tiene precio ({}) pero la columna moneda está vacía".format(codigo, importe))
    mostrar = (fila_csv.get("mostrar_precio_publico") or "").strip().upper()
    publico = sin_tildes(mostrar) in ("si", "true", "1", "y", "yes")
    return {
        "amount": importe,
        "currency": moneda,
        # Sin un "SI" explícito el precio existe pero no se publica. Nunca se
        # infiere que sí: es la misma regla que aplica `build_tour.py` al
        # decidir si el precio entra en availability.json.
        "visibility": "public" if publico else "on_request",
        "_unidad": codigo,
    }


def filas_tipos(filas_csv: List[Dict[str, str]]) -> List[Dict[str, Any]]:
    """Las tipologías distintas del CSV -> filas de `unit_types`.

    `attr_schema` se arma con las claves que REALMENTE tienen las unidades de
    ese tipo, no con un schema inventado: la columna se llama "JSON Schema de
    los atributos variables de este tipo" (0004) y un schema que describa
    campos que nadie escribe es peor que no tener ninguno."""
    vistos: Dict[str, Dict[str, Any]] = {}
    for fila in filas_csv:
        tipologia = (fila.get("tipologia") or "").strip()
        if not tipologia:
            continue
        codigo = slug(tipologia)
        if codigo not in vistos:
            vistos[codigo] = {"code": codigo, "name": tipologia, "attr_schema": {}, "_unidades": []}
        vistos[codigo]["_unidades"].append((fila.get("codigo_unidad") or "").strip())
    return list(vistos.values())


def esquema_de_atributos(unidades: List[Dict[str, Any]]) -> Dict[str, Any]:
    """JSON Schema mínimo y honesto: las claves que aparecen en los `attrs` de
    estas unidades, con su tipo, y `required` sólo para las que están en
    TODAS."""
    tipos: Dict[str, str] = {}
    conteo: Dict[str, int] = {}
    for u in unidades:
        for clave, valor in (u.get("attrs") or {}).items():
            conteo[clave] = conteo.get(clave, 0) + 1
            tipos.setdefault(
                clave,
                "number" if isinstance(valor, (int, float)) and not isinstance(valor, bool) else "string",
            )
    if not tipos:
        return {}
    esquema: Dict[str, Any] = {
        "type": "object",
        "properties": {k: {"type": v} for k, v in sorted(tipos.items())},
    }
    obligatorias = sorted(k for k, n in conteo.items() if n == len(unidades))
    if obligatorias:
        esquema["required"] = obligatorias
    return esquema


def campos_editoriales(manifiesto: Dict[str, Any]) -> Dict[str, Any]:
    """Las claves del manifiesto que el publicador levanta de
    `projects.settings`. Ver punto 6 del docstring.

    Una clave ausente o en `null` en el manifiesto queda ausente en el
    resultado, no en `null`: `pickManifestOverrides` le da significado a la
    ausencia (el visor simplemente no dibuja esa sección) y un `null`
    explícito rompería esa lectura."""
    salida: Dict[str, Any] = {}
    for clave in CAMPOS_EDITORIALES:
        valor = manifiesto.get(clave)
        if valor is not None:
            salida[clave] = valor
    return salida


def extras_de_escena(manifiesto: Dict[str, Any]) -> Dict[str, Any]:
    """Los campos de `Scene` que no tienen columna. Ver punto 12."""
    salida: Dict[str, Any] = {}
    for escena in manifiesto.get("scenes") or []:
        extras = {k: escena[k] for k in EXTRAS_DE_ESCENA if escena.get(k) is not None}
        if extras:
            salida[escena["slug"]] = extras
    return salida


def fusionar_settings(existente: Optional[Dict[str, Any]], nuevo: Dict[str, Any]) -> Dict[str, Any]:
    """Le encima al `settings` que ya está en la base las claves que este
    script maneja, sin tocar el resto. Ver punto 6: ahí también vive la
    configuración del panel (`initial_scene_id`, `allowed_domains`) y una
    ingesta no tiene por qué saber de su existencia para no borrarla."""
    fusionado = dict(existente or {})
    fusionado.update(nuevo)
    return fusionado


def filas_escenas(manifiesto: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Escenas del manifiesto -> filas de `scenes`.

    El `id` del manifiesto (`sc-masterplan`) NO viaja: en la plataforma el id
    es un uuid que genera la base, y el `slug` es la clave natural. Los
    hotspots, que en el manifiesto referencian escenas por ese id, se
    re-referencian por slug más abajo."""
    filas = []
    for escena in manifiesto.get("scenes") or []:
        filas.append(
            {
                "slug": escena.get("slug"),
                "kind": escena.get("kind"),
                "name": escena.get("name"),
                "source": escena.get("source") or {},
                "initial_view": escena.get("initialView"),
                "north_offset": escena.get("northOffset"),
                "sort": escena.get("sort", 0),
            }
        )
    return filas


def filas_hotspots(
    manifiesto: Dict[str, Any],
    features: Dict[str, Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """GeoJSON (geometría y tipo de destino) + manifiesto (escena, rótulo,
    acción) -> filas de `hotspots`. Ver puntos 2, 3 y 4 del docstring.

    Se itera sobre los hotspots DEL MANIFIESTO, no sobre las features, porque
    el manifiesto es el que sabe en qué escena va cada uno y adónde lleva. La
    geometría, en cambio, se toma de la feature: el GeoJSON es la fuente."""
    por_id_de_escena = {e["id"]: e["slug"] for e in manifiesto.get("scenes") or []}
    filas = []
    for hotspot in manifiesto.get("hotspots") or []:
        id_origen = hotspot.get("id") or ""
        # Convención de `build_tour.py`: el id del hotspot es "h-" + el code de
        # la feature. Es la única forma de volver a cruzar las dos fuentes, y
        # `validar` se encarga de que efectivamente cruce para los 11.
        codigo = id_origen[2:] if id_origen.startswith("h-") else id_origen
        feature = features.get(codigo)
        tipo_feature = (feature or {}).get("kind")
        destino = DESTINO_POR_TIPO_DE_FEATURE.get(tipo_feature or "", "info")

        accion = hotspot.get("action") or {}
        escena_destino = accion.get("sceneSlug") if accion.get("kind") == "goto" else None
        if destino == "scene" and not escena_destino:
            # Una feature de amenity sin `goto` no puede ser `target_kind='scene'`
            # (el check `hotspots_target_kind_matches` exige el target). Cae a
            # informativo, que es lo que el visor ya hace con ella.
            destino = "info"

        meta: Dict[str, Any] = {"sourceId": id_origen}
        if hotspot.get("label") is not None:
            meta["label"] = hotspot["label"]
        if hotspot.get("zIndex") is not None:
            meta["zIndex"] = hotspot["zIndex"]
        if accion.get("kind") == "url" and accion.get("href"):
            meta["url"] = accion["href"]

        filas.append(
            {
                "target_kind": destino,
                "geometry_kind": hotspot.get("geometryKind", "polygon_px"),
                "geometry": anillo_a_px(feature["anillo"]) if feature else hotspot.get("geometry"),
                "label_anchor": hotspot.get("anchor"),
                "meta": meta,
                "_clave": id_origen,
                "_escena": por_id_de_escena.get(hotspot.get("sceneId")),
                "_grupo": codigo if destino == "group" else None,
                "_escena_destino": escena_destino if destino == "scene" else None,
            }
        )
    return filas


def filas_grupos(features: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Las features de `kind='bloque'` -> filas de `groups`. Ver punto 2.

    Se cargan los CINCO bloques, no sólo los dos que tienen unidades: B1, B4 y
    B5 existen en el plano, tienen polígono y su hotspot necesita un
    `group_id` al que apuntar. Un bloque sin unidades no es un bloque que no
    exista: es un bloque de una etapa futura."""
    filas = []
    for orden, (codigo, feature) in enumerate(
        sorted((c, f) for c, f in features.items() if f.get("kind") == "bloque"), start=1
    ):
        filas.append(
            {
                "kind": "bloque",
                "code": codigo,
                "name": feature.get("name") or codigo,
                "sort": orden,
                "parent_id": None,
            }
        )
    return filas


# ═════════════════════════════════════════════════════════ lectura de fuentes


def leer_csv(ruta: str) -> List[Dict[str, str]]:
    with open(ruta, encoding="utf-8") as f:
        return [{k: (v or "") for k, v in fila.items()} for fila in csv.DictReader(f)]


def leer_geojson(ruta: str) -> Dict[str, Dict[str, Any]]:
    with open(ruta, encoding="utf-8") as f:
        datos = json.load(f)
    features: Dict[str, Dict[str, Any]] = {}
    for feature in datos.get("features") or []:
        props = feature.get("properties") or {}
        codigo = props.get("code")
        if not codigo:
            continue
        features[codigo] = {
            "kind": props.get("kind"),
            "name": props.get("name"),
            "anillo": (feature.get("geometry") or {}).get("coordinates", [[]])[0],
        }
    return features


def leer_manifiesto(ruta: str, prefijo: str) -> Dict[str, Any]:
    with open(ruta, encoding="utf-8") as f:
        return despegar_prefijo(json.load(f), prefijo)


# ═════════════════════════════════════════════════════════ el plan


@dataclass
class Plan:
    """Todo lo que se escribiría, ya resuelto, sin haber tocado la base.

    Existe para que el modo seco y el modo aplicado partan EXACTAMENTE del
    mismo objeto: lo que se imprime en seco es, literalmente, lo que se
    escribe con `--aplicar`. Si fueran dos caminos distintos, el modo seco
    sería una promesa y no una previsión."""

    tenant: Dict[str, Any]
    proyecto: Dict[str, Any]
    grupos: List[Dict[str, Any]]
    tipos: List[Dict[str, Any]]
    unidades: List[Dict[str, Any]]
    precios: List[Dict[str, Any]]
    escenas: List[Dict[str, Any]]
    hotspots: List[Dict[str, Any]]
    settings: Dict[str, Any]
    errores: List[str] = field(default_factory=list)
    advertencias: List[str] = field(default_factory=list)


def armar_plan(
    *,
    tenant: str,
    nombre_tenant: str,
    proyecto: str,
    nombre_proyecto: str,
    subdominio: Optional[str],
    tipo_proyecto: str,
    filas_csv: List[Dict[str, str]],
    features: Dict[str, Dict[str, Any]],
    manifiesto: Dict[str, Any],
    estado_faltante: Optional[str] = None,
) -> Plan:
    """Cruza las tres fuentes y deja armado el plan completo. No escribe nada
    ni valida nada: validar es el paso siguiente, y es a propósito que esté
    separado — el plan tiene que poder armarse (y mostrarse) aunque esté mal,
    para que el error se explique sobre datos concretos."""
    errores: List[str] = []
    unidades_manifiesto = manifiesto.get("units") or {}

    unidades: List[Dict[str, Any]] = []
    precios: List[Dict[str, Any]] = []
    for orden, fila in enumerate(filas_csv, start=1):
        codigo = (fila.get("codigo_unidad") or "").strip()
        if not codigo:
            errores.append("hay una fila del CSV sin `codigo_unidad` (fila {})".format(orden))
            continue
        try:
            unidades.append(
                fila_unidad(fila, unidades_manifiesto.get(codigo), orden, estado_faltante)
            )
            precio = fila_precio(fila)
            if precio:
                precios.append(precio)
        except ErrorDeDatos as e:
            errores.append(str(e))

    tipos = filas_tipos(filas_csv)
    por_tipo: Dict[str, List[Dict[str, Any]]] = {}
    for unidad in unidades:
        por_tipo.setdefault(unidad["_tipo"], []).append(unidad)
    for tipo in tipos:
        tipo["attr_schema"] = esquema_de_atributos(por_tipo.get(tipo["code"], []))

    settings = fusionar_settings(None, campos_editoriales(manifiesto))
    extras = extras_de_escena(manifiesto)
    if extras:
        settings["sceneExtras"] = extras

    plan = Plan(
        tenant={"slug": tenant, "name": nombre_tenant},
        proyecto={
            "slug": proyecto,
            "name": nombre_proyecto,
            "kind": tipo_proyecto,
            "subdomain": subdominio,
        },
        grupos=filas_grupos(features),
        tipos=tipos,
        unidades=unidades,
        precios=precios,
        escenas=filas_escenas(manifiesto),
        hotspots=filas_hotspots(manifiesto, features),
        settings=settings,
        errores=errores,
    )
    return plan


# ═════════════════════════════════════════════════════════ validación


def validar(
    plan: Plan,
    *,
    features: Dict[str, Dict[str, Any]],
    manifiesto: Dict[str, Any],
) -> Tuple[List[str], List[str]]:
    """Todo lo que tiene que cuadrar ANTES de escribir una sola fila.

    Devuelve (errores, advertencias). Los errores abortan; las advertencias se
    imprimen y la carga sigue. La diferencia entre unas y otras: un error
    significa que la carga produciría un proyecto ROTO o incompleto; una
    advertencia, que algo se va a perder o a degradar pero el proyecto queda
    consistente. Ver punto 11 del docstring: se juntan todas y se muestran
    juntas."""
    errores = list(plan.errores)
    advertencias: List[str] = []

    # --- identidad -------------------------------------------------------
    for etiqueta, valor in (("--tenant", plan.tenant["slug"]), ("--project", plan.proyecto["slug"])):
        if not valor or not FORMATO_SLUG.match(valor):
            errores.append(
                '{} = "{}" no sirve como segmento de URL (sólo minúsculas, números y guiones; '
                "viaja en /t/{{tenant}}/{{project}}/)".format(etiqueta, valor)
            )
    subdominio = plan.proyecto.get("subdomain")
    if subdominio and not FORMATO_SUBDOMINIO.match(subdominio):
        errores.append(
            '--subdominio "{}" no pasa el check `projects_subdomain_format` (0022): 3 a 30 '
            "caracteres, minúsculas, números y guiones, sin guion bajo y sin empezar ni "
            "terminar en guion".format(subdominio)
        )
    if plan.proyecto["kind"] not in TIPOS_DE_PROYECTO:
        errores.append(
            '--kind "{}" no es un valor del enum `project_kind` ({})'.format(
                plan.proyecto["kind"], ", ".join(TIPOS_DE_PROYECTO)
            )
        )

    # --- unidades --------------------------------------------------------
    codigos = [u["code"] for u in plan.unidades]
    repetidos = sorted({c for c in codigos if codigos.count(c) > 1})
    if repetidos:
        errores.append(
            "el CSV repite códigos de unidad ({}); `units(project_id, code)` es único".format(
                ", ".join(repetidos)
            )
        )

    codigos_de_grupo = {g["code"] for g in plan.grupos}
    unidades_manifiesto = manifiesto.get("units") or {}
    for unidad in plan.unidades:
        if unidad["status"] not in ESTADOS_PLATAFORMA:
            errores.append(
                '{}: el estado "{}" no existe en el enum `unit_status`'.format(
                    unidad["code"], unidad["status"]
                )
            )
        if not unidad["_grupo"]:
            errores.append(
                "{}: no se pudo leer el bloque de la columna `bloque_o_piso`".format(unidad["code"])
            )
        elif unidad["_grupo"] not in codigos_de_grupo:
            # Ésta es la validación de "unidad sin hotspot", adaptada al modelo
            # real: en Baleia NINGUNA unidad tiene polígono propio (el
            # masterplan dibuja bloques, no unidades — ver punto 2). Lo que
            # tiene que existir es el hotspot de SU BLOQUE; sin eso la unidad
            # queda cargada pero no hay forma de llegar a ella desde el plano.
            errores.append(
                "{}: su bloque {} no tiene polígono en el GeoJSON, así que no hay hotspot por el "
                "que llegar a esta unidad desde el masterplan".format(unidad["code"], unidad["_grupo"])
            )
        if unidad["code"] not in unidades_manifiesto:
            errores.append(
                "{}: está en el CSV pero no en el manifiesto. Las dos fuentes están "
                "desincronizadas: correr `build_tour.py` antes de ingestar".format(unidad["code"])
            )

    tipos_conocidos = {t["code"] for t in plan.tipos}
    for unidad in plan.unidades:
        if unidad["_tipo"] and unidad["_tipo"] not in tipos_conocidos:
            errores.append("{}: tipología desconocida ({})".format(unidad["code"], unidad["_tipo"]))
        if not unidad["_tipo"]:
            advertencias.append("{}: sin tipología en el CSV, queda sin `unit_type`".format(unidad["code"]))

    # --- precios ---------------------------------------------------------
    for precio in plan.precios:
        if precio["visibility"] not in VISIBILIDADES:
            errores.append(
                "{}: visibilidad de precio inválida ({})".format(precio["_unidad"], precio["visibility"])
            )
        if precio["amount"] < 0:
            errores.append("{}: precio negativo".format(precio["_unidad"]))

    # --- escenas ---------------------------------------------------------
    slugs_de_escena = set()
    for escena in plan.escenas:
        if not escena["slug"]:
            errores.append("hay una escena sin `slug` en el manifiesto")
            continue
        if escena["slug"] in slugs_de_escena:
            errores.append(
                "el manifiesto repite el slug de escena «{}»; `scenes(project_id, slug)` es "
                "único".format(escena["slug"])
            )
        slugs_de_escena.add(escena["slug"])
        if escena["kind"] not in TIPOS_DE_ESCENA:
            errores.append(
                '{}: kind "{}" no es un valor del enum `scene_kind` ({})'.format(
                    escena["slug"], escena["kind"], ", ".join(TIPOS_DE_ESCENA)
                )
            )
        fuente = escena.get("source") or {}
        # Una escena sin fuente es una pantalla en negro: `floorplan`/`video`
        # necesitan `url`, `panorama` necesita `base` (ver `TiledSource` en
        # packages/core/src/types.ts). Cargar la escena igual sería cargar un
        # recorrido con un agujero.
        if not fuente.get("url") and not fuente.get("base"):
            errores.append(
                "{}: la escena no tiene `source.url` ni `source.base`; no hay nada que mostrar".format(
                    escena["slug"]
                )
            )

    if plan.escenas:
        primera = min(plan.escenas, key=lambda e: (e.get("sort") or 0, e["slug"] or ""))
        arranque = manifiesto.get("start")
        if arranque and primera["slug"] != arranque:
            # El publicador calcula el arranque como `scenes[0].slug` ordenando
            # por `sort` — no lee ningún campo `start`. Si la escena de menor
            # `sort` no es la del `start` del manifiesto, el recorrido publicado
            # abre en otro lado. No aborta porque el proyecto queda consistente
            # (todas las escenas están, todos los hotspots también); es el
            # publicador el que decide distinto.
            advertencias.append(
                "el manifiesto arranca en «{}» pero la escena de menor `sort` es «{}»: el "
                "publicador usa la de menor `sort` (no lee `start`), así que el recorrido "
                "publicado va a abrir en «{}»".format(arranque, primera["slug"], primera["slug"])
            )

    # --- hotspots --------------------------------------------------------
    for hotspot in plan.hotspots:
        clave = hotspot["_clave"]
        if not hotspot["_escena"]:
            errores.append(
                "{}: apunta a una escena del manifiesto que no existe entre las escenas "
                "cargadas".format(clave)
            )
        if hotspot["target_kind"] == "group" and hotspot["_grupo"] not in codigos_de_grupo:
            errores.append("{}: apunta al bloque {} y ese grupo no existe".format(clave, hotspot["_grupo"]))
        if hotspot["target_kind"] == "scene" and hotspot["_escena_destino"] not in slugs_de_escena:
            errores.append(
                "{}: lleva a la escena «{}» y esa escena no está en el manifiesto".format(
                    clave, hotspot["_escena_destino"]
                )
            )
        if not hotspot.get("geometry"):
            errores.append("{}: se quedó sin geometría".format(clave))

    # Confrontación GeoJSON <-> manifiesto (punto 4 del docstring).
    #
    # Primero: que cada hotspot del manifiesto tenga SU feature. Sin este
    # chequeo el degradado es silencioso y feo — `filas_hotspots` no encuentra
    # la feature, no sabe de qué tipo es el destino y lo deja como informativo
    # con la geometría vieja del manifiesto. O sea: el Bloque 1 se cargaría
    # como si fuera una laguna. Que un polígono cambie de significado por un
    # code que no cruza es exactamente la clase de error que tiene que abortar.
    for hotspot in plan.hotspots:
        clave = hotspot["_clave"]
        codigo = clave[2:] if clave.startswith("h-") else clave
        if codigo not in features:
            errores.append(
                "{}: el manifiesto lo dibuja pero el GeoJSON no tiene ninguna feature con code "
                "«{}». Sin la feature no se sabe si es un bloque, un amenity o el perímetro, y "
                "cargarlo igual lo convertiría en otra cosa".format(clave, codigo)
            )

    geometria_manifiesto = {h.get("id"): h.get("geometry") for h in manifiesto.get("hotspots") or []}
    for hotspot in plan.hotspots:
        clave = hotspot["_clave"]
        esperada = geometria_manifiesto.get(clave)
        if esperada is not None and hotspot["geometry"] != esperada:
            errores.append(
                "{}: la geometría del GeoJSON y la del manifiesto no coinciden ({} vértices contra "
                "{}). El tour.json quedó viejo: volvé a correr build_tour.py".format(
                    clave, len(hotspot["geometry"] or []), len(esperada)
                )
            )
    codigos_en_hotspots = {
        h["_clave"][2:] if h["_clave"].startswith("h-") else h["_clave"] for h in plan.hotspots
    }
    huerfanas = sorted(set(features) - codigos_en_hotspots)
    if huerfanas:
        advertencias.append(
            "el GeoJSON tiene features que el manifiesto no dibuja y por lo tanto no se cargan: "
            "{}".format(", ".join(huerfanas))
        )

    # --- lo que se va a perder por el camino -----------------------------
    bloques_hotspot = [h for h in plan.hotspots if h["target_kind"] == "group"]
    if bloques_hotspot:
        advertencias.append(
            "los {} hotspots de bloque se cargan como `target_kind='group'` (que es lo correcto), "
            "pero el publicador de hoy sólo traduce `target_kind='unit'` a una acción: publicados "
            "así, los bloques del masterplan van a salir sin color de estado y sin click. Ver "
            "`buildManifestFromSupabase` en apps/worker/src/routes/publish.ts".format(
                len(bloques_hotspot)
            )
        )
    if plan.settings.get("sceneExtras"):
        advertencias.append(
            "{} escenas traen campos que `scenes` no tiene columna para guardar (procedencia, "
            "poster, mobileUrl, portrait): quedan en `settings.sceneExtras`, que el publicador de "
            "hoy no lee. El video en particular se va a publicar sin póster ni versión "
            "vertical".format(len(plan.settings["sceneExtras"]))
        )

    return errores, advertencias


# ═════════════════════════════════════════════════════════ PostgREST


class Plataforma:
    """Cliente mínimo de PostgREST sobre urllib.

    Sin dependencias: este script corre con el Python de sistema, en la misma
    Mac donde `tools/baleia/.venv` existe para Pillow y nada más. Meter
    `requests` o `supabase-py` sólo para hacer ocho POST sería pedirle a quien
    corra esto que arme un entorno antes de poder ver un dry-run."""

    def __init__(self, url: str, service_key: str, timeout: int = 60):
        self.base = url.rstrip("/") + "/rest/v1"
        self.service_key = service_key
        self.timeout = timeout

    def _pedir(
        self,
        metodo: str,
        ruta: str,
        cuerpo: Optional[Any] = None,
        prefer: Optional[str] = None,
    ) -> Any:
        datos = json.dumps(cuerpo).encode("utf-8") if cuerpo is not None else None
        pedido = urllib.request.Request(self.base + ruta, data=datos, method=metodo)
        pedido.add_header("apikey", self.service_key)
        pedido.add_header("Authorization", "Bearer " + self.service_key)
        pedido.add_header("Content-Type", "application/json")
        pedido.add_header("Accept", "application/json")
        if prefer:
            pedido.add_header("Prefer", prefer)
        try:
            with urllib.request.urlopen(pedido, timeout=self.timeout) as respuesta:
                crudo = respuesta.read().decode("utf-8")
                return json.loads(crudo) if crudo.strip() else None
        except urllib.error.HTTPError as e:
            detalle = e.read().decode("utf-8", "replace")
            # El mensaje incluye método y ruta pero NUNCA la service key: este
            # texto termina en una terminal, en un log o en un pantallazo.
            raise ErrorDePlataforma(
                "{} {} -> {} {}\n{}".format(metodo, ruta, e.code, e.reason, detalle)
            )
        except urllib.error.URLError as e:
            raise ErrorDePlataforma("no se pudo llegar a {}: {}".format(self.base, e.reason))

    def seleccionar(self, tabla: str, consulta: str) -> List[Dict[str, Any]]:
        return self._pedir("GET", "/{}?{}".format(tabla, consulta)) or []

    def insertar(self, tabla: str, filas: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not filas:
            return []
        return self._pedir("POST", "/" + tabla, filas, prefer="return=representation") or []

    def actualizar(self, tabla: str, consulta: str, cambios: Dict[str, Any]) -> List[Dict[str, Any]]:
        return (
            self._pedir(
                "PATCH", "/{}?{}".format(tabla, consulta), cambios, prefer="return=representation"
            )
            or []
        )


@dataclass
class Conteo:
    creadas: int = 0
    actualizadas: int = 0
    sin_cambios: int = 0
    cerradas: int = 0

    def __str__(self) -> str:
        partes = []
        if self.creadas:
            partes.append("{} creadas".format(self.creadas))
        if self.actualizadas:
            partes.append("{} actualizadas".format(self.actualizadas))
        if self.cerradas:
            partes.append("{} cerradas".format(self.cerradas))
        if self.sin_cambios:
            partes.append("{} sin cambios".format(self.sin_cambios))
        return ", ".join(partes) or "nada que hacer"


def _igual(a: Any, b: Any) -> bool:
    """Comparación tolerante con lo que devuelve PostgREST.

    Los `numeric` de Postgres vuelven como número JSON pero pueden haber pasado
    por una conversión de precisión (163.42 -> 163.42000000000002); comparar
    con `==` marcaría como "cambió" una fila idéntica y el script escribiría en
    cada corrida, que es justo lo contrario de idempotente."""
    if isinstance(a, bool) or isinstance(b, bool):
        return a == b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return abs(float(a) - float(b)) < 1e-6
    if a is None or b is None:
        return a is None and b is None
    if isinstance(a, (dict, list)) or isinstance(b, (dict, list)):
        return json.loads(json.dumps(a, sort_keys=True)) == json.loads(json.dumps(b, sort_keys=True))
    return a == b


def _limpiar(fila: Dict[str, Any]) -> Dict[str, Any]:
    """Saca las claves de trabajo (`_grupo`, `_tipo`, `_clave`, ...) antes de
    mandar la fila a PostgREST, que rechazaría una columna que no existe."""
    return {k: v for k, v in fila.items() if not k.startswith("_")}


def _sincronizar(
    api: Plataforma,
    tabla: str,
    *,
    consulta_existentes: str,
    clave: str,
    filas: List[Dict[str, Any]],
    columnas: List[str],
    fijas: Dict[str, Any],
) -> Tuple[Dict[str, str], Conteo]:
    """El lee-y-decide del punto 8, en una sola función para las cinco tablas
    que lo comparten. Devuelve el mapa clave natural -> uuid y el conteo."""
    existentes = {
        fila[clave]: fila for fila in api.seleccionar(tabla, consulta_existentes) if fila.get(clave)
    }
    conteo = Conteo()
    ids: Dict[str, str] = {}
    a_insertar: List[Dict[str, Any]] = []
    claves_a_insertar: List[str] = []

    for fila in filas:
        valor_clave = fila[clave]
        limpia = _limpiar(fila)
        limpia.update(fijas)
        actual = existentes.get(valor_clave)
        if actual is None:
            a_insertar.append(limpia)
            claves_a_insertar.append(valor_clave)
            continue
        ids[valor_clave] = actual["id"]
        cambios = {c: limpia[c] for c in columnas if c in limpia and not _igual(actual.get(c), limpia[c])}
        if cambios:
            api.actualizar(tabla, "id=eq.{}".format(actual["id"]), cambios)
            conteo.actualizadas += 1
        else:
            conteo.sin_cambios += 1

    if a_insertar:
        creadas = api.insertar(tabla, a_insertar)
        conteo.creadas += len(a_insertar)
        # PostgREST devuelve las filas en el mismo orden en que se mandaron.
        for valor_clave, fila_creada in zip(claves_a_insertar, creadas):
            ids[valor_clave] = fila_creada["id"]

    return ids, conteo


def aplicar(api: Plataforma, plan: Plan) -> Dict[str, Conteo]:
    """Escribe el plan, en el orden de dependencia: tenants -> projects ->
    groups -> unit_types -> units -> unit_prices -> scenes -> hotspots.

    No hay transacción: PostgREST no expone uno. Por eso importa tanto que
    `validar` haya corrido antes — es la única barrera entre una carga
    completa y una carga a medias."""
    conteos: Dict[str, Conteo] = {}

    # --- tenants ---------------------------------------------------------
    # A un tenant que ya existe no se le toca NADA, ni siquiera el nombre: si
    # ya está en la plataforma es porque alguien lo creó con su nombre real, y
    # el `--nombre-tenant` de esta corrida es, en el mejor de los casos, una
    # suposición. `settings` menos todavía: ahí vive configuración de la
    # inmobiliaria entera, no de este proyecto.
    conteo_tenant = Conteo()
    existentes = api.seleccionar("tenants", "slug=eq.{}&select=id,name".format(plan.tenant["slug"]))
    if existentes:
        tenant_id = existentes[0]["id"]
        conteo_tenant.sin_cambios = 1
    else:
        tenant_id = api.insertar("tenants", [plan.tenant])[0]["id"]
        conteo_tenant.creadas = 1
    conteos["tenants"] = conteo_tenant

    # --- projects --------------------------------------------------------
    conteo_proyecto = Conteo()
    existentes = api.seleccionar(
        "projects",
        "tenant_id=eq.{}&slug=eq.{}&select=id,name,kind,subdomain,settings".format(
            tenant_id, plan.proyecto["slug"]
        ),
    )
    deseado = dict(plan.proyecto)
    deseado["tenant_id"] = tenant_id
    if existentes:
        actual = existentes[0]
        proyecto_id = actual["id"]
        deseado["settings"] = fusionar_settings(actual.get("settings"), plan.settings)
        cambios = {
            c: deseado[c]
            for c in ("name", "kind", "subdomain", "settings")
            if not _igual(actual.get(c), deseado[c])
        }
        if cambios:
            api.actualizar("projects", "id=eq.{}".format(proyecto_id), cambios)
            conteo_proyecto.actualizadas = 1
        else:
            conteo_proyecto.sin_cambios = 1
    else:
        deseado["settings"] = plan.settings
        proyecto_id = api.insertar("projects", [deseado])[0]["id"]
        conteo_proyecto.creadas = 1
    conteos["projects"] = conteo_proyecto

    # --- groups ----------------------------------------------------------
    grupos, conteos["groups"] = _sincronizar(
        api,
        "groups",
        consulta_existentes="project_id=eq.{}&select=id,code,kind,name,sort,parent_id".format(proyecto_id),
        clave="code",
        filas=plan.grupos,
        columnas=["kind", "name", "sort"],
        fijas={"project_id": proyecto_id},
    )

    # --- unit_types ------------------------------------------------------
    tipos, conteos["unit_types"] = _sincronizar(
        api,
        "unit_types",
        consulta_existentes="project_id=eq.{}&select=id,code,name,attr_schema".format(proyecto_id),
        clave="code",
        filas=plan.tipos,
        columnas=["name", "attr_schema"],
        fijas={"project_id": proyecto_id},
    )

    # --- units -----------------------------------------------------------
    unidades_resueltas = []
    for unidad in plan.unidades:
        fila = dict(unidad)
        fila["group_id"] = grupos.get(unidad["_grupo"])
        fila["unit_type_id"] = tipos.get(unidad["_tipo"])
        unidades_resueltas.append(fila)
    unidades, conteos["units"] = _sincronizar(
        api,
        "units",
        consulta_existentes=(
            "project_id=eq.{}&select=id,code,status,area_total_m2,attrs,media,sort,group_id,"
            "unit_type_id".format(proyecto_id)
        ),
        clave="code",
        filas=unidades_resueltas,
        columnas=["status", "area_total_m2", "attrs", "media", "sort", "group_id", "unit_type_id"],
        fijas={"project_id": proyecto_id},
    )

    # --- unit_prices -----------------------------------------------------
    # Vigencia en vez de upsert. Ver punto 9 del docstring.
    conteo_precios = Conteo()
    for precio in plan.precios:
        unidad_id = unidades.get(precio["_unidad"])
        if not unidad_id:
            continue
        vigentes = api.seleccionar(
            "unit_prices",
            "unit_id=eq.{}&valid_to=is.null&select=id,amount,currency,visibility&order=valid_from."
            "desc".format(unidad_id),
        )
        deseado = {
            "unit_id": unidad_id,
            "amount": precio["amount"],
            "currency": precio["currency"],
            "visibility": precio["visibility"],
        }
        iguales = [
            v
            for v in vigentes
            if _igual(v.get("amount"), deseado["amount"])
            and v.get("currency") == deseado["currency"]
            and v.get("visibility") == deseado["visibility"]
        ]
        if iguales:
            conteo_precios.sin_cambios += 1
            # Si por algún accidente hubiera más de un precio vigente idéntico,
            # no se toca: cerrar filas que este script no creó sería decidir
            # sobre un historial ajeno.
            continue
        for vigente in vigentes:
            api.actualizar(
                "unit_prices", "id=eq.{}".format(vigente["id"]), {"valid_to": "now()"}
            )
            conteo_precios.cerradas += 1
        api.insertar("unit_prices", [deseado])
        conteo_precios.creadas += 1
    conteos["unit_prices"] = conteo_precios

    # --- scenes ----------------------------------------------------------
    escenas, conteos["scenes"] = _sincronizar(
        api,
        "scenes",
        consulta_existentes=(
            "project_id=eq.{}&select=id,slug,kind,name,source,initial_view,north_offset,sort".format(
                proyecto_id
            )
        ),
        clave="slug",
        filas=plan.escenas,
        columnas=["kind", "name", "source", "initial_view", "north_offset", "sort"],
        fijas={"project_id": proyecto_id},
    )

    # --- hotspots --------------------------------------------------------
    # `hotspots` no tiene project_id: se leen por escena. Y no tiene clave
    # natural: la clave es `meta->>sourceId`, que este mismo script graba.
    conteo_hotspots = Conteo()
    existentes_por_origen: Dict[str, Dict[str, Any]] = {}
    for slug_escena, escena_id in escenas.items():
        for fila in api.seleccionar(
            "hotspots",
            "scene_id=eq.{}&select=id,scene_id,target_kind,geometry_kind,geometry,label_anchor,meta,"
            "unit_id,group_id,target_scene_id".format(escena_id),
        ):
            origen = (fila.get("meta") or {}).get("sourceId")
            if origen:
                existentes_por_origen[origen] = fila

    a_insertar_hotspots = []
    for hotspot in plan.hotspots:
        fila = _limpiar(hotspot)
        fila["scene_id"] = escenas.get(hotspot["_escena"])
        fila["group_id"] = grupos.get(hotspot["_grupo"]) if hotspot["_grupo"] else None
        fila["target_scene_id"] = (
            escenas.get(hotspot["_escena_destino"]) if hotspot["_escena_destino"] else None
        )
        fila["unit_id"] = None
        actual = existentes_por_origen.get(hotspot["_clave"])
        if actual is None:
            a_insertar_hotspots.append(fila)
            continue
        cambios = {
            c: fila[c]
            for c in (
                "scene_id",
                "target_kind",
                "geometry_kind",
                "geometry",
                "label_anchor",
                "meta",
                "unit_id",
                "group_id",
                "target_scene_id",
            )
            if not _igual(actual.get(c), fila[c])
        }
        if cambios:
            api.actualizar("hotspots", "id=eq.{}".format(actual["id"]), cambios)
            conteo_hotspots.actualizadas += 1
        else:
            conteo_hotspots.sin_cambios += 1
    if a_insertar_hotspots:
        api.insertar("hotspots", a_insertar_hotspots)
        conteo_hotspots.creadas += len(a_insertar_hotspots)
    conteos["hotspots"] = conteo_hotspots

    return conteos


def comprobaciones_remotas(api: Plataforma, plan: Plan) -> List[str]:
    """Lo que sólo se puede saber mirando la base, y que conviene saber ANTES
    de escribir: si el subdominio está reservado o ya lo tiene otro proyecto.
    Son lecturas; corren igual en modo seco si hay credenciales (punto 10)."""
    errores: List[str] = []
    subdominio = plan.proyecto.get("subdomain")
    if not subdominio:
        return errores
    reservados = api.seleccionar(
        "reserved_subdomains", "subdomain=eq.{}&select=subdomain,reason".format(subdominio.lower())
    )
    if reservados:
        errores.append(
            'el subdominio "{}" está reservado por la plataforma ({}). El trigger '
            "`projects_check_subdomain_reserved` (0022) va a rechazar el insert.".format(
                subdominio, reservados[0].get("reason") or "sin motivo declarado"
            )
        )
    ocupados = api.seleccionar(
        "projects", "subdomain=eq.{}&select=id,slug,tenant_id".format(subdominio)
    )
    tenants = api.seleccionar("tenants", "slug=eq.{}&select=id".format(plan.tenant["slug"]))
    tenant_id = tenants[0]["id"] if tenants else None
    for ocupado in ocupados:
        if ocupado["slug"] != plan.proyecto["slug"] or ocupado["tenant_id"] != tenant_id:
            errores.append(
                'el subdominio "{}" ya lo tiene el proyecto {} (otro tenant o otro slug). Es único '
                "a nivel global: un hostname no admite dos dueños.".format(subdominio, ocupado["slug"])
            )
    return errores


# ═════════════════════════════════════════════════════════ resumen legible


def resumir(
    plan: Plan,
    *,
    rutas: Dict[str, str],
    filas_csv: List[Dict[str, str]],
    manifiesto: Dict[str, Any],
    conteos: Optional[Dict[str, Conteo]] = None,
) -> str:
    """El resumen que se imprime. En seco es la previsión; con `--aplicar`, lo
    que efectivamente pasó. Misma forma en los dos casos a propósito: así se
    pueden comparar de un vistazo."""
    lineas: List[str] = []
    ancho = 74
    titulo = "BALEIA -> PLATAFORMA" + ("" if conteos else "   (EN SECO: no se escribió nada)")
    lineas.append("=" * ancho)
    lineas.append(titulo)
    lineas.append("=" * ancho)

    lineas.append("")
    lineas.append("Fuentes")
    lineas.append("  CSV         {}".format(rutas["csv"]))
    lineas.append("              {} unidades".format(len(filas_csv)))
    lineas.append("  GeoJSON     {}".format(rutas["geojson"]))
    lineas.append("              {} polígonos".format(rutas["n_features"]))
    lineas.append("  Manifiesto  {}".format(rutas["manifiesto"]))
    lineas.append(
        "              {} escenas, {} hotspots, {} entradas en `units`".format(
            len(manifiesto.get("scenes") or []),
            len(manifiesto.get("hotspots") or []),
            len(manifiesto.get("units") or {}),
        )
    )

    lineas.append("")
    lineas.append("Destino")
    lineas.append(
        '  tenant    {}  "{}"'.format(plan.tenant["slug"], plan.tenant["name"])
    )
    lineas.append(
        '  proyecto  {}  "{}"   kind={}   subdominio={}'.format(
            plan.proyecto["slug"],
            plan.proyecto["name"],
            plan.proyecto["kind"],
            plan.proyecto.get("subdomain") or "(ninguno)",
        )
    )

    # Detalle por tabla.
    por_estado: Dict[str, int] = {}
    for unidad in plan.unidades:
        por_estado[unidad["status"]] = por_estado.get(unidad["status"], 0) + 1
    por_tipo: Dict[str, int] = {}
    for unidad in plan.unidades:
        por_tipo[unidad["_tipo"] or "(sin tipo)"] = por_tipo.get(unidad["_tipo"] or "(sin tipo)", 0) + 1
    por_kind_escena: Dict[str, int] = {}
    for escena in plan.escenas:
        por_kind_escena[escena["kind"]] = por_kind_escena.get(escena["kind"], 0) + 1
    por_destino: Dict[str, int] = {}
    for hotspot in plan.hotspots:
        por_destino[hotspot["target_kind"]] = por_destino.get(hotspot["target_kind"], 0) + 1
    por_visibilidad: Dict[str, int] = {}
    for precio in plan.precios:
        por_visibilidad[precio["visibility"]] = por_visibilidad.get(precio["visibility"], 0) + 1

    filas_resumen = [
        ("tenants", 1, plan.tenant["slug"]),
        ("projects", 1, "{} (settings: {})".format(plan.proyecto["slug"], ", ".join(sorted(plan.settings)))),
        ("groups", len(plan.grupos), " ".join(g["code"] for g in plan.grupos)),
        (
            "unit_types",
            len(plan.tipos),
            " · ".join("{} ({})".format(c, n) for c, n in sorted(por_tipo.items())),
        ),
        (
            "units",
            len(plan.unidades),
            " · ".join("{} {}".format(n, e) for e, n in sorted(por_estado.items(), key=lambda kv: -kv[1])),
        ),
        (
            "unit_prices",
            len(plan.precios),
            " · ".join("{} {}".format(n, v) for v, n in sorted(por_visibilidad.items())),
        ),
        (
            "scenes",
            len(plan.escenas),
            " · ".join("{} {}".format(n, k) for k, n in sorted(por_kind_escena.items(), key=lambda kv: -kv[1])),
        ),
        (
            "hotspots",
            len(plan.hotspots),
            " · ".join("{} {}".format(n, d) for d, n in sorted(por_destino.items(), key=lambda kv: -kv[1])),
        ),
    ]

    lineas.append("")
    lineas.append("Qué se escribiría" if conteos is None else "Qué se escribió")
    lineas.append("  {:<14} {:>5}  {}".format("tabla", "filas", "detalle"))
    lineas.append("  " + "-" * (ancho - 4))
    for tabla, cantidad, detalle in filas_resumen:
        lineas.append("  {:<14} {:>5}  {}".format(tabla, cantidad, detalle))
        if conteos is not None and tabla in conteos:
            lineas.append("  {:<14} {:>5}  -> {}".format("", "", conteos[tabla]))

    editoriales = []
    if "photoTour" in plan.settings:
        pt = plan.settings["photoTour"]
        pares = len(pt.get("pairs") or [])
        editoriales.append(
            "photoTour: {} fotos + {} {}".format(
                len(pt.get("items") or []), pares, "deslizador" if pares == 1 else "deslizadores"
            )
        )
    if "brochurePages" in plan.settings:
        editoriales.append("brochurePages: {} páginas".format(len(plan.settings["brochurePages"])))
    if "brandLogo" in plan.settings:
        editoriales.append("brandLogo: {}".format(plan.settings["brandLogo"]))
    if "contact" in plan.settings:
        editoriales.append(
            "contact: {} ({})".format(
                plan.settings["contact"].get("name"), plan.settings["contact"].get("whatsapp")
            )
        )
    if "sceneExtras" in plan.settings:
        editoriales.append("sceneExtras: {} escenas".format(len(plan.settings["sceneExtras"])))
    if editoriales:
        lineas.append("")
        lineas.append("Campos editoriales -> projects.settings")
        for item in editoriales:
            lineas.append("  · " + item)

    if plan.advertencias:
        lineas.append("")
        lineas.append("Advertencias ({})".format(len(plan.advertencias)))
        for advertencia in plan.advertencias:
            lineas.append("  ! " + _envolver(advertencia, ancho - 4, "    "))

    lineas.append("")
    if conteos is None:
        lineas.append("Nada de esto se escribió. Para hacerlo: volvé a correr con --aplicar.")
    else:
        lineas.append(
            "Listo. Falta la media (rsync) y publicar: POST /api/publish con "
            '{{"tenant":"{}","project":"{}"}}.'.format(plan.tenant["slug"], plan.proyecto["slug"])
        )
    return "\n".join(lineas)


def _envolver(texto: str, ancho: int, sangria: str) -> str:
    palabras = texto.split()
    lineas: List[str] = []
    actual = ""
    for palabra in palabras:
        if actual and len(actual) + 1 + len(palabra) > ancho:
            lineas.append(actual)
            actual = palabra
        else:
            actual = (actual + " " + palabra).strip()
    if actual:
        lineas.append(actual)
    return ("\n" + sangria).join(lineas)


# ═════════════════════════════════════════════════════════ CLI


def construir_parser() -> argparse.ArgumentParser:
    """`build_tour.py` se saltea argparse porque tiene dos banderas; éste tiene
    diez y una de ellas escribe en producción, así que el `--help` y la
    validación de tipos que da argparse valen más que la brevedad."""
    p = argparse.ArgumentParser(
        prog="ingestar_a_plataforma.py",
        description="Carga el recorrido de Baleia como proyecto de la plataforma (Supabase).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Credenciales: SUPABASE_URL y SUPABASE_SERVICE_KEY en el entorno. Nunca como\n"
            "argumento (queda en el historial del shell) ni en el código.\n\n"
            "Ejemplo:\n"
            "  python3 tools/baleia/scripts/ingestar_a_plataforma.py \\\n"
            "      --tenant dacal --project baleia --subdominio baleia\n"
        ),
    )
    p.add_argument("--tenant", required=True, help="slug del tenant (la inmobiliaria)")
    p.add_argument("--project", required=True, help="slug del proyecto dentro del tenant")
    p.add_argument("--subdominio", help="subdominio de plataforma (projects.subdomain, 0022)")
    p.add_argument("--nombre-tenant", help="nombre visible del tenant (por defecto, el slug capitalizado)")
    p.add_argument("--nombre-proyecto", help="nombre visible del proyecto (por defecto, el del manifiesto)")
    p.add_argument(
        "--kind",
        default="complejo",
        choices=list(TIPOS_DE_PROYECTO),
        help="projects.kind. Baleia son 5 bloques con amenities compartidos: complejo.",
    )
    p.add_argument("--csv", default=CSV_POR_DEFECTO, help="CSV comercial de unidades")
    p.add_argument("--geojson", default=GEOJSON_POR_DEFECTO, help="GeoJSON de hotspots del masterplan")
    p.add_argument("--manifiesto", default=MANIFIESTO_POR_DEFECTO, help="tour.json ya construido")
    p.add_argument(
        "--prefijo-publicado",
        default=PREFIJO_PUBLICADO,
        help="prefijo de ruta a despegar de las URLs del manifiesto (cadena vacía = no despegar)",
    )
    p.add_argument(
        "--estado-faltante",
        choices=list(ESTADOS_PLATAFORMA),
        help=(
            "estado para las unidades cuya columna `estado` está vacía. Sin esto se usa "
            "ESTADO_SIN_DATO_POR_BLOQUE y, si el bloque no está ahí, se aborta."
        ),
    )
    p.add_argument(
        "--aplicar",
        action="store_true",
        help="ESCRIBE en Supabase. Sin esta bandera el script sólo muestra qué haría.",
    )
    return p


def main(argv: Optional[List[str]] = None) -> int:
    args = construir_parser().parse_args(argv)

    for etiqueta, ruta in (("--csv", args.csv), ("--geojson", args.geojson), ("--manifiesto", args.manifiesto)):
        if not os.path.exists(ruta):
            print("No existe {} ({})".format(ruta, etiqueta), file=sys.stderr)
            return 2

    filas_csv = leer_csv(args.csv)
    features = leer_geojson(args.geojson)
    manifiesto = leer_manifiesto(args.manifiesto, args.prefijo_publicado)

    plan = armar_plan(
        tenant=args.tenant,
        nombre_tenant=args.nombre_tenant or args.tenant.replace("-", " ").title(),
        proyecto=args.project,
        nombre_proyecto=args.nombre_proyecto or manifiesto.get("project") or args.project,
        subdominio=args.subdominio,
        tipo_proyecto=args.kind,
        filas_csv=filas_csv,
        features=features,
        manifiesto=manifiesto,
        estado_faltante=args.estado_faltante,
    )
    errores, advertencias = validar(plan, features=features, manifiesto=manifiesto)

    if not args.nombre_tenant:
        advertencias.append(
            'el tenant se llamaría "{}", derivado del slug: si ya se sabe el nombre real de la '
            "inmobiliaria, pasalo con --nombre-tenant (a un tenant que ya exista no se le toca el "
            "nombre)".format(plan.tenant["name"])
        )

    url = os.environ.get("SUPABASE_URL", "").strip()
    clave = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    api: Optional[Plataforma] = None
    if url and clave:
        api = Plataforma(url, clave)
    elif args.aplicar:
        print(
            "Falta SUPABASE_URL y/o SUPABASE_SERVICE_KEY en el entorno. --aplicar escribe en una "
            "base real: no hay default ni se piden por teclado.",
            file=sys.stderr,
        )
        return 2
    else:
        advertencias.append(
            "sin SUPABASE_URL/SUPABASE_SERVICE_KEY en el entorno: el plan se armó sólo con los "
            "archivos locales y no se pudo comparar contra lo que ya hay en la base"
        )

    if api is not None:
        try:
            errores.extend(comprobaciones_remotas(api, plan))
        except ErrorDePlataforma as e:
            if args.aplicar:
                print("No se pudo consultar la plataforma:\n{}".format(e), file=sys.stderr)
                return 2
            advertencias.append("no se pudo consultar la plataforma para comparar: {}".format(e))
            api = None

    if errores:
        print("")
        print("NO SE ESCRIBIÓ NADA. Hay {} cosa(s) que no cuadran:".format(len(errores)), file=sys.stderr)
        for error in errores:
            print("  x " + _envolver(error, 70, "    "), file=sys.stderr)
        print("")
        print(
            "Un proyecto cargado a medias es peor que uno no cargado: corregí esto y volvé a "
            "correr.",
            file=sys.stderr,
        )
        return 1

    # Las advertencias se cuelgan del plan recién acá, cuando ya están todas
    # juntas: el resumen las imprime desde ahí.
    plan.advertencias = advertencias

    rutas = {
        "csv": os.path.relpath(args.csv, REPO_DIR),
        "geojson": os.path.relpath(args.geojson, REPO_DIR),
        "manifiesto": os.path.relpath(args.manifiesto, REPO_DIR),
        "n_features": len(features),
    }

    conteos = None
    if args.aplicar:
        try:
            conteos = aplicar(api, plan)
        except ErrorDePlataforma as e:
            print("La carga falló a mitad de camino:\n{}".format(e), file=sys.stderr)
            print(
                "\nLo que se haya escrito hasta acá queda. El script es idempotente: corregí la "
                "causa y volvé a correrlo con --aplicar para terminar.",
                file=sys.stderr,
            )
            return 1

    print(resumir(plan, rutas=rutas, filas_csv=filas_csv, manifiesto=manifiesto, conteos=conteos))
    return 0


if __name__ == "__main__":
    sys.exit(main())
