#!/usr/bin/env bash
# Chequeo de salud de la plataforma.
#
# POR QUE: hoy, si algo se cae, nadie se entera hasta que un cliente avisa.
# Swarm reinicia un contenedor muerto, pero no ve los fallos silenciosos, que
# son los que de verdad muerden: un certificado que dejo de renovarse, el
# disco que se llena, o un servicio que responde pero mal.
#
# DEUDA CONOCIDA: esto escribe en un log, no avisa a nadie. Sin un canal
# -mail, WhatsApp, lo que sea- un log es algo que alguien tiene que acordarse
# de mirar. Conectarlo a un canal real es lo que falta.

set -uo pipefail
LOG=/var/log/r360/salud.log
mkdir -p "$(dirname "$LOG")"
problemas=0
anotar() { echo "$(date -Is) $*" >> "$LOG"; }

# 1. Las puertas responden.
for url in \
  "https://baleia.vrottaprop360.com/" \
  "https://baleia.vrottaprop360.com/tour.json" \
  "https://app.vrottaprop360.com/api/health" \
  "https://panel.vrottaprop360.com/" \
  "https://cdn.vrottaprop360.com/v1.js"; do
  codigo=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 20 "$url" 2>/dev/null || echo "000")
  case "$codigo" in
    200|307|308) ;;
    *) anotar "PROBLEMA: $url devolvio $codigo"; problemas=$((problemas+1)) ;;
  esac
done

# 2. Certificados que se vencen. Traefik renueva solo, pero cuando falla no
# avisa: se descubre el dia que el navegador tira la advertencia.
for host in baleia.vrottaprop360.com app.vrottaprop360.com cdn.vrottaprop360.com; do
  fin=$(echo | openssl s_client -connect "$host:443" -servername "$host" 2>/dev/null \
        | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  [ -n "$fin" ] || { anotar "PROBLEMA: no pude leer el certificado de $host"; problemas=$((problemas+1)); continue; }
  dias=$(( ( $(date -d "$fin" +%s) - $(date +%s) ) / 86400 ))
  [ "$dias" -lt 20 ] && { anotar "PROBLEMA: el certificado de $host vence en $dias dias"; problemas=$((problemas+1)); }
done

# 3. Disco. La media versionada crece con cada publicacion.
libre=$(df --output=pcent / | tail -1 | tr -dc "0-9")
[ "$libre" -gt 85 ] && { anotar "PROBLEMA: disco al ${libre}%"; problemas=$((problemas+1)); }

# 4. Que el respaldo de anoche exista. Un respaldo que dejo de correr es
# indistinguible de uno que nunca existio, hasta que se necesita.
reciente=$(find /srv/r360/respaldos -name "plataforma-*.dump" -mtime -2 2>/dev/null | wc -l)
[ "$reciente" -eq 0 ] && { anotar "PROBLEMA: no hay respaldo de las ultimas 48 horas"; problemas=$((problemas+1)); }

# 5. Servicios que deberian estar corriendo.
for s in r360-worker r360-media r360-cdn r360-reconciliador; do
  estado=$(docker service ls --filter "name=$s" --format "{{.Replicas}}" 2>/dev/null)
  [ "$estado" = "1/1" ] || { anotar "PROBLEMA: el servicio $s esta en $estado"; problemas=$((problemas+1)); }
done

if [ "$problemas" -eq 0 ]; then
  echo "$(date -Is) todo bien" >> "$LOG"
else
  anotar "RESUMEN: $problemas problema(s)"
fi
# Se conserva un log acotado: un archivo que crece sin limite termina siendo
# otro problema.
tail -2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
exit 0
