/**
 * Contacto y conversión: el CTA de WhatsApp con el mensaje prellenado.
 *
 * Lo mejor del benchmark es el WhatsApp prellenado de Jacarandá, que manda
 * precio, anticipo y cuota. Este módulo hace lo mismo y le agrega la pieza que
 * a ellos les falta y que nosotros sí podemos dar: **el deep link a la unidad**
 * (`#/scene/{slug}/unit/{code}`). Con eso el vendedor abre exactamente lo que
 * el comprador estaba mirando, y si el chat se reenvía, el tercero cae en la
 * misma landing. El mensaje deja de ser texto y pasa a ser un artefacto
 * navegable — algo que un tour de 3DVista no puede mandar porque no tiene
 * URLs por unidad.
 *
 * Todo lo que arma el mensaje y el enlace es PURO y está testeado
 * (`contact.test.ts`): es lo único del visor que el visitante le va a mostrar
 * a otra persona, así que no puede depender de que alguien lo mire en pantalla.
 *
 * Este módulo NO toca el DOM: arma el texto y el enlace, y la ficha
 * (`ui.ts`) los dibuja. Si el proyecto no tiene `tour.contact`, `buildCta`
 * devuelve `null` y no hay que dibujar nada — un botón de contacto que no
 * lleva a ningún lado es peor que no tener botón.
 */
import type { AvailabilityFile, TourManifest, UnitStatus } from '@r360/core';
import { STATUS_TOKENS, isUnitStatus } from '@r360/core';
import { formatPrice, type Price } from './polygons.ts';
import { formatM2, frasePorUnidad, numeroComercial } from './unidad.ts';

// ------------------------------------------------------------------ contrato

export type CtaKind =
  /** Unidad con precio o con "a consultar". */
  | 'unit'
  /** Unidad sin imagen de planta en el material: el faltante se vuelve motivo. */
  | 'plan'
  /** Ficha de bloque: no hay una unidad elegida todavía. */
  | 'block'
  /**
   * "Quiero visitarla" desde la ficha de una unidad construida (plan §6). Es
   * la variante que ningún proyecto en pozo puede ofrecer, y por eso vive
   * como un CTA propio y no como un texto más del mensaje de consulta.
   */
  | 'visita';

export interface CtaContext {
  project: string;
  kind: CtaKind;
  code: string;
  label: string;
  /** Datos cortos, en orden de lectura: "Dúplex", "176 m²", "2 dormitorios". */
  facts: readonly string[];
  price: Price | null;
  status: UnitStatus | null;
  /** Sólo para `kind: 'block'`. */
  availableCount?: number | null;
  /**
   * Número comercial confirmado ("201"), si el manifiesto lo trae. El vendedor
   * y el comprador hablan de "la 201", no de "B2-A" (plan §6, punto 2). Nunca
   * se deduce acá: llega o no llega (ver `unidad.ts`).
   */
  numero?: string | null;
  /** Rótulo del bloque al que pertenece la unidad ("Bloque 2"), si lo hay. */
  bloqueLabel?: string | null;
  /** Deep link absoluto a lo que el visitante está mirando. */
  url: string;
}

export interface Cta {
  /** Texto del botón: "Consultar por B2-A". */
  label: string;
  /** Mensaje prellenado, ya en español rioplatense. */
  message: string;
  /** `https://wa.me/…?text=…` */
  href: string;
  kind: CtaKind;
  unitCode: string;
}

// -------------------------------------------------------------------- mensaje

/**
 * `wa.me` quiere el número en dígitos, sin `+`, espacios, guiones ni paréntesis.
 * Se normaliza acá y no en el builder para que un manifiesto escrito a mano
 * con "+598 91 234 567" también funcione.
 */
export function normalizeWhatsapp(raw: string): string | null {
  const digits = raw.replace(/\D+/g, '');
  // Menos de 8 dígitos no es un teléfono de ningún país: mejor no ofrecer el
  // botón que abrir WhatsApp en un número que no existe.
  return digits.length >= 8 ? digits : null;
}

export function whatsappUrl(whatsapp: string, message: string): string | null {
  const digits = normalizeWhatsapp(whatsapp);
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : null;
}

/** Texto del botón. Lleva el código adentro: el visitante ve por qué consulta. */
export function ctaLabel(ctx: Pick<CtaContext, 'kind' | 'label' | 'numero'>): string {
  if (ctx.kind === 'visita') return 'Quiero visitarla';
  if (ctx.kind === 'plan') return `Pedir planta de ${ctx.label}`;
  if (ctx.kind === 'block') return `Consultar por el ${ctx.label}`;
  // Con el número confirmado el botón dice lo que el comprador va a decir por
  // teléfono: "Consultar por la 201" (plan §6, "El botón").
  return ctx.numero ? `Consultar por la ${ctx.numero}` : `Consultar por ${ctx.label}`;
}

