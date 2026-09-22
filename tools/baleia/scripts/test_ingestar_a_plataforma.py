#!/usr/bin/env python3
"""Tests de la lógica pura de `ingestar_a_plataforma.py`.

    python3 tools/baleia/scripts/test_ingestar_a_plataforma.py

Por qué `unittest` y no pytest: `packages/pipeline/pyproject.toml` declara
pytest en `dev`, pero no está instalado en ninguno de los dos venvs del repo
(`tools/baleia/.venv` tiene Pillow y numpy y nada más) ni en el Python del
sistema. Un test que hay que instalar algo para correr es un test que no se
corre. `unittest` es biblioteca estándar y, además, pytest levanta y ejecuta
`unittest.TestCase` sin ninguna adaptación: el día que alguien instale pytest,
`pytest tools/baleia/` encuentra esto tal como está.

Qué se testea y qué no: lo que se testea es TODO lo que decide algo sobre los
datos —el mapeo de estados, la conversión de una fila del CSV a una fila de
`units`, la extracción de los campos editoriales, el armado de hotspots, la
fusión de settings y las validaciones—. Lo que NO se testea es la capa que
habla con PostgREST: ahí no hay decisiones, hay HTTP, y mockearlo sólo
probaría que el mock devuelve lo que le pusimos. Esa capa se verificó contra
un Supabase local de verdad, que es la única forma de que la prueba signifique
algo.
"""

from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ingestar_a_plataforma import (  # noqa: E402
    ErrorDeDatos,
    anillo_a_px,
    armar_plan,
    bloque_desde_texto,
    campos_editoriales,
    despegar_prefijo,
    esquema_de_atributos,
    ESTADO_SIN_DATO_POR_BLOQUE,
    ORIGEN_BLOQUES_DECLARADOS,
    extras_de,
    extras_de_escena,
    fila_precio,
    fila_unidad,
    filas_escenas,
    filas_grupos,
    filas_hotspots,
    filas_tipos,
    fusionar_settings,
    leer_bloques_declarados,
    mapear_estado,
    slug,
    validar,
)


# ── material de prueba ──────────────────────────────────────────────────────
# Recorte fiel de las tres fuentes reales: dos unidades de Bloque 2 (una con
# precio público, una con precio reservado), una de Bloque 3 (sin dato
# comercial) y los polígonos de un bloque, un amenity y el perímetro.


def fila_csv(**cambios):
    base = {
        "codigo_unidad": "B2-A",
        "tipologia": "Dúplex",
        "superficie_cubierta_m2": "109.68",
        "superficie_total_m2": "163.42",
        "estado": "disponible",
        "precio": "364861",
        "moneda": "USD",
        "mostrar_precio_publico": "SI",
        "financiacion": "50% anticipo",
        "bloque_o_piso": "Bloque 2",
        "orientacion": "",
        "notas_internas": "Fuente: brochure pag.13. Dato interno que NO tiene que publicarse.",
    }
    base.update(cambios)
    return base


FEATURES = {
    "B2": {"kind": "bloque", "name": "Bloque 2", "anillo": [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2], [0.1, 0.1]]},
    "B3": {"kind": "bloque", "name": "Bloque 3", "anillo": [[0.3, 0.3], [0.4, 0.3], [0.4, 0.4], [0.3, 0.3]]},
    "D": {"kind": "amenity", "name": "Piscina", "anillo": [[0.5, 0.5], [0.6, 0.5], [0.6, 0.6], [0.5, 0.5]]},
    "TERRENO": {"kind": "perimetro", "name": "Perímetro", "anillo": [[0, 0], [1, 0], [1, 1], [0, 0]]},
}


