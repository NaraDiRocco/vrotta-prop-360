#!/usr/bin/env bash
# Mueve la plataforma del dominio provisorio al definitivo.
#
#   bash tools/deploy/cambiar-dominio-plataforma.sh vrottaprop360.com
#
# Hasta ahora los proyectos viven en `algo.179.199.142.5.nip.io`, que resuelve
# a la IP del servidor y funciona como wildcard sin tocar DNS. Este script
# cambia el dominio base por uno propio.
#
# SE NIEGA A CORRER SI EL DNS TODAVIA NO RESUELVE, y eso no es prolijidad: los
# certificados se validan por HTTP contra el servidor, asi que pedirlos antes
# de que el dominio apunte aca es gastar intentos fallidos contra el cupo de
# Let's Encrypt (unos 50 certificados nuevos por semana por dominio).

set -euo pipefail

DOMINIO="${1:?falta el dominio, por ejemplo: vrottaprop360.com}"
VPS_HOST="${VPS_HOST:-root@179.199.142.5}"
IP_VPS="${IP_VPS:-179.199.142.5}"
HOST_PLATAFORMA="${HOST_PLATAFORMA:-app.$DOMINIO}"

echo "==> 1/5  Comprobando que el DNS ya apunte acá"
fallo=0
for nombre in "$DOMINIO" "$HOST_PLATAFORMA" "una-prueba-de-wildcard.$DOMINIO"; do
  resuelto=$(dig +short "$nombre" A 2>/dev/null | tail -1)
  printf '   %-44s -> %s\n' "$nombre" "${resuelto:-(no resuelve)}"
  [ "$resuelto" = "$IP_VPS" ] || fallo=1
done
if [ "$fallo" != 0 ]; then
  echo
  echo "==> Abortado: falta que el DNS resuelva a $IP_VPS."
  echo "    Los tres tienen que dar esa IP. El tercero prueba el registro"
  echo "    wildcard (*), que es el que hace que cada proyecto nuevo quede"
  echo "    publicado solo. Ver DNS-VROTTAPROP360.md."
  exit 1
fi

echo "==> 2/5  Cambiando el dominio base en la configuración"
ssh "$VPS_HOST" "set -e
  ENVFILE=/root/.r360/worker.env
  cp \$ENVFILE /root/.r360/respaldo/worker.env.\$(date +%Y%m%d-%H%M%S)
  sed -i \"s|^R360_PAGES_DOMAIN=.*|R360_PAGES_DOMAIN=$DOMINIO|\" \$ENVFILE
  sed -i \"s|^R360_BASE_DOMAIN=.*|R360_BASE_DOMAIN=$DOMINIO|\" \$ENVFILE
  sed -i \"s|^R360_PLATFORM_HOST=.*|R360_PLATFORM_HOST=$HOST_PLATAFORMA|\" \$ENVFILE
  echo '   variables actualizadas (respaldo guardado)'"

echo "==> 3/5  Reescribiendo el host fijo de la plataforma"
# Se reescribe el archivo ENTERO en vez de parchearlo con sed. Un sed sobre
# las reglas es fragil: la de media combina Host y PathRegexp, y en Traefik
# `&&` liga mas fuerte que `||`, asi que un reemplazo que agregue hosts la
# convierte en un catch-all que se come todo el dominio. Ya paso una vez.
ssh "$VPS_HOST" "cat > /etc/dokploy/traefik/dynamic/r360-worker.yml <<'YML'
http:
  routers:
    r360-worker-router:
      rule: Host(\`$HOST_PLATAFORMA\`) || Host(\`$DOMINIO\`) || Host(\`www.$DOMINIO\`)
      priority: 1
      service: r360-worker-service
      middlewares:
        - redirect-to-https
      entryPoints:
        - web
    r360-worker-router-websecure:
      rule: Host(\`$HOST_PLATAFORMA\`) || Host(\`$DOMINIO\`) || Host(\`www.$DOMINIO\`)
      priority: 1
      service: r360-worker-service
      middlewares: []
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt
    r360-media-router-websecure:
      rule: (Host(\`$HOST_PLATAFORMA\`) || Host(\`$DOMINIO\`) || Host(\`www.$DOMINIO\`)) && PathRegexp(\`^/t/[^/]+/[^/]+/v[0-9]+/\`)
      priority: 100
      service: r360-media-service
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt
  services:
    r360-media-service:
      loadBalancer:
        servers:
          - url: http://r360-media:80
    r360-worker-service:
      loadBalancer:
        servers:
          - url: http://r360-worker:8787
        passHostHeader: true
YML
  echo '   router de la plataforma apuntando a $HOST_PLATAFORMA'"

echo "==> 4/5  Reiniciando el worker y el reconciliador con la configuración nueva"
ssh "$VPS_HOST" "set -e
  ARGS=()
  while IFS= read -r linea; do [ -z \"\$linea\" ] && continue; ARGS+=(--env-add \"\$linea\"); done < /root/.r360/worker.env
  docker service update --quiet \"\${ARGS[@]}\" --force r360-worker >/dev/null
  docker service update --quiet \"\${ARGS[@]}\" --force r360-reconciliador >/dev/null
  echo '   ambos servicios reiniciados'"

echo "==> 5/5  Verificando (el certificado tarda unos segundos la primera vez)"
printf '   %-44s' "https://$HOST_PLATAFORMA/api/health"
curl -sS -o /dev/null -w 'http %{http_code}\n' --retry 20 --retry-delay 5 --retry-all-errors --max-time 180 "https://$HOST_PLATAFORMA/api/health"

sub=$(ssh "$VPS_HOST" "docker exec \$(docker ps -qf name=vrotta-prop-360-supabase-khxq56-db) psql -U postgres -d postgres -t -A -c \"select subdomain from projects where subdomain is not null limit 1;\"" | tr -d ' \r')
if [ -n "$sub" ]; then
  printf '   %-44s' "https://$sub.$DOMINIO/"
  curl -sS -o /dev/null -w 'http %{http_code}\n' --retry 20 --retry-delay 5 --retry-all-errors --max-time 180 "https://$sub.$DOMINIO/"
fi

echo "==> La plataforma vive en $DOMINIO. Actualizá PLATAFORMA en publicar-plataforma.sh."
