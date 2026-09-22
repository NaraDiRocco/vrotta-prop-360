// Reconciliador de dominios: lee de Supabase qué hosts tiene que atender la
// plataforma y le escribe a Traefik la configuración dinámica para que los
// enrute y les emita certificado. Es el mismo patrón que ya corre en
// producción para otro proyecto de este mismo servidor (Dokploy + Traefik
// con *file provider* leyendo `/etc/dokploy/traefik/dynamic/*.yml`) — acá se
// repite al pie de la letra, porque cada detalle de abajo salió de un
// incidente real.
//
// Uso: node tools/deploy/reconciliador-dominios.mjs
//
// Pensado para correr por cron, cada minuto (Traefik vigila los archivos y
// recarga solo apenas cambian — no hace falta reiniciar nada):
//
//   * * * * * cd /ruta/al/repo && /usr/bin/node tools/deploy/reconciliador-dominios.mjs >> /var/log/r360/reconciliador-dominios.log 2>&1
//
// Variables de entorno requeridas:
//
//   SUPABASE_URL              URL base del proyecto de Supabase (sin barra
//                              final), p.ej. https://xxxx.supabase.co — mismo
//                              nombre que usa apps/worker/src/env.ts.
//   SUPABASE_SERVICE_KEY      Service role key de ese Supabase. Tiene que
//                              poder leer `projects` y `project_domains` sin
//                              pasar por RLS. Igual que arriba, mismo nombre
//                              que ya usa el worker.
//   R360_BASE_DOMAIN          Dominio base de la plataforma, p.ej.
//                              "recorrido360.com". Cada `projects.subdomain`
//                              (sólo el label, p.ej. "acme") se combina con
//                              esto para armar el host completo
//                              "acme.recorrido360.com".
//   R360_WORKER_URL            URL interna del worker que sirve todos los
//                              proyectos, p.ej. "http://r360-worker:8787".
//                              Es el `service` de Traefik para el router
//                              GENERAL de cada host: el worker resuelve el
//                              proyecto leyendo el header Host (por eso
//                              `passHostHeader: true` más abajo).
//   R360_MEDIA_URL             URL interna del nginx que sirve la media
//                              versionada (fotos, tiles 360, video), p.ej.
//                              "http://r360-media:80". A diferencia de las
//                              demás, esta variable es OPCIONAL: si falta,
//                              se usa ese mismo valor por defecto. Por qué
//                              hace falta un service aparte del worker: el
//                              passthrough genérico del worker devuelve el
//                              objeto entero y no implementa Range -- con
//                              fotos y tiles sería sólo ineficiente, pero el
//                              video del recorrido pesa 64 MB, y sin Range
//                              no se puede adelantar, se lo tiene que bajar
//                              entero primero. Por eso cada host tiene, además
//                              del router general, uno extra que manda la
//                              ruta versionada de media directo a
//                              `r360-media` en vez de al worker -- ver el
//                              router `<prefix>-<hash>-media` en
//                              `renderTraefikDynamicConfig`.
//   TRAEFIK_SUBDOMAINS_FILE    Ruta absoluta al .yml de subdominios de
//                              plataforma, p.ej.
//                              /etc/dokploy/traefik/dynamic/r360-subdominios.yml
//   TRAEFIK_CUSTOM_DOMAINS_FILE  Ruta absoluta al .yml de dominios propios de
//                              clientes, p.ej.
//                              /etc/dokploy/traefik/dynamic/r360-dominios-propios.yml
//
// Por qué DOS archivos y no uno: un dominio propio mal cargado por un
// cliente (typo, DNS raro, lo que sea) no tiene por qué poder tirar abajo el
// archivo de subdominios de plataforma, que es infraestructura nuestra y
// tiene que seguir funcionando pase lo que pase del lado del cliente. Cada
// archivo se regenera y se escribe de forma independiente: si uno falla
// (Supabase no responde para esa tabla, por ejemplo), el otro igual se
// actualiza.
//
// Reconciliación declarativa completa: en cada corrida se regenera el
// archivo ENTERO a partir de lo que hay hoy en la base. No hay altas o bajas
// incrementales — si un proyecto pierde su subdominio, en la próxima corrida
// (como mucho, un minuto después) ese router deja de existir. Si Supabase
// devuelve una lista vacía, el archivo se vacía: es la reconciliación
// funcionando, no un bug. (Si algún día hace falta un colchón contra un hipo
// transitorio de la API que devuelva 200 con menos filas de las que debería,
// ese colchón va acá, pero hoy no existe, a propósito, por simplicidad.)