def manifiesto_de_prueba():
    return {
        "project": "Baleia",
        "start": "masterplan",
        "brandLogo": "./marca/logo.svg",
        "contact": {"whatsapp": "+59895559230", "name": "Caetano"},
        "brochurePages": ["./media/brochure/pagina-01.webp"],
        "photoTour": {"items": [{"id": "f1", "url": "./media/fotos/f1.webp"}], "pairs": []},
        "scenes": [
            {
                "id": "sc-masterplan",
                "slug": "masterplan",
                "kind": "floorplan",
                "name": "Masterplan",
                "source": {"url": "./masterplan.webp", "width": 7945, "height": 1960},
                "procedencia": {"kind": "render"},
                "sort": 1,
            },
            {
                "id": "sc-amenities",
                "slug": "amenities",
                "kind": "floorplan",
                "name": "Amenities",
                "source": {"url": "./media/renders/amenities.webp", "width": 1600, "height": 1238},
                "sort": 16,
            },
            {
                "id": "sc-video",
                "slug": "video",
                "kind": "video",
                "name": "El recorrido real",
                "source": {"url": "./media/video/real.mp4", "width": 1920, "height": 1080},
                "procedencia": {"kind": "foto", "capturedAt": "2026-09-02"},
                "mobileUrl": "./media/video/real.720.mp4",
                "poster": {"url": "./media/video/real.poster.jpg", "width": 1280, "height": 720},
                "sort": 900,
            },
        ],
        "hotspots": [
            {
                "id": "h-TERRENO",
                "sceneId": "sc-masterplan",
                "unitCode": None,
                "geometryKind": "polygon_px",
                "geometry": [[0, 0], [1, 0], [1, 1]],
                "zIndex": 0,
                "label": "Perímetro del terreno",
            },
            {
                "id": "h-B2",
                "sceneId": "sc-masterplan",
                "unitCode": "B2",
                "geometryKind": "polygon_px",
                "geometry": [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2]],
                "action": {"kind": "unit"},
                "zIndex": 2,
                "label": "Bloque 2",
            },
            {
                "id": "h-D",
                "sceneId": "sc-masterplan",
                "unitCode": None,
                "geometryKind": "polygon_px",
                "geometry": [[0.5, 0.5], [0.6, 0.5], [0.6, 0.6]],
                "action": {"kind": "goto", "sceneSlug": "amenities"},
                "zIndex": 1,
                "label": "Piscina",
            },
        ],
        "units": {
            "B2-A": {
                "label": "B2-A",
                "groupCode": "B2",
                "typeCode": "duplex",
                "areaTotalM2": 163.42,
                "attrs": {
                    "tipologia": "Dúplex",
                    "superficieCubiertaM2": 109.68,
                    "numeroComercial": "201",
                    "planoPdf": "./media/planos-pdf/B2-A.pdf",
                },
                "media": ["./media/plantas/unidad-a.webp"],
            },
            "B2-F": {
                "label": "B2-F",
                "groupCode": "B2",
                "typeCode": "1-dormitorio",
                "areaTotalM2": 84.45,
                "attrs": {"tipologia": "1 dormitorio", "superficieCubiertaM2": 54.15},
                "media": ["./media/plantas/unidades-fyg.webp"],
            },
            "B3-A": {
                "label": "B3-A",
                "groupCode": "B3",
                "typeCode": "duplex",
                "areaTotalM2": 175.92,
                "attrs": {"tipologia": "Dúplex", "superficieCubiertaM2": 109.68},
            },
        },
    }


FILAS_CSV = [
    fila_csv(),
    fila_csv(
        codigo_unidad="B2-F",
        tipologia="1 dormitorio",
        superficie_cubierta_m2="54.15",
        superficie_total_m2="84.45",
        estado="bloqueado",
        precio="235000",
        mostrar_precio_publico="NO",
    ),
    fila_csv(
        codigo_unidad="B3-A",
        superficie_total_m2="175.92",
        estado="",
        precio="",
        moneda="",
        mostrar_precio_publico="",
        bloque_o_piso="Bloque 3",
    ),
]


def plan_de_prueba(**cambios):
    parametros = dict(
        tenant="dacal",
        nombre_tenant="Dacal",
        proyecto="baleia",
        nombre_proyecto="Baleia",
        subdominio="baleia",
        tipo_proyecto="complejo",
        filas_csv=FILAS_CSV,
        features=FEATURES,
        manifiesto=manifiesto_de_prueba(),
    )
    parametros.update(cambios)
    return armar_plan(**parametros)


# ── estados ─────────────────────────────────────────────────────────────────


class MapeoDeEstados(unittest.TestCase):
    def test_los_tres_del_csv_son_identicos_al_enum(self):
        """Bloque 2 trae los estados ya escritos como los nombra la plataforma."""
        self.assertEqual(mapear_estado("disponible", "B2"), "disponible")
        self.assertEqual(mapear_estado("bloqueado", "B2"), "bloqueado")
        self.assertEqual(mapear_estado("vendido", "B2"), "vendido")

    def test_tolera_mayusculas_tildes_y_espacios(self):
        """El CSV lo llena una persona mirando un brochure: una tilde o una
        mayúscula no puede abortar una carga."""
        self.assertEqual(mapear_estado("  VENDIDA ", "B2"), "vendido")
        self.assertEqual(mapear_estado("Reservada", "B2"), "reservado")
        self.assertEqual(mapear_estado("No Disponible", "B2"), "no_disponible")
        self.assertEqual(mapear_estado("Próximamente", "B2"), "proximamente")

    def test_un_estado_que_no_existe_aborta(self):
        """Nunca se adivina: un estado desconocido corta la carga entera."""
        with self.assertRaises(ErrorDeDatos) as ctx:
            mapear_estado("en preventa", "B2")
        self.assertIn("en preventa", str(ctx.exception))

    def test_bloque_3_sin_estado_cae_en_proximamente(self):
        """El dato no falta: está en el brochure ("PRÓXIMAMENTE" sobre B1 y B3),
        no en el CSV. Misma regla que BLOCKS_PROXIMAMENTE en build_tour.py."""
        self.assertEqual(mapear_estado("", "B3"), "proximamente")
        self.assertEqual(mapear_estado("   ", "B1"), "proximamente")

    def test_otro_bloque_sin_estado_aborta(self):
        """A un bloque del que nadie dijo nada no se le inventa un estado."""
        with self.assertRaises(ErrorDeDatos) as ctx:
            mapear_estado("", "B2")
        self.assertIn("ESTADO_SIN_DATO_POR_BLOQUE", str(ctx.exception))

    def test_estado_faltante_pisa_la_regla_por_bloque(self):
        self.assertEqual(mapear_estado("", "B2", "no_disponible"), "no_disponible")
        self.assertEqual(mapear_estado("", "B3", "no_disponible"), "no_disponible")

    def test_el_estado_explicito_le_gana_al_faltante(self):
        """`--estado-faltante` es para los vacíos, no para pisar lo que sí vino."""
        self.assertEqual(mapear_estado("vendido", "B3", "no_disponible"), "vendido")


