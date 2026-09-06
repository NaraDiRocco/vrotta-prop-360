import os
from PIL import Image

SRC = "/Users/naradirocco/Desktop/Recorrido 360/elementos baleia/fotos-editadas/fotos editadas"
FULL_OUT = "/Users/naradirocco/Desktop/Recorrido 360/tools/baleia/material-real/web/full"
THUMB_OUT = "/Users/naradirocco/Desktop/Recorrido 360/tools/baleia/material-real/web/thumb"

# (source_filename, new_descriptive_name, category)
SELECTION = [
    ("DJI_20260902154548_0023_D_LEO.jpg", "01_aerea_contexto_costa_lejos", "terreno-contexto"),
    ("DJI_20260902154916_0031_D_LEO.jpg", "02_aerea_bloque2_oblicua_cercana", "obra-exterior"),
    ("DJI_20260902155153_0035_D_LEO.jpg", "03_aerea_peninsula_la_barra_contexto", "terreno-contexto"),
    ("DJI_20260902155855_0053_D_LEO.jpg", "04_aerea_skyline_punta_del_este", "terreno-contexto"),
    ("DJI_20260902155933_0055_D_LEO.jpg", "05_aerea_bloque2_obra_oblicua_larga", "obra-exterior"),
    ("DJI_20260902160101_0060_D_LEO.jpg", "06_aerea_balcones_detalle", "obra-exterior"),
    ("7IV01188.jpg", "07_fachada_bloque2_dia_completa", "obra-exterior"),
    ("7IV01194.jpg", "08_fachada_bloque2_angulo", "obra-exterior"),
    ("7IV01196.jpg", "09_fachada_bloque2_vertical", "obra-exterior"),
    ("7IV01199.jpg", "10_terraza_planta_baja_vacia", "obra-exterior"),
    ("7IV01229.jpg", "11_vista_terraza_peninsula_skyline", "vista-mar"),
    ("7IV01122-HDR.jpg", "12_terraza_pergolotecho_parrillero", "unidad-terraza"),
    ("7IV01130.jpg", "13_terraza_sillon_vista_verde", "unidad-terraza"),
    ("7IV01108-HDR.jpg", "14_living_ventanales_vista_verde", "unidad-interior"),
    ("7IV01154-HDR.jpg", "15_living_esquina_ventanal_vista", "unidad-interior"),
    ("7IV01089.jpg", "16_living_comedor_amplio", "unidad-interior"),
    ("7IV01084.jpg", "17_cocina_equipada_completa", "unidad-interior"),
    ("7IV01237.jpg", "18_cocina_vista_horizonte_mar", "unidad-interior"),
    ("7IV01217.jpg", "19_bano_completo_ducha", "unidad-interior"),
    ("7IV01176.jpg", "20_dormitorio_placard_vacio", "unidad-interior"),
    ("7IV01156.jpg", "21_escalera_interna_duplex", "unidad-interior"),
    ("7IV01235.jpg", "22_parrillero_empotrado_detalle", "unidad-terraza"),
    ("DSC05102.jpg", "23_fachada_bloque2_atardecer", "obra-exterior"),
    ("DSC05104.jpg", "24_fachada_bloque2_atardecer_angulo", "obra-exterior"),
    ("DSC05108.jpg", "25_terraza_cubierta_interior_video", "unidad-terraza"),
    ("DSC05094.jpg", "26_pasillo_placard_video", "unidad-interior"),
]

FULL_W = 2000
THUMB_W = 480

os.makedirs(FULL_OUT, exist_ok=True)
os.makedirs(THUMB_OUT, exist_ok=True)

report = []
for src_fn, new_name, cat in SELECTION:
    path = os.path.join(SRC, src_fn)
    orig_size = os.path.getsize(path)
    img = Image.open(path)
    img = img.convert("RGB")
    w, h = img.size

    # full
    if w > FULL_W:
        ratio = FULL_W / w
        full_img = img.resize((FULL_W, int(h*ratio)), Image.LANCZOS)
    else:
        full_img = img
    full_path = os.path.join(FULL_OUT, new_name + ".webp")
    full_img.save(full_path, "WEBP", quality=78, method=6)
    full_size = os.path.getsize(full_path)

    # thumb
    ratio = THUMB_W / w
    thumb_img = img.resize((THUMB_W, int(h*ratio)), Image.LANCZOS)
    thumb_path = os.path.join(THUMB_OUT, new_name + ".webp")
    thumb_img.save(thumb_path, "WEBP", quality=70, method=6)
    thumb_size = os.path.getsize(thumb_path)

    report.append((src_fn, new_name, cat, orig_size, full_size, thumb_size))

total_orig = sum(r[3] for r in report)
total_full = sum(r[4] for r in report)
total_thumb = sum(r[5] for r in report)

print(f"{'origen':<38}{'nuevo nombre':<42}{'orig KB':>10}{'full KB':>10}{'thumb KB':>10}")
for r in report:
    print(f"{r[0]:<38}{r[1]:<42}{r[3]//1024:>10}{r[4]//1024:>10}{r[5]//1024:>10}")
print("-"*110)
print(f"TOTAL: original {total_orig/1024/1024:.1f} MB -> full webp {total_full/1024/1024:.1f} MB + thumb webp {total_thumb/1024/1024:.1f} MB")
print(f"Reduccion full: {100*(1-total_full/total_orig):.1f}%")
