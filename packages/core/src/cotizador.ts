/**
 * Motor de cálculo del cotizador: precio de una unidad → plan de pago
 * simulado (anticipo + cuotas + gastos de ocupación). Vive en `core` y no en
 * `apps/viewer` porque el panel también va a necesitarlo para armar
 * propuestas comerciales (no sólo la ficha pública de la unidad) — la misma
 * razón por la que `status.ts` y `geometry.ts` están acá y no en un app
 * puntual.
 *
 * Todo lo de este archivo es puro: recibe `precio` + `CondicionesVenta` y
 * devuelve datos, sin tocar red ni storage. Las condiciones NO están
 * hardcodeadas acá adentro — cambian con el tiempo (lista de precios nueva,
 * otra tasa, otro plazo) y no pueden forzar un deploy; quien llama las trae
 * de donde corresponda (hoy, `TourManifest.cotizador`, ver `types.ts`).
 *
 * ---------------------------------------------------------------------
 * DECISIÓN DE REDONDEO (léase antes de tocar cualquier cuenta de acá)
 * ---------------------------------------------------------------------
 * La cuota mensual se redondea a dos decimales porque es la plata que
 * efectivamente se cobra cada mes — nadie factura $11.236,445763...
 *
 * Todos los totales que involucran la cuota (`totalCuotas`,
 * `interesesTotales`, `totalUnidad`, `desembolsoTotal`) se derivan de esa
 * cuota YA REDONDEADA (`cuotaMensual × plazoMeses`), nunca de la cuota
 * exacta sin redondear. Si se derivaran de la exacta, el total que ve el
 * cliente dejaría de ser la suma de las doce cuotas que realmente va a
 * pagar — y esa diferencia de centavos es justo la que alguien reclama el
 * día que suma su propio resumen de pagos.
 *
 * En la tabla de amortización (`calcularTablaAmortizacion`) pasa lo mismo a
 * nivel de cada fila: la cuota fija se usa para las primeras `n - 1` cuotas,
 * pero ONCE redondeos sucesivos (interés y amortización, mes a mes) arrastran
 * una diferencia de unos pocos centavos. La ÚLTIMA cuota absorbe ese
 * arrastre: su amortización no sale de `cuota - interés` sino que es,
 * directamente, todo el saldo que queda — así el saldo final cierra en
 * exactamente 0, nunca en "$0,03" ni en "-$0,01". La cuota de ese último mes
 * puede diferir en centavos de `cuotaMensual`; es el precio de que la cuota
 * "de siempre" sea un número prolijo los otros once meses.
 *
 * El mismo criterio ("el total manda, la última pieza absorbe el resto")
 * se usa para el desglose de gastos de ocupación: `escritura` no sale de
 * `precio × escrituraPct` de forma independiente, sino de `total - posesión`
 * ya redondeada — así el desglose siempre suma exacto contra el total.
 */

/**
 * Condiciones comerciales de venta de un proyecto (o de una unidad, si algún
 * día hiciera falta bajar el nivel). Todos los porcentajes van expresados
 * como fracción de 1 (0.5 = 50%, 0.06 = 6%), igual que el resto de los
 * porcentajes del contrato del manifiesto.
 *
 * Deliberadamente NO hay campo de descuento por pago contado: la modalidad
 * vigente (lista de precios Caetano, septiembre 2026) es única — "no se
 * aplica descuento por pago contado" — y este tipo modela esa única
 * modalidad. Si algún día se ofrece una alternativa real, se agrega su
 * propio campo opcional; no se inventa uno hoy sin dato que lo respalde.
 */
export interface CondicionesVenta {
  /**
   * Porcentaje del precio que se abona como anticipo (0.5 = 50%). El resto
   * (`1 - anticipoPct`) es lo que se financia en cuotas.
   */
  anticipoPct: number;
  /**
   * Tasa de interés NOMINAL anual sobre saldo (0.06 = 6% anual). La cuota
   * mensual usa `i = tasaAnualPct / 12` — la tasa lineal mensual, NO la tasa
   * efectiva compuesta (`(1+tasaAnualPct)^(1/12) - 1`, que da un número
   * distinto). La lista de precios habla de "6% anual sobre saldo", que en
   * la plaza inmobiliaria es la lineal, y es la que reproduce los valores de
   * referencia verificados en `cotizador.test.ts`.
   */
  tasaAnualPct: number;
  /** Cantidad de cuotas mensuales del plan (12 en las condiciones vigentes). */
  plazoMeses: number;
  /**
   * Porcentaje del precio TOTAL de la unidad (cochera incluida) que se abona
   * en concepto de gastos de ocupación, a cargo del comprador. NO integra el
   * total a escriturar: es un desembolso aparte, por eso el plan lo devuelve
   * en su propio campo (`gastosOcupacion`) y no mezclado en `totalUnidad`.
   */
  gastosOcupacionPct: number;
  /**
   * Cómo se reparte `gastosOcupacionPct` entre los dos momentos en que se
   * paga. Ambos porcentajes van expresados sobre el precio de la unidad,
   * igual que los publica la lista de precios ("2.5% a la posesión y 1.5% a
   * la escritura"), no como fracción del propio `gastosOcupacionPct`.
   */
  gastosOcupacionReparto: {
    /** Se abona a la posesión de la unidad. */
    posesionPct: number;
    /** Se abona, por separado, a la escritura. */
    escrituraPct: number;
  };
}