const bullet = (s: string) => `• ${s}`;

/**
 * El mensaje que se abre en WhatsApp.
 *
 * Está escrito como lo escribiría el comprador, no como lo escribiría un
 * formulario: arranca con "Hola!", tutea, y no dice "Estimado" ni "Solicito
 * información". El vendedor tiene que poder responderlo sin traducir nada.
 */
export function buildCtaMessage(ctx: CtaContext): string {
  const lines: string[] = [];

  // "Quiero visitarla": la unidad está construida y se puede ir a verla. El
  // mensaje no necesita precio ni estado — necesita una fecha, que la pone el
  // vendedor.
  if (ctx.kind === 'visita') {
    const frase = frasePorUnidad(ctx);
    const donde = ctx.bloqueLabel ? ` al ${ctx.bloqueLabel}` : '';
    lines.push(`Hola! Estoy viendo ${ctx.project} y me interesa ${frase}. ¿Puedo coordinar una visita${donde}?`);
    if (ctx.facts.length) lines.push(bullet(ctx.facts.join(' · ')));
    lines.push(`La estoy viendo acá: ${ctx.url}`);
    return lines.join('\n');
  }

  if (ctx.kind === 'block') {
    const disp =
      ctx.availableCount != null && ctx.availableCount > 0
        ? ` (${ctx.availableCount} ${ctx.availableCount === 1 ? 'disponible' : 'disponibles'})`
        : '';
    lines.push(`Hola! Estoy viendo ${ctx.project} y me interesan las unidades del ${ctx.label}${disp}.`);
  } else {
    lines.push(`Hola! Estoy viendo ${ctx.project} y me interesa ${frasePorUnidad(ctx)}.`);
  }

  if (ctx.facts.length) lines.push(bullet(ctx.facts.join(' · ')));

  if (ctx.kind !== 'block') {
    if (ctx.price) lines.push(bullet(`Precio de lista: ${formatPrice(ctx.price)}`));
    // Sin precio público no se inventa un número ni se calla el tema: se
    // convierte en la pregunta, que es exactamente para lo que sirve el canal.
    else lines.push('Quisiera saber el precio.');
    if (ctx.status) lines.push(bullet(`Estado: ${STATUS_TOKENS[ctx.status].label}`));
  }

  // El faltante de material (7 de 20 unidades sin planta) se vuelve motivo de
  // contacto en vez de un renglón vacío en la ficha.
  if (ctx.kind === 'plan') lines.push('¿Me pasás la planta?');

  lines.push(`${ctx.kind === 'block' ? 'Lo' : 'La'} estoy viendo acá: ${ctx.url}`);
  return lines.join('\n');
}

/**
 * Plantilla opcional del manifiesto (`contact.messageTemplate`). Sólo se
 * reemplazan los placeholders conocidos; cualquier otro `{...}` queda tal cual
 * (es texto del cliente, no nuestro).
 */
export function applyTemplate(template: string, ctx: CtaContext): string {
  const values: Record<string, string> = {
    project: ctx.project,
    code: ctx.code,
    label: ctx.label,
    facts: ctx.facts.join(' · '),
    price: ctx.price ? formatPrice(ctx.price) : 'a consultar',
    status: ctx.status ? STATUS_TOKENS[ctx.status].label : '',
    url: ctx.url,
  };
  return template.replace(/\{(project|code|label|facts|price|status|url)\}/g, (_m, k: string) => values[k]!);
}

/** Une todo. `null` cuando el proyecto no tiene contacto cargado. */
export function buildCta(contact: TourManifest['contact'], ctx: CtaContext): Cta | null {
  if (!contact?.whatsapp) return null;
  const message = contact.messageTemplate
    ? applyTemplate(contact.messageTemplate, ctx)
    : buildCtaMessage(ctx);
  const href = whatsappUrl(contact.whatsapp, message);
  if (!href) {
    console.warn(`[r360] contact.whatsapp "${contact.whatsapp}" no parece un teléfono; no se muestra el CTA.`);
    return null;
  }
  return { label: ctaLabel(ctx), message, href, kind: ctx.kind, unitCode: ctx.code };
}

// ------------------------------------------------------------------ deep link

