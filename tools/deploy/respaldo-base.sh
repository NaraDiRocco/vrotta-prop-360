#!/usr/bin/env bash
# Respalda la base de la plataforma.
#
# POR QUE EXISTE: hasta hoy no habia ninguno. La base tiene las unidades, los
# precios, las escenas, los hotspots y -lo que de verdad no se puede
# reconstruir- los leads: los contactos de gente interesada en comprar. La
# media y el codigo se regeneran desde el repo; esto no.
#
# LIMITACION CONOCIDA Y DELIBERADA: el respaldo queda en el MISMO disco que la
# base. Protege contra un borrado accidental, una migracion mal aplicada o una
# tabla pisada, que es lo que pasa seguido. NO protege contra la perdida del
# disco o del servidor. Para eso hace falta una copia afuera, que es una
# decision de infraestructura que todavia no esta tomada.

set -euo pipefail

DESTINO=/srv/r360/respaldos
DIAS_A_GUARDAR=14
FECHA=$(date +%Y%m%d-%H%M%S)

mkdir -p "$DESTINO"
chmod 700 "$DESTINO"

DB=$(docker ps -qf name=vrotta-prop-360-supabase-khxq56-db)
[ -n "$DB" ] || { echo "$(date -Is) ERROR: no encuentro el contenedor de la base"; exit 1; }

ARCHIVO="$DESTINO/plataforma-$FECHA.dump"

# Formato custom (-Fc): comprimido y restaurable con pg_restore de forma
# selectiva, tabla por tabla si hiciera falta. Un .sql plano solo se puede
# restaurar entero.
docker exec "$DB" pg_dump -U postgres -d postgres -Fc --no-owner --no-acl > "$ARCHIVO.parcial"
mv "$ARCHIVO.parcial" "$ARCHIVO"
chmod 600 "$ARCHIVO"

# Los secretos van al lado: sin ellos, una base restaurada no sirve de nada
# porque nadie puede arrancar el worker contra ella.
cp /root/.r360/worker.env "$DESTINO/worker.env-$FECHA"
chmod 600 "$DESTINO/worker.env-$FECHA"

# Verificacion: un dump que no se puede leer no es un respaldo. Se comprueba
# que pg_restore pueda listar su contenido y que aparezcan las tablas clave.
if ! docker exec -i "$DB" pg_restore -l < "$ARCHIVO" > /tmp/lista-respaldo.txt 2>/dev/null; then
  echo "$(date -Is) ERROR: el dump no se puede leer, lo borro para no dar falsa tranquilidad"
  rm -f "$ARCHIVO"
  exit 1
fi
for tabla in projects units leads scenes hotspots; do
  grep -q "TABLE DATA public $tabla" /tmp/lista-respaldo.txt || {
    echo "$(date -Is) ERROR: falta la tabla $tabla en el dump"
    rm -f "$ARCHIVO"; exit 1
  }
done
rm -f /tmp/lista-respaldo.txt

find "$DESTINO" -name "plataforma-*.dump" -mtime +$DIAS_A_GUARDAR -delete
find "$DESTINO" -name "worker.env-*" -mtime +$DIAS_A_GUARDAR -delete

echo "$(date -Is) ok: $(basename "$ARCHIVO") ($(du -h "$ARCHIVO" | cut -f1)), $(ls "$DESTINO"/plataforma-*.dump | wc -l) respaldos guardados"