/** Desglose de los gastos de ocupación de `PlanDePago`. `posesion + escritura` suma siempre, centavo a centavo, `total` — ver la nota de redondeo arriba. */
export interface DesgloseGastosOcupacion {
  total: number;
  posesion: number;
  escritura: number;
}

/** Plan de pago completo devuelto por `calcularPlanDePago`. */
export interface PlanDePago {
  /** Precio de entrada, ya normalizado (ver `calcularPlanDePago`: nulo/negativo se trata como 0). */
  precio: number;
  anticipo: number;
  /** Lo que queda a financiar en cuotas: `precio - anticipo`. */
  saldoFinanciar: number;
  /** Cuota fija del sistema francés, redondeada a dos decimales (ver nota de redondeo). */
  cuotaMensual: number;
  plazoMeses: number;
  /** `cuotaMensual × plazoMeses` — la suma de las cuotas que el cliente efectivamente paga, no la exacta sin redondear. */
  totalCuotas: number;
  /** `totalCuotas - saldoFinanciar`: lo que cuesta financiar, ya con la cuota redondeada. */
  interesesTotales: number;
  /** Lo que cuesta la unidad en total (anticipo + cuotas), SIN gastos de ocupación: `anticipo + totalCuotas`. */
  totalUnidad: number;
  /** Ver `DesgloseGastosOcupacion`. No integra `totalUnidad` ni `desembolsoTotal` menos lo que ya suma ahí — ver `desembolsoTotal`. */
  gastosOcupacion: DesgloseGastosOcupacion;
  /** Todo lo que el comprador desembolsa en la operación: `totalUnidad + gastosOcupacion.total`. Es el único total que junta ambos conceptos — `totalUnidad` a propósito no los mezcla, porque los gastos de ocupación no integran el total a escriturar. */
  desembolsoTotal: number;
}

/** Una fila de la tabla de amortización devuelta por `calcularTablaAmortizacion`. */
export interface CuotaAmortizacion {
  /** 1-based: la primera cuota es la 1, no la 0. */
  numero: number;
  saldoInicial: number;
  /** Parte de la cuota que reduce capital. */
  amortizacion: number;
  /** Parte de la cuota que es interés sobre `saldoInicial`. */
  interes: number;
  /** La cuota de ESTE mes. Coincide con `PlanDePago.cuotaMensual` salvo en la última fila (ver nota de redondeo: la última absorbe el arrastre). */
  cuota: number;
  /** Saldo después de pagar esta cuota. En la última fila es, siempre, exactamente 0. */
  saldoFinal: number;
}

/** Redondeo a dos decimales, con el `Number.EPSILON` de rigor para que casos límite (`x,xx5`) no queden a merced de cómo cae ese número en binario. Es EL único punto de redondeo de todo el archivo — todo lo demás lo llama a él. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Precio de entrada normalizado: nulo, indefinido, negativo o no numérico se
 * tratan como 0 en vez de propagar `NaN`/explotar. Hace falta porque el
 * precio de una unidad puede no estar cargado todavía (mismo caso que
 * `AvailabilityFile`, donde el precio viaja `null` cuando no es público) y
 * el cotizador tiene que poder dibujarse igual, con un plan en cero, en vez
 * de romper la ficha entera.
 */
function normalizarPrecio(precio: number | null | undefined): number {
  return typeof precio === 'number' && Number.isFinite(precio) && precio > 0 ? precio : 0;
}

/**
 * Cuota mensual del sistema francés: `cuota = saldo × i / (1 − (1+i)^−n)`,
 * con `i` = tasa anual / 12 (ver `CondicionesVenta.tasaAnualPct`).
 *
 * Dos guardas defensivas para que una `CondicionesVenta` rara no explote:
 *  - `saldo <= 0` (precio nulo/cero, o anticipo del 100%) → cuota 0, no
 *    `0/0`.
 *  - `i === 0` (tasa 0%, hoy no pasa con las condiciones reales pero la
 *    fórmula del sistema francés sí divide por cero en ese caso) → cuota
 *    lineal `saldo / n`, que es el límite matemático de la fórmula cuando la
 *    tasa tiende a 0.
 */
function calcularCuotaMensual(saldo: number, condiciones: CondicionesVenta): number {
  const { tasaAnualPct, plazoMeses: n } = condiciones;
  if (saldo <= 0 || n <= 0) return 0;
  const i = tasaAnualPct / 12;
  if (i === 0) return round2(saldo / n);
  const cuotaExacta = (saldo * i) / (1 - Math.pow(1 + i, -n));
  return round2(cuotaExacta);
}

