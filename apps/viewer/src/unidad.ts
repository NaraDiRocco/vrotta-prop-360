/**
 * Cómo se NOMBRA y cómo se PRESENTA una unidad. Lógica pura, sin DOM.
 *
 * El recorrido arrastra dos nomenclaturas que no son la misma y las dos son
 * reales: el brochure del proyecto numera las unidades por letra (`B2-A`, la
 * "UNIDAD A" de sus planos) y la lista de precios de septiembre 2026 —la que
 * tiene en la mano el vendedor y la que el comprador repite por teléfono— las
 * numera `201`..`209`. La tabla de equivalencia **no existe en ningún
 * documento del cliente**: se reconstruyó por aritmética de superficie y sólo
 * cerró exacto para tres unidades (A→201, F→206, G→207; ver
 * `tools/baleia/README.md` §3.1). Para el resto el mapeo es posicional y está
 * sin confirmar con Caetano.
 *
 * De ahí la regla dura de este módulo, que es la misma que la del resto del
 * visor aplicada a un dato distinto: **el número comercial se muestra sólo si
 * llegó**. Si `tour.json` no trae `attrs.numeroComercial` para una unidad, la
 * ficha dice la letra y nada más. Nunca se deduce un número a partir del
 * código, ni acá ni en el builder: un "203" inventado en la pantalla se
 * convierte en un "203" dicho por teléfono, y ahí ya no hay forma de saber de
 * dónde salió.
 *
 * Se prueba con `node --test` (`unidad.test.ts`): es lo que decide qué número
 * de unidad se le manda al vendedor por WhatsApp.
 */

/** Números con coma decimal, que es como se escriben en español. */
const NUM = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

/** `163.42` → `"163,42 m²"`. El mensaje de WhatsApp decía "163.42 m²" (auditoría §2.15). */
export function formatM2(v: number): string {
  return `${NUM.format(v)} m²`;
}

/**
 * `"B2-A"` → `"A"`. Sólo el sufijo de letra del código del brochure; cualquier
 * otro formato de código (un `M4/L 12` de otro proyecto) devuelve `null` y el
 * llamador se queda con el código tal cual.
 */
export function letraDeUnidad(code: string): string | null {
  const m = /^[A-Za-z]\d+-([A-Za-z]{1,2})$/.exec(code.trim());
  return m ? m[1]!.toUpperCase() : null;
}

/**
 * El número comercial que trae el manifiesto, si trae alguno. Se lee de
 * `attrs.numeroComercial` (campo aditivo, lo emite `build_tour.py` sólo para
 * las unidades cuyo mapeo está verificado por superficie).
 */
export function numeroComercial(attrs: Record<string, unknown> | undefined | null): string | null {
  const raw = attrs?.numeroComercial;
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  return v || null;
}

/**
 * El título de la ficha (auditoría §4, Idea 3).
 *
 *  - Con número confirmado: `"201 · Unidad A"` — el número primero, que es lo
 *    que el vendedor y el comprador usan para hablar.
 *  - Sin número: `"Unidad A"`. La letra sola, nunca un número asumido.
 *  - Sin letra reconocible: el rótulo del manifiesto tal cual.
 */
export function tituloDeUnidad(opts: {
  code: string;
  label?: string | null;
  numero?: string | null;
}): string {
  const letra = letraDeUnidad(opts.code);
  const base = letra ? `Unidad ${letra}` : (opts.label ?? opts.code);
  return opts.numero ? `${opts.numero} · ${base}` : base;
}

/**
 * Cómo se nombra la unidad DENTRO de una frase ("me interesa …"). Con número
 * confirmado el vendedor la reconoce al instante: "la 201". Sin número, se
 * dice la unidad por su código, que es lo único que se sabe con certeza.
 */
export function frasePorUnidad(opts: { code: string; label?: string | null; numero?: string | null }): string {
  if (opts.numero) return `la ${opts.numero}`;
  return `la unidad ${opts.label ?? opts.code}`;
}

/**
 * Una etapa futura: un bloque del que no hay NINGÚN dato. En Baleia son el
 * Bloque 4 y el Bloque 5 — el cartel del brochure sólo nombra "próximamente"
 * al 1 y al 3, así que del 4 y del 5 no se sabe ni eso, y quedan afuera de
 * `availability.json` a propósito (`tools/baleia/README.md` §3.1).
 *
 * En pantalla salían con el chip "No disponible", que es una afirmación:
 * dice que la unidad existe y no se puede comprar. No lo sabemos. El plan de
 * experiencia (§5.3) pide que no lleven chip comercial y que al tocarlos la
 * ficha diga lo único que se puede decir. El polígono sigue dibujándose:
 * la regla dura ("ningún hotspot desaparece") no se toca.
 */
export const ETAPA_FUTURA_NOTA = 'Etapa futura. Sin información comercial todavía.';

export function esEtapaFutura(opts: {
  /** `attrs.unitCodes` del bloque: `null` si la entrada no es un bloque. */
  codes: readonly string[] | null;
  /** ¿`availability.json` trae una entrada para este código? */
  tieneEstado: boolean;
}): boolean {
  return !!opts.codes && opts.codes.length === 0 && !opts.tieneEstado;
}

/**
 * "Quiero visitarla": el argumento que ningún proyecto en pozo puede dar
 * (plan §6). Sólo tiene sentido ofrecerlo donde efectivamente hay algo
 * construido para visitar, y eso no se adivina: es el bloque que el propio
 * recorrido identificó como fotografiado (`RailContent.bloque.bloque`, que
 * sale de los nombres de archivo de las fotos reales).
 *
 * Una unidad vendida queda afuera: invitar a visitar lo que ya no está a la
 * venta es hacerle perder el viaje a los dos.
 */
export function puedeVisitarse(opts: {
  groupCode: string | null | undefined;
  bloqueConstruido: string | null | undefined;
  status: string | null;
}): boolean {
  if (!opts.groupCode || !opts.bloqueConstruido) return false;
  if (opts.groupCode !== opts.bloqueConstruido) return false;
  return opts.status !== 'vendido';
}

/**
 * Cuántas unidades están EN VENTA, contra cuántas hay en el manifiesto.
 *
 * La pestaña Unidades decía "20 unidades · 5 disponibles" contando las 11 del
 * Bloque 3, que no está a la venta (auditoría §2.15): al lado de "5
 * disponibles", ese 20 se lee como stock. En venta es lo que ya salió al
 * mercado: ni "próximamente" ni las unidades sin ningún estado.
 */
export function resumenEnVenta(
  codes: readonly string[],
  estadoDe: (code: string) => string | null,
): { enVenta: number; disponibles: number } {
  let enVenta = 0;
  let disponibles = 0;
  for (const code of codes) {
    const s = estadoDe(code);
    if (!s || s === 'proximamente') continue;
    enVenta += 1;
    if (s === 'disponible') disponibles += 1;
  }
  return { enVenta, disponibles };
}

/** La línea de la pestaña Unidades: "9 unidades en venta · 5 disponibles". */
export function lineaEnVenta(r: { enVenta: number; disponibles: number }): string {
  const unidades = `${r.enVenta} ${r.enVenta === 1 ? 'unidad' : 'unidades'} en venta`;
  const disp = `${r.disponibles} ${r.disponibles === 1 ? 'disponible' : 'disponibles'}`;
  return `${unidades} · ${disp}`;
}
