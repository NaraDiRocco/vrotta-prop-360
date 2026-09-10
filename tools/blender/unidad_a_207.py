# -*- coding: utf-8 -*-
"""
Baleia (Punta Ballena, UY) — UNIDAD A = 207 DÚPLEX
Modelo paramétrico construido desde las plantas 2D acotadas del brochure.

Uso (headless, desde cero, idempotente):
  "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" --background --python tools/blender/unidad_a_207.py

Qué hace:
  1. Vacía la escena.
  2. Calibra la escala píxel→metro de los PNG de las plantas contra las cotas
     rotuladas (mínimos cuadrados) y reporta el error por cota en cm.
  3. Carga los dos PNG como Empties de imagen alineados al plano XY, ya
     escalados y posicionados, para que cualquiera pueda verificar en el .blend
     que los muros caen exactamente sobre el dibujo.
  4. Traza muros, losas, aberturas, escalera, mobiliario básico y contexto
     usando coordenadas EN PÍXELES leídas del plano (ver tablas más abajo) y
     la escala calibrada. Nada de proporciones estimadas a ojo.
  5. Materiales procedurales según 2-Materiales-Desde-Obra-Real.md.
  6. Cámara equirectangular en el living de PA a 1.60 m, mirando a +X (= este
     = mar), pitch 0. Render 2:1 y guardado del .blend.

Sistema de coordenadas del modelo:
  +X = ESTE = MAR = hacia la terraza (en el plano: hacia ABAJO de la imagen).
  +Y = hacia la DERECHA de la imagen del plano (hacia la unidad vecina 208).
  +Z = arriba. Z = 0 es el piso terminado de Planta Alta (PA).
  Conversión: X = (y_px - Y_FACHADA_px) / S ;  Y = (x_px - X_CENTRO_px) / S
"""

import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector

# =============================================================================
# CONSTANTES — SUPUESTOS DECLARADOS (las cotas del plano no dan alturas)
# =============================================================================
ALTURA_LIBRE = 2.60        # m, piso terminado a fondo de losa (supuesto)
ESP_LOSA = 0.25            # m, espesor de losa (supuesto)
ESP_MURO_EXT = 0.20        # m, sólo se usa para muros no medibles en el plano
ESP_MURO_INT = 0.10        # m, ídem
ALTURA_ENTREPISO = ALTURA_LIBRE + ESP_LOSA   # 2.85 m piso PA a piso PB
Z_PB = -ALTURA_ENTREPISO                     # piso terminado de PB

# Aberturas (deducidas del grafismo del plano y de las fotos de obra)
ANTEPECHO_VENTANA_LIVING = 0.30   # foto living: ventanal casi a piso
DINTEL_VENTANA_LIVING = 2.30
ANTEPECHO_VENTANA_COCINA = 1.20   # foto cocina: ventana horizontal sobre mesada
DINTEL_VENTANA_COCINA = 1.90
ANTEPECHO_VENTANA_BANO = 1.60
DINTEL_VENTANA_BANO = 2.30
ANTEPECHO_VENTANA_DORM = 1.00
DINTEL_VENTANA_DORM = 2.20
ALTO_PUERTA_INTERIOR = 2.10
ALTO_PUERTA_ENTRADA = 2.30        # foto: puerta pivotante alta, negra
ALTO_FACHADA_VIDRIO = ALTURA_LIBRE  # ventanal de piso a techo (foto fachada)
PERFIL_ALUMINIO = 0.05            # ancho de parante visible, perfil fino
ALTO_BARANDA = 1.05
ALTO_ZOCALO_BARANDA = 0.15        # perfil inferior de hormigón bajo el vidrio
PROFUNDIDAD_SEMICUBIERTA = 2.64   # m de terraza cubiertos por la losa superior
                                  # (33.26 m² semicubierta / 2 plantas / 6.3 m)
ALTO_CIELORRASO_COCINA_HALL = 2.40  # foto: cielorraso blanco más bajo en cocina/hall

# Render
RENDER_W = 2048            # ← subir a 8192 para entrega (RENDER_H sale solo)
RENDER_H = RENDER_W // 2   # 2:1 exacto, no tocar
RENDER_SAMPLES = 96
ALTURA_CAMARA = 1.60       # m sobre piso terminado (spec Baleia)
NOMBRE_RENDER = "B2-A_INT-LIVING_01_TEST_%dx%d.png" % (RENDER_W, RENDER_H)

# Rutas
RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
PLANO_PA = os.path.join(RAIZ, "docs", "09-MODELO-3D", "planos", "A-207-PA.png")
PLANO_PB = os.path.join(RAIZ, "docs", "09-MODELO-3D", "planos", "A-207-PB.png")
DIR_OUT = os.path.join(RAIZ, "tools", "blender", "out")
BLEND_OUT = os.path.join(DIR_OUT, "unidad_a_207.blend")

# =============================================================================
# CALIBRACIÓN PÍXEL → METRO
# Los tramos en píxeles se midieron sobre los PNG (900 DPI) detectando los
# muros (color oscuro del dibujo) por filas/columnas. Cada par es
# (nombre, píxeles medidos entre caras de muro, metros rotulados).
# =============================================================================
COTAS_PA = [
    ("PA Living ancho 6.05",      1664 - 182,  6.05),   # muro izq. int. → muro der. int.
    ("PA Living largo 4.31",      3830 - 2764, 4.31),   # línea punteada → línea de fachada
    ("PA Cocina ancho 2.90",      897 - 182,   2.90),   # muro izq. → cara ext. del pilar
    ("PA Cocina largo 3.73",      2764 - 1871, 3.73),   # muro superior → línea punteada
    ("PA Hall ancho 3.07",        1664 - 897,  3.07),
    ("PA Baño ancho 1.76",        1664 - 1223, 1.76),
    ("PA Baño largo 1.02",        1936 - 1676, 1.02),
    ("PA Terraza ancho 6.28",     1692 - 125,  6.28),   # entre caras exteriores
]
COTAS_PB = [
    ("PB Dorm ppal ancho 2.90",   892 - 189,   2.90),
    ("PB Dorm ppal largo 5.31",   2750 - 1455, 5.31),   # muro baño → fachada
    ("PB Dorm 2 ancho 2.87",      1665 - 955,  2.87),
    ("PB Dorm 2 largo 4.16",      2750 - 1735, 4.16),
    ("PB Vestidor ancho 1.71",    613 - 189,   1.71),
    ("PB Vestidor largo 3.95",    1707 - 724,  3.95),
    ("PB Baño ancho 1.41",        999 - 647,   1.41),
    ("PB Baño largo 2.80",        1421 - 724,  2.80),
    ("PB Lavadero ancho 2.50",    1665 - 1041, 2.50),
    ("PB Pasillo ancho 1.00",     1707 - 1455, 1.00),
    ("PB Pasillo largo 3.23",     1428 - 647,  3.23),
    ("PB Terraza ancho 6.34",     1692 - 133,  6.34),
]
# Cotas primarias exigidas para calibrar (Living en PA, Dormitorio ppal en PB)
PRIMARIAS = ("PA Living ancho 6.05", "PA Living largo 4.31",
             "PB Dorm ppal ancho 2.90", "PB Dorm ppal largo 5.31")


def calibrar():
    """Escala S (px/m) por mínimos cuadrados sobre las cotas primarias,
    verificada contra todas las demás. Devuelve S y lista de residuos (cm)."""
    todas = COTAS_PA + COTAS_PB
    prim = [c for c in todas if c[0] in PRIMARIAS]
    # min sum (px - S*m)^2  →  S = Σ(px·m)/Σ(m²)
    S = sum(px * m for _, px, m in prim) / sum(m * m for _, _, m in prim)
    residuos = []
    for nombre, px, m in todas:
        err_cm = (px / S - m) * 100.0
        residuos.append((nombre, px / S, m, err_cm))
    return S, residuos


S, RESIDUOS = calibrar()

# Anclajes de cada planta (px). Las dos plantas se alinean por su línea de
# fachada (X = 0) y por el eje central de la unidad (Y = 0).
PA_Y_FACHADA = 3830.0
PA_X_CENTRO = (125 + 1692) / 2.0
PB_Y_FACHADA = 2750.0
PB_X_CENTRO = (133 + 1692) / 2.0
PA_IMG = (1825, 4950)
PB_IMG = (1825, 3825)


def pa(x_px, y_px):
    """Píxel del plano PA → (X, Y) en metros."""
    return ((y_px - PA_Y_FACHADA) / S, (x_px - PA_X_CENTRO) / S)


def pb(x_px, y_px):
    """Píxel del plano PB → (X, Y) en metros."""
    return ((y_px - PB_Y_FACHADA) / S, (x_px - PB_X_CENTRO) / S)


# =============================================================================
# UTILIDADES DE ESCENA
# =============================================================================
def limpiar_escena():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for col in (bpy.data.meshes, bpy.data.materials, bpy.data.images,
                bpy.data.cameras, bpy.data.lights, bpy.data.worlds):
        for b in list(col):
            col.remove(b)


COLECCIONES = {}