import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

// ───────────────────────────────────────────────────────────────────────
// Parte PURA: valida hosts y arma el YAML. Sin red, sin filesystem, sin
// `process.env` — recibe strings, devuelve strings. Es la que testea
// reconciliador-dominios.test.mjs sin necesidad de Supabase ni de Traefik.
// ───────────────────────────────────────────────────────────────────────

// Un hostname válido y nada más laxo: minúsculas, dígitos, guion y punto
// como separador de labels, cada label empieza y termina con
// alfanumérico (no con guion), y tiene que haber al menos un punto (esto
// arma hosts completos, "sub.dominio", no labels sueltos). Cualquier otro
// carácter -- comilla, backtick, espacio, paréntesis -- queda afuera de
// entrada: el patrón sólo permite `[a-z0-9.-]`, así que un host manipulado
// para meter algo como `` evil`)\n  otra-cosa: true # `` (para cerrar el
// `Host(\`...\`)` de Traefik e inyectar configuración propia) nunca hace
// match y se descarta.
const HOST_PATTERN =
  /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

// 253 es el límite real de un hostname (RFC 1035); no hace falta una
// política de producto más estricta acá como la que sí tiene
// `projects.subdomain` en la migración 0022 (esa limita a 30 porque hay una
// razón de producto -- un link fácil de decir por teléfono --, acá sólo
// importa que sea un host válido).
const MAX_HOST_LENGTH = 253;

/** ¿`host` es un hostname válido para meter tal cual dentro de un `Host(...)` de Traefik? */
export function isValidHost(host) {
  return (
    typeof host === 'string' &&
    host.length > 0 &&
    host.length <= MAX_HOST_LENGTH &&
    HOST_PATTERN.test(host)
  );
}

/**
 * Normaliza una lista cruda de hosts (tal como salen de armar
 * `subdomain + '.' + base` o de leer `project_domains.domain`): minúsculas,
 * sin espacios de sobra, deduplicados y ordenados alfabéticamente.
 *
 * El orden importa para el determinismo del archivo final: la base no
 * garantiza en qué orden devuelve las filas, y si el archivo cambiara de
 * contenido sólo porque PostgREST decidió devolver las filas en otro orden,
 * Traefik recargaría de gusto en cada corrida aunque el conjunto de hosts
 * sea exactamente el mismo. Ordenar acá, antes de generar el YAML, elimina
 * esa fuente de recargas inútiles.
 *
 * Los hosts inválidos NO se descartan en silencio de esta función: se
 * devuelven aparte (`invalid`, con el valor tal cual vino) para que el
 * llamador los registre en el log — "descartar en silencio" en la letra de
 * la tarea es sobre el archivo generado (que un host raro no aparezca ahí),
 * no sobre la operación entera quedando sin rastro.
 */
export function normalizeHosts(rawHosts) {
  const valid = new Set();
  const invalid = [];
  for (const raw of rawHosts) {
    const host = typeof raw === 'string' ? raw.trim().toLowerCase() : raw;
    if (isValidHost(host)) {
      valid.add(host);
    } else {
      invalid.push(raw);
    }
  }
  return { hosts: [...valid].sort(), invalid };
}

