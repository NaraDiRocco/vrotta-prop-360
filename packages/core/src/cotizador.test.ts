import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularPlanDePago, calcularTablaAmortizacion } from './cotizador.ts';
import type { CondicionesVenta } from './cotizador.ts';

/**
 * Condiciones comerciales reales de Baleia (lista de precios Caetano,
 * septiembre 2026): anticipo 50% + 12 cuotas al 6% anual sobre saldo,
 * gastos de ocupación 4% (2.5% a la posesión + 1.5% a la escritura). Son las
 * mismas que emite `tools/baleia/scripts/build_tour.py`.
 */
const CONDICIONES: CondicionesVenta = {
  anticipoPct: 0.5,
  tasaAnualPct: 0.06,
  plazoMeses: 12,
  gastosOcupacionPct: 0.04,
  gastosOcupacionReparto: { posesionPct: 0.025, escrituraPct: 0.015 },
};

// Los tres casos verificados a mano (informe de la tarea): precio, anticipo,
// saldo, cuota, total de cuotas, intereses totales y gastos de ocupación.
const CASOS = [
  {
    precio: 261111,
    anticipo: 130555.5,
    saldo: 130555.5,
    cuota: 11236.45,
    totalCuotas: 134837.4,
    intereses: 4281.9,
    go: 10444.44,
  },
  {
    precio: 358638,
    anticipo: 179319,
    saldo: 179319,
    cuota: 15433.35,
    totalCuotas: 185200.2,
    intereses: 5881.2,
    go: 14345.52,
  },
  {
    precio: 364861,
    anticipo: 182430.5,
    saldo: 182430.5,
    cuota: 15701.14,
    totalCuotas: 188413.68,
    intereses: 5983.18,
    go: 14594.44,
  },
];

test('calcularPlanDePago reproduce los tres casos verificados de la lista de precios', () => {
  for (const caso of CASOS) {
    const plan = calcularPlanDePago(caso.precio, CONDICIONES);
    assert.equal(plan.anticipo, caso.anticipo, `anticipo de ${caso.precio}`);
    assert.equal(plan.saldoFinanciar, caso.saldo, `saldo de ${caso.precio}`);
    assert.equal(plan.cuotaMensual, caso.cuota, `cuota de ${caso.precio}`);
    assert.equal(plan.totalCuotas, caso.totalCuotas, `total de cuotas de ${caso.precio}`);
    assert.equal(plan.interesesTotales, caso.intereses, `intereses de ${caso.precio}`);
    assert.equal(plan.gastosOcupacion.total, caso.go, `gastos de ocupación de ${caso.precio}`);
    // Decisión de redondeo: el total de cuotas es la cuota YA redondeada
    // por la cantidad de cuotas, no la suma de la cuota exacta.
    assert.equal(plan.totalCuotas, Math.round(caso.cuota * 12 * 100) / 100);
  }
});

test('el desglose de gastos de ocupación de 261.111 es posesión 6.527,78 y escritura 3.916,66', () => {
  const plan = calcularPlanDePago(261111, CONDICIONES);
  assert.equal(plan.gastosOcupacion.posesion, 6527.78);
  assert.equal(plan.gastosOcupacion.escritura, 3916.66);
  // El desglose suma exacto contra el total (ver nota de redondeo del archivo).
  assert.equal(
    Math.round((plan.gastosOcupacion.posesion + plan.gastosOcupacion.escritura) * 100) / 100,
    plan.gastosOcupacion.total,
  );
});

test('totalUnidad y desembolsoTotal se arman a partir de anticipo/cuotas/gastos de ocupación', () => {
  const plan = calcularPlanDePago(261111, CONDICIONES);
  assert.equal(plan.totalUnidad, Math.round((plan.anticipo + plan.totalCuotas) * 100) / 100);
  assert.equal(
    plan.desembolsoTotal,
    Math.round((plan.totalUnidad + plan.gastosOcupacion.total) * 100) / 100,
  );
});

