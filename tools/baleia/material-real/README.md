# Material real de Baleia — fotos, video y PDFs (septiembre 2026)

Ver el análisis completo en `docs/08-MATERIAL-REAL/README.md`. Esta carpeta
solo tiene los derivados web; los originales (74 fotos JPG, el video de
209 MB y los dos PDFs) siguen en `elementos baleia/` (fuera del repo
versionado, no se movieron ni se copiaron acá para no duplicar 1.2 GB).

## Contenido

- `web/full/` — 26 fotos seleccionadas, WebP a 2000px de ancho (calidad 78).
- `web/thumb/` — las mismas 26, WebP a 480px (calidad 70).
- `index.csv` — mapeo nombre original de cámara → nombre descriptivo nuevo,
  con categoría y tamaños antes/después.

## Cómo se generaron

```bash
python3 tools/baleia/material-real/scripts/webp_convert.py
```

(script de referencia documentado en `docs/08-MATERIAL-REAL/README.md`,
sección 7 — usa Pillow, no depende de `cwebp` del sistema).