function shortHash(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

// Ruta versionada de media dentro del recorrido: `/t/{tenant}/{project}/v{n}/...`
// (fotos, tiles 360, video). Es una constante nuestra, no algo que salga de
// la base ni del host -- por eso no necesita pasar por `isValidHost` ni por
// ningún saneamiento: el único lugar donde se arma es acá.
const MEDIA_PATH_REGEXP = '^/t/[^/]+/[^/]+/v[0-9]+/';

// Prioridad explícita del router de media. Sin esto, Traefik ordena por
// longitud de la regla (heurística de "más específica gana"), y con dos
// reglas por host (una sólo `Host(...)`, otra `Host(...) && PathRegexp(...)`)
// el resultado técnicamente ya favorece a la más larga -- pero depender de
// esa heurística implícita es justamente lo que la tarea pidió evitar: un
// día cualquiera alguien agrega upstream una tercera regla, o cambia el
// patrón, y el orden "obvio" deja de serlo. Fijar la prioridad -- alto para
// media, bajo para el general -- lo hace explícito y a prueba de ese futuro
// cambio.
const MEDIA_ROUTER_PRIORITY = 100;
// Cualquier valor menor a MEDIA_ROUTER_PRIORITY alcanza; 1 es el mínimo
// razonable en Traefik (0 se trata como "sin prioridad asignada" y cae de
// nuevo en la heurística por longitud, así que no sirve para este propósito).
const GENERAL_ROUTER_PRIORITY = 1;

/**
 * Genera el YAML de configuración dinámica de Traefik para una lista de
 * hosts YA normalizada (ver `normalizeHosts` — esta función no vuelve a
 * validar ni a deduplicar, confía en su entrada).
 *
 * Por cada host arma TRES routers:
 *   - uno GENERAL en `websecure`, con TLS vía `letsencrypt`, que apunta al
 *     `service` del worker (`serviceUrl`) y atiende todo lo que no matchea
 *     el de media. Prioridad explícita baja (`GENERAL_ROUTER_PRIORITY`).
 *   - uno de MEDIA, también en `websecure` con TLS, pero que sólo matchea
 *     `Host(...) && PathRegexp(MEDIA_PATH_REGEXP)` y apunta a un `service`
 *     distinto (`mediaServiceUrl`, el nginx `r360-media`) -- el passthrough
 *     genérico del worker no implementa Range, así que serviría el video de
 *     64 MB del recorrido entero de una, sin poder adelantarlo. Prioridad
 *     explícita alta (`MEDIA_ROUTER_PRIORITY`), para que le gane SIEMPRE al
 *     general del mismo host sin depender de cómo Traefik compare longitud
 *     de reglas.
 *   - uno en `web` (HTTP plano) que sólo redirige a HTTPS -- así un cliente
 *     que todavía tiene el link viejo en `http://` no se queda tildado ni
 *     ve un error de certificado. Sirve para las dos rutas de arriba por
 *     igual: no necesita distinguir media, sólo manda a HTTPS y ahí
 *     deciden los dos routers de `websecure` por prioridad.
 *
 * El router de media SIEMPRE lleva el `Host(...)` de ESE proyecto, nunca
 * una regla de sólo `PathRegexp` sin Host: Traefik comparte este mismo file
 * provider con otros proyectos ajenos que viven en el mismo servidor (ver
 * DESPLIEGUE-VPS.md), y una regla de path sin Host se comería esa ruta en
 * TODOS los dominios que atiende ese Traefik, no sólo en los nuestros. Por
 * eso el router de media se genera acá adentro, por host, y no en un
 * archivo/regla suelta y global.
 *
 * Cada `service` es UNO SOLO por archivo para todos sus hosts (no uno por
 * host): todos los routers generales apuntan al mismo worker y todos los de
 * media al mismo `r360-media`, ambos con `passHostHeader: true`, que es lo
 * que les permite resolver a qué proyecto corresponde cada request mirando
 * el header `Host` de la request entrante.
 *
 * `routerPrefix` distingue el namespace de nombres entre el archivo de
 * subdominios y el de dominios propios (p.ej. "r360-sub" / "r360-custom"):
 * mantiene routers, middleware y services con nombres distintos entre los
 * dos archivos aunque casualmente compartan algún host, y hace que cada
 * nombre de router sea determinista (mismo host -> mismo hash -> mismo
 * nombre siempre, sin importar el orden de la base ni cuántas veces se
 * regenere).
 */
export function renderTraefikDynamicConfig(hosts, { routerPrefix, serviceUrl, mediaServiceUrl }) {
  if (!routerPrefix) throw new Error('renderTraefikDynamicConfig: falta routerPrefix');
  if (!serviceUrl) throw new Error('renderTraefikDynamicConfig: falta serviceUrl');
  if (!mediaServiceUrl) throw new Error('renderTraefikDynamicConfig: falta mediaServiceUrl');

  const header = [
    '# Generado por tools/deploy/reconciliador-dominios.mjs -- NO EDITAR A MANO.',
    '# Se regenera entero en cada corrida (cron, cada minuto); un cambio manual',
    '# se pisa en la próxima.',
  ];

  if (hosts.length === 0) {
    // A propósito NO se emite `http.routers: {}` acá abajo. Traefik v3
    // rechaza esa clave vacía y, al rechazarla, tira abajo la recarga de
    // TODA la configuración dinámica del file provider -- no sólo la de
    // este archivo, la de cualquier otro .yml que Traefik esté vigilando
    // en el mismo directorio. Ya pasó una vez acá. La salida segura cuando
    // no hay hosts es no escribir la sección `http:` en absoluto: un
    // documento YAML vacío (o sólo comentarios) es, para Traefik, "esta
    // fuente no aporta nada" -- lo ignora sin quejarse y sin voltear a las
    // demás.
    return [
      ...header,
      '#',
      '# Sin hosts para enrutar en esta corrida (ver normalizeHosts): no hay',
      '# sección "http:" a propósito, ver el comentario en',
      '# renderTraefikDynamicConfig() de reconciliador-dominios.mjs.',
      '',
    ].join('\n');
  }

  const middlewareName = `${routerPrefix}-redirect-https`;
  const serviceName = `${routerPrefix}-service`;
  const mediaServiceName = `${routerPrefix}-media-service`;

  const lines = [...header, 'http:', '  routers:'];

  for (const host of hosts) {
    // Nombre determinista: mismo host produce siempre el mismo hash, así
    // que correr el reconciliador dos veces seguidas con los mismos datos
    // da bit a bit el mismo archivo (ver el test de determinismo). Usar un
    // hash del host en vez del host tal cual como nombre de router evita
    // además cualquier problema con los caracteres que YAML no banca bien
    // en una key (empezar con dígito, largo, etc.).
    const hash = shortHash(host);
    const secureRouter = `${routerPrefix}-${hash}`;
    const mediaRouter = `${secureRouter}-media`;
    const plainRouter = `${secureRouter}-web`;
    const rule = `Host(\`${host}\`)`;
    // Siempre con el Host de este proyecto adelante: ver la explicación
    // larga en el docstring de arriba sobre por qué un PathRegexp sin Host
    // sería una regla global que se comería esa ruta para todos los demás
    // proyectos que este mismo Traefik atiende.
    const mediaRule = `Host(\`${host}\`) && PathRegexp(\`${MEDIA_PATH_REGEXP}\`)`;

    lines.push(
      // Router general: todo lo que no sea media versionada. Prioridad
      // explícita BAJA a propósito, para no depender de que Traefik la
      // calcule sola comparando longitud de reglas (ver comentario junto a
      // GENERAL_ROUTER_PRIORITY).
      `    ${secureRouter}:`,
      `      rule: "${rule}"`,
      `      priority: ${GENERAL_ROUTER_PRIORITY}`,
      '      entryPoints:',
      '        - websecure',
      `      service: ${serviceName}`,
      '      tls:',
      '        certResolver: letsencrypt',
      // Router de media: mismo host, mismo entrypoint/TLS, pero acotado a
      // las rutas versionadas y con prioridad explícita ALTA, para que le
      // gane siempre al general de arriba.
      `    ${mediaRouter}:`,
      `      rule: "${mediaRule}"`,
      `      priority: ${MEDIA_ROUTER_PRIORITY}`,
      '      entryPoints:',
      '        - websecure',
      `      service: ${mediaServiceName}`,
      '      tls:',
      '        certResolver: letsencrypt',
      // Redirect HTTP -> HTTPS: uno solo por host, no necesita distinguir
      // media -- una vez en HTTPS, los dos routers de arriba deciden.
      `    ${plainRouter}:`,
      `      rule: "${rule}"`,
      '      entryPoints:',
      '        - web',
      `      service: ${serviceName}`,
      '      middlewares:',
      `        - ${middlewareName}`,
    );
  }

  lines.push(
    '  middlewares:',
    `    ${middlewareName}:`,
    '      redirectScheme:',
    '        scheme: https',
    '        permanent: true',
    '  services:',
    `    ${serviceName}:`,
    '      loadBalancer:',
    '        servers:',
    `          - url: "${serviceUrl}"`,
    '        passHostHeader: true',
    `    ${mediaServiceName}:`,
    '      loadBalancer:',
    '        servers:',
    `          - url: "${mediaServiceUrl}"`,
    '        passHostHeader: true',
    '',
  );

  return lines.join('\n');
}

/**
 * Junta `normalizeHosts` + `renderTraefikDynamicConfig` en una sola llamada
 * pura: es la función que usan tanto `reconcile*()` más abajo como los
 * tests. Devuelve también `invalid` para que el llamador decida cómo
 * registrarlo (acá: un `console.warn` por host descartado).
 */
export function buildDynamicConfigFile(rawHosts, { routerPrefix, serviceUrl, mediaServiceUrl }) {
  const { hosts, invalid } = normalizeHosts(rawHosts);
  const yaml = renderTraefikDynamicConfig(hosts, { routerPrefix, serviceUrl, mediaServiceUrl });
  return { yaml, hosts, invalid };
}

// ───────────────────────────────────────────────────────────────────────
// Parte con efectos: leer Supabase, escribir el archivo. Nada de esto se
// testea directo (necesitaría una base y un filesystem real) -- lo que
// importa que esté bien es la parte pura de arriba.
// ───────────────────────────────────────────────────────────────────────

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta (o está vacía) la variable de entorno ${name}.`);
  }
  return value;
}

async function fetchAllRows(supabaseUrl, queryPath, serviceKey) {
  const pageSize = 1000;
  const rows = [];
  // Paginado por si algún día hay más tenants/proyectos de los que entran
  // en una sola página de PostgREST (por defecto, Supabase corta en 1000
  // filas si no se pide explícitamente un rango mayor). Hoy con pocos
  // proyectos esto siempre va a resolver en una sola vuelta del loop.
  for (let offset = 0; ; offset += pageSize) {
    const res = await fetch(`${supabaseUrl}/rest/v1/${queryPath}`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Range: `${offset}-${offset + pageSize - 1}`,
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Supabase/PostgREST respondió ${res.status} en "${queryPath}": ${body.slice(0, 300)}`);
    }
    const page = await res.json();
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

