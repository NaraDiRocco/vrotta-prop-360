import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AvailabilityFile, TourManifest } from '@r360/core';
import {
  applyTemplate,
  buildCta,
  buildCtaMessage,
  ctaContextFor,
  ctaLabel,
  deepLink,
  normalizeWhatsapp,
  whatsappUrl,
  type CtaContext,
} from './contact.ts';

const URL_B2A = 'https://baleia.uy/tour#/scene/masterplan/unit/B2-A';

// Intl separa el símbolo de moneda con un espacio duro (U+00A0): se normaliza
// para que la aserción hable del texto y no del glifo del espacio.
const plain = (s: string): string => s.replace(/[\u00a0\u202f]/g, ' ');

const base: CtaContext = {
  project: 'Baleia',
  kind: 'unit',
  code: 'B2-A',
  label: 'B2-A',
  facts: ['Dúplex', '176 m²'],
  price: { a: 240000, c: 'USD' },
  status: 'disponible',
  url: URL_B2A,
};

// ------------------------------------------------------------------ teléfono

test('normaliza el teléfono a los dígitos que quiere wa.me', () => {
  assert.equal(normalizeWhatsapp('+598 91 234 567'), '59891234567');
  assert.equal(normalizeWhatsapp('(+598) 91-234-567'), '59891234567');
});

test('un número imposible no genera enlace: mejor sin botón que con botón roto', () => {
  assert.equal(normalizeWhatsapp('123'), null);
  assert.equal(normalizeWhatsapp('a definir'), null);
  assert.equal(whatsappUrl('123', 'hola'), null);
});

test('el mensaje viaja codificado en el querystring', () => {
  const href = whatsappUrl('+59891234567', 'Hola! ¿Cuánto sale?');
  assert.equal(href, 'https://wa.me/59891234567?text=Hola!%20%C2%BFCu%C3%A1nto%20sale%3F');
});

// ------------------------------------------------------------------- mensaje

test('el mensaje de una unidad lleva datos, precio, estado y el deep link', () => {
  const msg = plain(buildCtaMessage(base));
  assert.equal(
    msg,
    'Hola! Estoy viendo Baleia y me interesa la unidad B2-A.\n' +
      '• Dúplex · 176 m²\n' +
      '• Precio de lista: US$ 240.000\n' +
      '• Estado: Disponible\n' +
      `La estoy viendo acá: ${URL_B2A}`,
  );
});

test('el deep link es la última línea: es la mejora clave sobre el competidor', () => {
  const lines = buildCtaMessage(base).split('\n');
  assert.ok(lines.at(-1)!.endsWith(URL_B2A));
  assert.ok(lines.at(-1)!.includes('#/scene/masterplan/unit/B2-A'));
});

test('sin precio público la línea de precio se vuelve la pregunta', () => {
  const msg = buildCtaMessage({ ...base, price: null });
  assert.ok(msg.includes('Quisiera saber el precio.'));
  assert.ok(!msg.includes('Precio de lista'));
});

test('una unidad sin planta pide la planta', () => {
  const msg = buildCtaMessage({ ...base, kind: 'plan', code: 'B3-H', label: 'B3-H', price: null });
  assert.ok(msg.includes('me interesa la unidad B3-H.'));
  assert.ok(msg.includes('¿Me pasás la planta?'));
});

test('la ficha de bloque consulta por el bloque, con su conteo de disponibles', () => {
  const msg = buildCtaMessage({
    ...base,
    kind: 'block',
    code: 'B2',
    label: 'Bloque 2',
    facts: [],
    availableCount: 6,
  });
  assert.ok(msg.startsWith('Hola! Estoy viendo Baleia y me interesan las unidades del Bloque 2 (6 disponibles).'));
  // Un bloque no tiene un precio ni un estado único: no se inventan.
  assert.ok(!msg.includes('Precio de lista'));
  assert.ok(!msg.includes('Estado:'));
  assert.ok(msg.includes('Lo estoy viendo acá:'));
});

test('un solo disponible se dice en singular', () => {
  const msg = buildCtaMessage({ ...base, kind: 'block', label: 'Bloque 5', facts: [], availableCount: 1 });
  assert.ok(msg.includes('(1 disponible)'));
});

test('el texto del botón dice por qué se consulta', () => {
  assert.equal(ctaLabel({ kind: 'unit', label: 'B2-A' }), 'Consultar por B2-A');
  assert.equal(ctaLabel({ kind: 'plan', label: 'B3-H' }), 'Pedir planta de B3-H');
  assert.equal(ctaLabel({ kind: 'block', label: 'Bloque 2' }), 'Consultar por el Bloque 2');
});

// ---------------------------------------- número comercial y "quiero visitarla"

test('con el número confirmado el mensaje y el botón dicen "la 201"', () => {
  const ctx: CtaContext = { ...base, numero: '201' };
  assert.equal(ctaLabel(ctx), 'Consultar por la 201');
  assert.ok(buildCtaMessage(ctx).startsWith('Hola! Estoy viendo Baleia y me interesa la 201.'));
});

test('sin número confirmado se sigue hablando por el código, sin inventar el 202', () => {
  const ctx: CtaContext = { ...base, code: 'B2-B', label: 'B2-B', numero: null };
  assert.equal(ctaLabel(ctx), 'Consultar por B2-B');
  assert.ok(buildCtaMessage(ctx).includes('me interesa la unidad B2-B.'));
  assert.ok(!buildCtaMessage(ctx).includes('202'));
});