test('la tabla de amortización cierra en saldo final cero', () => {
  for (const caso of CASOS) {
    const tabla = calcularTablaAmortizacion(caso.precio, CONDICIONES);
    assert.equal(tabla.length, 12);
    assert.equal(tabla.at(-1)?.saldoFinal, 0, `saldo final de ${caso.precio}`);
  }
});

test('la suma de las amortizaciones de la tabla es igual al saldo financiado', () => {
  for (const caso of CASOS) {
    const tabla = calcularTablaAmortizacion(caso.precio, CONDICIONES);
    const sumaAmortizaciones = tabla.reduce((acc, fila) => acc + fila.amortizacion, 0);
    assert.equal(Math.round(sumaAmortizaciones * 100) / 100, caso.saldo, `suma de amortizaciones de ${caso.precio}`);
  }
});

test('la tabla de amortización encadena saldoFinal de una fila con saldoInicial de la siguiente', () => {
  const tabla = calcularTablaAmortizacion(261111, CONDICIONES);
  for (let idx = 1; idx < tabla.length; idx++) {
    assert.equal(tabla[idx]?.saldoInicial, tabla[idx - 1]?.saldoFinal);
  }
  // Números de fila 1..12, sin saltos.
  assert.deepEqual(
    tabla.map((f) => f.numero),
    Array.from({ length: 12 }, (_, i) => i + 1),
  );
});

test('un plazo de 24 meses también funciona: cierra en cero y la cuota mensual baja frente a 12 meses', () => {
  const condiciones24: CondicionesVenta = { ...CONDICIONES, plazoMeses: 24 };
  const plan12 = calcularPlanDePago(261111, CONDICIONES);
  const plan24 = calcularPlanDePago(261111, condiciones24);
  const tabla24 = calcularTablaAmortizacion(261111, condiciones24);

  assert.equal(tabla24.length, 24);
  assert.equal(tabla24.at(-1)?.saldoFinal, 0);
  const sumaAmortizaciones24 = tabla24.reduce((acc, fila) => acc + fila.amortizacion, 0);
  assert.equal(Math.round(sumaAmortizaciones24 * 100) / 100, plan24.saldoFinanciar);

  // Más plazo, cuota mensual más baja (mismo saldo, más cuotas para pagarlo).
  assert.ok(plan24.cuotaMensual < plan12.cuotaMensual);
  // Pero más plazo también significa más interés total acumulado.
  assert.ok(plan24.interesesTotales > plan12.interesesTotales);
});

test('un precio cero no explota: plan en cero y tabla de saldo cero de punta a punta', () => {
  const plan = calcularPlanDePago(0, CONDICIONES);
  assert.equal(plan.precio, 0);
  assert.equal(plan.anticipo, 0);
  assert.equal(plan.saldoFinanciar, 0);
  assert.equal(plan.cuotaMensual, 0);
  assert.equal(plan.totalCuotas, 0);
  assert.equal(plan.interesesTotales, 0);
  assert.equal(plan.totalUnidad, 0);
  assert.equal(plan.gastosOcupacion.total, 0);
  assert.equal(plan.desembolsoTotal, 0);

  const tabla = calcularTablaAmortizacion(0, CONDICIONES);
  assert.equal(tabla.length, 12);
  for (const fila of tabla) {
    assert.equal(fila.saldoInicial, 0);
    assert.equal(fila.amortizacion, 0);
    assert.equal(fila.interes, 0);
    assert.equal(fila.cuota, 0);
    assert.equal(fila.saldoFinal, 0);
  }
});

test('un precio nulo o indefinido tampoco explota: se trata como 0', () => {
  for (const precio of [null, undefined] as const) {
    const plan = calcularPlanDePago(precio, CONDICIONES);
    assert.equal(plan.precio, 0);
    assert.equal(plan.desembolsoTotal, 0);
    assert.equal(calcularTablaAmortizacion(precio, CONDICIONES).length, 12);
  }
});

test('un precio negativo tampoco explota: se trata como 0', () => {
  const plan = calcularPlanDePago(-1000, CONDICIONES);
  assert.equal(plan.precio, 0);
  assert.equal(plan.saldoFinanciar, 0);
});
