/**
 * El cotizador de la ficha: cuándo se muestra, cómo se formatean sus números
 * y el HTML del desplegable. Lógica pura, sin DOM — igual que `unidad.ts` y
 * `contact.ts`, y por la misma razón: es la que decide qué ve el visitante y
 * qué manda por WhatsApp, así que tiene que poder probarse con `node --test`
 * sin levantar un navegador.
 *
 * El MOTOR de cálculo (`calcularPlanDePago`, `calcularTablaAmortizacion`)
 * vive en `@r360/core::cotizador.ts` y no acá: ese archivo es el que sabe de
 * redondeo financiero y lo necesita también el panel (no sólo el visor). Acá
 * sólo se decide SI se dibuja y CÓMO se ve lo que ese motor ya calculó.
 *
 * `ui.ts` es quien la integra: arma `price`/`sinConsulta` a partir del tour y
 * la disponibilidad (eso sí es DOM/estado del visor) y llama a las funciones
 * de este archivo con datos ya resueltos.
 */
import type { CondicionesVenta, CuotaAmortizacion, PlanDePago } from '@r360/core';
import { PRICE_ON_REQUEST, escapeHtml, type Price } from './polygons.ts';
import type { Cta } from './contact.ts';

// ------------------------------------------------------------------ decisión

/**
 * ¿Corresponde mostrar el cotizador de esta unidad? Todas las condiciones son
 * de corte, no adornos — si cualquiera falla, no hay nada que simular:
 *
 *  - Sin `cotizador` (condiciones comerciales) en el manifiesto: no hay con
 *    qué calcular un plan.
 *  - Es un bloque (`esBloque`), no una unidad: el bloque no tiene un precio
 *    propio para financiar, tiene el resumen de varias unidades.
 *  - Sin precio PÚBLICO (`price` nulo): hay unidades "a consultar" a
 *    propósito (visibilidad no pública) — cotizarlas sería inventar un
 *    número que el proyecto decidió no publicar.
 *  - `sinConsulta`: el mismo corte que ya usa el CTA de contacto (`ui.ts`,
 *    `SIN_CONSULTA` — vendida, bloqueada, próximamente o sin dato). Si no hay
 *    ni siquiera botón para preguntar, tampoco hay para qué simular un plan
 *    de pago de algo que no está a la venta.
 */
export function puedeCotizarse(opts: {
  cotizador: CondicionesVenta | null | undefined;
  esBloque: boolean;
  price: Price | null;
  sinConsulta: boolean;
}): boolean {
  return !!opts.cotizador && !opts.esBloque && !!opts.price && !opts.sinConsulta;
}

// ------------------------------------------------------------------ números

/**
 * A diferencia de `formatPrice` (que recorta a propósito los centavos del
 * precio de lista: un número grande y redondo no los necesita), acá SÍ
 * importan. La cuota mensual sale de un cálculo redondeado a dos decimales
 * (ver la nota de redondeo en `cotizador.ts`), y el resto de los totales se
 * derivan de esa cuota ya redondeada — si acá se le recortaran los centavos
 * para mostrarla, "cuota × plazo" dejaría de dar el total que aparece debajo,
 * que es exactamente la cuenta que alguien hace con la calculadora y la que,
 * si no cierra, se convierte en un reclamo.
 */
export function formatMonto(p: Price): string {
  if (!Number.isFinite(p.a)) return PRICE_ON_REQUEST;
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: p.c }).format(p.a);
  } catch {
    // Moneda que Intl no conoce: se muestra el código tal cual, mismo
    // criterio que `formatPrice`.
    return `${p.c} ${new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(p.a)}`;
  }
}

const PCT = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
/** `0.025` → `"2,5"`. Los porcentajes de `CondicionesVenta` viajan como fracción de 1 (ver `cotizador.ts`). */
function formatPct(fraction: number): string {
  return PCT.format(fraction * 100);
}

// --------------------------------------------------------------------- HTML

export interface CotizadorPanelOptions {
  condiciones: CondicionesVenta;
  plan: PlanDePago;
  amortizacion: CuotaAmortizacion[];
  /** Código de moneda del precio de la unidad (`availability.json`, campo `c`). */
  moneda: string;
  /**
   * El CTA de WhatsApp ya armado (`contact.ts::buildCta`, con `kind:
   * 'cotizador'`). `null` cuando el proyecto no tiene `contact` cargado o el
   * teléfono no es válido — mismo criterio que el resto del visor: se dibuja
   * el resto del cotizador igual (los números ya son útiles sin botón), pero
   * nunca un botón que no lleva a ningún lado.
   */
  cta: Cta | null;
}

