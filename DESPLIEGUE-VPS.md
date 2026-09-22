# Recorrido 360 — Despliegue en el VPS de Hostinger

> Documento para arrancar el despliegue desde otra sesión de trabajo.
> Escrito el 2026-09-06. Todo lo que dice acá está verificado contra el servidor
> y contra este repo, no asumido.

---

## 0. Estado actual — Baleia ya está desplegada (2026-09-22)

> Esta sección se escribió después que el resto del documento y **manda sobre
> las secciones 1, 5, 6 y 7 donde se contradigan**. Aquellas describían
> decisiones pendientes; acá está lo que efectivamente quedó hecho, verificado
> contra el servidor.

### Dónde vive

VPS de **Arquiify**: `179.199.142.5`. Se eligió éste sobre el otro (kanu-vps,
`31.97.172.99`) porque ahí ya estaba el proyecto *Vrotta Prop 360* en Dokploy.

Provisoriamente en línea en **https://baleia.179.199.142.5.nip.io**, con
certificado real de Let's Encrypt. `nip.io` es un truco: resuelve cualquier
`algo.IP.nip.io` a esa IP, así se puede tener HTTPS de verdad antes de que
exista el dominio.

### Cómo está armado

Dos servicios de Docker Swarm, fuera de Dokploy pero en su misma red
(`dokploy-network`), enrutados por el Traefik que Dokploy ya tenía andando:

| Servicio | Qué hace | Monta |
|---|---|---|
| `baleia-web` | nginx que sirve el sitio estático | `/srv/baleia/site` y `/srv/baleia/nginx.conf` |
| `baleia-leads` | recibe los contactos del recorrido | `/srv/baleia/receptor-leads.py` y `/srv/baleia/leads` |

La ruta de Traefik está en `/etc/dokploy/traefik/dynamic/baleia.yml`, con el
mismo formato que los archivos que escribe Dokploy para sus propias apps.

### Por qué no se despliega con el Dockerfile ni desde git

Porque el material del recorrido —unos 100 MB de fotos, tiles 360, video y
brochure, en `apps/viewer/public/baleia/`— **no está en git** (ni debe estarlo)
y además está excluido en `.dockerignore`. Una imagen construida desde el repo
da un visor vacío. Por eso publicamos el `dist` ya construido, por rsync:

```bash
bash tools/deploy/publicar-vps.sh
```

Ese script construye para la raíz del dominio, se niega a publicar si el build
salió mal (revisa que las rutas no queden atadas a GitHub Pages, que estén el
manifiesto, las escenas 360 y el video), sincroniza y verifica que el sitio
responda. Son unos 100 MB y tarda menos de un minuto. No reinicia nada: el
contenido es un volumen, se reemplazan los archivos y listo.

Un detalle que costó encontrar: **`VITE_BASE=""` no es lo mismo que no tenerla**.
`vite.config.ts` usa `process.env.VITE_BASE ?? '/'`, y `??` sólo cae al default
si la variable está ausente. Con la variable vacía el build sale con rutas
relativas y no sirve. El script hace `unset`.

### Los leads

El visor manda cada contacto por `POST /api/leads` contra su mismo origen, sin
esperar respuesta (`contact.ts`, con `sendBeacon`). Mientras estuvo en GitHub
Pages **nadie atendía ese endpoint y cada lead se perdió en silencio**: no hay
error visible para el visitante ni aviso para nosotros.

Ahora nginx lo enruta a `baleia-leads`, que escribe una línea JSON por contacto
en `/srv/baleia/leads/leads.jsonl`, con `fsync`. Para leerlos:

```bash
ssh root@179.199.142.5 'cat /srv/baleia/leads/leads.jsonl'
```

Sin base de datos a propósito: lo importante era que no se pierda ninguno y que
se pueda leer con un `cat`. Si algún día conviene, el Supabase de este proyecto
ya está en ese mismo servidor (`vrotta-prop-360-supabase-khxq56`).

