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

## Autorizar a un sitio a incrustar un recorrido

Desde el 2026-09-22 la restricción de `frame-ancestors` **se aplica de
verdad**. Antes se calculaba y se perdía en silencio, así que cualquier sitio
podía incrustar cualquier recorrido; ahora, por defecto, no puede ninguno.

Eso significa que pegar el snippet en la web de un cliente **no alcanza**: hay
que autorizar su origen. Si no, el navegador bloquea el iframe y el loader
dispara `tm:loadError` a los ocho segundos.

La configuración vive en el KV del worker, una entrada por inmobiliaria:

```bash
ssh root@179.199.142.5
python3 - <<'PY'
import json, pathlib
inquilino = "baleia"
cfg = {"active": True, "allowedAncestors": ["https://www.sitiodelcliente.com"]}
p = pathlib.Path(f"/srv/r360/kv/tenant%3A{inquilino}.kv.json")
p.write_text(json.dumps({"value": json.dumps(cfg)}))
print("listo:", cfg)
PY
```

El origen va completo y exacto: esquema y host, sin barra final. `https://x.com`
y `https://www.x.com` son orígenes distintos; si el cliente usa los dos, van
los dos en la lista.

Para comprobarlo:

```bash
curl -sS -D - -o /dev/null https://baleia.vrottaprop360.com/ | grep -i content-security
```

Borrar esa entrada vuelve a denegar todo, que es el estado por defecto.

**Deuda:** esto debería configurarse desde el panel, no editando un archivo
por SSH. Hoy es lo que hay.

## Vulnerabilidades de dependencias — evaluación al 2026-09-22

`pnpm audit` reporta 11 problemas: 1 crítico, 3 altos, 7 medios. **Ninguno
llega al visitante.** El desglose, para que nadie se asuste con el número ni
lo ignore sin mirarlo:

| Paquete | Severidad | Dónde vive | Por qué no es urgente |
|---|---|---|---|
| vitest | crítica | corredor de tests | Exige que el servidor de interfaz de vitest esté escuchando. Nunca se levanta: los tests corren con `vitest run`. |
| vite | alta | servidor de desarrollo | El fallo es del servidor de desarrollo y sólo en Windows. La build de producción no lo expone. |
| postcss (×2) | alta | build de CSS del panel | Se ejecuta al construir, no al servir. |
| resto | media | herramientas | Idem. |

Lo que SÍ llegaba al visitante era `wrangler` en `apps/worker`, que arrastraba
seis vulnerabilidades altas por `undici` y `sharp`. Se eliminó: el worker dejó
de correr en Cloudflare y esa dependencia estaba muerta. El árbol pasó de 28
problemas a 11.

**Lo que falta**, y conviene hacerlo con el repositorio quieto: subir vitest de
la serie 2 a la 3 en los seis paquetes que lo usan. Es un salto de versión
mayor sobre unos 1.000 tests, así que necesita atención y no se hace de
apuro al final de una jornada.

## Pendiente importante: el panel que corre es del 6 de septiembre

El servicio `r360-admin-ilx9n6` se construyó el **2026-09-06** y nunca se
volvió a desplegar. Todo lo que se arregló después —incluida la escalada de
privilegios dentro del propio inquilino del 2026-09-22— está en el repositorio
pero **no en lo que está sirviendo**.

**Exposición real al 2026-09-22: ninguna.** Hay un solo usuario y pertenece al
equipo de la plataforma; no existe ninguna cuenta de inmobiliaria desde la
cual escalar, ni invitaciones pendientes. La escalada requiere una sesión
legítima de `owner` o `editor` de un inquilino.

**Cuándo deja de ser cero:** el día que se invite a la primera inmobiliaria.
Antes de ese día hay que redesplegar el panel.

No se redesplegó ahora a propósito: la app está configurada en Dokploy como
build desde git pero con el repositorio sin completar, así que un despliegue
a ciegas podía fallar y dejar el panel caído sin nadie mirando. Es una tarea
de diez minutos con alguien atento, no una para hacer de apuro.