/**
 * El HTML del desplegable completo (fila cerrada + contenido), para insertar
 * ya armado en la ficha (`ui.ts::openUnit`). Arranca CERRADO: `hidden` en el
 * cuerpo y `aria-expanded="false"` en el botón — `ui.ts` es quien alterna los
 * dos al click (mismo patrón delegado que el resto de la ficha).
 *
 * DECISIÓN DE UX (por qué un desplegable adentro de la ficha y no un modal o
 * un panel aparte): en el teléfono la ficha YA es una hoja que sube desde
 * abajo (`Sheet`, ver `sheet.ts`). Un modal por encima de esa hoja sería una
 * capa sobre otra, y "volver atrás" se convierte en un laberinto —cerrar el
 * modal, después la hoja, después salir del recorrido—, exactamente lo que
 * `ui.ts` evita con su pila de capas (`pushLayer`/`requestClose`). Al
 * desplegarse en el mismo lugar, el precio de la unidad (`.r360-ficha__precio`,
 * arriba) queda a la vista mientras la persona mira la cuota: es la
 * comparación que vino a hacer, y las dos cifras entran en la misma pantalla.
 */
export function cotizadorPanelHtml(opts: CotizadorPanelOptions): string {
  const { condiciones, plan, amortizacion, moneda, cta } = opts;
  const monto = (a: number) => formatMonto({ a, c: moneda });

  const filas = amortizacion
    .map(
      (f) =>
        `<tr><td>${f.numero}</td><td>${monto(f.saldoInicial)}</td><td>${monto(f.interes)}</td>` +
        `<td>${monto(f.amortizacion)}</td><td>${monto(f.cuota)}</td><td>${monto(f.saldoFinal)}</td></tr>`,
    )
    .join('');

  const ctaHtml = cta
    ? `<a class="r360-cta r360-cotizador__whatsapp" href="${escapeHtml(cta.href)}" target="_blank" rel="noopener"
        data-cta-unit="${escapeHtml(cta.unitCode)}" data-cta-kind="${escapeHtml(cta.kind)}">
        ${escapeHtml(cta.label)}
      </a>`
    : '';

  return `<div class="r360-cotizador">
      <button type="button" class="r360-cotizador__toggle" aria-expanded="false" aria-controls="r360-cotizador-body">
        <span>Simular plan de pago</span>
        <i class="r360-cotizador__chevron" aria-hidden="true"></i>
      </button>
      <div class="r360-cotizador__body" id="r360-cotizador-body" hidden>
        <div class="r360-cotizador__anticipo">
          <span>Anticipo (${formatPct(condiciones.anticipoPct)}%)</span>
          <strong>${monto(plan.anticipo)}</strong>
        </div>
        <p class="r360-cotizador__cuota-label">${plan.plazoMeses} cuotas de</p>
        <p class="r360-cotizador__cuota">${monto(plan.cuotaMensual)}</p>
        <dl class="r360-facts r360-cotizador__detalle">
          <dt>Saldo financiado</dt><dd>${monto(plan.saldoFinanciar)}</dd>
          <dt>Intereses totales</dt><dd>${monto(plan.interesesTotales)}</dd>
          <dt>Total pagado por la unidad</dt><dd>${monto(plan.totalUnidad)}</dd>
        </dl>
        <div class="r360-cotizador__ocupacion">
          <p class="r360-cotizador__ocupacion-titulo">Gastos de ocupación (${formatPct(condiciones.gastosOcupacionPct)}%) &middot; ${monto(plan.gastosOcupacion.total)}</p>
          <p class="r360-cotizador__ocupacion-reparto">${formatPct(condiciones.gastosOcupacionReparto.posesionPct)}% a la posesión &middot; ${formatPct(condiciones.gastosOcupacionReparto.escrituraPct)}% a la escritura</p>
          <p class="r360-panel__note">Se abonan por separado y no integran el total a escriturar.</p>
        </div>
        <details class="r360-cotizador__amort">
          <summary>Ver cuota por cuota</summary>
          <div class="r360-cotizador__tabla-wrap">
            <table class="r360-cotizador__tabla">
              <thead><tr><th>Cuota</th><th>Saldo inicial</th><th>Interés</th><th>Amortización</th><th>Cuota</th><th>Saldo final</th></tr></thead>
              <tbody>${filas}</tbody>
            </table>
          </div>
        </details>
        ${ctaHtml}
      </div>
    </div>`;
}