### Pasar al dominio definitivo

1. Los dueños cargan los registros DNS. Están en `DNS-BALEIA.md`, listo para
   entregar: dos registros `A` a `179.199.142.5`, TTL 300.
2. Cuando el dominio ya resuelva a esa IP, agregar el Host a las **dos** reglas
   de `/etc/dokploy/traefik/dynamic/baleia.yml` (el archivo tiene el ejemplo
   escrito arriba). Traefik pide el certificado solo y después lo renueva solo.
3. Actualizar `URL_PRUEBA` en `tools/deploy/publicar-vps.sh`.

El orden importa: primero el DNS, después el certificado. La validación es por
HTTP contra el servidor, así que no puede emitirse antes de que el dominio
apunte ahí.

### Sobre Cloudflare R2

No hace falta. Se evaluó y no entra en esta etapa: el peso está en el video
(64 MB de los 100), no en las 360. Con los 100 GB de tráfico del plan entran
del orden de 30.000 visitas livianas por mes, o unas 3.000 si cada visita mira
el video entero. Cuando el tráfico se acerque a eso, lo que conviene mudar es
el video, no los tiles.

### Lo que quedó sin resolver

- **El dominio no está elegido.** El sitio anda en la dirección provisoria.
- **Sin `og:image`**, la tarjeta de previsualización cuando el link se comparta
  por WhatsApp —que es como va a circular— sale sin imagen. Necesita una URL
  absoluta, o sea el dominio.
- **Los precios se actualizan a mano** (`tools/baleia/out/baleia_unidades.csv`,
  fuera de git).
- **La app vieja `r360-viewer-anvr6b`** sigue sirviendo el visor genérico de
  septiembre en `viewer.179.199.142.5.nip.io`. No es Baleia y no se tocó.

---

## 1. Antes de escribir una línea: tres decisiones que hay que tomar

No las tomo yo porque cambian la arquitectura. Están explicadas abajo con una
recomendación de cada una, pero **la dueña decide**.

| # | Decisión | Recomendación |
|---|---|---|
| **D1** | El worker está hecho para Cloudflare (KV + R2). ¿Se queda ahí o se reescribe para el VPS? | **Se queda en Cloudflare** — ver §4 |
| **D2** | ¿Dónde viven los tiles de las panorámicas? | **R2 con dominio propio**, no el VPS — ver §5 |
| **D3** | ¿Qué dominio usa? | Definir antes de pedir certificados — ver §6 |

---

## 2. Acceso al servidor y a Dokploy

**VPS Hostinger** — `179.199.142.5`, Ubuntu 24.04, 4 vCPU, 15 GB de RAM, 193 GB de disco.

```bash
ssh root@179.199.142.5
```

El acceso es **por clave SSH**, ya configurada en esta computadora. No hace falta
contraseña. Si algún día pide contraseña, algo se rompió: no la escribas en el
chat, revisá `~/.ssh/` primero.

**Dokploy** corre en el puerto 3000 y administra todo lo que está desplegado.

- Panel web: `http://179.199.142.5:3000`
- API: **solo por HTTP**, no por HTTPS. `https://179.199.142.5:3000` falla con
  error de TLS. Es el detalle que más tiempo hace perder.
- Token de la API: **`~/.arquiify/dokploy_token`** (permisos 600).
  Es el mismo Dokploy para todos los proyectos del servidor, así que se reusa.
  **Nunca lo pegues en un chat ni en un archivo del repo.**

```bash
TOKEN=$(cat ~/.arquiify/dokploy_token)
curl -s -H "x-api-key: $TOKEN" http://179.199.142.5:3000/api/project.all
```

### Estado actual del servidor

Ya hay un proyecto desplegado, **Arquiify**, con 16 contenedores (Supabase
autoalojado + API + web). Deja libre:

- **12 GB de RAM** y **175 GB de disco** — hay lugar de sobra.
- Puertos ocupados: 22, 53, 80, 443, 2377, 3000, 7946, 65529.

