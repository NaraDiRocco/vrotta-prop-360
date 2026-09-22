import type { TourManifest } from '@r360/core';

/**
 * Etiquetas Open Graph / Twitter Card para la tarjeta de previsualización del
 * shell (WhatsApp, y cualquier otro cliente que lea `og:*`), armadas POR
 * PROYECTO en `routes/serve.ts` — nunca embebidas en el HTML del visor, que
 * es el mismo archivo para todos los tenants (ver el comentario en
 * apps/viewer/index.html que dejó este hueco pendiente).
 *
 * Todo lo de acá es funciones puras sobre datos ya en memoria (un
 * `TourManifest` y un string de HTML): la parte con I/O (leer `tour.json` de
 * R2, resolver el origen del request) vive en `routes/serve.ts`, que es quien
 * de verdad conoce el entorno de ejecución. Separado así, este módulo se
 * prueba sin mockear R2 ni KV.
 */

export interface OgTags {
  title: string;
  /** Ausente si no hay descripción que ofrecer — ver `buildOgTags`. */
  description?: string;
  /** URL ABSOLUTA (esquema + host + path). Ausente si no hay imagen posible — nunca vacía ni rota. */
  image?: string;
  /** URL ABSOLUTA de esta misma página, tal como la pidió el visitante. */
  url: string;
  siteName: string;
}

/**
 * Vuelve absoluta una ruta de media del manifiesto contra el origen del
 * request. Las rutas de media del manifiesto ya salen de `publish.ts`
 * (`prefixManifestMediaPaths`) absolutas DESDE LA RAÍZ del propio origen
 * (`/t/tenant/proyecto/vN/...`) — nunca relativas al documento — así que acá
 * alcanza con anteponerles el origen, nunca tratarlas como relativas a un
 * path intermedio.
 *
 * Una ruta que ya trae esquema (`http:`, `https:`, `data:`...) se deja
 * intacta: puede venir de `settings.social.image` cargado a mano por un
 * admin con una URL externa. `//host/...` (protocol-relative) no es válido
 * para `og:image` (la spec pide URL absoluta con esquema), así que se le
 * pone el esquema del origen en vez de dejarlo así.
 */
function toAbsoluteUrl(origin: string, path: string): string {
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)) return path;
  if (path.startsWith('//')) return `${origin.split('://')[0]}:${path}`;
  if (path.startsWith('/')) return `${origin}${path}`;
  return `${origin}/${path}`;
}

/**
 * `og:image`, en el orden de precedencia del pedido:
 *   1. `settings.social.image` (vía `manifest.social`), si está cargado.
 *   2. La primera foto de `photoTour.items` que NO sea `restricted` — las
 *      recreaciones de IA (`restricted: true`, ver el docstring de
 *      `PhotoTourItem` en packages/core/src/types.ts) están explícitamente
 *      vetadas como portada/miniatura/OG fuera de su contexto original: usar
 *      una acá sería exactamente el uso que el campo existe para prohibir.
 *   3. `brandLogo`, si no hay ninguna foto utilizable.
 *   4. Nada: NUNCA se emite una imagen rota ni un string vacío (tarea 3 del
 *      pedido). El visor/la tarjeta simplemente sale sin `og:image`.
 */
function resolveOgImage(manifest: TourManifest, origin: string): string | undefined {
  const socialImage = manifest.social?.image;
  if (socialImage) return toAbsoluteUrl(origin, socialImage);

  const primeraFotoUtilizable = manifest.photoTour?.items.find((item) => !item.restricted);
  if (primeraFotoUtilizable) return toAbsoluteUrl(origin, primeraFotoUtilizable.url);

  if (manifest.brandLogo) return toAbsoluteUrl(origin, manifest.brandLogo);

  return undefined;
}