# ── CSV -> units ────────────────────────────────────────────────────────────


class FilaDeUnidad(unittest.TestCase):
    def test_unidad_completa(self):
        fila = fila_unidad(fila_csv(), manifiesto_de_prueba()["units"]["B2-A"], 1)
        self.assertEqual(fila["code"], "B2-A")
        self.assertEqual(fila["status"], "disponible")
        self.assertEqual(fila["area_total_m2"], 163.42)
        self.assertEqual(fila["_grupo"], "B2")
        self.assertEqual(fila["_tipo"], "duplex")
        self.assertEqual(fila["sort"], 1)

    def test_los_attrs_editoriales_salen_del_manifiesto(self):
        """El número comercial y el PDF del plano no están en el CSV: los deriva
        build_tour.py cruzando tablas de material."""
        fila = fila_unidad(fila_csv(), manifiesto_de_prueba()["units"]["B2-A"], 1)
        self.assertEqual(fila["attrs"]["numeroComercial"], "201")
        self.assertEqual(fila["attrs"]["planoPdf"], "./media/planos-pdf/B2-A.pdf")
        self.assertEqual(fila["media"], ["./media/plantas/unidad-a.webp"])

    def test_las_notas_internas_nunca_viajan(self):
        """`tour.json` es público y se arma leyendo estas filas. Una nota interna
        que llegue a `attrs` termina descargada por cualquier visitante."""
        fila = fila_unidad(fila_csv(), manifiesto_de_prueba()["units"]["B2-A"], 1)
        volcado = str(fila)
        self.assertNotIn("notas_internas", volcado)
        self.assertNotIn("Dato interno", volcado)

    def test_sin_manifiesto_reconstruye_los_attrs_minimos(self):
        """Si la unidad no está en el manifiesto la ficha no queda vacía: se
        rehacen tipología y superficie cubierta desde el CSV."""
        fila = fila_unidad(fila_csv(), None, 1)
        self.assertEqual(fila["attrs"], {"tipologia": "Dúplex", "superficieCubiertaM2": 109.68})

    def test_sin_media_queda_objeto_vacio_no_lista_vacia(self):
        """El publicador hace `Array.isArray(u.media)`: `{}` borra la clave del
        manifiesto (que es lo que pasa hoy con Bloque 3), `[]` la deja presente
        y vacía. No es lo mismo."""
        fila = fila_unidad(FILAS_CSV[2], manifiesto_de_prueba()["units"]["B3-A"], 3)
        self.assertEqual(fila["media"], {})

    def test_superficie_no_numerica_aborta(self):
        with self.assertRaises(ErrorDeDatos):
            fila_unidad(fila_csv(superficie_total_m2="ciento sesenta"), None, 1)

    def test_el_codigo_viaja_en_el_error_para_saber_cual_es(self):
        with self.assertRaises(ErrorDeDatos) as ctx:
            fila_unidad(fila_csv(codigo_unidad="B9-Z", estado="", bloque_o_piso="Bloque 9"), None, 1)
        self.assertTrue(str(ctx.exception).startswith("B9-Z:"))


# ── CSV -> unit_prices ──────────────────────────────────────────────────────


class FilaDePrecio(unittest.TestCase):
    def test_precio_publico(self):
        precio = fila_precio(fila_csv())
        self.assertEqual(precio["amount"], 364861.0)
        self.assertEqual(precio["currency"], "USD")
        self.assertEqual(precio["visibility"], "public")

    def test_precio_cargado_pero_no_publicable_queda_on_request(self):
        """B2-F y B2-G: el número existe y el vendedor lo necesita, pero no sale
        en availability.json. `on_request` guarda una cosa sin habilitar la otra."""
        precio = fila_precio(fila_csv(mostrar_precio_publico="NO"))
        self.assertEqual(precio["visibility"], "on_request")

    def test_sin_si_explicito_no_se_publica(self):
        """Nunca se infiere que sí: una celda vacía no es una autorización."""
        self.assertEqual(fila_precio(fila_csv(mostrar_precio_publico=""))["visibility"], "on_request")
        self.assertEqual(fila_precio(fila_csv(mostrar_precio_publico="tal vez"))["visibility"], "on_request")

    def test_sin_precio_no_hay_fila(self):
        """Las vendidas no llevan precio: no se inventa una fila de historial."""
        self.assertIsNone(fila_precio(fila_csv(precio="")))

    def test_precio_sin_moneda_aborta(self):
        with self.assertRaises(ErrorDeDatos):
            fila_precio(fila_csv(moneda=""))