**Regla que la dueña pidió explícitamente y que hay que respetar: base de datos
propia, sin tocar el ecosistema de ningún otro proyecto.** Recorrido 360 necesita
**su propia instancia de Supabase**, no la de Arquiify. Nada de compartir la base
"para ahorrar", ni de correr migraciones sobre la de Arquiify.

---

## 3. Qué es este proyecto (para saber qué se despliega)

Monorepo con **pnpm** (`pnpm@10.33.2`), workspaces en `apps/*` y `packages/*`.

| App | Qué es | Cómo se despliega |
|---|---|---|
| `apps/viewer` | El visor 360 público. Vite + photo-sphere-viewer + leaflet | Build estático → se sirve como sitio estático |
| `apps/admin` | Panel de administración. **Next.js + Supabase** | Aplicación Node en Dokploy, igual que la web de Arquiify |
| `apps/embed` | El incrustable para poner el recorrido en la web del cliente | Build estático |
| `apps/worker` | La API. **Hono sobre Cloudflare Workers** | **Ver §4 — no se muda al VPS sin reescribir** |
| `packages/core`, `packages/pipeline` | Librerías internas | No se despliegan solas |
| `supabase/` | Migraciones y seed de la base | Se aplican contra la instancia nueva |

---

## 4. D1 — El worker no se muda al VPS tal como está

Esto es lo más importante de este documento, y conviene entenderlo antes de
prometer una fecha.

`apps/worker` **no es un servidor Node común**. Está escrito contra dos servicios
de Cloudflare, declarados en `apps/worker/wrangler.toml`:

- **KV** (`TENANTS_KV`): configuración por tenant, punteros de versión activa
  del recorrido, revocación de tokens de embed.
- **R2** (`r360-tours`): `tour.json`, `availability.json`, el shell HTML por
  versión, y los tiles de las panorámicas.

Moverlo al VPS **no es cambiar una variable de entorno**: hay que reescribir la
capa de almacenamiento (KV → Postgres o Redis, R2 → MinIO o disco local) y
volver a probar todo lo que hoy depende de eso: publicación de versiones,
anti-hotlink de tiles, tokens HMAC de embed y `frame-ancestors`. Es un trabajo
de días, no de horas, y toca la parte del sistema donde un error se ve en vivo
en la web del cliente.

**Recomendación: dejar el worker en Cloudflare** y desplegar en el VPS solo
`viewer`, `admin` y `embed`. Motivos concretos:

1. El plan gratuito de Cloudflare Workers cubre de sobra el tráfico de un
   recorrido inmobiliario.
2. **R2 no cobra egreso.** Un recorrido 360 son cientos de megas de tiles por
   proyecto; servirlos desde el VPS significa pagar ese ancho de banda y que
   alguien en Buenos Aires los baje desde un servidor que puede estar lejos.
   El propio código ya lo tiene en cuenta: los tiles se sirven por el dominio
   público del bucket, **no** a través del worker (está comentado en
   `wrangler.toml` y en `src/routes/serve.ts`).
3. Es para lo que está escrito. Reescribirlo ahora es asumir riesgo sin ganar
   nada que el cliente note.

**Si aun así se decide llevar todo al VPS**, hay que planificarlo aparte: no lo
metas en el mismo despliegue, porque mezcla un trabajo mecánico (levantar tres
cosas) con uno de arquitectura.

---

## 5. D2 — Dónde viven los tiles (y el material pesado)

Hoy el material del cliente **no está en git**, a propósito, y está bien que así sea:

```
elementos baleia/            2,7 GB   ← originales, ignorados por git
apps/viewer/public/baleia/            ← tiles generados, ignorados por git
```

En `apps/viewer/public` solo hay **4 archivos versionados** (`tour.json`,
`availability.json` y dos imágenes de demo). O sea: **si clonás el repo en el
servidor y compilás, el recorrido queda sin panorámicas.**