/**
 * Arma las etiquetas a partir de un manifiesto ya leído y el origen/ruta del
 * request. Devuelve `null` sólo cuando el manifiesto no tiene ni el dato
 * mínimo indispensable (`project`, siempre obligatorio en `TourManifest`) —
 * en la práctica eso sólo pasa si quien llama ya detectó un manifiesto
 * ilegible y de todos modos invocó esta función; `routes/serve.ts` corta
 * antes en ese caso, así que esto es más red de seguridad que camino
 * esperado.
 *
 * `og:description`: a propósito NO tiene deducción de respaldo desde el
 * manifiesto (a diferencia de `title` e `image`) — no hay ningún campo de
 * texto libre en `TourManifest` del que deducir una descripción razonable, y
 * inventar una (p. ej. "Recorrido virtual de {project}") sería agregar
 * contenido que nadie cargó. Mismo criterio que con `og:image`: mejor
 * ausente que inventado.
 *
 * `og:site_name`: se reusa el mismo título resuelto, no un nombre de marca
 * fijo — este SaaS es white-label (el motivo entero de esta tarea es que la
 * tarjeta de CADA proyecto tiene que ser la suya), así que no existe un
 * "nombre del sitio" distinto del propio proyecto para poner acá.
 */
export function buildOgTags(manifest: TourManifest, origin: string, requestPath: string): OgTags | null {
  if (!manifest || typeof manifest.project !== 'string' || manifest.project.length === 0) {
    return null;
  }

  const title = manifest.social?.title?.trim() || manifest.project;
  const description = manifest.social?.description?.trim() || undefined;
  const image = resolveOgImage(manifest, origin);

  return {
    title,
    description,
    image,
    url: `${origin}${requestPath}`,
    siteName: title,
  };
}

const HTML_ATTR_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapado para interpolar texto de la base dentro de un atributo HTML
 * (`content="..."`). Las cinco entidades de la tabla son las que importan acá
 * — `"` porque el atributo está entre comillas dobles, `<`/`>` porque cierran
 * el propio tag o abren uno nuevo, `&` porque sin escaparlo primero cualquier
 * otra entidad de esta misma tabla quedaría mal formada, y `'` por las dudas
 * (defensa en profundidad si algún día el atributo se cita con comilla
 * simple). Sin esto, un nombre de proyecto como
 * `Baleia" /><script>alert(1)</script>` cierra el atributo y el tag `<meta>`
 * y mete un `<script>` propio en el `<head>` — ver el test dedicado.
 */
export function escapeHtmlAttr(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ATTR_ESCAPES[ch] as string);
}

function metaTag(attr: 'property' | 'name', key: string, content: string): string {
  return `<meta ${attr}="${key}" content="${escapeHtmlAttr(content)}">`;
}

/** Arma el bloque de `<meta>` a insertar, ya escapado. Sólo emite las etiquetas cuyo dato existe. */
function renderOgTagsHtml(tags: OgTags): string {
  const lines: string[] = [
    metaTag('property', 'og:type', 'website'),
    metaTag('property', 'og:site_name', tags.siteName),
    metaTag('property', 'og:title', tags.title),
    metaTag('property', 'og:url', tags.url),
  ];
  if (tags.description) lines.push(metaTag('property', 'og:description', tags.description));
  if (tags.image) lines.push(metaTag('property', 'og:image', tags.image));

  lines.push(metaTag('name', 'twitter:card', 'summary_large_image'));
  lines.push(metaTag('name', 'twitter:title', tags.title));
  if (tags.description) lines.push(metaTag('name', 'twitter:description', tags.description));
  if (tags.image) lines.push(metaTag('name', 'twitter:image', tags.image));

  return lines.join('\n    ');
}

const HEAD_CLOSE = /<\/head>/i;

/**
 * Inserta el bloque de etiquetas OG justo antes de `</head>`. Si el shell no
 * tiene un `</head>` reconocible (HTML raro, roto, o de un build futuro que
 * cambió la forma del documento) se devuelve el HTML SIN TOCAR — nunca se
 * arriesga a partir el documento a la fuerza; que falte la tarjeta de
 * previsualización es aceptable, que el visor no cargue no (tarea 6 del
 * pedido).
 *
 * El reemplazo usa una función callback, no un string, como segundo
 * argumento de `replace`: un string de reemplazo interpreta patrones como
 * `$&`/`$1` de forma especial, y el bloque puede contener perfectamente un
 * `$` legítimo (viene de datos de la base, ya escapados para HTML pero no
 * para la sintaxis de `String.prototype.replace`). Con un callback ese
 * problema no existe.
 */
export function injectOgTags(html: string, tags: OgTags): string {
  if (!HEAD_CLOSE.test(html)) return html;
  const block = `    ${renderOgTagsHtml(tags)}\n  `;
  return html.replace(HEAD_CLOSE, () => `${block}</head>`);
}