def coleccion(nombre):
    if nombre in COLECCIONES:
        return COLECCIONES[nombre]
    c = bpy.data.collections.new(nombre)
    bpy.context.scene.collection.children.link(c)
    COLECCIONES[nombre] = c
    return c


def caja(nombre, x0, x1, y0, y1, z0, z1, mat, col="Arquitectura"):
    """Prisma alineado a ejes entre dos esquinas (metros). Idempotente por
    construcción: la escena se vacía al inicio."""
    x0, x1 = sorted((x0, x1)); y0, y1 = sorted((y0, y1)); z0, z1 = sorted((z0, z1))
    if x1 - x0 < 1e-4 or y1 - y0 < 1e-4 or z1 - z0 < 1e-4:
        return None
    verts = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
             (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    caras = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    me = bpy.data.meshes.new(nombre)
    me.from_pydata(verts, [], caras)
    me.update()
    ob = bpy.data.objects.new(nombre, me)
    if mat is not None:
        me.materials.append(mat)
    coleccion(col).objects.link(ob)
    return ob


def caja_px(nombre, conv, x0, x1, y0, y1, z0, z1, mat, col="Arquitectura"):
    """Caja definida por un rectángulo en PÍXELES del plano (conv = pa | pb)."""
    X0, Y0 = conv(x0, y0)
    X1, Y1 = conv(x1, y1)
    return caja(nombre, X0, X1, Y0, Y1, z0, z1, mat, col)


def muro_px(nombre, conv, x0, x1, y0, y1, z0, z1, mat, aberturas=(), col="Arquitectura"):
    """Muro en píxeles con aberturas. Cada abertura = (eje, a_px, b_px, zb, zt):
    eje 'x' si la abertura se mide a lo largo de x_px, 'y' si a lo largo de y_px.
    El muro se parte en tramos llenos + dintel + antepecho (sin booleanos)."""
    largo_en_x = (x1 - x0) >= (y1 - y0)
    a0, a1 = (x0, x1) if largo_en_x else (y0, y1)
    cortes = sorted((a, b, zb, zt) for _, a, b, zb, zt in aberturas)
    piezas = []
    cursor = a0
    for (a, b, zb, zt) in cortes:
        if a > cursor:
            piezas.append((cursor, a, z0, z1))
        if zb > z0:
            piezas.append((a, b, z0, zb))       # antepecho
        if zt < z1:
            piezas.append((a, b, zt, z1))       # dintel
        cursor = b
    if cursor < a1:
        piezas.append((cursor, a1, z0, z1))
    obs = []
    for i, (a, b, zb, zt) in enumerate(piezas):
        if largo_en_x:
            ob = caja_px("%s.%02d" % (nombre, i), conv, a, b, y0, y1, zb, zt, mat, col)
        else:
            ob = caja_px("%s.%02d" % (nombre, i), conv, x0, x1, a, b, zb, zt, mat, col)
        if ob:
            obs.append(ob)
    return obs


def plano_z(nombre, x0, x1, y0, y1, z, mat, col="Arquitectura", flip=False):
    verts = [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)]
    cara = (0, 3, 2, 1) if flip else (0, 1, 2, 3)
    me = bpy.data.meshes.new(nombre)
    me.from_pydata(verts, [], [cara])
    ob = bpy.data.objects.new(nombre, me)
    me.materials.append(mat)
    coleccion(col).objects.link(ob)
    return ob


def losa_con_hueco(nombre, x0, x1, y0, y1, z0, z1, mat, hueco):
    """Losa rectangular con un hueco rectangular (escalera). Se arma con 4
    cajas alrededor del hueco para evitar booleanos."""
    hx0, hx1, hy0, hy1 = hueco
    obs = [
        caja(nombre + ".a", x0, hx0, y0, y1, z0, z1, mat),
        caja(nombre + ".b", hx1, x1, y0, y1, z0, z1, mat),
        caja(nombre + ".c", hx0, hx1, y0, hy0, z0, z1, mat),
        caja(nombre + ".d", hx0, hx1, hy1, y1, z0, z1, mat),
    ]
    return [o for o in obs if o]


# =============================================================================
# MATERIALES PROCEDURALES (paleta de 2-Materiales-Desde-Obra-Real.md)
# =============================================================================
MATS = {}


def _nuevo_mat(nombre):
    m = bpy.data.materials.new(nombre)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    MATS[nombre] = m
    return m, nt, bsdf


def _coord(nt, escala=1.0, generado=False):
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (escala, escala, escala)
    nt.links.new(tc.outputs["Generated" if generado else "Object"], mp.inputs["Vector"])
    return mp.outputs["Vector"]