Antes de desplegar hay que responder: ¿de dónde salen los tiles en producción?

- **Recomendado**: R2 con dominio propio, que es para lo que está escrito el
  worker.
- Alternativa si todo va al VPS: un bucket MinIO en el mismo servidor, o una
  carpeta servida por el proxy. Sumale disco y ancho de banda al cálculo.

**No los subas a git.** 2,7 GB de originales en un repo es un problema
permanente, y el `.gitignore` actual ya los excluye por diseño.

---

## 6. D3 — Dominio

Hoy **no hay dominio definido** para este proyecto. Arquiify usa `arquiify.com`
y no corresponde colgar de ahí un producto distinto.

Opciones, en orden de preferencia:

1. **Dominio propio** (por ejemplo `recorrido360.com` o el nombre comercial que
   se elija). Es lo correcto si esto se le vende a inmobiliarias.
2. Un subdominio de un dominio que ya tengas.
3. **Para probar sin comprar nada**: `nip.io`. Es lo que se usó con Arquiify
   antes de comprar el dominio, y funciona bien:
   `viewer.179.199.142.5.nip.io`, `admin.179.199.142.5.nip.io`.

Recién con el dominio definido se piden los certificados de Let's Encrypt en
Dokploy. Si arrancás con `nip.io`, después la migración al dominio real es
cambiar el dominio en Dokploy y volver a pedir el certificado.

---

## 7. Lo que falta antes de poder desplegar

### 7.1 No hay repositorio remoto

```
$ git remote -v
(vacío)
```

Dokploy despliega **desde un repositorio git**, así que hay que crear uno
privado, igual que se hizo con Arquiify (`github.com/NaraDiRocco/arquiify`, con
una clave de despliegue de solo lectura).

El repositorio local ya tiene historia (`main`, con commits reales), así que es
solo crear el remoto y empujar.

**La historia ya está auditada y está limpia** (verificado el 2026-09-06):
ningún `.env` fue commiteado nunca, y no hay claves reales versionadas — las
coincidencias de `SUPABASE_SERVICE_KEY` o `EMBED_HMAC_SECRET` en el código son
solo el *nombre* de la variable, leída desde el entorno. El `.env.local` del
panel existe en el disco pero está ignorado.

Si volvés a tocar la historia (rebase, filter-branch, importar ramas viejas),
conviene repetir el chequeo:

```bash
cd ~/Desktop/"Recorrido 360"
git log --all --diff-filter=A --name-only --format="" -- '*.env' '*.env.local' | grep -v example
git grep -nIE "eyJhbGciOi[A-Za-z0-9_-]{10,}"   # tokens JWT reales
```

### 7.2 Supabase propio

El panel usa Supabase (`apps/admin/.env.example`), y hay migraciones en
`supabase/migrations/` (al menos 5 archivos numerados) más un `seed.sql`.

Hay que levantar **una instancia nueva** en Dokploy, con la plantilla de
Supabase, como se hizo con Arquiify — pero **con sus propias credenciales y su
propia base**. Los puertos internos no chocan porque cada stack vive en su red
de Docker, pero los dominios sí: usá uno distinto.

El panel tiene un **modo de simulación** que es muy útil para desplegar por
partes:

```
NEXT_PUBLIC_R360_MOCK=1   # no toca Supabase, sirve el seed de Baleia en memoria
```

**Sugerencia fuerte**: desplegá primero el visor y el panel en modo simulación,
confirmá que se ven bien con dominio y certificado, y recién después conectá
Supabase. Así separás "¿se despliega?" de "¿la base está bien?", que son dos
problemas distintos y se depuran distinto.

### 7.3 Variables de entorno de Next.js

Esto ya nos mordió en Arquiify y conviene no repetirlo: **las variables
`NEXT_PUBLIC_*` se resuelven al compilar, no al arrancar**. En Dokploy tienen que
ir como **argumentos de build**, no solo como variables de entorno del
contenedor. Si las ponés solo como entorno, la aplicación compila con valores
vacíos y falla en el navegador sin un error claro.

