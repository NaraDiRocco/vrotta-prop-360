import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CondicionesVenta } from '@r360/core';
import { calcularPlanDePago, calcularTablaAmortizacion } from '@r360/core';
import { cotizadorPanelHtml, formatMonto, puedeCotizarse } from './cotizador-panel.ts';
import type { Cta } from './contact.ts';

// Intl separa el símbolo de moneda con un espacio duro (U+00A0): se normaliza
// para que la aserción hable del texto y no del glifo del espacio.
const plain = (s: string): string => s.replace(/[  ]/g, ' ');
const montoPlano = (p: { a: number; c: string }): string => plain(formatMonto(p));

// Las condiciones reales de Baleia (lista de precios Caetano, septiembre
// 2026), las mismas que usa `packages/core/src/cotizador.test.ts`.
const CONDICIONES: CondicionesVenta = {
  anticipoPct: 0.5,
  tasaAnualPct: 0.06,
  plazoMeses: 12,
  gastosOcupacionPct: 0.04,
  gastosOcupacionReparto: { posesionPct: 0.025, escrituraPct: 0.015 },
};

const PRECIO = 261111; // B2-F/B2-G en `tour.json`: caso ya verificado a mano en `cotizador.test.ts`.
const MONEDA = 'USD';

// ------------------------------------------------------------------ decisión

test('sin condiciones (tour.cotizador ausente) no se cotiza', () => {
  assert.equal(
    puedeCotizarse({ cotizador: null, esBloque: false, price: { a: PRECIO, c: MONEDA }, sinConsulta: false }),
    false,
  );
  assert.equal(
    puedeCotizarse({ cotizador: undefined, esBloque: false, price: { a: PRECIO, c: MONEDA }, sinConsulta: false }),
    false,
  );
});

test('un bloque (no una unidad) no se cotiza', () => {
  assert.equal(
    puedeCotizarse({ cotizador: CONDICIONES, esBloque: true, price: { a: PRECIO, c: MONEDA }, sinConsulta: false }),
    false,
  );
});

test('sin precio público ("a consultar") no se cotiza', () => {
  assert.equal(
    puedeCotizarse({ cotizador: CONDICIONES, esBloque: false, price: null, sinConsulta: false }),
    false,
  );
});

test('vendida, bloqueada, próximamente o sin dato (sinConsulta) no se cotiza', () => {
  assert.equal(
    puedeCotizarse({ cotizador: CONDICIONES, esBloque: false, price: { a: PRECIO, c: MONEDA }, sinConsulta: true }),
    false,
  );
});

test('con condiciones, precio público, unidad (no bloque) y en venta, sí se cotiza', () => {
  assert.equal(
    puedeCotizarse({ cotizador: CONDICIONES, esBloque: false, price: { a: PRECIO, c: MONEDA }, sinConsulta: false }),
    true,
  );
});

// -------------------------------------------------------------------- montos

test('formatMonto conserva los centavos (a diferencia de formatPrice)', () => {
  // 50% de 261.111 cae justo en medio dólar: si se recortara a 0 decimales
  // como el precio de lista, "anticipo" dejaría de ser la mitad exacta del
  // precio que se ve arriba en la ficha.
  assert.equal(plain(formatMonto({ a: 130555.5, c: 'USD' })), 'US$ 130.555,50');
  assert.equal(plain(formatMonto({ a: 11236.45, c: 'USD' })), 'US$ 11.236,45');
});

// ---------------------------------------------------------------------- HTML

test('el HTML arranca cerrado: aria-expanded="false" y el cuerpo hidden', () => {
  const plan = calcularPlanDePago(PRECIO, CONDICIONES);
  const amortizacion = calcularTablaAmortizacion(PRECIO, CONDICIONES);
  const html = cotizadorPanelHtml({ condiciones: CONDICIONES, plan, amortizacion, moneda: MONEDA, cta: null });
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /id="r360-cotizador-body"[^>]*hidden/);
  assert.match(html, />Simular plan de pago</);
});

