#!/usr/bin/env bash
# Publica el visor Baleia en el VPS propio.
#
#   bash tools/deploy/publicar-vps.sh
#
# Construye el sitio para la raiz del dominio y lo sincroniza por rsync contra
# /srv/baleia/site del servidor, donde un nginx lo sirve desde un bind mount.
# No reconstruye imagenes ni reinicia contenedores: el contenido es el volumen.
#
# La media (unos 100 MB de fotos, tiles 360, video y brochure) vive fuera de git,
# en apps/viewer/public/baleia/. Por eso publicamos el dist ya construido y no
# dejamos que el servidor compile: alla nunca llegaria el material.

set -euo pipefail

VPS_HOST="${VPS_HOST:-root@179.199.142.5}"
VPS_RUTA="${VPS_RUTA:-/srv/baleia/site}"
URL_PRUEBA="${URL_PRUEBA:-https://baleia.179.199.142.5.nip.io}"

cd "$(dirname "$0")/../.."
RAIZ="$PWD"
DIST="$RAIZ/apps/viewer/dist"

echo "==> 1/4  Construyendo el visor para la raiz del dominio"
# Ojo: VITE_BASE="" NO es lo mismo que no tenerla. vite.config usa
# process.env.VITE_BASE ?? '/', y ?? solo cae al default si esta ausente.
# Con la variable vacia el build sale con rutas relativas y no sirve.
unset VITE_BASE
pnpm --filter @r360/viewer build

echo "==> 2/4  Revisando que el build sea publicable"
fallo=0
grep -q 'src="/assets/' "$DIST/index.html" || { echo "   ERROR: index.html no apunta a /assets/ (base mal resuelta)"; fallo=1; }
grep -q 'id="r360-pre"' "$DIST/index.html" || { echo "   ERROR: falta el preloader del logo"; fallo=1; }
[ -f "$DIST/tour.json" ] || { echo "   ERROR: falta tour.json"; fallo=1; }
[ -d "$DIST/baleia/scenes" ] || { echo "   ERROR: faltan las escenas 360 en baleia/scenes"; fallo=1; }
[ -d "$DIST/baleia/media/video" ] || { echo "   ERROR: falta el video en baleia/media/video"; fallo=1; }
if grep -rqa 'vrotta-prop-360' "$DIST" 2>/dev/null; then
  echo "   ERROR: quedaron rutas de GitHub Pages dentro del dist"; fallo=1
fi
escenas=$(python3 -c "import json;d=json.load(open('$DIST/tour.json'));print(sum(1 for s in d.get('scenes',[]) if s.get('type')=='pano' or 'tiles' in str(s)))" 2>/dev/null || echo "?")
echo "   dist: $(du -sh "$DIST" | cut -f1) en $(find "$DIST" -type f | wc -l | tr -d ' ') archivos, escenas 360 en el manifiesto: $escenas"
[ "$fallo" = 0 ] || { echo "==> Abortado: el build no esta en condiciones de publicarse."; exit 1; }

echo "==> 3/4  Sincronizando contra $VPS_HOST:$VPS_RUTA"
# macOS trae openrsync: sin --info ni --human-readable
  rsync -rlpt --delete --partial --stats \
  "$DIST/" "$VPS_HOST:$VPS_RUTA/"

echo "==> 4/4  Verificando el sitio publicado"
for ruta in "/" "/tour.json"; do
  codigo=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 "$URL_PRUEBA$ruta")
  echo "   $ruta -> http $codigo"
  [ "$codigo" = "200" ] || { echo "==> El sitio no responde bien en $ruta"; exit 1; }
done
echo "==> Publicado: $URL_PRUEBA"