def mat_hormigon_tablas():
    """Hormigón visto encofrado con tablas: bandas horizontales de ~15 cm con
    junta marcada y veta de madera impresa. NO es hormigón liso."""
    m, nt, bsdf = _nuevo_mat("Hormigon_Encofrado_Tablas")
    vec = _coord(nt)
    # Tablas: ladrillos de 0.15 m de alto x 2.4 m de largo, junta 4 mm.
    # En superficies verticales (muros) las tablas corren horizontales;
    # en el cielorraso, a lo largo de Y. Se usa una proyección en XZ y otra en XY
    # mezcladas por la normal (aprox. triplanar barata).
    tab = nt.nodes.new("ShaderNodeTexBrick")
    tab.inputs["Scale"].default_value = 1.0
    tab.inputs["Mortar Size"].default_value = 0.004
    tab.inputs["Bias"].default_value = 0.0
    tab.inputs["Brick Width"].default_value = 2.4
    tab.inputs["Row Height"].default_value = 0.15
    tab.inputs["Color1"].default_value = (0.62, 0.61, 0.58, 1)
    tab.inputs["Color2"].default_value = (0.55, 0.54, 0.52, 1)
    tab.inputs["Mortar"].default_value = (0.30, 0.30, 0.29, 1)
    tab.offset = 0.5
    tab.offset_frequency = 2
    # Vector para las tablas: (X, Z) en muros y (Y, X) en cielorrasos → usamos
    # separar XYZ y elegir por la normal.
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(vec, sep.inputs["Vector"])
    comb_muro = nt.nodes.new("ShaderNodeCombineXYZ")   # muros: (x+y, z)
    add_xy = nt.nodes.new("ShaderNodeMath"); add_xy.operation = "ADD"
    nt.links.new(sep.outputs["X"], add_xy.inputs[0]); nt.links.new(sep.outputs["Y"], add_xy.inputs[1])
    nt.links.new(add_xy.outputs[0], comb_muro.inputs["X"])
    nt.links.new(sep.outputs["Z"], comb_muro.inputs["Y"])
    comb_techo = nt.nodes.new("ShaderNodeCombineXYZ")  # techo: (y, x)
    nt.links.new(sep.outputs["Y"], comb_techo.inputs["X"])
    nt.links.new(sep.outputs["X"], comb_techo.inputs["Y"])
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    nsep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Normal"], nsep.inputs["Vector"])
    nabs = nt.nodes.new("ShaderNodeMath"); nabs.operation = "ABSOLUTE"
    nt.links.new(nsep.outputs["Z"], nabs.inputs[0])
    mixv = nt.nodes.new("ShaderNodeMix"); mixv.data_type = "VECTOR"
    nt.links.new(nabs.outputs[0], mixv.inputs["Factor"])
    nt.links.new(comb_muro.outputs["Vector"], mixv.inputs[4])
    nt.links.new(comb_techo.outputs["Vector"], mixv.inputs[5])
    nt.links.new(mixv.outputs[1], tab.inputs["Vector"])
    # Veta de madera impresa: ondas finas a lo largo de la tabla + ruido
    veta = nt.nodes.new("ShaderNodeTexWave")
    veta.wave_type = "BANDS"; veta.bands_direction = "X"
    veta.inputs["Scale"].default_value = 60.0
    veta.inputs["Distortion"].default_value = 6.0
    veta.inputs["Detail"].default_value = 3.0
    nt.links.new(mixv.outputs[1], veta.inputs["Vector"])
    manchas = nt.nodes.new("ShaderNodeTexNoise")
    manchas.inputs["Scale"].default_value = 1.2
    manchas.inputs["Detail"].default_value = 6.0
    nt.links.new(vec, manchas.inputs["Vector"])
    # Color = tablas * (0.85 + 0.15 veta) * manchas
    m1 = nt.nodes.new("ShaderNodeMix"); m1.data_type = "RGBA"; m1.blend_type = "MULTIPLY"
    m1.inputs["Factor"].default_value = 0.18
    nt.links.new(tab.outputs["Color"], m1.inputs[6])
    nt.links.new(veta.outputs["Color"], m1.inputs[7])
    m2 = nt.nodes.new("ShaderNodeMix"); m2.data_type = "RGBA"; m2.blend_type = "MULTIPLY"
    m2.inputs["Factor"].default_value = 0.35
    nt.links.new(m1.outputs[2], m2.inputs[6])
    nt.links.new(manchas.outputs["Color"], m2.inputs[7])
    nt.links.new(m2.outputs[2], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.75
    # Relieve: junta entre tablas + veta
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.35
    bump.inputs["Distance"].default_value = 0.01
    nt.links.new(tab.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def mat_aluminio_negro():
    m, nt, bsdf = _nuevo_mat("Aluminio_Negro_Mate")
    bsdf.inputs["Base Color"].default_value = (0.02, 0.02, 0.022, 1)
    bsdf.inputs["Metallic"].default_value = 0.4
    bsdf.inputs["Roughness"].default_value = 0.55
    return m


def mat_vidrio(nombre="Vidrio", tinte=(0.92, 0.96, 0.97, 1)):
    m, nt, bsdf = _nuevo_mat(nombre)
    bsdf.inputs["Base Color"].default_value = tinte
    bsdf.inputs["Roughness"].default_value = 0.0
    bsdf.inputs["Transmission Weight"].default_value = 1.0
    bsdf.inputs["IOR"].default_value = 1.5
    return m


def mat_piso_madera():
    """Piso de madera clara en tabla larga (living, dormitorios, pasillo)."""
    m, nt, bsdf = _nuevo_mat("Piso_Madera_Clara")
    vec = _coord(nt)
    # tablas 0.19 x 1.80 m, corriendo en X (hacia el mar) como en las fotos
    sep = nt.nodes.new("ShaderNodeSeparateXYZ"); nt.links.new(vec, sep.inputs["Vector"])
    comb = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(sep.outputs["X"], comb.inputs["X"]); nt.links.new(sep.outputs["Y"], comb.inputs["Y"])
    tab = nt.nodes.new("ShaderNodeTexBrick")
    tab.inputs["Scale"].default_value = 1.0
    tab.inputs["Mortar Size"].default_value = 0.002
    tab.inputs["Brick Width"].default_value = 1.8
    tab.inputs["Row Height"].default_value = 0.19
    tab.inputs["Color1"].default_value = (0.66, 0.53, 0.38, 1)
    tab.inputs["Color2"].default_value = (0.58, 0.46, 0.32, 1)
    tab.inputs["Mortar"].default_value = (0.35, 0.27, 0.18, 1)
    tab.offset = 0.37; tab.offset_frequency = 3
    nt.links.new(comb.outputs["Vector"], tab.inputs["Vector"])
    veta = nt.nodes.new("ShaderNodeTexWave")
    veta.wave_type = "BANDS"; veta.bands_direction = "Y"
    veta.inputs["Scale"].default_value = 25.0
    veta.inputs["Distortion"].default_value = 4.0
    veta.inputs["Detail"].default_value = 2.0
    nt.links.new(vec, veta.inputs["Vector"])
    mx = nt.nodes.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.blend_type = "MULTIPLY"
    mx.inputs["Factor"].default_value = 0.12
    nt.links.new(tab.outputs["Color"], mx.inputs[6]); nt.links.new(veta.outputs["Color"], mx.inputs[7])
    nt.links.new(mx.outputs[2], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.35
    bsdf.inputs["Specular IOR Level"].default_value = 0.4
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.15; bump.inputs["Distance"].default_value = 0.002
    nt.links.new(tab.outputs["Fac"], bump.inputs["Height"]); nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def mat_loseta_terraza():
    """Loseta de hormigón gris, formato grande, junta marcada."""
    m, nt, bsdf = _nuevo_mat("Loseta_Hormigon_Terraza")
    vec = _coord(nt)
    tab = nt.nodes.new("ShaderNodeTexBrick")
    tab.inputs["Scale"].default_value = 1.0
    tab.inputs["Mortar Size"].default_value = 0.006
    tab.inputs["Brick Width"].default_value = 0.60
    tab.inputs["Row Height"].default_value = 0.60
    tab.inputs["Color1"].default_value = (0.52, 0.52, 0.50, 1)
    tab.inputs["Color2"].default_value = (0.46, 0.46, 0.45, 1)
    tab.inputs["Mortar"].default_value = (0.25, 0.25, 0.25, 1)
    tab.offset = 0.0
    nt.links.new(vec, tab.inputs["Vector"])
    ruido = nt.nodes.new("ShaderNodeTexNoise"); ruido.inputs["Scale"].default_value = 8.0
    nt.links.new(vec, ruido.inputs["Vector"])
    mx = nt.nodes.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.blend_type = "MULTIPLY"
    mx.inputs["Factor"].default_value = 0.25
    nt.links.new(tab.outputs["Color"], mx.inputs[6]); nt.links.new(ruido.outputs["Color"], mx.inputs[7])
    nt.links.new(mx.outputs[2], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.8
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.4; bump.inputs["Distance"].default_value = 0.01
    nt.links.new(tab.outputs["Fac"], bump.inputs["Height"]); nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def mat_granito_negro():
    """Granito negro muy reflectante (mesadas)."""
    m, nt, bsdf = _nuevo_mat("Granito_Negro")
    vec = _coord(nt, escala=400.0)
    ruido = nt.nodes.new("ShaderNodeTexNoise")
    ruido.inputs["Scale"].default_value = 1.0; ruido.inputs["Detail"].default_value = 2.0
    nt.links.new(vec, ruido.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.45; ramp.color_ramp.elements[0].color = (0.01, 0.01, 0.012, 1)
    ramp.color_ramp.elements[1].position = 0.75; ramp.color_ramp.elements[1].color = (0.22, 0.22, 0.24, 1)
    nt.links.new(ruido.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.06
    bsdf.inputs["Specular IOR Level"].default_value = 0.8
    bsdf.inputs["Coat Weight"].default_value = 0.6
    return m


def mat_simple(nombre, color, rough=0.5, metal=0.0, spec=0.5):
    m, nt, bsdf = _nuevo_mat(nombre)
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Specular IOR Level"].default_value = spec
    return m


def mat_madera_mueble():
    """Madera clara tipo roble/guatambú para muebles y puertas."""
    m, nt, bsdf = _nuevo_mat("Madera_Mueble_Roble")
    vec = _coord(nt)
    veta = nt.nodes.new("ShaderNodeTexWave")
    veta.wave_type = "BANDS"; veta.bands_direction = "Z"
    veta.inputs["Scale"].default_value = 30.0
    veta.inputs["Distortion"].default_value = 5.0; veta.inputs["Detail"].default_value = 2.0
    nt.links.new(vec, veta.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.55, 0.38, 0.22, 1)
    ramp.color_ramp.elements[1].color = (0.72, 0.53, 0.33, 1)
    nt.links.new(veta.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.45
    return m


def mat_agua():
    m, nt, bsdf = _nuevo_mat("Mar")
    bsdf.inputs["Base Color"].default_value = (0.04, 0.16, 0.30, 1)
    bsdf.inputs["Roughness"].default_value = 0.30
    bsdf.inputs["Specular IOR Level"].default_value = 0.2
    vec = _coord(nt, escala=0.02)
    ruido = nt.nodes.new("ShaderNodeTexNoise"); ruido.inputs["Scale"].default_value = 40.0
    ruido.inputs["Detail"].default_value = 8.0
    nt.links.new(vec, ruido.inputs["Vector"])
    bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.08
    nt.links.new(ruido.outputs["Fac"], bump.inputs["Height"]); nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def crear_materiales():
    mat_hormigon_tablas()
    mat_aluminio_negro()
    mat_vidrio()
    mat_vidrio("Vidrio_Baranda", (0.85, 0.93, 0.92, 1))
    mat_piso_madera()
    mat_loseta_terraza()
    mat_granito_negro()
    mat_madera_mueble()
    mat_agua()
    mat_simple("Pared_Blanca", (0.86, 0.86, 0.84), rough=0.7, spec=0.3)
    mat_simple("Cielorraso_Blanco", (0.90, 0.90, 0.88), rough=0.8, spec=0.2)
    mat_simple("Frente_Negro", (0.03, 0.03, 0.035), rough=0.5, spec=0.4)
    mat_simple("Porcelanato_Claro", (0.78, 0.76, 0.72), rough=0.2, spec=0.6)
    mat_simple("Hormigon_Liso", (0.5, 0.5, 0.48), rough=0.85, spec=0.3)
    mat_simple("Acero_Negro", (0.02, 0.02, 0.02), rough=0.4, metal=0.8)
    mat_simple("Tierra", (0.30, 0.22, 0.15), rough=1.0, spec=0.1)
    mat_simple("Pasto", (0.22, 0.30, 0.10), rough=1.0, spec=0.1)
    mat_simple("Gramineas", (0.55, 0.60, 0.25), rough=0.9, spec=0.2)
    mat_simple("Tela_Gris", (0.35, 0.35, 0.33), rough=0.9, spec=0.2)
    mat_simple("Ceramica_Blanca", (0.92, 0.92, 0.90), rough=0.1, spec=0.7)
    mat_simple("Vecino_Oscuro", (0.10, 0.10, 0.11), rough=0.6, spec=0.4)


def M(n):
    return MATS[n]


# =============================================================================
# REFERENCIAS: LOS PLANOS COMO EMPTIES DE IMAGEN, CALIBRADOS
# =============================================================================
def cargar_plano_como_empty(nombre, ruta, tam_px, conv, z):
    img = bpy.data.images.load(ruta)
    W, H = tam_px
    e = bpy.data.objects.new(nombre, None)
    e.empty_display_type = "IMAGE"
    e.data = img
    # El lado mayor del empty mide empty_display_size; ambas plantas son más
    # altas que anchas → el alto de la imagen = H/S metros.
    e.empty_display_size = H / S
    e.empty_image_offset = (-0.5, -0.5)     # centrado
    # Rotación +90° en Z: derecha de la imagen → +Y ; abajo de la imagen → +X
    e.rotation_euler = (0.0, 0.0, math.radians(90.0))
    X, Y = conv(W / 2.0, H / 2.0)
    e.location = (X, Y, z)
    e.hide_render = True
    e.show_in_front = False
    coleccion("Referencias_Planos").objects.link(e)
    return e


# =============================================================================
# PLANTA ALTA (PA) — coordenadas en px de A-207-PA.png
# =============================================================================
def construir_PA():
    HORM = M("Hormigon_Encofrado_Tablas")
    PARED = M("Pared_Blanca")
    Z0, Z1 = 0.0, ALTURA_LIBRE
    ZT = ALTURA_LIBRE + ESP_LOSA
    X_TERR = PROFUNDIDAD_SEMICUBIERTA
    X_TERR_TOTAL = 3.62           # cota rotulada "Terraza 6.28 x 3.62"

    # --- Muros exteriores (hormigón visto por fuera; interior revocado blanco:
    #     se modela el muro en hormigón y una piel interior fina blanca) ---
    # Muro izquierdo (lado -Y) con ventanal del living
    muro_px("PA_muro_izq", pa, 125, 182, 1814, 3878, Z0, ZT, HORM,
            aberturas=[("y", 3004, 3643, ANTEPECHO_VENTANA_LIVING, DINTEL_VENTANA_LIVING)])
    # Muro superior de cocina (lado oeste) con ventana horizontal sobre mesada
    muro_px("PA_muro_cocina_oeste", pa, 125, 897, 1814, 1871, Z0, ZT, HORM,
            aberturas=[("x", 217, 605, ANTEPECHO_VENTANA_COCINA, DINTEL_VENTANA_COCINA)])
    # Pilar/tabique negro entre cocina y vestíbulo de entrada (foto: columna negra)
    caja_px("PA_pilar_cocina", pa, 848, 897, 1636, 2036, Z0, ZT, M("Frente_Negro"))
    # Muro superior hall + baño (lado oeste) con puerta de entrada
    muro_px("PA_muro_hall_oeste", pa, 897, 1692, 1636, 1676, Z0, ZT, HORM,
            aberturas=[("x", 897, 1199, 0.0, ALTO_PUERTA_ENTRADA)])
    # Muro derecho (medianera con la 208) con ventanita del baño
    muro_px("PA_muro_der", pa, 1664, 1692, 1636, 3830, Z0, ZT, HORM,
            aberturas=[("y", 1792, 1936, ANTEPECHO_VENTANA_BANO, DINTEL_VENTANA_BANO)])

    # --- Pieles interiores blancas (revoque) sobre los muros exteriores ---
    PIEL = 0.015
    # izquierda, tramo living + cocina (con el hueco de la ventana)
    muro_px("PA_piel_izq", pa, 182, 182 + PIEL * S, 1871, 3830, Z0, Z1, PARED,
            aberturas=[("y", 3004, 3643, ANTEPECHO_VENTANA_LIVING, DINTEL_VENTANA_LIVING)])
    muro_px("PA_piel_cocina_oeste", pa, 182, 848, 1871, 1871 + PIEL * S, Z0, Z1, PARED,
            aberturas=[("x", 217, 605, ANTEPECHO_VENTANA_COCINA, DINTEL_VENTANA_COCINA)])
    muro_px("PA_piel_hall_oeste", pa, 897, 1664, 1676, 1676 + PIEL * S, Z0, Z1, PARED,
            aberturas=[("x", 897, 1199, 0.0, ALTO_PUERTA_ENTRADA)])
    muro_px("PA_piel_der", pa, 1664 - PIEL * S, 1664, 1676, 3830, Z0, Z1, PARED,
            aberturas=[("y", 1792, 1936, ANTEPECHO_VENTANA_BANO, DINTEL_VENTANA_BANO)])

    # --- Tabiques interiores (blancos) ---
    caja_px("PA_tab_bano_oeste", pa, 1199, 1223, 1671, 1964, Z0, Z1, PARED)
    muro_px("PA_tab_bano_sur", pa, 1223, 1664, 1936, 1964, Z0, Z1, PARED,
            aberturas=[("x", 1223, 1399, 0.0, ALTO_PUERTA_INTERIOR)])
    # Puerta del baño (hoja cerrada, madera clara)
    caja_px("PA_puerta_bano", pa, 1223, 1399, 1940, 1960, 0.0, ALTO_PUERTA_INTERIOR, M("Madera_Mueble_Roble"))
    # Puerta de entrada (pivotante negra, cerrada)
    caja_px("PA_puerta_entrada", pa, 897, 1199, 1646, 1666, 0.0, ALTO_PUERTA_ENTRADA, M("Aluminio_Negro_Mate"))

    # --- Fachada este: vidrio de piso a techo con perfiles de aluminio negro ---
    # Pilar de hormigón central (medido en el plano: x 891-947, y 3815-3878)
    caja_px("PA_pilar_fachada", pa, 891, 947, 3815, 3878, Z0, ZT, HORM)
    # Paños: fijo | puerta | pilar | puerta | fijo  (x en px sobre y 3840-3860)
    panos = [("fijo_a", 182, 655), ("puerta_a", 668, 891), ("puerta_b", 947, 1170), ("fijo_b", 1184, 1585)]
    yv0, yv1 = 3843, 3857
    for nombre, a, b in panos:
        caja_px("PA_fachada_vidrio_" + nombre, pa, a + PERFIL_ALUMINIO * S, b - PERFIL_ALUMINIO * S,
                yv0 + 4, yv1 - 4, 0.02, ALTO_FACHADA_VIDRIO - 0.05, M("Vidrio"))
        # parantes
        caja_px("PA_fachada_parante_" + nombre + "_i", pa, a, a + PERFIL_ALUMINIO * S, yv0, yv1, Z0, ALTO_FACHADA_VIDRIO, M("Aluminio_Negro_Mate"))
        caja_px("PA_fachada_parante_" + nombre + "_d", pa, b - PERFIL_ALUMINIO * S, b, yv0, yv1, Z0, ALTO_FACHADA_VIDRIO, M("Aluminio_Negro_Mate"))
        # travesaños inferior y superior
        caja_px("PA_fachada_trav_inf_" + nombre, pa, a, b, yv0, yv1, 0.0, 0.05, M("Aluminio_Negro_Mate"))
        caja_px("PA_fachada_trav_sup_" + nombre, pa, a, b, yv0, yv1, ALTO_FACHADA_VIDRIO - 0.05, ALTO_FACHADA_VIDRIO, M("Aluminio_Negro_Mate"))
    # Marcos de puerta (lado pilar) más gruesos
    caja_px("PA_fachada_marco_1", pa, 655, 668, yv0, yv1, Z0, ALTO_FACHADA_VIDRIO, M("Aluminio_Negro_Mate"))
    caja_px("PA_fachada_marco_2", pa, 1170, 1184, yv0, yv1, Z0, ALTO_FACHADA_VIDRIO, M("Aluminio_Negro_Mate"))
    # Parrillero (bloque de hormigón a la derecha de la terraza, medido en plano)
    caja_px("PA_parrillero", pa, 1585, 1692, 3822, 4172, Z0, ZT, HORM)
    caja_px("PA_parrillero_boca", pa, 1592, 1600, 3900, 4100, 0.85, 1.55, M("Frente_Negro"))

    # --- Ventanas: vidrio + marco de aluminio negro ---
    def ventana_px(nombre, x0, x1, y0, y1, zb, zt):
        caja_px(nombre + "_vidrio", pa, x0, x1, y0, y1, zb + 0.04, zt - 0.04, M("Vidrio"))
        # marco perimetral
        if (x1 - x0) < (y1 - y0):   # ventana en muro paralelo a X (vidrio en plano XZ)
            caja_px(nombre + "_m1", pa, x0 - 2, x1 + 2, y0, y0 + PERFIL_ALUMINIO * S, zb, zt, M("Aluminio_Negro_Mate"))
            caja_px(nombre + "_m2", pa, x0 - 2, x1 + 2, y1 - PERFIL_ALUMINIO * S, y1, zb, zt, M("Aluminio_Negro_Mate"))
        else:
            caja_px(nombre + "_m1", pa, x0, x0 + PERFIL_ALUMINIO * S, y0 - 2, y1 + 2, zb, zt, M("Aluminio_Negro_Mate"))
            caja_px(nombre + "_m2", pa, x1 - PERFIL_ALUMINIO * S, x1, y0 - 2, y1 + 2, zb, zt, M("Aluminio_Negro_Mate"))
        caja_px(nombre + "_m3", pa, x0, x1, y0, y1, zb, zb + 0.05, M("Aluminio_Negro_Mate"))
        caja_px(nombre + "_m4", pa, x0, x1, y0, y1, zt - 0.05, zt, M("Aluminio_Negro_Mate"))
    ventana_px("PA_ventana_living", 140, 170, 3004, 3643, ANTEPECHO_VENTANA_LIVING, DINTEL_VENTANA_LIVING)
    ventana_px("PA_ventana_cocina", 217, 605, 1830, 1856, ANTEPECHO_VENTANA_COCINA, DINTEL_VENTANA_COCINA)
    ventana_px("PA_ventana_bano", 1670, 1686, 1792, 1936, ANTEPECHO_VENTANA_BANO, DINTEL_VENTANA_BANO)

    # --- Losas ---
    # Losa de piso PA: cubre la planta y la terraza (es el techo de PB y de su
    # terraza). Hueco de escalera medido en plano: x 1425-1664, y 1990-2940.
    xA, _ = pa(0, 1636); xB = X_TERR_TOTAL
    _, yA = pa(125, 0); _, yB = pa(1692, 0)
    hx0, hy0 = pa(1425, 1990); hx1, hy1 = pa(1664, 2940)
    losa_con_hueco("PA_losa_piso", xA, xB, yA, yB, -ESP_LOSA, 0.0, HORM, (hx0, hx1, hy0, hy1))
    # Losa de techo: cubre planta + PROFUNDIDAD_SEMICUBIERTA de terraza
    caja("PA_losa_techo", xA, X_TERR, yA, yB, ALTURA_LIBRE, ZT, HORM)
    # Cielorraso blanco más bajo sobre cocina + hall (foto del living)
    xc0, _ = pa(0, 1676); xc1, _ = pa(0, 2764)
    _, yc0 = pa(182, 0); _, yc1 = pa(1664, 0)
    caja("PA_cielorraso_cocina_hall", xc0, xc1, yc0, yc1, ALTO_CIELORRASO_COCINA_HALL, ALTO_CIELORRASO_COCINA_HALL + 0.02, M("Cielorraso_Blanco"))
    # Viga/canto del cielorraso bajo (frente hacia el living)
    caja("PA_cielorraso_canto", xc1 - 0.02, xc1, yc0, yc1, ALTO_CIELORRASO_COCINA_HALL, ALTURA_LIBRE, M("Cielorraso_Blanco"))

    # --- Pisos ---
    # Madera clara: living + hall + cocina (el hueco de escalera lo cubre la losa)
    losa_con_hueco("PA_piso_madera", xA + 0.02, 0.0, yc0, yc1, 0.0, 0.012, M("Piso_Madera_Clara"), (hx0, hx1, hy0, hy1))
    # Baño: porcelanato
    caja_px("PA_piso_bano", pa, 1223, 1664, 1676, 1936, 0.012, 0.02, M("Porcelanato_Claro"))
    # Terraza: losetas de hormigón, excluyendo el parrillero
    _, yp = pa(1585, 0)
    caja("PA_piso_terraza", 0.0, X_TERR_TOTAL, yA, yp, -0.02, 0.0, M("Loseta_Hormigon_Terraza"))
    caja("PA_piso_terraza_b", pa(0, 4172)[0], X_TERR_TOTAL, yp, yB, -0.02, 0.0, M("Loseta_Hormigon_Terraza"))

    # --- Barandas de vidrio con perfil inferior de hormigón (terraza) ---
    def baranda(nombre, x0, x1, y0, y1):
        caja(nombre + "_zocalo", x0, x1, y0, y1, 0.0, ALTO_ZOCALO_BARANDA, M("Hormigon_Liso"))
        e = 0.012
        cx = (x0 + x1) / 2; cy = (y0 + y1) / 2
        if (x1 - x0) > (y1 - y0):
            caja(nombre + "_vidrio", x0, x1, cy - e, cy + e, ALTO_ZOCALO_BARANDA, ALTO_BARANDA + ALTO_ZOCALO_BARANDA, M("Vidrio_Baranda"))
        else:
            caja(nombre + "_vidrio", cx - e, cx + e, y0, y1, ALTO_ZOCALO_BARANDA, ALTO_BARANDA + ALTO_ZOCALO_BARANDA, M("Vidrio_Baranda"))
    baranda("PA_baranda_frente", X_TERR_TOTAL - 0.12, X_TERR_TOTAL, yA, yB)
    baranda("PA_baranda_izq", 0.0, X_TERR_TOTAL, yA, yA + 0.12)
    # División con la terraza vecina (lado derecho, más allá del parrillero)
    caja("PA_division_terraza_der", pa(0, 4172)[0], X_TERR_TOTAL, yB - 0.03, yB, 0.0, 1.8, M("Vidrio_Baranda"))
    # Jardinera de hormigón con gramíneas (esquina derecha, tramo achurado del plano)
    jx0, jy0 = pa(1600, 4450); jx1, jy1 = pa(1692, 4640)
    caja("PA_jardinera", jx0, jx1, jy0, jy1, 0.0, 0.45, M("Hormigon_Liso"))
    gramineas("PA_gramineas", jx0, jx1, jy0, jy1, 0.45, 24)

    # --- Escalera: baja desde el living (y 2940) hacia el oeste hasta PB (y 2190) ---
    construir_escalera(hx0, hx1, hy0, hy1)

    # --- Cocina (foto: L en muro oeste + izquierdo, península hacia el living) ---
    ROBLE = M("Madera_Mueble_Roble"); GRAN = M("Granito_Negro"); NEG = M("Frente_Negro")
    # Bajo mesada muro oeste (y 1871 → 1871+0.60 m), x 182 → 848
    caja_px("PA_coc_bajo_oeste", pa, 182, 848, 1875, 1875 + 0.60 * S, 0.0, 0.86, ROBLE)
    caja_px("PA_coc_mesada_oeste", pa, 182, 848, 1875, 1875 + 0.62 * S, 0.86, 0.90, GRAN)
    caja_px("PA_coc_aereo_oeste", pa, 182, 848, 1875, 1875 + 0.35 * S, 1.45, 2.10, ROBLE)
    caja_px("PA_coc_aereo_negro", pa, 182, 848, 1875, 1875 + 0.35 * S, 2.10, ALTO_CIELORRASO_COCINA_HALL, NEG)
    # Bajo mesada muro izquierdo (x 182 → +0.60), y 1875+0.6 → 2223
    caja_px("PA_coc_bajo_izq", pa, 186, 186 + 0.60 * S, 1875 + 0.60 * S, 2223, 0.0, 0.86, ROBLE)
    caja_px("PA_coc_mesada_izq", pa, 186, 186 + 0.62 * S, 1875 + 0.60 * S, 2223, 0.86, 0.90, GRAN)
    # Península (medida en plano: y 2223-2366, x 326-833) con frente negro al living
    caja_px("PA_coc_peninsula", pa, 326, 833, 2223, 2366, 0.0, 0.86, NEG)
    caja_px("PA_coc_peninsula_mesada", pa, 316, 843, 2213, 2376, 0.86, 0.90, GRAN)
    # Anafe y bacha (detalles negros sobre granito)
    caja_px("PA_coc_bacha", pa, 300, 480, 1890, 1990, 0.90, 0.905, NEG)
    caja_px("PA_coc_anafe", pa, 560, 740, 1890, 1990, 0.90, 0.905, NEG)
    # Grifería negra
    caja_px("PA_coc_griferia", pa, 385, 395, 2000, 2010, 0.90, 1.22, M("Acero_Negro"))
    # Banquetas (2) del lado del living
    for i, xq in enumerate((420, 700)):
        caja_px("PA_banqueta_%d" % i, pa, xq, xq + 0.35 * S, 2400, 2400 + 0.35 * S, 0.62, 0.66, ROBLE)
        caja_px("PA_banqueta_pata_%d" % i, pa, xq + 0.16 * S, xq + 0.19 * S, 2400 + 0.16 * S, 2400 + 0.19 * S, 0.0, 0.62, M("Acero_Negro"))

    # --- Mobiliario living (cajas simples, posiciones tomadas del plano) ---
    caja_px("PA_mesa_comedor", pa, 347, 620, 3013, 3596, 0.72, 0.76, ROBLE)
    for i, (xs, ys) in enumerate([(300, 3060), (300, 3260), (300, 3460), (660, 3060), (660, 3260), (660, 3460)]):
        caja_px("PA_silla_%d" % i, pa, xs, xs + 0.42 * S, ys, ys + 0.42 * S, 0.43, 0.46, ROBLE)
        caja_px("PA_silla_resp_%d" % i, pa, xs if xs < 400 else xs + 0.38 * S, (xs + 0.04 * S) if xs < 400 else xs + 0.42 * S, ys, ys + 0.42 * S, 0.46, 0.85, ROBLE)
    # Sofá contra el muro derecho (plano: x 1463-1637, y 3100-3620) + mesa ratona
    caja_px("PA_sofa", pa, 1440, 1650, 3100, 3620, 0.0, 0.42, M("Tela_Gris"))
    caja_px("PA_sofa_respaldo", pa, 1590, 1650, 3100, 3620, 0.42, 0.80, M("Tela_Gris"))
    caja_px("PA_mesa_ratona", pa, 1090, 1360, 3200, 3520, 0.30, 0.34, ROBLE)

    # --- Baño PA: inodoro y bacha (cajas) ---
    caja_px("PA_bano_mueble", pa, 1500, 1660, 1690, 1830, 0.0, 0.80, ROBLE)
    caja_px("PA_bano_mesada", pa, 1495, 1664, 1685, 1835, 0.80, 0.83, GRAN)
    caja_px("PA_bano_bacha", pa, 1540, 1620, 1720, 1800, 0.83, 0.95, M("Ceramica_Blanca"))
    caja_px("PA_bano_inodoro", pa, 1330, 1470, 1690, 1830, 0.0, 0.42, M("Ceramica_Blanca"))

    # --- Terraza: mesa y sillas (plano) ---
    caja_px("PA_terr_mesa", pa, 590, 940, 4030, 4360, 0.70, 0.74, ROBLE)
    for i, (xs, ys) in enumerate([(430, 4040), (430, 4220), (1000, 4040), (1000, 4220)]):
        caja_px("PA_terr_silla_%d" % i, pa, xs, xs + 0.45 * S, ys, ys + 0.45 * S, 0.42, 0.45, M("Frente_Negro"))


def gramineas(nombre, x0, x1, y0, y1, z, n):
    """Manojo de gramíneas: cilindros finos inclinados al azar (barato)."""
    import random
    rnd = random.Random(7)
    bm = bmesh.new()
    for i in range(n):
        px = rnd.uniform(x0 + 0.05, x1 - 0.05); py = rnd.uniform(y0 + 0.05, y1 - 0.05)
        alto = rnd.uniform(0.5, 0.9)
        tx = rnd.uniform(-0.25, 0.25); ty = rnd.uniform(-0.25, 0.25)
        for k in range(6):
            a = k * math.pi / 3
            r = 0.004
            v0 = bm.verts.new((px + r * math.cos(a), py + r * math.sin(a), z))
            v1 = bm.verts.new((px + r * math.cos(a) + tx * alto, py + r * math.sin(a) + ty * alto, z + alto))
            if k > 0:
                bm.faces.new((prev0, v0, v1, prev1))
            prev0, prev1 = v0, v1
            if k == 0:
                first0, first1 = v0, v1
        bm.faces.new((prev0, first0, first1, prev1))
    me = bpy.data.meshes.new(nombre); bm.to_mesh(me); bm.free()
    me.materials.append(M("Gramineas"))
    ob = bpy.data.objects.new(nombre, me)
    coleccion("Paisaje").objects.link(ob)
    return ob


def construir_escalera(hx0, hx1, hy0, hy1):
    """Escalera recta de hormigón visto entre PA (Z=0) y PB (Z_PB).
    Arranque arriba en X = hx1 (lado living), baja hacia -X (oeste).
    Ancho = todo el hueco (Y de hy0 a hy1). Baranda de vidrio hacia el hall
    y pasamanos negro contra la medianera (foto escalera/7IV01156.jpg)."""
    HORM = M("Hormigon_Encofrado_Tablas")
    n_alz = 15
    alz = ALTURA_ENTREPISO / n_alz          # ≈ 0.19 m
    # Huellas dibujadas en el plano entre y_px 2190 y 2940 (14 huellas); el
    # hueco de losa (hx0) sigue 0.8 m más al oeste sobre el desembarco de PB.
    x_pie, _ = pa(0, 2190)
    largo = hx1 - x_pie                     # ≈ 3.07 m
    huella = largo / (n_alz - 1)            # ≈ 0.22 m
    for i in range(n_alz - 1):
        # peldaño i: desde arriba, top a Z = -alz*(i+1)
        ztop = -alz * (i + 1)
        xa = hx1 - huella * (i + 1)
        xb = hx1 - huella * i
        caja("Esc_peldano_%02d" % i, xa, xb, hy0, hy1, ztop - alz - 0.12, ztop, HORM)
    # Losa inclinada de la escalera (llenado bajo los peldaños) simplificada como cajas descendentes
    # Baranda de vidrio sobre el borde del hueco (lado hall, Y = hy0) y cabecera oeste
    e = 0.012
    caja("Esc_baranda_vidrio_lat", hx0, hx1, hy0 - e, hy0 + e, 0.0, ALTO_BARANDA, M("Vidrio_Baranda"))
    caja("Esc_baranda_vidrio_cab", hx0 - e, hx0 + e, hy0, hy1, 0.0, ALTO_BARANDA, M("Vidrio_Baranda"))
    caja("Esc_baranda_perfil_lat", hx0, hx1, hy0 - 0.02, hy0 + 0.02, 0.0, 0.05, M("Aluminio_Negro_Mate"))
    caja("Esc_baranda_perfil_cab", hx0 - 0.02, hx0 + 0.02, hy0, hy1, 0.0, 0.05, M("Aluminio_Negro_Mate"))
    # Pasamanos negro en la medianera (lado hy1), inclinado: cajas cortas
    for i in range(12):
        t0 = i / 12.0; t1 = (i + 1) / 12.0
        xa = hx1 - largo * t1; xb = hx1 - largo * t0
        z = 0.95 - ALTURA_ENTREPISO * (t0 + t1) / 2
        caja("Esc_pasamanos_%02d" % i, xa, xb, hy1 - 0.06, hy1 - 0.02, z - 0.02, z + 0.02, M("Acero_Negro"))


# =============================================================================
# PLANTA BAJA (PB) — coordenadas en px de A-207-PB.png
# =============================================================================
def construir_PB():
    HORM = M("Hormigon_Encofrado_Tablas")
    PARED = M("Pared_Blanca")
    Z0 = Z_PB; Z1 = Z_PB + ALTURA_LIBRE
    X_TERR_TOTAL = 3.57            # cota rotulada "Terraza 6.34 x 3.57"

    # Muros exteriores
    caja_px("PB_muro_oeste", pb, 133, 1692, 653, 724, Z0 - ESP_LOSA, 0.0, HORM)   # de contención
    muro_px("PB_muro_izq", pb, 133, 189, 653, 2768, Z0 - ESP_LOSA, 0.0, HORM,
            aberturas=[("y", 2445, 2597, Z0 + ANTEPECHO_VENTANA_DORM, Z0 + DINTEL_VENTANA_DORM)])
    caja_px("PB_muro_der", pb, 1665, 1692, 653, 3004, Z0 - ESP_LOSA, 0.0, HORM)   # medianera, sigue 1 m en terraza
    # Pieles blancas interiores
    PIEL = 0.015
    caja_px("PB_piel_oeste", pb, 189, 1665, 724, 724 + PIEL * S, Z0, Z1, PARED)
    muro_px("PB_piel_izq", pb, 189, 189 + PIEL * S, 724, 2750, Z0, Z1, PARED,
            aberturas=[("y", 2445, 2597, Z0 + ANTEPECHO_VENTANA_DORM, Z0 + DINTEL_VENTANA_DORM)])
    caja_px("PB_piel_der", pb, 1665 - PIEL * S, 1665, 724, 2750, Z0, Z1, PARED)
    # Ventana dorm ppal
    caja_px("PB_ventana_dorm_vidrio", pb, 150, 170, 2445, 2597, Z0 + ANTEPECHO_VENTANA_DORM + 0.04, Z0 + DINTEL_VENTANA_DORM - 0.04, M("Vidrio"))
    caja_px("PB_ventana_dorm_m1", pb, 140, 180, 2445, 2445 + PERFIL_ALUMINIO * S, Z0 + ANTEPECHO_VENTANA_DORM, Z0 + DINTEL_VENTANA_DORM, M("Aluminio_Negro_Mate"))
    caja_px("PB_ventana_dorm_m2", pb, 140, 180, 2597 - PERFIL_ALUMINIO * S, 2597, Z0 + ANTEPECHO_VENTANA_DORM, Z0 + DINTEL_VENTANA_DORM, M("Aluminio_Negro_Mate"))

    # Tabiques interiores (medidos en plano)
    muro_px("PB_tab_vestidor_bano", pb, 613, 647, 724, 1455, Z0, Z1, PARED,
            aberturas=[("y", 1118, 1299, Z0, Z0 + ALTO_PUERTA_INTERIOR)])
    caja_px("PB_puerta_bano", pb, 620, 640, 1118, 1299, Z0, Z0 + ALTO_PUERTA_INTERIOR, M("Madera_Mueble_Roble"))
    caja_px("PB_tab_bano_lavadero", pb, 999, 1041, 724, 1455, Z0, Z1, PARED)
    caja_px("PB_tab_banos_sur", pb, 613, 1206, 1421, 1455, Z0, Z1, PARED)
    caja_px("PB_puerta_lavadero", pb, 1206, 1378, 1428, 1448, Z0, Z0 + ALTO_PUERTA_INTERIOR, M("Madera_Mueble_Roble"))
    caja_px("PB_tab_escalera", pb, 1378, 1428, 1091, 1477, Z0, Z1, PARED)
    # Vestíbulo de vestidor/pasillo: dos machones y puerta entre ellos
    caja_px("PB_tab_vest_pas_a", pb, 827, 862, 1455, 1477, Z0, Z1, PARED)
    caja_px("PB_tab_vest_pas_b", pb, 827, 862, 1679, 1742, Z0, Z1, PARED)
    caja_px("PB_puerta_vestidor", pb, 835, 855, 1477, 1679, Z0, Z0 + ALTO_PUERTA_INTERIOR, M("Madera_Mueble_Roble"))
    caja_px("PB_tab_vest_pas_dintel", pb, 827, 862, 1477, 1679, Z0 + ALTO_PUERTA_INTERIOR, Z1, PARED)
    # Dorm ppal / vestidor: muro corto + abertura amplia (como en plano)
    caja_px("PB_tab_dorm1_vest", pb, 133, 340, 1707, 1735, Z0, Z1, PARED)
    caja_px("PB_tab_dorm1_vest_dintel", pb, 340, 827, 1707, 1735, Z0 + ALTO_PUERTA_INTERIOR, Z1, PARED)
    # Pasillo / dorm 2 con puerta
    muro_px("PB_tab_pasillo_dorm2", pb, 862, 1692, 1707, 1735, Z0, Z1, PARED,
            aberturas=[("x", 962, 1157, Z0, Z0 + ALTO_PUERTA_INTERIOR)])
    caja_px("PB_puerta_dorm2", pb, 962, 1157, 1712, 1730, Z0, Z0 + ALTO_PUERTA_INTERIOR, M("Madera_Mueble_Roble"))
    # Muro entre dormitorios, hasta la fachada
    caja_px("PB_tab_dorms", pb, 892, 955, 1707, 2750, Z0, Z1, PARED)
    # Placard dorm 2 bajo la escalera (frentes negros, foto dormitorio)
    caja_px("PB_placard_dorm2", pb, 1165, 1662, 1719, 1881, Z0, Z0 + 2.40, M("Frente_Negro"))
    # Lavarropas (2) en el nicho del lavadero
    for i, xs in enumerate((1500, 1600)):
        caja_px("PB_lavarropas_%d" % i, pb, xs, xs + 0.58 * S, 790, 790 + 0.60 * S, Z0, Z0 + 0.85, M("Ceramica_Blanca"))
    # Bloque de hormigón junto a la fachada, derecha (ducto del parrillero)
    caja_px("PB_ducto_fachada", pb, 1586, 1692, 2700, 2768, Z0, 0.0, HORM)

    # Fachada este PB: fijo | puerta dorm1 | muro dorms | puerta dorm2 | fijo
    panos = [("fijo_a", 189, 668), ("puerta_a", 668, 892), ("puerta_b", 955, 1184), ("fijo_b", 1184, 1586)]
    yv0, yv1 = 2743, 2757
    for nombre, a, b in panos:
        caja_px("PB_fachada_vidrio_" + nombre, pb, a + PERFIL_ALUMINIO * S, b - PERFIL_ALUMINIO * S, yv0 + 4, yv1 - 4, Z0 + 0.02, Z1 - 0.05, M("Vidrio"))
        caja_px("PB_fachada_parante_" + nombre + "_i", pb, a, a + PERFIL_ALUMINIO * S, yv0, yv1, Z0, Z1, M("Aluminio_Negro_Mate"))
        caja_px("PB_fachada_parante_" + nombre + "_d", pb, b - PERFIL_ALUMINIO * S, b, yv0, yv1, Z0, Z1, M("Aluminio_Negro_Mate"))
        caja_px("PB_fachada_trav_inf_" + nombre, pb, a, b, yv0, yv1, Z0, Z0 + 0.05, M("Aluminio_Negro_Mate"))
        caja_px("PB_fachada_trav_sup_" + nombre, pb, a, b, yv0, yv1, Z1 - 0.05, Z1, M("Aluminio_Negro_Mate"))

    # Losa de piso PB (planta + terraza) y pisos
    xA, _ = pb(0, 653); _, yA = pb(133, 0); _, yB = pb(1692, 0)
    caja("PB_losa_piso", xA, X_TERR_TOTAL, yA, yB, Z0 - ESP_LOSA, Z0, HORM)
    _, yi = pb(189, 0); _, yd = pb(1665, 0); xi, _ = pb(0, 724)
    caja("PB_piso_madera", xi, 0.0, yi, yd, Z0, Z0 + 0.012, M("Piso_Madera_Clara"))
    caja_px("PB_piso_bano", pb, 647, 999, 724, 1421, Z0 + 0.012, Z0 + 0.02, M("Porcelanato_Claro"))
    caja_px("PB_piso_lavadero", pb, 1041, 1665, 724, 1421, Z0 + 0.012, Z0 + 0.02, M("Porcelanato_Claro"))
    caja("PB_piso_terraza", 0.0, X_TERR_TOTAL, yA, yB, Z0 - 0.02, Z0, M("Loseta_Hormigon_Terraza"))
    # Barandas y jardinera PB (foto fachada: jardineras de hormigón al frente)
    caja("PB_jardinera_frente", X_TERR_TOTAL - 0.45, X_TERR_TOTAL, yA, yB, Z0, Z0 + 0.50, M("Hormigon_Liso"))
    gramineas("PB_gramineas", X_TERR_TOTAL - 0.40, X_TERR_TOTAL - 0.05, yA + 0.1, yB - 0.1, Z0 + 0.50, 60)
    caja("PB_baranda_izq_vidrio", 0.0, X_TERR_TOTAL - 0.45, yA - 0.012, yA + 0.012, Z0, Z0 + 1.1, M("Vidrio_Baranda"))

    # Camas (cajas) según plano
    caja_px("PB_cama_dorm1", pb, 200, 540, 2060, 2520, Z0, Z0 + 0.45, M("Tela_Gris"))
    caja_px("PB_cama_dorm2", pb, 1200, 1640, 2060, 2520, Z0, Z0 + 0.45, M("Tela_Gris"))
    # Baño PB: mueble, mesada, bacha redonda, inodoro
    caja_px("PB_bano_mueble", pb, 660, 990, 740, 940, Z0, Z0 + 0.80, M("Madera_Mueble_Roble"))
    caja_px("PB_bano_mesada", pb, 655, 995, 735, 945, Z0 + 0.80, Z0 + 0.83, M("Granito_Negro"))
    caja_px("PB_bano_inodoro", pb, 700, 830, 1240, 1400, Z0, Z0 + 0.42, M("Ceramica_Blanca"))
    caja_px("PB_bano_mampara", pb, 660, 990, 1090, 1100, Z0, Z0 + 2.0, M("Vidrio"))


# =============================================================================
# CONTEXTO: vecino, terreno, mar, cielo
# =============================================================================
def construir_contexto():
    HORM = M("Hormigon_Encofrado_Tablas")
    _, yB = pa(1692, 0); _, yA = pa(125, 0)
    xW, _ = pa(0, 1636)
    ancho = yB - yA
    # Unidad vecina 208 (lado +Y): misma envolvente, sin detalle, fachada vidriada
    for k in range(1, 3):
        y0 = yB + (k - 1) * ancho; y1 = y0 + ancho
        caja("Vecino_%d_muro_oeste" % k, xW, xW + 0.2, y0, y1, Z_PB - ESP_LOSA, ALTURA_LIBRE + ESP_LOSA, HORM)
        caja("Vecino_%d_losa_techo" % k, xW, PROFUNDIDAD_SEMICUBIERTA, y0, y1, ALTURA_LIBRE, ALTURA_LIBRE + ESP_LOSA, HORM)
        caja("Vecino_%d_losa_piso" % k, xW, 3.62, y0, y1, -ESP_LOSA, 0.0, HORM)
        caja("Vecino_%d_losa_pb" % k, xW, 3.57, y0, y1, Z_PB - ESP_LOSA, Z_PB, HORM)
        caja("Vecino_%d_fachada_pa" % k, -0.05, 0.0, y0, y1, 0.0, ALTURA_LIBRE, M("Vecino_Oscuro"))
        caja("Vecino_%d_fachada_pb" % k, -0.05, 0.0, y0, y1, Z_PB, Z_PB + ALTURA_LIBRE, M("Vecino_Oscuro"))
        caja("Vecino_%d_medianera" % k, xW, 0.0, y1 - 0.1, y1, Z_PB - ESP_LOSA, ALTURA_LIBRE + ESP_LOSA, HORM)
        caja("Vecino_%d_baranda" % k, 3.5, 3.62, y0, y1, 0.0, 0.15, M("Hormigon_Liso"))
        caja("Vecino_%d_baranda_v" % k, 3.55, 3.57, y0, y1, 0.15, 1.2, M("Vidrio_Baranda"))
        caja("Vecino_%d_jardinera" % k, 3.12, 3.57, y0, y1, Z_PB, Z_PB + 0.5, M("Hormigon_Liso"))
    # Terreno: meseta al oeste a nivel PA (cochera/patio), talud y planicie al este a nivel PB
    xW2 = xW - 12.0
    plano_z("Terreno_oeste", -80.0, xW, -80.0, 80.0, -0.05, M("Pasto"), col="Paisaje")
    plano_z("Terreno_este", xW, 40.0, -80.0, 80.0, Z_PB - ESP_LOSA - 0.02, M("Pasto"), col="Paisaje")
    # Frente de talud entre ambos niveles (lado -Y, el que se ve desde el ventanal)
    caja("Terreno_talud", xW - 0.2, xW, -80.0, yA - 0.3, Z_PB - ESP_LOSA, -0.05, M("Tierra"), col="Paisaje")
    # Patio achurado junto a la cocina (nivel PA) y cochera: losa de hormigón
    x0, y0 = pa(125, 160); x1, y1 = pa(877, 1814)
    caja("Cochera_patio", x0, x1, y0, y1, -0.05, 0.0, M("Hormigon_Liso"), col="Paisaje")
    # Ladera bajando al mar y mar en el horizonte (el terreno cae ~30 m hasta la costa)
    verts = [(40.0, -600.0, Z_PB - 0.3), (120.0, -600.0, -25.0), (120.0, 600.0, -25.0), (40.0, 600.0, Z_PB - 0.3)]
    me = bpy.data.meshes.new("Ladera"); me.from_pydata(verts, [], [(0, 1, 2, 3)])
    me.materials.append(M("Pasto")); ob = bpy.data.objects.new("Ladera", me); coleccion("Paisaje").objects.link(ob)
    plano_z("Mar", 110.0, 8000.0, -8000.0, 8000.0, -25.0, M("Mar"), col="Paisaje")

    # Cielo (Nishita) + sol
    w = bpy.data.worlds.new("Cielo"); bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes.get("Background")
    sky = nt.nodes.new("ShaderNodeTexSky")
    for tipo in ("NISHITA", "MULTIPLE_SCATTERING", "SINGLE_SCATTERING"):
        try:
            sky.sky_type = tipo
            break
        except Exception:
            pass
    try:
        sky.sun_elevation = math.radians(28.0)
        sky.sun_rotation = math.radians(150.0)   # sol al norte-noreste (hemisferio sur, media mañana)
        sky.sun_disc = False
        sky.altitude = 40.0
    except Exception:
        pass
    nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 0.28
    sol_data = bpy.data.lights.new("Sol", "SUN")
    sol_data.energy = 5.0
    sol_data.angle = math.radians(0.6)
    sol = bpy.data.objects.new("Sol", sol_data)
    # Dirección: elevación 38°, azimut desde +X (este) girado hacia +Y (norte)... el sol
    # queda al NE-N: en el modelo +Y es "derecha del plano"; se toma como norte.
    elev = math.radians(28.0); az = math.radians(35.0)
    d = Vector((-math.cos(elev) * math.cos(az), -math.cos(elev) * math.sin(az), -math.sin(elev)))
    sol.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    sol.location = (0, 0, 20)
    coleccion("Paisaje").objects.link(sol)


# =============================================================================
# CÁMARA EQUIRECTANGULAR (spec Baleia) Y RENDER
# =============================================================================
def crear_camara():
    cam_data = bpy.data.cameras.new("CAM_B2-A_INT-LIVING_01")
    cam_data.type = "PANO"
    try:
        cam_data.panorama_type = "EQUIRECTANGULAR"          # Blender ≥ 4.0
    except Exception:
        cam_data.cycles.panorama_type = "EQUIRECTANGULAR"   # Blender ≤ 3.x
    cam_data.clip_start = 0.05
    cam_data.clip_end = 20000.0
    cam = bpy.data.objects.new("CAM_B2-A_INT-LIVING_01", cam_data)
    # Living de PA, entre la mesa y el sofá (px del plano: x≈870, y≈3300)
    X, Y = pa(870, 3300)
    cam.location = (X, Y, ALTURA_CAMARA)
    # Mira a +X (este = mar), pitch 0: (90°, 0, -90°) lleva el -Z local de la
    # cámara a +X mundo con Z arriba.
    cam.rotation_euler = (math.radians(90.0), 0.0, math.radians(-90.0))
    coleccion("Camaras").objects.link(cam)
    bpy.context.scene.camera = cam
    return cam


def configurar_render():
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    cy = sc.cycles
    cy.samples = RENDER_SAMPLES
    cy.use_denoising = True
    cy.max_bounces = 8
    cy.transmission_bounces = 8
    cy.transparent_max_bounces = 8
    # GPU si hay, si no CPU
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        # CUDA antes que OPTIX: en esta máquina OptiX falla al compilar el kernel
        for tipo in ("CUDA", "OPTIX", "HIP", "ONEAPI", "METAL"):
            try:
                prefs.compute_device_type = tipo
                prefs.get_devices()
                usable = [d for d in prefs.devices if d.type == tipo]
                if usable:
                    for d in prefs.devices:
                        d.use = (d.type == tipo or d.type == "CPU")
                    cy.device = "GPU"
                    print("[render] GPU:", tipo, [d.name for d in usable])
                    break
            except Exception:
                continue
        else:
            cy.device = "CPU"
    except Exception:
        cy.device = "CPU"
    sc.render.resolution_x = RENDER_W
    sc.render.resolution_y = RENDER_H
    sc.render.resolution_percentage = 100
    sc.render.pixel_aspect_x = 1.0
    sc.render.pixel_aspect_y = 1.0
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    sc.render.image_settings.color_depth = "16"
    sc.render.film_transparent = False
    sc.render.filepath = os.path.join(DIR_OUT, NOMBRE_RENDER)
    try:
        sc.view_settings.view_transform = "AgX"
        sc.view_settings.look = "AgX - Base Contrast"
    except Exception:
        pass
    sc.view_settings.exposure = 1.0


# =============================================================================
# REPORTE DE CONTROL
# =============================================================================
def reporte():
    print("\n================ CALIBRACIÓN ================")
    print("Escala S = %.2f px/m  (900 DPI → el brochure está a ~1:%.0f)" % (S, 900 / 25.4 * 1000 / S))
    peor = 0.0
    for nombre, med, rot, err in RESIDUOS:
        marca = "  <- primaria" if nombre in PRIMARIAS else ""
        print("  %-28s medido %.3f m  rotulado %.2f m  error %+5.1f cm%s" % (nombre, med, rot, err, marca))
        if nombre not in ("PA Cocina largo 3.73", "PA Living largo 4.31"):
            peor = max(peor, abs(err))
    print("  (error máx. entre muros físicos: %.1f cm; las cotas contra la línea" % peor)
    print("   punteada living/cocina no son contra muro y se reportan aparte)")
    # Superficie cubierta por planta (envolvente exterior)
    xA, yA = pa(125, 1636); xB, yB = pa(1692, 3830)
    nx0, ny0 = pa(125, 1636); nx1, ny1 = pa(848, 1814)   # entrante del patio junto a la cocina
    sup_pa = (xB - xA) * (yB - yA) - (nx1 - nx0) * (ny1 - ny0)
    xA2, yA2 = pb(133, 653); xB2, yB2 = pb(1692, 2750)
    sup_pb = (xB2 - xA2) * (yB2 - yA2)
    print("\n================ SUPERFICIES ================")
    print("  Cubierta PA (envolvente ext. menos entrante): %.2f m²  (esperado ~54.8)" % sup_pa)
    print("  Cubierta PB (envolvente ext.):                %.2f m²  (esperado ~54.8)" % sup_pb)
    print("  Total cubierta modelada: %.2f m²  (brochure 109.68)" % (sup_pa + sup_pb))
    print("=============================================\n")
    return sup_pa, sup_pb


# =============================================================================
# MAIN
# =============================================================================
def main():
    os.makedirs(DIR_OUT, exist_ok=True)
    limpiar_escena()
    sc = bpy.context.scene
    sc.unit_settings.system = "METRIC"
    sc.unit_settings.length_unit = "METERS"
    crear_materiales()
    cargar_plano_como_empty("REF_plano_PA", PLANO_PA, PA_IMG, pa, 0.005)
    cargar_plano_como_empty("REF_plano_PB", PLANO_PB, PB_IMG, pb, Z_PB + 0.005)
    construir_PA()
    construir_PB()
    construir_contexto()
    crear_camara()
    configurar_render()
    reporte()
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)
    print("[ok] .blend guardado en", BLEND_OUT)
    if "--no-render" not in sys.argv:
        try:
            bpy.ops.render.render(write_still=True)
        except RuntimeError as e:
            # Kernel GPU roto (driver viejo, etc.): se cae a CPU y se reintenta.
            print("[render] fallo en GPU (%s); reintentando en CPU" % str(e).strip()[:120])
            sc.cycles.device = "CPU"
            bpy.ops.render.render(write_still=True)
        print("[ok] render guardado en", sc.render.filepath)


if __name__ == "__main__":
    main()