---

## 8. Receta de despliegue

Los identificadores de Dokploy de Arquiify, como referencia del formato:

```
proyecto Arquiify         8JdXlubQBVIw7FY7VDBc1
entorno production        q3z2SnH_KxtowtmtM11BX
app arquiify-api          qz3ZLDSjsWOEtwTyv2qGj
app arquiify-web          RANsHL7ALEb-uZIg_BBl8
compose supabase          hQMGpOedXwj9pgUDHu42W
```

Para Recorrido 360 hay que crear un **proyecto nuevo**, no colgarse del de
Arquiify.

Endpoints de la API de Dokploy que se usaron y funcionan:

```
POST /api/project.create
POST /api/application.create
POST /api/application.saveGitProvider
POST /api/application.saveBuildType
POST /api/application.saveEnvironment
POST /api/application.deploy
POST /api/domain.create      (y domain.update)
POST /api/compose.deployTemplate
```

Orden sugerido:

1. Crear el proyecto y el entorno de producción.
2. Levantar Supabase propio (plantilla de Dokploy) y guardar sus credenciales
   fuera del repo, en `~/.r360/` con permisos 600.
3. Aplicar las migraciones de `supabase/migrations/` contra **esa** instancia.
4. Desplegar el visor (build estático de Vite).
5. Desplegar el panel (Next.js), primero con `NEXT_PUBLIC_R360_MOCK=1`.
6. Dominios y certificados.
7. Conectar el panel a Supabase (`MOCK=0`) y verificar el login de verdad.
8. Decidir D1 y D2 para el worker y los tiles.

**Después de cada despliegue, verificá de verdad**: que responda 200, que el
recorrido cargue una panorámica, y que el panel entre con un usuario real. Un
contenedor "corriendo" no significa una aplicación que funciona.

---

## 9. Comandos útiles del servidor

```bash
# Contenedores y a qué proyecto pertenecen
ssh root@179.199.142.5 "docker ps --format '{{.Names}}\t{{.Status}}'"

# La base de Arquiify (NO tocarla desde este proyecto, es solo referencia
# de cómo se nombran los contenedores)
ssh root@179.199.142.5 "docker exec arquiify-supabase-cycugv-db-1 psql -U postgres -d postgres -c '\\l'"

# Espacio y memoria antes de sumar un stack nuevo
ssh root@179.199.142.5 "free -h; df -h /"
```

---

## 10. Seguridad — lo que no hay que hacer

- **No pegues contraseñas ni tokens en el chat.** Van a archivos con permisos
  600 fuera del repo (`~/.arquiify/`, `~/.r360/`).
- **No compartas base de datos entre proyectos.** Recorrido 360 tiene la suya.
- **No subas el material del cliente a git.** Son gigas y el `.gitignore` ya lo
  contempla.
- **No expongas la clave de servicio de Supabase en el front.** El panel usa la
  clave anónima; la de servicio es solo del lado del servidor.
- La contraseña de root del VPS **sigue pendiente de rotar** desde que se
  desplegó Arquiify. Conviene hacerlo.

---

## 11. Lo que este documento no resuelve

Para que no se asuma resuelto lo que no lo está:

- **La reescritura del worker** para el VPS, si se decide esa opción (D1).
- **El pipeline de generación de tiles** en producción: hoy se corre a mano en
  la computadora (`packages/pipeline`, `tools/baleia/`). Quién lo corre y dónde
  cuando entre un cliente nuevo, no está definido.
- **Copias de seguridad** de la base nueva. Arquiify tampoco las tiene
  configuradas; vale la pena resolverlo para los dos de una vez.
- **Multi-tenant en producción**: el modelo existe en las migraciones, pero cómo
  se da de alta una inmobiliaria nueva de punta a punta no está probado en un
  servidor real.