# ── tipologías -> unit_types ────────────────────────────────────────────────


class Tipologias(unittest.TestCase):
    def test_el_code_coincide_con_el_typecode_del_manifiesto(self):
        """Si esto se rompe, la ficha de una unidad deja de encontrar su tipo."""
        self.assertEqual(slug("Dúplex"), "duplex")
        self.assertEqual(slug("1 dormitorio"), "1-dormitorio")

    def test_una_fila_por_tipologia_distinta(self):
        tipos = filas_tipos(FILAS_CSV)
        self.assertEqual(sorted(t["code"] for t in tipos), ["1-dormitorio", "duplex"])
        duplex = [t for t in tipos if t["code"] == "duplex"][0]
        self.assertEqual(duplex["name"], "Dúplex")
        self.assertEqual(duplex["_unidades"], ["B2-A", "B3-A"])

    def test_el_attr_schema_describe_lo_que_realmente_hay(self):
        """Nada de schemas inventados: sólo las claves que las unidades escriben,
        y `required` sólo para las que están en todas."""
        unidades = [
            {"attrs": {"tipologia": "Dúplex", "superficieCubiertaM2": 109.68, "numeroComercial": "201"}},
            {"attrs": {"tipologia": "Dúplex", "superficieCubiertaM2": 107.76}},
        ]
        esquema = esquema_de_atributos(unidades)
        self.assertEqual(esquema["properties"]["superficieCubiertaM2"], {"type": "number"})
        self.assertEqual(esquema["properties"]["numeroComercial"], {"type": "string"})
        self.assertEqual(esquema["required"], ["superficieCubiertaM2", "tipologia"])

    def test_sin_atributos_el_schema_queda_vacio(self):
        self.assertEqual(esquema_de_atributos([{"attrs": {}}]), {})


# ── campos editoriales ──────────────────────────────────────────────────────


class CamposEditoriales(unittest.TestCase):
    def test_extrae_los_cuatro_que_trae_baleia(self):
        campos = campos_editoriales(manifiesto_de_prueba())
        self.assertEqual(sorted(campos), ["brandLogo", "brochurePages", "contact", "photoTour"])
        self.assertEqual(campos["contact"]["whatsapp"], "+59895559230")

    def test_una_clave_ausente_queda_ausente_no_en_null(self):
        """`pickManifestOverrides` le da significado a la ausencia: un `null`
        explícito rompería esa lectura. Baleia hoy no emite `theme` a propósito
        (no inventa bandas de precio)."""
        campos = campos_editoriales(manifiesto_de_prueba())
        self.assertNotIn("theme", campos)
        self.assertNotIn("theme", campos_editoriales({"theme": None}))

    def test_no_se_cuela_nada_que_el_publicador_no_levante(self):
        campos = campos_editoriales({"scenes": [1], "units": {}, "tenant": "baleia", "version": 7})
        self.assertEqual(campos, {})

    def test_los_extras_de_escena_se_guardan_por_slug(self):
        extras = extras_de_escena(manifiesto_de_prueba())
        self.assertEqual(sorted(extras), ["masterplan", "video"])
        self.assertEqual(extras["masterplan"], {"procedencia": {"kind": "render"}})
        self.assertEqual(sorted(extras["video"]), ["mobileUrl", "poster", "procedencia"])
        self.assertNotIn("amenities", extras)  # sin extras, no ocupa lugar

    def test_una_escena_sin_extras_da_objeto_vacio_no_none(self):
        """`scenes.extras` es `not null default '{}'`: un solo caso a
        contemplar del lado del código, no dos."""
        self.assertEqual(extras_de({"slug": "amenities", "kind": "floorplan"}), {})

    def test_no_entra_a_extras_nada_fuera_de_la_lista_blanca(self):
        """Misma lista blanca que `pickSceneExtras` en el publicador: si acá se
        colara `source` o `sort`, del otro lado se descartaría igual, pero la
        columna quedaría con basura que nadie sabe de dónde salió."""
        escena = {
            "slug": "x",
            "kind": "floorplan",
            "name": "X",
            "source": {"url": "./x.webp"},
            "sort": 3,
            "procedencia": {"kind": "render"},
        }
        self.assertEqual(extras_de(escena), {"procedencia": {"kind": "render"}})