/** Desglose de gastos de ocupación — ver la nota de redondeo del encabezado ("escritura absorbe el resto"). */
function calcularGastosOcupacion(precio: number, condiciones: CondicionesVenta): DesgloseGastosOcupacion {
  const total = round2(precio * condiciones.gastosOcupacionPct);
  const posesion = round2(precio * condiciones.gastosOcupacionReparto.posesionPct);
  // `escritura` NO sale de `precio × escrituraPct` de forma independiente:
  // redondear cada parte por separado puede dejar `posesion + escritura`
  // un centavo arriba o abajo de `total` (pasa, de hecho, con las
  // condiciones reales de Baleia: 2.5%/1.5% de 261.111 caen justo en un
  // medio centavo cada una). `escritura` absorbe esa diferencia para que el
  // desglose sume siempre exacto.
  const escritura = round2(total - posesion);
  return { total, posesion, escritura };
}

/**
 * Función pura: precio + condiciones → plan de pago completo. Ver la nota de
 * redondeo del encabezado del archivo para las decisiones de `cuotaMensual`,
 * `totalCuotas` y el desglose de gastos de ocupación.
 */
export function calcularPlanDePago(precio: number | null | undefined, condiciones: CondicionesVenta): PlanDePago {
  const p = normalizarPrecio(precio);
  const anticipo = round2(p * condiciones.anticipoPct);
  // Saldo = precio - anticipo (resta), no `precio × (1 - anticipoPct)`: así
  // `anticipo + saldoFinanciar` da SIEMPRE `p`, centavo a centavo, sin
  // depender de que las dos cuentas redondeen para el mismo lado.
  const saldoFinanciar = round2(p - anticipo);
  const cuotaMensual = calcularCuotaMensual(saldoFinanciar, condiciones);
  const totalCuotas = round2(cuotaMensual * condiciones.plazoMeses);
  const interesesTotales = round2(totalCuotas - saldoFinanciar);
  const totalUnidad = round2(anticipo + totalCuotas);
  const gastosOcupacion = calcularGastosOcupacion(p, condiciones);
  const desembolsoTotal = round2(totalUnidad + gastosOcupacion.total);

  return {
    precio: p,
    anticipo,
    saldoFinanciar,
    cuotaMensual,
    plazoMeses: condiciones.plazoMeses,
    totalCuotas,
    interesesTotales,
    totalUnidad,
    gastosOcupacion,
    desembolsoTotal,
  };
}

/**
 * Función pura: precio + condiciones → tabla de amortización cuota por
 * cuota. Recibe los mismos dos argumentos que `calcularPlanDePago` (no el
 * saldo ya calculado) para que quien arma la interfaz no tenga que repetir
 * la cuenta de anticipo/saldo ni pueda pasarle, por error, un saldo que no
 * corresponde a ese precio y esas condiciones.
 *
 * La ÚLTIMA fila absorbe el redondeo acumulado de las anteriores: ver la
 * nota de redondeo del encabezado del archivo. Por construcción, la suma de
 * `amortizacion` de todas las filas da exactamente `saldoFinanciar` y la
 * última fila siempre tiene `saldoFinal === 0`.
 */
export function calcularTablaAmortizacion(
  precio: number | null | undefined,
  condiciones: CondicionesVenta,
): CuotaAmortizacion[] {
  const p = normalizarPrecio(precio);
  const anticipo = round2(p * condiciones.anticipoPct);
  const saldo = round2(p - anticipo);
  const cuotaFija = calcularCuotaMensual(saldo, condiciones);
  const i = condiciones.tasaAnualPct / 12;
  const n = condiciones.plazoMeses;

  const filas: CuotaAmortizacion[] = [];
  let saldoInicial = saldo;
  for (let numero = 1; numero <= n; numero++) {
    const interes = round2(saldoInicial * i);
    const esUltima = numero === n;

    let amortizacion: number;
    let cuota: number;
    let saldoFinal: number;
    if (esUltima) {
      // La amortización de la última cuota es TODO lo que queda de saldo —
      // no `cuotaFija - interes` — así el saldo final cierra en exactamente
      // 0 en vez de arrastrar los centavos de once redondeos previos. La
      // cuota de este mes se recalcula a partir de esa amortización, y por
      // eso puede diferir en centavos de `cuotaFija`.
      amortizacion = saldoInicial;
      saldoFinal = 0;
      cuota = round2(amortizacion + interes);
    } else {
      amortizacion = round2(cuotaFija - interes);
      saldoFinal = round2(saldoInicial - amortizacion);
      cuota = cuotaFija;
    }

    filas.push({ numero, saldoInicial, amortizacion, interes, cuota, saldoFinal });
    saldoInicial = saldoFinal;
  }
  return filas;
}
