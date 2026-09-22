# Operación de la plataforma

Los scripts de esta carpeta corren **en el servidor** (`/srv/r360/`), no acá.
Esta copia existe para que sobrevivan a la pérdida del servidor, que es
justamente contra lo que protegen.

| Script | Dónde vive | Cuándo corre |
|---|---|---|
| `respaldo-base.sh` | `/srv/r360/respaldo-base.sh` | cron, todos los días a las 04:00 |
| `chequeo-salud.sh` | `/srv/r360/chequeo-salud.sh` | cron, cada 15 minutos |
| `publicar-plataforma.sh` | acá | a mano, al publicar |
| `reconciliador-dominios.mjs` | `/srv/r360/app/` | servicio `r360-reconciliador`, cada minuto |
| `cambiar-dominio-plataforma.sh` | acá | a mano, si se muda el dominio |

Para actualizar uno de los dos primeros en el servidor:

```bash
scp tools/deploy/respaldo-base.sh root@179.199.142.5:/srv/r360/respaldo-base.sh
ssh root@179.199.142.5 'chmod 700 /srv/r360/respaldo-base.sh'
```

## Qué mirar si algo anda mal

```bash
ssh root@179.199.142.5 'tail -20 /var/log/r360/salud.log'      # chequeos
ssh root@179.199.142.5 'tail -10 /var/log/r360/respaldos.log'  # respaldos
ssh root@179.199.142.5 'ls -lh /srv/r360/respaldos/'           # qué hay guardado
```

## Restaurar un respaldo

Los dumps están en formato custom, así que se puede restaurar todo o sólo
una tabla. Probado de verdad el 2026-09-22: restauró 1 proyecto, 20 unidades,
25 escenas, 11 hotspots y 9 publicaciones.

```bash
ssh root@179.199.142.5
DB=$(docker ps -qf name=vrotta-prop-360-supabase-khxq56-db)
# Siempre a una base de prueba primero, NUNCA directo sobre la que está viva.
docker exec $DB psql -U postgres -c "create database prueba;"
docker exec -i $DB pg_restore -U postgres -d prueba --no-owner --no-acl < /srv/r360/respaldos/plataforma-AAAAMMDD-HHMMSS.dump
```

Al restaurar aparece un error sobre una función del esquema `realtime` que
pide un permiso que el dump no puede otorgar. Es interno de Supabase y no
afecta a los datos del proyecto: se ignora.

## Las dos deudas conocidas

1. **El respaldo queda en el mismo disco que la base.** Protege contra un
   borrado accidental o una migración mal aplicada, que es lo que pasa
   seguido. No protege contra la pérdida del servidor. Falta una copia
   afuera.
2. **El chequeo de salud escribe en un log, no avisa a nadie.** Sin un canal
   —mail, WhatsApp, lo que sea— depende de que alguien se acuerde de mirar.
