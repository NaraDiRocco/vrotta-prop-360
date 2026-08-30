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

// ------------------------------------------------------------------ contrato

export type CtaKind =
  /** Unidad con precio o con "a consultar". */
  | 'unit'
  /** Unidad sin imagen de planta en el material: el faltante se vuelve motivo. */
  | 'plan'
  /** Ficha de bloque: no hay una unidad elegida todavía. */
  | 'block';

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
export function ctaLabel(ctx: Pick<CtaContext, 'kind' | 'label'>): string {
  if (ctx.kind === 'plan') return `Pedir planta de ${ctx.label}`;
  if (ctx.kind === 'block') return `Consultar por el ${ctx.label}`;
  return `Consultar por ${ctx.label}`;
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

  if (ctx.kind === 'block') {
    const disp =
      ctx.availableCount != null && ctx.availableCount > 0
        ? ` (${ctx.availableCount} ${ctx.availableCount === 1 ? 'disponible' : 'disponibles'})`
        : '';
    lines.push(`Hola! Estoy viendo ${ctx.project} y me interesan las unidades del ${ctx.label}${disp}.`);
  } else {
    lines.push(`Hola! Estoy viendo ${ctx.project} y me interesa la unidad ${ctx.label}.`);
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

// ------------------------------------------------------ contexto desde el tour

/** Arma el `CtaContext` de una unidad (o bloque) leyendo tour + availability. */
export function ctaContextFor(
  code: string,
  tour: TourManifest,
  availability: AvailabilityFile | null,
  slug: string | null,
  href?: string,
): CtaContext {
  const unit = tour.units[code];
  const entry = availability?.units[code];
  const status = entry && isUnitStatus(entry.s) ? entry.s : null;
  const attrs = unit?.attrs ?? {};
  const memberCodes = Array.isArray(attrs.unitCodes) ? (attrs.unitCodes as string[]) : null;

  const facts: string[] = [];
  if (typeof attrs.tipologia === 'string') facts.push(attrs.tipologia);
  if (unit?.areaTotalM2 != null) facts.push(`${unit.areaTotalM2} m²`);
  if (attrs.dormitorios != null) facts.push(`${String(attrs.dormitorios)} dormitorios`);

  const hasMedia = (unit?.media?.length ?? 0) > 0;
  const kind: CtaKind = memberCodes ? 'block' : hasMedia ? 'unit' : 'plan';

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
    url: deepLink(slug, code, href),
  };
}