class FusionDeSettings(unittest.TestCase):
    def test_no_le_borra_al_panel_lo_que_la_ingesta_no_conoce(self):
        existente = {"initial_scene_id": "sc-masterplan", "allowed_domains": ["dacal.com.uy"]}
        fusionado = fusionar_settings(existente, {"brandLogo": "./marca/logo.svg"})
        self.assertEqual(fusionado["initial_scene_id"], "sc-masterplan")
        self.assertEqual(fusionado["allowed_domains"], ["dacal.com.uy"])
        self.assertEqual(fusionado["brandLogo"], "./marca/logo.svg")

    def test_las_claves_propias_si_se_pisan(self):
        fusionado = fusionar_settings({"brandLogo": "viejo.svg"}, {"brandLogo": "nuevo.svg"})
        self.assertEqual(fusionado["brandLogo"], "nuevo.svg")

    def test_no_muta_el_settings_que_vino_de_la_base(self):
        existente = {"initial_scene_id": "sc-masterplan"}
        fusionar_settings(existente, {"brandLogo": "x"})
        self.assertEqual(existente, {"initial_scene_id": "sc-masterplan"})

    def test_retira_el_scene_extras_viejo_sin_tocar_lo_demas(self):
        """Desde la 0024 los extras viven en `scenes.extras`. Mientras la clave
        vieja siga en `settings`, el publicador tiene un puente que la usa para
        las escenas con la columna vacía: dos fuentes de verdad para el mismo
        dato y ninguna forma de saber cuál se publicó."""
        existente = {
            "sceneExtras": {"video": {"mobileUrl": "./viejo.mp4"}},
            "initial_scene_id": "sc-masterplan",
            "allowed_domains": ["dacal.com.uy"],
        }
        fusionado = fusionar_settings(existente, {"brandLogo": "./marca/logo.svg"})
        self.assertNotIn("sceneExtras", fusionado)
        self.assertEqual(fusionado["initial_scene_id"], "sc-masterplan")
        self.assertEqual(fusionado["allowed_domains"], ["dacal.com.uy"])

    def test_no_retira_nada_que_este_script_no_haya_puesto(self):
        """`retirar` es una lista corta y explícita, no una limpieza general."""
        existente = {"una_clave_rara_del_panel": 1, "theme_interno": {"x": 2}}
        self.assertEqual(fusionar_settings(existente, {}), existente)


# ── normalización de rutas ──────────────────────────────────────────────────


class PrefijoDePublicacion(unittest.TestCase):
    def test_despega_el_prefijo_en_todo_el_documento(self):
        documento = {
            "brandLogo": "./baleia/marca/logo.svg",
            "scenes": [{"source": {"url": "./baleia/masterplan.webp"}}],
            "brochurePages": ["./baleia/media/brochure/p01.webp?v=abc"],
        }
        salida = despegar_prefijo(documento, "./baleia/")
        self.assertEqual(salida["brandLogo"], "./marca/logo.svg")
        self.assertEqual(salida["scenes"][0]["source"]["url"], "./masterplan.webp")
        self.assertEqual(salida["brochurePages"][0], "./media/brochure/p01.webp?v=abc")

    def test_no_toca_lo_que_no_empieza_con_el_prefijo(self):
        documento = {"name": "Bloque 2", "url": "https://x.com/baleia/foto.webp", "n": 3, "ok": True}
        self.assertEqual(despegar_prefijo(documento, "./baleia/"), documento)

    def test_prefijo_vacio_no_hace_nada(self):
        documento = {"url": "./baleia/x.webp"}
        self.assertEqual(despegar_prefijo(documento, ""), documento)


# ── geometría ───────────────────────────────────────────────────────────────


class Geometria(unittest.TestCase):
    def test_descarta_el_vertice_de_cierre_y_redondea(self):
        """Igual que build_tour.py::ring_to_px, y tiene que seguir siéndolo: de
        eso depende que comparar las dos fuentes signifique algo."""
        anillo = [[0.123456789, 0.5], [0.9, 0.5], [0.9, 0.9], [0.123456789, 0.5]]
        self.assertEqual(anillo_a_px(anillo), [[0.12346, 0.5], [0.9, 0.5], [0.9, 0.9]])

    def test_anillo_abierto_se_deja_entero(self):
        self.assertEqual(anillo_a_px([[0, 0], [1, 0], [1, 1]]), [[0, 0], [1, 0], [1, 1]])

    def test_bloque_desde_texto(self):
        self.assertEqual(bloque_desde_texto("Bloque 2"), "B2")
        self.assertEqual(bloque_desde_texto("bloque 11"), "B11")
        self.assertIsNone(bloque_desde_texto(""))
        self.assertIsNone(bloque_desde_texto("Planta baja"))


# ── GeoJSON + manifiesto -> groups / scenes / hotspots ──────────────────────


class Grupos(unittest.TestCase):
    def test_solo_los_bloques_son_grupos(self):
        grupos = filas_grupos(FEATURES)
        self.assertEqual([g["code"] for g in grupos], ["B2", "B3"])
        self.assertEqual(grupos[0]["kind"], "bloque")
        self.assertEqual(grupos[0]["name"], "Bloque 2")
        self.assertEqual([g["sort"] for g in grupos], [1, 2])

    def test_solo_declara_status_el_bloque_que_lo_declara(self):
        """`null` no es un estado: es "derivalo de las unidades" (0026/0027)."""
        grupos = {g["code"]: g for g in filas_grupos(FEATURES, {"B3": "proximamente"})}
        self.assertEqual(grupos["B3"]["status"], "proximamente")
        self.assertIsNone(grupos["B2"]["status"])

    def test_el_status_va_siempre_como_clave_explicita(self):
        """Tiene que viajar como `None` y no omitirse: es lo que permite que una
        corrida posterior BORRE un estado declarado que dejó de corresponder,
        el día que el bloque se lance y pase a tener unidades de verdad."""
        for grupo in filas_grupos(FEATURES):
            self.assertIn("status", grupo)
            self.assertIsNone(grupo["status"])

    def test_la_lista_de_declarados_sale_de_build_tour(self):
        """Tenerla escrita en dos scripts era pedir que se desincronizaran. Si
        esto falla, o se movió la constante o se rompió el parseo — y el script
        tiene que avisarlo, no caer a una copia vieja en silencio."""
        self.assertEqual(ORIGEN_BLOQUES_DECLARADOS, "build_tour.py")
        self.assertEqual(ESTADO_SIN_DATO_POR_BLOQUE, {"B1": "proximamente", "B3": "proximamente"})

    def test_si_no_se_puede_leer_build_tour_cae_a_la_copia_y_lo_dice(self):
        mapa, origen = leer_bloques_declarados("/no/existe/build_tour.py")
        self.assertEqual(mapa, {"B1": "proximamente", "B3": "proximamente"})
        self.assertTrue(origen.startswith("copia local"), origen)