test('"Quiero visitarla" pide la visita al bloque construido y no habla de precio', () => {
  const msg = buildCtaMessage({ ...base, kind: 'visita', numero: '201', bloqueLabel: 'Bloque 2' });
  assert.equal(
    plain(msg),
    'Hola! Estoy viendo Baleia y me interesa la 201. ¿Puedo coordinar una visita al Bloque 2?\n' +
      '• Dúplex · 176 m²\n' +
      `La estoy viendo acá: ${URL_B2A}`,
  );
  assert.ok(!msg.includes('Precio de lista'));
  assert.equal(ctaLabel({ kind: 'visita', label: 'B2-A' }), 'Quiero visitarla');
});

// ------------------------------------------------------------------ plantilla

test('la plantilla del manifiesto reemplaza sólo los placeholders conocidos', () => {
  const out = plain(applyTemplate('{project}/{code}: {price} ({status}) {url} {otro}', base));
  assert.equal(out, `Baleia/B2-A: US$ 240.000 (Disponible) ${URL_B2A} {otro}`);
});

test('sin precio la plantilla dice "a consultar", no un número inventado', () => {
  assert.equal(applyTemplate('{price}', { ...base, price: null }), 'a consultar');
});

// ----------------------------------------------------------------- deep link

test('el deep link se arma sobre la URL actual, sin arrastrar el hash viejo', () => {
  assert.equal(
    deepLink('masterplan', 'B2-A', 'https://baleia.uy/tour#/scene/acceso'),
    'https://baleia.uy/tour#/scene/masterplan/unit/B2-A',
  );
});

test('el deep link escapa códigos con caracteres raros', () => {
  assert.equal(
    deepLink('masterplan', 'M4/L 12', 'https://x.uy/'),
    'https://x.uy/#/scene/masterplan/unit/M4%2FL%2012',
  );
});

// ---------------------------------------------------------------- integración

const tour = {
  schema: 1,
  project: 'Baleia',
  version: 1,
  tenant: 'baleia',
  availabilityUrl: './availability.json',
  start: 'masterplan',
  scenes: [],
  hotspots: [],
  contact: { whatsapp: '+598 91 234 567' },
  units: {
    'B2-A': {
      label: 'B2-A',
      groupCode: 'B2',
      areaTotalM2: 176,
      attrs: { tipologia: 'Dúplex', numeroComercial: '201' },
      media: ['./p.webp'],
    },
    'B3-H': { label: 'B3-H', areaTotalM2: 96, attrs: { tipologia: '1 dormitorio' } },
    B2: { label: 'Bloque 2', attrs: { unitCodes: ['B2-A', 'B3-H'] } },
  },
} satisfies TourManifest;

const availability: AvailabilityFile = {
  v: 1,
  generated_at: '2026-08-30T00:00:00.000Z',
  units: {
    'B2-A': { s: 'disponible', p: { a: 240000, c: 'USD' } },
    'B3-H': { s: 'disponible', p: null },
    B2: { s: 'disponible', p: null },
  },
};

test('una unidad con planta y precio arma un CTA "unit" completo', () => {
  const ctx = ctaContextFor('B2-A', tour, availability, 'masterplan', 'https://baleia.uy/tour');
  assert.equal(ctx.kind, 'unit');
  assert.deepEqual(ctx.facts, ['Dúplex', '176 m²']);
  assert.equal(ctx.url, URL_B2A);
  assert.equal(ctx.numero, '201');
  assert.equal(ctx.bloqueLabel, 'Bloque 2');
  const cta = buildCta(tour.contact, ctx)!;
  assert.equal(cta.label, 'Consultar por la 201');
  assert.ok(cta.href.startsWith('https://wa.me/59891234567?text='));
  assert.ok(decodeURIComponent(cta.href).includes(URL_B2A));
});

test('la superficie del manifiesto viaja con coma decimal al mensaje', () => {
  const ctx = ctaContextFor('B2-A', { ...tour, units: { ...tour.units, 'B2-A': { ...tour.units['B2-A'], areaTotalM2: 163.42 } } } as TourManifest, availability, 'masterplan', 'https://baleia.uy/tour');
  assert.ok(plain(ctx.facts.join(' · ')).includes('163,42 m²'));
  assert.ok(!ctx.facts.join(' · ').includes('163.42'));
});

test('sin numeroComercial en el manifiesto el contexto no trae número', () => {
  const ctx = ctaContextFor('B3-H', tour, availability, 'masterplan', 'https://baleia.uy/tour');
  assert.equal(ctx.numero, null);
});

test('una unidad sin imagen de planta cae en el CTA que pide la planta', () => {
  const ctx = ctaContextFor('B3-H', tour, availability, 'masterplan', 'https://baleia.uy/tour');
  assert.equal(ctx.kind, 'plan');
  assert.equal(ctx.price, null);
});

test('una entrada con unitCodes es un bloque y cuenta sus disponibles', () => {
  const ctx = ctaContextFor('B2', tour, availability, 'masterplan', 'https://baleia.uy/tour');
  assert.equal(ctx.kind, 'block');
  assert.equal(ctx.availableCount, 2);
  assert.deepEqual(ctx.facts, []);
});

test('sin contact en el manifiesto no hay CTA (no un botón roto)', () => {
  const ctx = ctaContextFor('B2-A', tour, availability, 'masterplan', 'https://baleia.uy/tour');
  assert.equal(buildCta(undefined, ctx), null);
  assert.equal(buildCta({ whatsapp: '' }, ctx), null);
});
