#!/usr/bin/env bash
# Publica un proyecto EN LA PLATAFORMA (no como sitio suelto).
#
#   bash tools/deploy/publicar-plataforma.sh dacal baleia
#
# Diferencia con publicar-vps.sh: aquel sube un sitio estatico a su propio
# nginx, sin base de datos. Este deja el proyecto servido por la plataforma
# multi-tenant, con su version, su puntero y su manifiesto armado desde
# Supabase.
#
# El reparto de quien escribe que:
#   - Este script sube el shell del visor (index.html + assets) y la media.
#   - /api/publish arma el tour.json desde la base y mueve el puntero.
#   - /api/availability/.../regenerate llena la disponibilidad.
#
# Cada publicacion crea una version nueva. La media se enlaza con hardlinks
# desde la version anterior en vez de copiarse: son ~100 MB que no cambian
# entre publicaciones, y un hardlink no ocupa disco ni tarda.

set -euo pipefail

TENANT="${1:?falta el tenant, por ejemplo: dacal}"
PROYECTO="${2:?falta el proyecto, por ejemplo: baleia}"

VPS_HOST="${VPS_HOST:-root@179.199.142.5}"
ALMACEN="${ALMACEN:-/srv/r360/storage}"
PLATAFORMA="${PLATAFORMA:-https://r360.179.199.142.5.nip.io}"

cd "$(dirname "$0")/../.."
DIST="$PWD/apps/viewer/dist"

echo "==> 1/6  Construyendo el visor"
unset VITE_BASE
pnpm --filter @r360/viewer build >/dev/null
grep -q 'src="/assets/' "$DIST/index.html" || { echo "   ERROR: el build no quedo con base en la raiz"; exit 1; }
[ -d "$DIST/baleia" ] || { echo "   ERROR: falta la media en el dist"; exit 1; }
echo "   dist: $(du -sh "$DIST" | cut -f1) en $(find "$DIST" -type f | wc -l | tr -d ' ') archivos"

echo "==> 2/6  Averiguando que version toca"
BASE="$ALMACEN/t/$TENANT/$PROYECTO"
ACTUAL=$(ssh "$VPS_HOST" "cat /srv/r360/kv/$(printf 'ptr:%s:%s' "$TENANT" "$PROYECTO" | sed 's/:/%3A/g').kv.json 2>/dev/null" \
  | python3 -c "import sys,json
# El adaptador de KV guarda un sobre {value: '<json>', expiresAt?}, no el
# puntero pelado: hay que abrirlo antes de leer la version.
try:
    sobre=json.load(sys.stdin)
    print(json.loads(sobre['value']).get('version') or 0)
except Exception:
    print(0)" 2>/dev/null || echo 0)
SIGUIENTE=$((ACTUAL + 1))
echo "   version activa: ${ACTUAL:-ninguna} -> se publicara la v$SIGUIENTE"

echo "==> 3/6  Preparando el directorio de la version nueva"
ssh "$VPS_HOST" "set -e
  mkdir -p '$BASE'
  if [ '$ACTUAL' != '0' ] && [ -d '$BASE/v$ACTUAL' ]; then
    # Hardlinks: la media no cambia entre versiones y son 100 MB.
    rm -rf '$BASE/v$SIGUIENTE'
    cp -al '$BASE/v$ACTUAL' '$BASE/v$SIGUIENTE'
  else
    mkdir -p '$BASE/v$SIGUIENTE'
  fi
  echo \"   listo: \$(find '$BASE/v$SIGUIENTE' -type f | wc -l | tr -d ' ') archivos heredados\""

echo "==> 4/6  Subiendo el shell del visor y la media"
# tour.json queda afuera: lo escribe /api/publish desde la base, y subir el
# del pipeline seria pisarlo con datos que no vienen de Supabase.
rsync -rlpt --delete --partial --stats --exclude 'tour.json' \
  "$DIST/" "$VPS_HOST:$BASE/v$SIGUIENTE/" | tail -3

echo "==> 5/6  Publicando (manifiesto desde la base + puntero) y regenerando disponibilidad"
ssh "$VPS_HOST" "set -a; . /root/.r360/worker.env; set +a
  echo -n '   publish: '
  curl -sS -o /tmp/pub.json -w '%{http_code}\n' --max-time 120 -X POST '$PLATAFORMA/api/publish' \
    -H 'Content-Type: application/json' -H \"Authorization: Bearer \$PUBLISH_SECRET\" \
    -d '{\"tenant\":\"$TENANT\",\"project\":\"$PROYECTO\"}'
  python3 -c \"import json;d=json.load(open('/tmp/pub.json'));print('   etapas:', ', '.join(f\\\"{s['stage']}={'ok' if s['ok'] else 'FALLO'}\\\" for s in d.get('stages',[])))\" 2>/dev/null || cat /tmp/pub.json
  echo -n '   disponibilidad: '
  curl -sS -o /tmp/av.json -w '%{http_code}\n' --max-time 60 -X POST \
    '$PLATAFORMA/api/availability/$TENANT/$PROYECTO/regenerate' \
    -H \"Authorization: Bearer \$PUBLISH_SECRET\"
  cat /tmp/av.json; echo
  rm -f /tmp/pub.json /tmp/av.json"

echo "==> 6/6  Verificando"
SUB=$(ssh "$VPS_HOST" "docker exec \$(docker ps -qf name=vrotta-prop-360-supabase-khxq56-db) psql -U postgres -d postgres -t -A -c \"select subdomain from projects p join tenants t on t.id=p.tenant_id where t.slug='$TENANT' and p.slug='$PROYECTO';\"" | tr -d ' \r')
for ruta in "/t/$TENANT/$PROYECTO/" "/t/$TENANT/$PROYECTO/tour.json"; do
  printf '   %-44s' "$ruta"
  curl -sS -o /dev/null -w 'http %{http_code}\n' --max-time 30 "$PLATAFORMA$ruta"
done
[ -n "$SUB" ] && echo "   subdominio del proyecto: https://$SUB.179.199.142.5.nip.io (Traefik lo toma en <1 min)"
echo "==> Publicado en la plataforma: $TENANT/$PROYECTO v$SIGUIENTE"