/**
 * Escribe `content` en `targetFile` sólo si difiere del contenido actual, y
 * cuando escribe lo hace de forma atómica: primero a un archivo temporal EN
 * EL MISMO DIRECTORIO, después `rename`. `rename` dentro del mismo
 * filesystem es atómico a nivel de sistema operativo -- Traefik, que está
 * mirando el directorio, nunca llega a abrir un YAML a medio escribir (lo
 * peor que puede pasar es que no lo vea todavía, nunca que lo vea roto a
 * mitad de una escritura).
 *
 * "No reescribir si no cambió" no es sólo prolijidad: cada escritura hace
 * que Traefik recargue toda su configuración dinámica. Si el reconciliador
 * corre cada minuto y el estado de la base no cambió, escribir el mismo
 * contenido de nuevo sería una recarga de Traefik por minuto, sin motivo.
 */
async function writeIfChanged(targetFile, content) {
  let current = null;
  try {
    current = await readFile(targetFile, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  if (current === content) return false;

  const dir = path.dirname(targetFile);
  const tmpFile = path.join(dir, `.${path.basename(targetFile)}.tmp-${process.pid}-${Date.now()}`);
  await writeFile(tmpFile, content, 'utf8');
  try {
    await rename(tmpFile, targetFile);
  } catch (err) {
    await unlink(tmpFile).catch(() => {});
    throw err;
  }
  return true;
}

function logInvalid(label, invalid) {
  for (const raw of invalid) {
    console.warn(`[reconciliador-dominios] ${label}: host inválido descartado -> ${JSON.stringify(raw)}`);
  }
}

async function reconcileSubdomains({ supabaseUrl, serviceKey, baseDomain, workerUrl, mediaUrl, targetFile }) {
  const rows = await fetchAllRows(supabaseUrl, 'projects?select=subdomain&subdomain=not.is.null', serviceKey);
  const rawHosts = rows
    .map((row) => (row && row.subdomain ? `${row.subdomain}.${baseDomain}` : null))
    .filter((host) => host !== null);

  const { yaml, hosts, invalid } = buildDynamicConfigFile(rawHosts, {
    routerPrefix: 'r360-sub',
    serviceUrl: workerUrl,
    mediaServiceUrl: mediaUrl,
  });
  logInvalid('subdominios', invalid);
  const wrote = await writeIfChanged(targetFile, yaml);
  console.log(
    `[reconciliador-dominios] subdominios: ${hosts.length} host(s), ${invalid.length} descartado(s), ` +
      `${wrote ? 'archivo actualizado' : 'sin cambios'} -> ${targetFile}`,
  );
}

async function reconcileCustomDomains({ supabaseUrl, serviceKey, workerUrl, mediaUrl, targetFile }) {
  const rows = await fetchAllRows(supabaseUrl, 'project_domains?select=domain&status=eq.verified', serviceKey);
  const rawHosts = rows.map((row) => (row ? row.domain : null)).filter((host) => host !== null);

  const { yaml, hosts, invalid } = buildDynamicConfigFile(rawHosts, {
    routerPrefix: 'r360-custom',
    serviceUrl: workerUrl,
    mediaServiceUrl: mediaUrl,
  });
  logInvalid('dominios propios', invalid);
  const wrote = await writeIfChanged(targetFile, yaml);
  console.log(
    `[reconciliador-dominios] dominios propios: ${hosts.length} host(s), ${invalid.length} descartado(s), ` +
      `${wrote ? 'archivo actualizado' : 'sin cambios'} -> ${targetFile}`,
  );
}

async function main() {
  const supabaseUrl = requireEnv('SUPABASE_URL').replace(/\/+$/, '');
  const serviceKey = requireEnv('SUPABASE_SERVICE_KEY');
  const baseDomain = requireEnv('R360_BASE_DOMAIN').trim().toLowerCase();
  const workerUrl = requireEnv('R360_WORKER_URL');
  // A diferencia de las demás, R360_MEDIA_URL es opcional: en el VPS el
  // service de media siempre se llama "r360-media" y escucha en el puerto
  // 80 (ver DESPLIEGUE-VPS.md), así que ese valor sirve de default sin que
  // haga falta configurarlo a mano en cada entorno.
  const mediaUrl = process.env.R360_MEDIA_URL || 'http://r360-media:80';
  const subdomainsFile = requireEnv('TRAEFIK_SUBDOMAINS_FILE');
  const customDomainsFile = requireEnv('TRAEFIK_CUSTOM_DOMAINS_FILE');

  // Los dos archivos se reconcilian por separado y con `allSettled`, no con
  // `Promise.all`: si Supabase responde mal para `project_domains` pero bien
  // para `projects` (o viceversa), el archivo que sí pudo leerse igual se
  // actualiza. Un problema del lado de los dominios propios de un cliente no
  // tiene por qué frenar la reconciliación de los subdominios de plataforma,
  // que es justo la separación en dos archivos que pide la tarea.
  const results = await Promise.allSettled([
    reconcileSubdomains({ supabaseUrl, serviceKey, baseDomain, workerUrl, mediaUrl, targetFile: subdomainsFile }),
    reconcileCustomDomains({ supabaseUrl, serviceKey, workerUrl, mediaUrl, targetFile: customDomainsFile }),
  ]);

  const labels = ['subdominios', 'dominios propios'];
  let failed = false;
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      failed = true;
      console.error(`[reconciliador-dominios] falló la reconciliación de ${labels[i]}:`, result.reason);
    }
  });
  if (failed) process.exitCode = 1;
}

// Sólo corre `main()` cuando el archivo se ejecuta directo (`node
// reconciliador-dominios.mjs`), no cuando otro módulo lo importa -- que es
// exactamente lo que hace reconciliador-dominios.test.mjs para llegar a las
// funciones puras de arriba sin disparar una corrida real contra Supabase.
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((err) => {
    console.error('[reconciliador-dominios] fallo inesperado:', err);
    process.exitCode = 1;
  });
}