/**
 * URL absoluta de la unidad. Es la mejora clave sobre el prellenado de
 * Jacarandá: el mensaje viaja con la dirección exacta de lo que se está
 * mirando.
 *
 * El formato del hash se repite acá (una línea) en vez de importarse de
 * `scenes.ts`: ese módulo arrastra Photo Sphere Viewer y Leaflet, que no
 * cargan en Node, y este es el único módulo del visor que se testea sin
 * navegador. Si el hash canónico cambia, cambia también `scenes.ts::buildHash`.
 */
export function deepLink(slug: string | null, code: string, href: string = location.href): string {
  const base = href.split('#')[0]!;
  return slug ? `${base}#/scene/${encodeURIComponent(slug)}/unit/${encodeURIComponent(code)}` : base;
}

// ---------------------------------------------------------- registro de leads

/**
 * Hallazgo I1 de la auditoría: el visor arma el link de WhatsApp pero nunca
 * avisa a nadie más. `POST /api/leads` (apps/worker/src/routes/leads.ts) ya
 * existe y guarda bien en Supabase — sólo que ningún botón lo llama, así que
 * la pantalla de Leads del panel queda vacía para siempre y la inmobiliaria
 * pierde cada consulta.
 *
 * Contrato del body, tal como lo espera el endpoint (ver el comentario de
 * `leads.ts`): tenant/project son los slugs de la URL (`/t/:tenant/:project`,
 * no el nombre lindo de `tour.project`), `channel` siempre `'whatsapp'` acá
 * porque este módulo sólo dispara desde el CTA de WhatsApp, y `name` es
 * obligatorio del lado del servidor aunque el visor no le pida el nombre a
 * nadie: pedirlo sería la puerta que el arranque "sin puertas" (plan §1, ver
 * `main.ts`) decidió no poner. Por eso viaja un valor fijo que dice lo que es
 * — un signal anónimo — y el resto del contexto (unidad, mensaje) viaja en
 * `unitCode`/`message`.
 */
export interface LeadPayload {
  tenant: string;
  project: string;
  channel: 'whatsapp';
  name: string;
  unitCode?: string | null;
  message?: string | null;
  whatsappNumber?: string | null;
}

/** Nombre fijo para un lead sin formulario: ver comentario de `LeadPayload`. */
export const ANONYMOUS_LEAD_NAME = 'Visitante del recorrido (WhatsApp)';

/**
 * El botón renderiza el link de WhatsApp con el mensaje ya codificado en
 * `?text=`. En vez de recalcular el mensaje en el punto de click (duplicando
 * lo que `buildCtaMessage`/`applyTemplate` ya decidieron al armar la ficha),
 * se lo vuelve a leer desde ahí: una sola fuente de verdad para "qué dice el
 * mensaje".
 */
export function messageFromWhatsappHref(href: string): string | null {
  try {
    return new URL(href).searchParams.get('text');
  } catch {
    return null;
  }
}

/**
 * `/api/leads` vive en el mismo Worker que sirve `tour.json`
 * (`/t/:tenant/:project/*`, ver `serve.ts`): se resuelve contra el origen de
 * `tourUrl`, igual que `resolveManifestUrls` en `main.ts` resuelve los
 * assets del manifiesto. Nunca se inventa un host nuevo ni se lee de una
 * variable de entorno que el visor no tiene: en producción el visor y el
 * Worker son el mismo origen.
 */
export function leadsUrl(tourUrl: string, href: string = location.href): string {
  return new URL('/api/leads', new URL(tourUrl, href)).href;
}

/**
 * El tenant y el project "reales" (los slugs que `resolveProject` busca en
 * Supabase) son los segmentos de `/t/:tenant/:project/...` con los que el
 * Worker sirvió este recorrido — no `tour.project`, que es el nombre lindo
 * ("Baleia") y no necesariamente el slug. Se leen de la URL en vez de
 * agregar un campo nuevo al manifiesto porque la URL ES el contrato que
 * `serve.ts` ya expone.
 */
export function projectRefFromLocation(pathname: string): { tenant: string; project: string } | null {
  const m = /^\/t\/([^/]+)\/([^/]+)/.exec(pathname);
  return m ? { tenant: decodeURIComponent(m[1]!), project: decodeURIComponent(m[2]!) } : null;
}

