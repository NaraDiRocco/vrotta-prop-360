# Recorrido 360 — Despliegue en el VPS de Hostinger

> Documento para arrancar el despliegue desde otra sesión de trabajo.
> Escrito el 2026-09-06. Todo lo que dice acá está verificado contra el servidor
> y contra este repo, no asumido.

---

## 0. Estado actual — Baleia vive DENTRO de la plataforma (2026-09-22)

> Esta sección manda sobre todo el resto del documento donde se contradigan.
> Lo de abajo está verificado contra el servidor, no asumido.

### Lo que cambió respecto de la primera versión de esta sección

Baleia estuvo unas horas publicada como **sitio suelto** (un nginx sirviendo
archivos estáticos, sin base de datos). Eso ya no es así: ahora es un
**proyecto adentro del SaaS**, con sus filas en Supabase, su manifiesto
versionado y su subdominio propio. El sitio suelto sigue instalado pero **sin
ruta en Traefik**, como respaldo: para volver atrás alcanza con restaurar
`/root/.r360/respaldo/baleia.yml.suelto` en `/etc/dokploy/traefik/dynamic/`.

### Las piezas

VPS **179.199.142.5** (el de Arquiify). Todo corre en la red `dokploy-network`,
enrutado por el Traefik que Dokploy ya tenía.

| Servicio | Qué hace |
|---|---|
| `r360-worker` | la capa de servido de la plataforma (Hono sobre Node) |
| `r360-media` | nginx que sirve la media versionada, con soporte de rangos |
| `r360-reconciliador` | cada minuto, lee la base y le escribe a Traefik un router por host |
| `baleia-leads` | receptor de contactos del sitio suelto (sigue vivo) |
| `baleia-web` | el sitio suelto, **sin ruta**, como respaldo |

El worker no es una imagen: es un bundle de ~150 KB montado en un contenedor
`node:22-alpine`. Actualizarlo es copiar un archivo y forzar el servicio.

### Cómo se publica

```bash
bash tools/deploy/publicar-plataforma.sh dacal baleia
```

Construye el visor, crea la versión nueva enlazando la anterior con hardlinks
(los 100 MB de media no se copian: una publicación cuesta ~2 MB de disco),
sincroniza por contenido y no por fecha —Vite recopia la carpeta pública en
cada build, así que las fechas siempre cambian aunque los bytes no—, llama a
`/api/publish` para que arme el manifiesto **desde la base** y mueva el
puntero, y regenera la disponibilidad.

### Cómo se carga un proyecto

```bash
python3 tools/baleia/scripts/ingestar_a_plataforma.py \
  --tenant dacal --project baleia --subdominio baleia \
  --nombre-tenant "Dacal Bienes Raíces" --prefijo-publicado "" --aplicar
```

Sin `--aplicar` no escribe nada, sólo muestra el plan. Es idempotente. El
`--prefijo-publicado ""` importa: conserva el `./baleia/` de las rutas, que es
la forma en que la media se sube al almacenamiento y la que espera el
`index.html` para el logo del preloader.

### Subdominio automático y dominio propio

Cada proyecto tiene `projects.subdomain` (único global, label DNS válido, con
lista de reservados que hace cumplir un trigger). El reconciliador le escribe
a Traefik **tres routers por host**: el general hacia el worker, el de media
hacia nginx (con `PathRegexp` y prioridad explícita) y el de redirección a
https. Traefik pide y renueva el certificado solo.

Hoy el dominio base es `179.199.142.5.nip.io`, que funciona como wildcard sin
tocar DNS. **Falta comprar el dominio del SaaS.** El día que esté:

1. Cargar un registro **A wildcard** `*.algo.eldominio.com` → `179.199.142.5`.
2. Cambiar `R360_PAGES_DOMAIN` y `R360_BASE_DOMAIN` en `/root/.r360/worker.env`.
3. Reiniciar `r360-worker` y `r360-reconciliador`.

Para el dominio propio de un cliente está la tabla `project_domains`, con
token de posesión y estados. El reconciliador sólo enruta los `verified`.

### Lo que sigue pendiente

- **Comprar el dominio del SaaS** (ver arriba). Es lo único que bloquea.
- **Sin `og:image`**: el link compartido por WhatsApp sale sin imagen. Necesita
  URL absoluta, o sea dominio.
- **Los leads del proyecto en la plataforma** los recibe `/api/leads` del
  worker y van a la tabla `leads` de Supabase. Los que junte el sitio suelto
  quedaron en `/srv/baleia/leads/leads.jsonl`.
- **`B3-K`** ahora figura como "próximamente"; el pipeline viejo la omitía a
  propósito. Es la única diferencia visible respecto del sitio suelto.
- **Servir por ruta** (`/t/tenant/proyecto/`) no sirve el shell del visor: sus
  assets son absolutos desde la raíz. Por hostname sí. Si alguna vez hace
  falta la forma por ruta, hay que construir el visor con `VITE_BASE`.
- Los precios se siguen actualizando a mano en el CSV.

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