test('la cuota grande y el total de cuotas son internamente consistentes: cuota × plazo = total', () => {
  const plan = calcularPlanDePago(PRECIO, CONDICIONES);
  const amortizacion = calcularTablaAmortizacion(PRECIO, CONDICIONES);
  const html = cotizadorPanelHtml({ condiciones: CONDICIONES, plan, amortizacion, moneda: MONEDA, cta: null });
  const plano = plain(html);
  // La cuota grande, arriba.
  assert.ok(plano.includes(`${plan.plazoMeses} cuotas de`));
  assert.ok(plano.includes(montoPlano({ a: plan.cuotaMensual, c: MONEDA })));
  // Los totales de abajo, ya calculados por el motor a partir de la MISMA
  // cuota redondeada (ver la nota de redondeo de `cotizador.ts`): por
  // construcción, cuotaMensual × plazoMeses === totalCuotas, así que lo que
  // se ve arriba y lo que se ve abajo cierran exacto, sin nota al pie.
  assert.equal(Math.round(plan.cuotaMensual * plan.plazoMeses * 100), Math.round(plan.totalCuotas * 100));
  assert.ok(plano.includes(montoPlano({ a: plan.saldoFinanciar, c: MONEDA })));
  assert.ok(plano.includes(montoPlano({ a: plan.interesesTotales, c: MONEDA })));
  assert.ok(plano.includes(montoPlano({ a: plan.totalUnidad, c: MONEDA })));
});

test('el bloque de gastos de ocupación trae el desglose y la aclaración textual', () => {
  const plan = calcularPlanDePago(PRECIO, CONDICIONES);
  const amortizacion = calcularTablaAmortizacion(PRECIO, CONDICIONES);
  const html = cotizadorPanelHtml({ condiciones: CONDICIONES, plan, amortizacion, moneda: MONEDA, cta: null });
  const plano = plain(html);
  assert.ok(plano.includes('Gastos de ocupación (4%)'));
  assert.ok(plano.includes('2,5% a la posesión'));
  assert.ok(plano.includes('1,5% a la escritura'));
  assert.ok(plano.includes('Se abonan por separado y no integran el total a escriturar.'));
  assert.ok(plano.includes(montoPlano({ a: plan.gastosOcupacion.total, c: MONEDA })));
});

test('"ver cuota por cuota" trae una fila por cada cuota del plazo', () => {
  const plan = calcularPlanDePago(PRECIO, CONDICIONES);
  const amortizacion = calcularTablaAmortizacion(PRECIO, CONDICIONES);
  const html = cotizadorPanelHtml({ condiciones: CONDICIONES, plan, amortizacion, moneda: MONEDA, cta: null });
  assert.ok(html.includes('Ver cuota por cuota'));
  const filas = html.match(/<tr>/g) ?? [];
  // +1 por la fila de encabezado (`<thead><tr>...`).
  assert.equal(filas.length, CONDICIONES.plazoMeses + 1);
  // La última fila (la que absorbe el redondeo, ver `cotizador.ts`) cierra
  // siempre en saldo final 0.
  const ultima = amortizacion.at(-1)!;
  assert.equal(ultima.saldoFinal, 0);
  assert.ok(plain(html).includes(montoPlano({ a: ultima.cuota, c: MONEDA })));
});

test('sin CTA de WhatsApp (proyecto sin `contact`) el resto del cotizador se sigue mostrando', () => {
  const plan = calcularPlanDePago(PRECIO, CONDICIONES);
  const amortizacion = calcularTablaAmortizacion(PRECIO, CONDICIONES);
  const html = cotizadorPanelHtml({ condiciones: CONDICIONES, plan, amortizacion, moneda: MONEDA, cta: null });
  assert.ok(!html.includes('data-cta-unit'));
  // Nunca un botón que no lleva a ningún lado, pero sí los números: son
  // útiles aunque no haya a quién mandárselos.
  assert.ok(html.includes('Simular plan de pago'));
});

test('con CTA armado, el botón de WhatsApp lleva los datos de `Cta` tal cual', () => {
  const plan = calcularPlanDePago(PRECIO, CONDICIONES);
  const amortizacion = calcularTablaAmortizacion(PRECIO, CONDICIONES);
  const cta: Cta = {
    label: 'Enviar propuesta por WhatsApp',
    message: 'Hola!',
    href: 'https://wa.me/59891234567?text=Hola!',
    kind: 'cotizador',
    unitCode: 'B2-F',
  };
  const html = cotizadorPanelHtml({ condiciones: CONDICIONES, plan, amortizacion, moneda: MONEDA, cta });
  assert.ok(html.includes('data-cta-unit="B2-F"'));
  assert.ok(html.includes('data-cta-kind="cotizador"'));
  assert.ok(html.includes(cta.href));
  assert.ok(html.includes('Enviar propuesta por WhatsApp'));
});