/**
 * Manda el lead a `/api/leads` sin bloquear ni demorar el click: el
 * visitante tiene que salir a WhatsApp aunque el Worker esté caído, esté
 * lento, o el rate limit lo frene (I2). Por eso esta función nunca se
 * `await`ea desde el handler de click y nunca deja escapar un error.
 *
 * `sendBeacon` es la herramienta pensada para esto: manda el POST aunque la
 * pestaña se vaya a segundo plano o se cierre un instante después de abrir
 * WhatsApp (justo lo que pasa acá — el link a wa.me navega o abre una app
 * externa apenas se suelta el click). Un `fetch` normal, incluso sin awaitear
 * la promesa, puede quedar cancelado por el navegador si la página se
 * descarga antes de que el request salga. `sendBeacon` no permite headers
 * custom, pero un `Blob` con `type: 'application/json'` alcanza: el
 * navegador arma el `Content-Type` a partir de ese `type`, así que
 * `c.req.json()` del lado del Worker lo sigue leyendo bien.
 *
 * El fallback a `fetch({ keepalive: true })` es sólo para el puñado de
 * entornos sin `sendBeacon` (o donde devuelve `false` porque la cola interna
 * del navegador está llena) — `keepalive` es la opción de `fetch` pensada
 * para el mismo caso de "la página se puede ir en cualquier momento".
 */
export function registerLead(payload: LeadPayload, endpoint: string): void {
  let body: string;
  try {
    body = JSON.stringify(payload);
  } catch {
    return; // payload no serializable: no hay nada que mandar.
  }

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon(endpoint, blob)) return;
    }
  } catch {
    // sendBeacon no debería tirar, pero si lo hace (cola llena en algún
    // navegador raro) se sigue de largo al fallback de fetch.
  }

  try {
    void fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      // El lead no se registró, pero WhatsApp ya abrió — no es problema del
      // visitante. Nunca se le muestra un error por esto.
    });
  } catch {
    // Nunca debe reventar el click del visitante por esto.
  }
}

/** Lo que llevan los eventos `r360:cta` que disparan `ui.ts` y `tour-rail.ts`. */
export interface CtaEventDetail {
  unitCode: string | null;
  kind: string | null;
  message?: string | null;
}

/**
 * Arma el `LeadPayload` a partir del evento de click y del tour ya cargado.
 * Vive acá (no en `main.ts`) para poder testearse sin DOM, igual que el
 * resto de este módulo.
 */
export function leadPayloadFromCta(
  tour: Pick<TourManifest, 'contact'>,
  ref: { tenant: string; project: string },
  detail: CtaEventDetail,
): LeadPayload {
  return {
    tenant: ref.tenant,
    project: ref.project,
    channel: 'whatsapp',
    name: ANONYMOUS_LEAD_NAME,
    unitCode: detail.unitCode ?? null,
    message: detail.message ?? null,
    whatsappNumber: normalizeWhatsapp(tour.contact?.whatsapp ?? ''),
  };
}

// ------------------------------------------------------ contexto desde el tour

/** Arma el `CtaContext` de una unidad (o bloque) leyendo tour + availability. */
export function ctaContextFor(
  code: string,
  tour: TourManifest,
  availability: AvailabilityFile | null,
  slug: string | null,
  href?: string,
  /** Fuerza la variante del CTA ("Quiero visitarla"); por defecto se deduce del material. */
  kindOverride?: CtaKind,
): CtaContext {
  const unit = tour.units[code];
  const entry = availability?.units[code];
  const status = entry && isUnitStatus(entry.s) ? entry.s : null;
  const attrs = unit?.attrs ?? {};
  const memberCodes = Array.isArray(attrs.unitCodes) ? (attrs.unitCodes as string[]) : null;

  const facts: string[] = [];
  if (typeof attrs.tipologia === 'string') facts.push(attrs.tipologia);
  // Coma decimal, igual que la pantalla: el mensaje decía "163.42 m²" mientras
  // la ficha decía "163,42 m²" (auditoría §2.15).
  if (unit?.areaTotalM2 != null) facts.push(formatM2(unit.areaTotalM2));
  if (attrs.dormitorios != null) facts.push(`${String(attrs.dormitorios)} dormitorios`);

  const hasMedia = (unit?.media?.length ?? 0) > 0;
  const kind: CtaKind = kindOverride ?? (memberCodes ? 'block' : hasMedia ? 'unit' : 'plan');
  const grupo = unit?.groupCode ?? null;

  return {
    project: tour.project,
    kind,
    code,
    label: unit?.label ?? code,
    facts: memberCodes ? [] : facts,
    price: entry?.p ?? null,
    status,
    availableCount: memberCodes
      ? memberCodes.filter((c) => availability?.units[c]?.s === 'disponible').length
      : null,
    numero: numeroComercial(attrs),
    bloqueLabel: grupo ? (tour.units[grupo]?.label ?? grupo) : null,
    url: deepLink(slug, code, href),
  };
}