class Escenas(unittest.TestCase):
    def test_el_id_del_manifiesto_no_viaja(self):
        """En la plataforma el id es un uuid de la base; la clave natural es el
        slug."""
        filas = filas_escenas(manifiesto_de_prueba())
        self.assertNotIn("id", filas[0])
        self.assertEqual(filas[0]["slug"], "masterplan")
        self.assertEqual(filas[0]["source"]["width"], 7945)
        self.assertEqual(filas[0]["sort"], 1)

    def test_cada_escena_lleva_sus_extras_en_su_propia_columna(self):
        filas = {f["slug"]: f for f in filas_escenas(manifiesto_de_prueba())}
        self.assertEqual(filas["masterplan"]["extras"], {"procedencia": {"kind": "render"}})
        self.assertEqual(filas["amenities"]["extras"], {})
        self.assertEqual(filas["video"]["extras"]["mobileUrl"], "./media/video/real.720.mp4")
        self.assertEqual(filas["video"]["extras"]["poster"]["width"], 1280)


class Hotspots(unittest.TestCase):
    def setUp(self):
        self.filas = {h["_clave"]: h for h in filas_hotspots(manifiesto_de_prueba(), FEATURES)}

    def test_un_bloque_apunta_a_su_grupo(self):
        """Ésta es la diferencia de modelo con build_tour.py: el bloque no es una
        unidad, es un grupo, y el esquema tiene `target_kind='group'` para eso."""
        h = self.filas["h-B2"]
        self.assertEqual(h["target_kind"], "group")
        self.assertEqual(h["_grupo"], "B2")
        self.assertIsNone(h["_escena_destino"])

    def test_un_amenity_lleva_a_la_escena_de_su_render(self):
        h = self.filas["h-D"]
        self.assertEqual(h["target_kind"], "scene")
        self.assertEqual(h["_escena_destino"], "amenities")
        self.assertIsNone(h["_grupo"])

    def test_el_perimetro_es_informativo(self):
        """El único valor del enum que no exige target."""
        h = self.filas["h-TERRENO"]
        self.assertEqual(h["target_kind"], "info")
        self.assertIsNone(h["_grupo"])
        self.assertIsNone(h["_escena_destino"])

    def test_la_geometria_sale_del_geojson(self):
        """Del GeoJSON, que es la fuente, con el vértice de cierre descartado."""
        self.assertEqual(self.filas["h-B2"]["geometry"], [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2]])

    def test_meta_guarda_la_clave_con_la_que_se_lo_reencuentra(self):
        """`hotspots` no tiene clave natural; `meta.sourceId` es la que inventa
        este script para poder ser idempotente."""
        h = self.filas["h-B2"]
        self.assertEqual(h["meta"]["sourceId"], "h-B2")
        self.assertEqual(h["meta"]["label"], "Bloque 2")
        self.assertEqual(h["meta"]["zIndex"], 2)

    def test_la_escena_se_re_referencia_por_slug(self):
        self.assertEqual(self.filas["h-B2"]["_escena"], "masterplan")

    def test_el_sort_transcribe_el_orden_del_manifiesto(self):
        """Leaflet apila por orden de inserción e ignora `zIndex`: el perímetro
        va primero para quedar DEBAJO de los bloques. Ese orden ya está resuelto
        en el manifiesto; acá sólo se numera."""
        filas = filas_hotspots(manifiesto_de_prueba(), FEATURES)
        self.assertEqual([f["sort"] for f in filas], [1, 2, 3])
        self.assertEqual(filas[0]["_clave"], "h-TERRENO")
        self.assertEqual(self.filas["h-TERRENO"]["sort"], 1)
        self.assertEqual(self.filas["h-B2"]["sort"], 2)

    def test_la_numeracion_arranca_en_uno_no_en_cero(self):
        """0 es el default de la columna, o sea "sin orden". Si el primer
        hotspot quedara en 0 no se podría distinguir de uno sin cargar."""
        self.assertTrue(all(f["sort"] >= 1 for f in self.filas.values()))

    def test_un_amenity_sin_goto_cae_a_informativo(self):
        """El check `hotspots_target_kind_matches` exige el target: sin `goto` no
        puede ser `target_kind='scene'`."""
        manifiesto = manifiesto_de_prueba()
        del manifiesto["hotspots"][2]["action"]
        filas = {h["_clave"]: h for h in filas_hotspots(manifiesto, FEATURES)}
        self.assertEqual(filas["h-D"]["target_kind"], "info")


# ── plan completo ───────────────────────────────────────────────────────────


class PlanCompleto(unittest.TestCase):
    def test_los_numeros_del_recorte(self):
        plan = plan_de_prueba()
        self.assertEqual(len(plan.unidades), 3)
        self.assertEqual(len(plan.precios), 2)  # B3-A no tiene precio
        self.assertEqual(len(plan.grupos), 2)
        self.assertEqual(len(plan.tipos), 2)
        self.assertEqual(len(plan.escenas), 3)
        self.assertEqual(len(plan.hotspots), 3)
        self.assertEqual([u["status"] for u in plan.unidades], ["disponible", "bloqueado", "proximamente"])

    def test_el_settings_lleva_los_editoriales_y_nada_mas(self):
        """Desde la 0024, `sceneExtras` YA NO va acá: cada escena lleva los
        suyos en `scenes.extras`."""
        plan = plan_de_prueba()
        self.assertEqual(
            sorted(plan.settings), ["brandLogo", "brochurePages", "contact", "photoTour"]
        )
        self.assertNotIn("sceneExtras", plan.settings)

    def test_los_bloques_declarados_llegan_al_plan(self):
        plan = plan_de_prueba()
        grupos = {g["code"]: g["status"] for g in plan.grupos}
        self.assertEqual(grupos["B3"], "proximamente")  # declarado en build_tour.py
        self.assertIsNone(grupos["B2"])  # deriva de sus unidades


# ── validaciones ────────────────────────────────────────────────────────────


def errores_de(plan, **cambios):
    parametros = {"features": FEATURES, "manifiesto": manifiesto_de_prueba()}
    parametros.update(cambios)
    return validar(plan, **parametros)[0]


class Validaciones(unittest.TestCase):
    def test_el_recorte_real_no_tiene_errores(self):
        self.assertEqual(errores_de(plan_de_prueba()), [])

    def test_unidad_cuyo_bloque_no_tiene_poligono(self):
        """La validación de "unidad sin hotspot", adaptada: en Baleia el
        masterplan dibuja bloques, no unidades, así que lo que tiene que existir
        es el polígono del bloque."""
        features = {k: v for k, v in FEATURES.items() if k != "B3"}
        plan = plan_de_prueba(features=features)
        errores = errores_de(plan, features=features)
        self.assertTrue(any("B3-A" in e and "no tiene polígono" in e for e in errores), errores)

    def test_unidad_del_csv_que_no_esta_en_el_manifiesto(self):
        """Las dos fuentes desincronizadas: hay que volver a correr build_tour.py
        antes de ingestar."""
        manifiesto = manifiesto_de_prueba()
        del manifiesto["units"]["B3-A"]
        plan = plan_de_prueba(manifiesto=manifiesto)
        errores = errores_de(plan, manifiesto=manifiesto)
        self.assertTrue(any("B3-A" in e and "desincronizadas" in e for e in errores), errores)

    def test_escena_sin_fuente(self):
        manifiesto = manifiesto_de_prueba()
        manifiesto["scenes"][1]["source"] = {}
        plan = plan_de_prueba(manifiesto=manifiesto)
        errores = errores_de(plan, manifiesto=manifiesto)
        self.assertTrue(any("amenities" in e and "source" in e for e in errores), errores)

    def test_escena_con_kind_fuera_del_enum(self):
        manifiesto = manifiesto_de_prueba()
        manifiesto["scenes"][1]["kind"] = "gallery"
        plan = plan_de_prueba(manifiesto=manifiesto)
        errores = errores_de(plan, manifiesto=manifiesto)
        self.assertTrue(any("scene_kind" in e for e in errores), errores)

    def test_hotspot_del_manifiesto_sin_feature_en_el_geojson(self):
        """Sin este chequeo el degradado es silencioso: el hotspot se queda sin
        saber de qué tipo es y se carga como informativo, o sea que el Bloque 2
        entraría a la base como si fuera una laguna."""
        features = {k: v for k, v in FEATURES.items() if k != "B2"}
        plan = plan_de_prueba(features=features)
        errores = errores_de(plan, features=features)
        self.assertTrue(any("h-B2" in e and "ninguna feature" in e for e in errores), errores)

    def test_geometria_del_manifiesto_distinta_de_la_del_geojson(self):
        """El tour.json quedó viejo respecto del GeoJSON. Elegir una de las dos
        en silencio sería decidir a ciegas cuál tiene razón."""
        manifiesto = manifiesto_de_prueba()
        manifiesto["hotspots"][1]["geometry"] = [[0.9, 0.9], [0.8, 0.8]]
        plan = plan_de_prueba(manifiesto=manifiesto)
        errores = errores_de(plan, manifiesto=manifiesto)
        self.assertTrue(any("h-B2" in e and "no coinciden" in e for e in errores), errores)

    def test_hotspot_que_lleva_a_una_escena_inexistente(self):
        manifiesto = manifiesto_de_prueba()
        manifiesto["hotspots"][2]["action"] = {"kind": "goto", "sceneSlug": "no-existe"}
        plan = plan_de_prueba(manifiesto=manifiesto)
        errores = errores_de(plan, manifiesto=manifiesto)
        self.assertTrue(any("no-existe" in e for e in errores), errores)

    def test_hotspot_sin_sort_no_pasa(self):
        """Con todos empatados en 0, el orden de apilado del plano pasa a ser el
        que Postgres quiera y el perímetro puede tapar los bloques (0023)."""
        plan = plan_de_prueba()
        plan.hotspots[0]["sort"] = 0
        self.assertTrue(any("sin `sort`" in e for e in errores_de(plan)))

    def test_status_de_grupo_fuera_del_enum(self):
        plan = plan_de_prueba()
        plan.grupos[0]["status"] = "en preventa"
        self.assertTrue(any("B2" in e and "unit_status" in e for e in errores_de(plan)))

    def test_status_de_grupo_en_none_es_valido(self):
        """`null` no es un estado inválido: es "derivalo de las unidades"."""
        plan = plan_de_prueba()
        for grupo in plan.grupos:
            grupo["status"] = None
        self.assertEqual(errores_de(plan), [])

    def test_codigos_de_unidad_repetidos(self):
        filas = FILAS_CSV + [fila_csv()]
        plan = plan_de_prueba(filas_csv=filas)
        self.assertTrue(any("repite códigos" in e for e in errores_de(plan)))

    def test_subdominio_con_guion_bajo(self):
        """Prohibido por `projects_subdomain_format` (0022): Let's Encrypt no
        emite certificado para un hostname que lo contenga."""
        plan = plan_de_prueba(subdominio="baleia_dacal")
        self.assertTrue(any("projects_subdomain_format" in e for e in errores_de(plan)))

    def test_subdominio_demasiado_corto(self):
        self.assertTrue(any("subdominio" in e for e in errores_de(plan_de_prueba(subdominio="ba"))))

    def test_subdominio_valido_no_molesta(self):
        self.assertEqual(errores_de(plan_de_prueba(subdominio="baleia-dacal")), [])

    def test_slug_de_tenant_con_mayusculas(self):
        plan = plan_de_prueba(tenant="Dacal")
        self.assertTrue(any("--tenant" in e for e in errores_de(plan)))

    def test_kind_de_proyecto_fuera_del_enum(self):
        plan = plan_de_prueba(tipo_proyecto="barrio")
        self.assertTrue(any("project_kind" in e for e in errores_de(plan)))

    def test_se_juntan_todos_los_errores_no_corta_en_el_primero(self):
        """Arreglar un dato por corrida es la forma más lenta de arreglar tres."""
        plan = plan_de_prueba(tenant="Dacal", subdominio="ba", tipo_proyecto="barrio")
        self.assertGreaterEqual(len(errores_de(plan)), 3)


class Advertencias(unittest.TestCase):
    def _advertencias(self, plan, manifiesto=None):
        return validar(plan, features=FEATURES, manifiesto=manifiesto or manifiesto_de_prueba())[1]

    def test_el_recorte_real_no_dispara_avisos_de_perdida(self):
        """Los dos avisos que había acá —hotspots de bloque sin color, extras de
        escena sin columna— eran agujeros reales del publicador y del esquema.
        Los dos se taparon (0023-0027 y `pickSceneExtras`), así que una carga
        limpia ya no tiene que avisar ninguno de los dos.

        (El recorte sí dispara el aviso de features huérfanas: B3 tiene polígono
        pero el manifiesto de prueba no lo dibuja. Eso es del fixture, y tiene su
        propio test más abajo.)"""
        avisos = self._advertencias(plan_de_prueba())
        self.assertFalse(any("target_kind='group'" in a for a in avisos), avisos)
        self.assertFalse(any("sceneExtras" in a for a in avisos), avisos)

    def test_avisa_si_el_arranque_no_es_la_escena_de_menor_sort(self):
        """El publicador usa `scenes[0].slug` ordenando por `sort`; no lee
        `start`. Si no coinciden, el recorrido publicado abre en otro lado."""
        manifiesto = manifiesto_de_prueba()
        manifiesto["scenes"][0]["sort"] = 999
        plan = plan_de_prueba(manifiesto=manifiesto)
        avisos = self._advertencias(plan, manifiesto)
        self.assertTrue(any("menor `sort`" in a for a in avisos), avisos)

    def test_avisa_de_features_que_el_manifiesto_no_dibuja(self):
        features = dict(FEATURES)
        features["Z"] = {"kind": "amenity", "name": "Cancha", "anillo": [[0, 0], [1, 1], [0, 1]]}
        plan = plan_de_prueba(features=features)
        avisos = validar(plan, features=features, manifiesto=manifiesto_de_prueba())[1]
        self.assertTrue(any("features que el manifiesto no dibuja" in a for a in avisos), avisos)


if __name__ == "__main__":
    unittest.main(verbosity=2)
