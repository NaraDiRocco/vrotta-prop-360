/**
 * El riel de seis tramos: TODA la lógica, sin una sola línea de DOM.
 *
 * Es la especificación de `docs/06-BENCHMARK/5-EXPERIENCIA-BALEIA.md` §1
 * traducida a datos y a una máquina de estados. Vive separado de
 * `tour-rail.ts` (la capa de DOM) por el mismo motivo que
 * `plan-orientation.ts` vive separado de `floorplan.ts`: lo que decide "en
 * qué tramo estoy", "qué capas tengo abiertas", "qué hace Atrás" y "qué foto
 * va en qué tramo" se prueba con `node --test`, sin navegador. Si el estado
 * del recorrido viviera desparramado en clases y atributos del DOM, la única
 * forma de verificarlo sería mirarlo.
 *
 * Tres cosas que este módulo garantiza y que los tests cuidan:
 *
 *  1. **La regla de gestos** (spec §1): horizontal mueve entre HERMANOS
 *     (fotos de una serie) y NUNCA entre tramos; el cambio de tramo es
 *     siempre una acción explícita (`ir` / `siguiente` / `anterior`).
 *  2. **Atrás sale de una capa por vez** y nunca del recorrido de un salto
 *     (spec §1 y plan anterior §2): capa → riel cerrado (plano) → recién ahí
 *     el navegador.
 *  3. **La imagen de IA no existe fuera del deslizador** (spec §3.1/§5.1):
 *     ningún ítem con `restricted` (ni con `procedencia.kind === 'ia'`) entra
 *     en las listas que arma `buildRailContent`, y `chapaFor` devuelve `null`
 *     para `ia` — no hay chapa de IA fuera del slider, que pone la suya.
 */
import type {
  AvailabilityFile,
  BeforeAfterPair,
  PhotoTourItem,
  Procedencia,
  Scene,
  TourManifest,
} from '@r360/core';

// ---------------------------------------------------------------- los tramos

export type TramoId = 'llegada' | 'bloque-2' | 'amenities' | 'video' | 'unidades' | 'consultar';

export interface TramoDef {
  id: TramoId;
  /** Nombre corto para los puntos del riel. */
  short: string;
  /** Título que se lee arriba del tramo. */
  title: string;
  /** Cómo se nombra este tramo en el botón del tramo anterior ("Siguiente: …"). */
  asNext: string;
}

/**
 * El orden es el del cliente con un cambio que la spec justifica: "detalles"
 * (5) antes que "consultar" (6), porque la consulta buena necesita la unidad
 * ya elegida. Consultar no se pierde: hay CTA en todos los tramos.
 */
export const TRAMOS: readonly TramoDef[] = [
  { id: 'llegada',   short: 'Llegada',   title: 'La llegada',                 asNext: 'la llegada' },
  { id: 'bloque-2',  short: 'El bloque', title: 'El bloque, afuera y adentro', asNext: 'el Bloque 2, construido' },
  { id: 'amenities', short: 'Amenities', title: 'Los amenities',              asNext: 'los amenities' },
  { id: 'video',     short: 'Video',     title: 'El video',                   asNext: 'el video' },
  { id: 'unidades',  short: 'Detalles',  title: 'Elegí tu unidad',            asNext: 'elegí tu unidad' },
  { id: 'consultar', short: 'Consultar', title: 'Consultar',                  asNext: 'consultar' },
];

export const TRAMO_SLUGS: readonly string[] = TRAMOS.map((t) => t.id);

export function isTramoId(v: unknown): v is TramoId {
  return typeof v === 'string' && TRAMOS.some((t) => t.id === v);
}

export function tramoDef(id: TramoId): TramoDef {
  return TRAMOS.find((t) => t.id === id)!;
}

export function tramoIndex(id: TramoId): number {
  return TRAMOS.findIndex((t) => t.id === id);
}

/**
 * Hash de un tramo. Comparte el espacio `#/scene/…` con las escenas del
 * recorrido a propósito (así lo publica la spec, Anexo): el `SceneController`
 * recibe estos slugs como "virtuales" y no intenta abrir una escena que no
 * existe.
 */
export function tramoHash(id: TramoId): string {
  return `#/scene/${id}`;
}

export function parseTramoHash(hash: string): TramoId | null {
  const m = /^#\/scene\/([^/?#]+)/.exec(hash);
  const slug = m ? decodeURIComponent(m[1]!) : null;
  return isTramoId(slug) ? slug : null;
}

// ------------------------------------------------------- máquina de estados

/**
 * Capas que se abren DENTRO de un tramo. Hoy hay una sola (la foto a
 * pantalla completa); el tipo existe igual para que "Atrás cierra la última
 * capa" sea una regla del modelo y no un `if` suelto en el DOM.
 */
export type RailLayer = 'foto';

export interface RailState {
  /** `true` mientras el riel es lo que se ve; `false` = el visitante está en el plano/ficha. */
  readonly open: boolean;
  readonly tramo: TramoId;
  /** Capas abiertas, en orden de apertura. La última es la que cierra Atrás. */
  readonly layers: readonly RailLayer[];
  /** Índice activo de cada serie horizontal (id de serie → índice). */
  readonly series: Readonly<Record<string, number>>;
}

export const initialRailState: RailState = { open: false, tramo: 'llegada', layers: [], series: {} };

export type RailAction =
  /** Mostrar el riel (opcionalmente en un tramo dado). */
  | { type: 'abrir'; tramo?: TramoId }
  /** Esconder el riel para ir al plano (pestaña Plano, ficha, etc.). */
  | { type: 'cerrar' }
  /** Cambio de tramo EXPLÍCITO: botón "Siguiente", punto del riel, hash. */
  | { type: 'ir'; tramo: TramoId }
  | { type: 'siguiente' }
  | { type: 'anterior' }
  | { type: 'abrir-capa'; layer: RailLayer }
  | { type: 'atras' }
  /** La serie se movió (scroll horizontal nativo, flechas, tira de ambientes). */
  | { type: 'serie'; id: string; index: number; length: number };

/**
 * Qué tiene que hacer quien despacha, además de repintar. El modelo no toca
 * `history` ni el DOM: dice qué pasó y el llamador traduce.
 */
export type RailEffect =
  | 'nada'
  /** Cambió el tramo: hay que reescribir el hash y subir el scroll. */
  | 'tramo'
  /** Se cerró una capa interna (la foto grande). */
  | 'capa-cerrada'
  /** El riel se cerró: hay que mostrar el plano. */
  | 'al-plano'
  /** No quedaba nada que cerrar: Atrás es del navegador. */
  | 'salir'
  /** El riel se abrió. */
  | 'abierto'
  /** Se movió una serie horizontal (contador, tira de ambientes, caption). */
  | 'serie';

export interface RailResult {
  state: RailState;
  effect: RailEffect;
}

const same = (state: RailState): RailResult => ({ state, effect: 'nada' });

/**
 * Reductor puro del recorrido.
 *
 * Reglas duras, todas verificadas en `tour-rail.model.test.ts`:
 *  - `serie` NUNCA cambia de tramo ni abre/cierra capas: el swipe horizontal
 *    mueve entre hermanos y nada más (spec §1).
 *  - salir de un tramo cierra sus capas (una foto grande no sobrevive al
 *    cambio de capítulo) pero CONSERVA la posición de las series: volver a un
 *    tramo te deja donde estabas.
 *  - `atras` deshace exactamente una cosa por vez.
 */
export function railReduce(state: RailState, action: RailAction): RailResult {
  switch (action.type) {
    case 'abrir': {
      const tramo = action.tramo ?? state.tramo;
      if (state.open && tramo === state.tramo) return same(state);
      return {
        state: { ...state, open: true, tramo, layers: [] },
        effect: state.open ? 'tramo' : 'abierto',
      };
    }
    case 'cerrar': {
      if (!state.open) return same(state);
      return { state: { ...state, open: false, layers: [] }, effect: 'al-plano' };
    }
    case 'ir': {
      if (state.open && action.tramo === state.tramo) return same(state);
      return { state: { ...state, open: true, tramo: action.tramo, layers: [] }, effect: 'tramo' };
    }
    case 'siguiente':
    case 'anterior': {
      const delta = action.type === 'siguiente' ? 1 : -1;
      const next = TRAMOS[tramoIndex(state.tramo) + delta];
      if (!next) return same(state); // en las puntas no pasa nada: el riel es finito y se ve
      return { state: { ...state, open: true, tramo: next.id, layers: [] }, effect: 'tramo' };
    }
    case 'abrir-capa': {
      return { state: { ...state, layers: [...state.layers, action.layer] }, effect: 'nada' };
    }
    case 'atras': {
      if (state.layers.length) {
        return { state: { ...state, layers: state.layers.slice(0, -1) }, effect: 'capa-cerrada' };
      }
      if (state.open) return { state: { ...state, open: false }, effect: 'al-plano' };
      return { state, effect: 'salir' };
    }
    case 'serie': {
      const max = Math.max(0, action.length - 1);
      const index = Math.min(max, Math.max(0, action.index));
      if (state.series[action.id] === index) return same(state);
      return { state: { ...state, series: { ...state.series, [action.id]: index } }, effect: 'serie' };
    }
  }
}

/** Índice activo de una serie (0 si nunca se movió). */
export function serieIndex(state: RailState, id: string, length: number): number {
  const raw = state.series[id] ?? 0;
  return Math.min(Math.max(0, raw), Math.max(0, length - 1));
}

// ------------------------------------------------- el pie fusionado del riel

/**
 * El pie del riel y la barra de pestañas son UNA franja de ~60 px (auditoría
 * §4, Idea 1): en 375×812 el chrome baja de 231 a 112 px y la foto pasa de 250
 * a ~700. En esa franja no entra "Siguiente: el Bloque 2, construido →" al lado
 * de seis puntos, así que el botón se rotula corto y el nombre del tramo que
 * viene queda en el `aria-label`: quien ve la pantalla ya tiene el punto
 * resaltado; quien la escucha necesita el nombre.
 */
export interface RailNextLabel {
  /** Lo que se lee en el botón. */
  label: string;
  /** Lo que anuncia el lector de pantalla. */
  aria: string;
}

export function railNextLabel(tramo: TramoId): RailNextLabel | null {
  const next = TRAMOS[tramoIndex(tramo) + 1];
  if (!next) return null;
  return { label: 'Siguiente', aria: `Siguiente: ${next.asNext}` };
}

// ------------------------------------------------------ chapas de procedencia

/**
 * Las tres chapas de la spec §5.1 — tres y sólo tres. Van escritas como
 * caption, no como descargo legal.
 *
 * `ia` devuelve `null` a propósito: la única imagen de IA del recorrido vive
 * dentro del deslizador, que pone su propio rótulo fijo ("Recreación IA sobre
 * la foto") y no acepta que se lo cambien. Si alguna vez esta función
 * devolviera una chapa de IA, sería la señal de que una imagen inventada se
 * está dibujando fuera de su slider.
 */
export interface Chapa {
  kind: 'foto' | 'render';
  text: string;
  /** Lo que se lee al tocar la chapa. */
  detail: string;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** `2026-09-02` → `2 sep 2026`. Sin `Date`: no hay zona horaria que pueda correr un día. */
export function formatCaptureDate(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const mes = MESES[Number(m[2]) - 1];
  if (!mes) return null;
  return `${Number(m[3])} ${mes} ${Number(m[1])}`;
}

/** `2026-09-02` → `2 de septiembre de 2026`, para el texto largo de la chapa. */
const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export function formatCaptureDateLong(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const mes = MESES_LARGOS[Number(m[2]) - 1];
  if (!mes) return null;
  return `${Number(m[3])} de ${mes} de ${Number(m[1])}`;
}

export function chapaFor(p: Procedencia | undefined | null): Chapa | null {
  if (!p) return null;
  if (p.kind === 'foto') {
    const corta = p.capturedAt ? formatCaptureDate(p.capturedAt) : null;
    const larga = p.capturedAt ? formatCaptureDateLong(p.capturedAt) : null;
    return {
      kind: 'foto',
      // La fecha no es decoración: es la prueba de que es una foto y no un
      // render (spec §5.1, "fecha = prueba").
      text: corta ? `Foto real · ${corta}` : 'Foto real',
      detail: larga
        ? `Fotografía y drone del ${larga} en el predio. Sin retoque de arquitectura.`
        : 'Fotografía tomada en el predio. Sin retoque de arquitectura.',
    };
  }
  if (p.kind === 'render') {
    return {
      kind: 'render',
      text: 'Render del proyecto',
      detail: 'Imagen del proyecto arquitectónico. Lo construido puede diferir en detalles.',
    };
  }
  return null; // `ia`: no hay chapa fuera del deslizador.
}

export type ChapaKind = Chapa['kind'];

/**
 * La caption no repite lo que la chapa ya dice. Varias vienen del manifiesto
 * cerradas con "Foto real, 2 sep 2026." y quedaban justo encima de la chapa
 * "Foto real · 2 sep 2026" (auditoría §2.13). Se recorta esa frase final y
 * nada más: el resto de la caption es del cliente y no se toca.
 */
export function captionSinChapa(caption: string | null | undefined): string | null {
  if (!caption) return null;
  const texto = caption.trim();
  // Una caption que ES la chapa y nada más no deja nada que decir.
  if (/^Foto real(\s*[·,]\s*[^.]*)?\.?$/i.test(texto)) return null;
  // El signo de puntuación anterior es lo que distingue una frase FINAL
  // agregada ("… Ruta 10. Foto real, 2 sep 2026.") de una caption que empieza
  // hablando de la foto ("Foto real del living, sin muebles.").
  const limpia = texto.replace(/([.!?])\s*Foto real[^.]*\.\s*$/i, '$1').trim();
  return limpia || null;
}

/**
 * ¿Se dibuja la chapa en esta pieza? La fecha como prueba funciona **una vez
 * por tramo**; diecisiete veces seguidas es ruido (auditoría §2.13). La regla
 * es: la primera pieza del tramo la lleva, y después sólo cuando cambia la
 * NATURALEZA del material (foto → render → foto). `prev` es la naturaleza de
 * la última pieza que sí llevó chapa; `null` al empezar cada tramo.
 */
export function chapaVisible(prev: ChapaKind | null, kind: ChapaKind | null): boolean {
  return !!kind && kind !== prev;
}

/** La misma regla sobre una secuencia entera — es la que se prueba. */
export function chapasVisibles(kinds: readonly (ChapaKind | null)[]): boolean[] {
  let prev: ChapaKind | null = null;
  return kinds.map((kind) => {
    const show = chapaVisible(prev, kind);
    if (show) prev = kind;
    return show;
  });
}

// ------------------------------------------------------ contenido por tramo

/** Una escena del manifiesto usada como imagen del recorrido (los renders). */
export interface RailRender {
  slug: string;
  name: string;
  url: string;
  procedencia: Procedencia;
}

export interface RailBloque {
  code: string;
  label: string;
  codes: string[];
}

export interface RailContent {
  llegada: { fotos: PhotoTourItem[]; render: RailRender | null };
  bloque: {
    hero: PhotoTourItem | null;
    pares: BeforeAfterPair[];
    fachadas: PhotoTourItem[];
    paseo: PhotoTourItem[];
    /** Bloque construido al que apunta "Ver las N unidades", si el manifiesto lo tiene. */
    bloque: RailBloque | null;
  };
  amenities: {
    renders: RailRender[];
    /**
     * El resto de las vistas del proyecto. Están acá y no en una galería
     * aparte: sueltas competían con las fotos reales sin decir cuál era cuál;
     * en el tramo donde el material cambia de naturaleza, enmarcadas y
     * etiquetadas, se leen por lo que son.
     */
    otros: RailRender[];
    hoy: PhotoTourItem | null;
  };
  video: { scene: Scene | null; poster: PhotoTourItem | null };
  unidades: { bloques: RailBloque[] };
}

/** Ids de la spec §1. Si alguno falta en el manifiesto, el tramo se dibuja con lo que haya. */
const ID_CONTEXTO = '01_aerea_contexto_costa_lejos';
const ID_SKYLINE_AEREO = '04_aerea_skyline_punta_del_este';
const ID_HERO = '02_aerea_bloque2_oblicua_cercana';
const ID_SKYLINE_TERRAZA = '11_vista_terraza_peninsula_skyline';
const IDS_FACHADA = [
  '07_fachada_bloque2_dia_completa',
  '08_fachada_bloque2_angulo',
  '09_fachada_bloque2_vertical',
  // La luz del atardecer va al final porque es la que mejor luce (spec §1).
  '24_fachada_bloque2_atardecer_angulo',
];
const SLUG_ACCESO = 'acceso';
const SLUGS_AMENITIES = ['amenities', 'complejo-laguna', 'complejo-pergola'];

/**
 * Una imagen es publicable fuera de su slider sólo si no está restringida y
 * no es una recreación de IA. Las dos condiciones se chequean juntas: el
 * manifiesto marca `restricted` y además dice `kind: 'ia'`; alcanza con que
 * falle una para dejarla afuera.
 */
export function isPublicable(item: PhotoTourItem): boolean {
  return item.restricted !== true && item.procedencia?.kind !== 'ia';
}

/** "Bloque 2" y "07_fachada_bloque2_dia" comparten `bloque2` una vez normalizados. */
function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function pick(items: readonly PhotoTourItem[], id: string): PhotoTourItem | null {
  const found = items.find((i) => i.id === id) ?? null;
  return found && isPublicable(found) ? found : null;
}

function renderFor(tour: TourManifest, slug: string): RailRender | null {
  const scene = tour.scenes.find((s) => s.slug === slug);
  if (!scene || !('url' in scene.source)) return null;
  return {
    slug: scene.slug,
    name: scene.name,
    url: scene.source.url,
    // Sin `procedencia` explícita un render sigue siendo un render: el
    // masterplan y las vistas del proyecto son lo único que emite el builder
    // con `source.url` de este tipo. Nunca se etiqueta como foto por defecto.
    procedencia: scene.procedencia ?? { kind: 'render' },
  };
}

/**
 * Envuelve `Scene.poster` (sólo `url`/`width`/`height`) como `PhotoTourItem`
 * para que el Tramo 4 lo use con el mismo tipo que el resto del riel — el
 * `id` es fijo porque no hay ninguna lista donde pueda chocar con una foto
 * real, y la `procedencia` es la de la propia escena de video.
 */
function videoPoster(scene: Scene | null): PhotoTourItem | null {
  if (!scene?.poster) return null;
  return {
    id: 'video-poster',
    url: scene.poster.url,
    thumbUrl: scene.poster.url,
    width: scene.poster.width,
    height: scene.poster.height,
    procedencia: scene.procedencia ?? { kind: 'foto' },
  };
}

/** Bloques (grupos) con sus unidades hoja, como los agrupa la pestaña Unidades. */
export function bloquesDe(tour: TourManifest): RailBloque[] {
  const groups = new Map<string, RailBloque>();
  for (const [code, u] of Object.entries(tour.units)) {
    if (!u.groupCode) continue; // es un bloque, no una unidad vendible
    const g = groups.get(u.groupCode) ?? {
      code: u.groupCode,
      label: tour.units[u.groupCode]?.label ?? u.groupCode,
      codes: [],
    };
    g.codes.push(code);
    groups.set(u.groupCode, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, codes: [...g.codes].sort() }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Qué material usa cada tramo. Todo sale del manifiesto: si una foto no está,
 * el tramo se dibuja sin ella. Nada se inventa y nada se fabrica acá.
 */
export function buildRailContent(tour: TourManifest): RailContent {
  const items = (tour.photoTour?.items ?? []).filter(isPublicable);
  const pares = (tour.photoTour?.pairs ?? []).filter((p) => isPublicable(p.before));
  const bloques = bloquesDe(tour);
  const hero = pick(items, ID_HERO);

  // El paseo por la unidad (spec §1, Tramo 2, Mitad B) es la secuencia con
  // orden de casa que ya viene ordenada en el manifiesto: se respeta ese
  // orden y las captions tal como están escritas. Se reconoce por tener
  // `ambiente` — es el campo que el builder emite sólo para el paseo.
  const paseo = items.filter((i) => !!i.ambiente);

  // Qué bloque es el que está fotografiado. NO se adivina: se lee del nombre
  // de los propios archivos de foto, que nombran el bloque
  // (`07_fachada_bloque2_dia_completa`), contra el rótulo del bloque en el
  // manifiesto ("Bloque 2"), los dos normalizados a `bloque2`. Si ningún
  // rótulo coincide, no se apunta a ningún bloque y el tramo no ofrece el
  // botón: preferimos no ofrecerlo antes que mandar al visitante al bloque
  // equivocado.
  const bloqueDelPaseo =
    bloques.find((b) => {
      const clave = normalizeKey(b.label) || normalizeKey(b.code);
      return clave.length >= 2 && IDS_FACHADA.some((id) => normalizeKey(id).includes(clave));
    }) ?? null;

  const videoScene = tour.scenes.find((s) => s.kind === 'video' && 'url' in s.source) ?? null;

  return {
    llegada: {
      fotos: [pick(items, ID_CONTEXTO), pick(items, ID_SKYLINE_AEREO)].filter(
        (i): i is PhotoTourItem => !!i,
      ),
      render: renderFor(tour, SLUG_ACCESO),
    },
    bloque: {
      hero,
      pares,
      fachadas: IDS_FACHADA.map((id) => pick(items, id)).filter((i): i is PhotoTourItem => !!i),
      paseo,
      bloque: bloqueDelPaseo,
    },
    amenities: {
      renders: SLUGS_AMENITIES.map((s) => renderFor(tour, s)).filter((r): r is RailRender => !!r),
      otros: tour.scenes
        .filter(
          (s) =>
            s.slug !== tour.start &&
            s.slug !== SLUG_ACCESO &&
            !SLUGS_AMENITIES.includes(s.slug) &&
            // La escena de video (decisión 15, build_tour.py) también tiene
            // `'url' in s.source`, pero no es un render: es un .mp4. Sin este
            // filtro, "Otras vistas del proyecto" le pondría un <img> a un
            // archivo de video.
            s.kind !== 'video' &&
            'url' in s.source,
        )
        .sort((a, b) => a.sort - b.sort)
        .map((s) => renderFor(tour, s.slug))
        .filter((r): r is RailRender => !!r),
      hoy: pick(items, ID_CONTEXTO),
    },
    // El póster propio de la escena de video (cuadro aéreo de apertura, ver
    // `Scene.poster` en packages/core) es más fiel que el hero genérico del
    // Tramo 2: se usa cuando el manifiesto lo trae, envuelto como
    // `PhotoTourItem` (mismo `id` fijo, misma `procedencia` que la escena)
    // para no tocar el tipo de `RailContent`. Se cae al hero cuando la
    // escena todavía no está publicada o no trae `poster`.
    video: { scene: videoScene, poster: videoPoster(videoScene) ?? hero },
    unidades: { bloques },
  };
}

// ------------------------------------------------- volver a la unidad modelo

/**
 * El ambiente por el que se entra a la unidad modelo desde la ficha
 * ("Ver la unidad modelo fotografiada →", auditoría §4, Idea 3). Es el living:
 * es la primera foto del paseo y la que da la escala de la casa.
 */
export const AMBIENTE_MODELO = 'Living';

/**
 * Índice de la primera foto de un ambiente dentro del paseo, o `null` si ese
 * ambiente no está en el material. `null` es la respuesta correcta y no un
 * borde raro: la ficha no ofrece el enlace si no hay a dónde llevar.
 */
export function indiceDeAmbiente(
  items: readonly Pick<PhotoTourItem, 'ambiente'>[],
  ambiente: string,
): number | null {
  const i = items.findIndex((it) => it.ambiente === ambiente);
  return i >= 0 ? i : null;
}

/** El tramo donde vive el paseo por la unidad modelo. */
export const TRAMO_UNIDAD_MODELO: TramoId = 'bloque-2';

// --------------------------------------------------------------- el cierre

/**
 * Las variantes de mensaje del cierre (spec §6). Dos de ellas —"Quiero
 * visitarla" y "Mandame el plano"— son las que ningún proyecto en pozo puede
 * ofrecer: la unidad está construida y los planos existen.
 *
 * El mensaje por unidad ya lo arma `contact.ts` y no se duplica acá: esto es
 * el cierre a nivel TRAMO, cuando todavía no hay una unidad elegida.
 */
export type RailCtaKind = 'tramo' | 'visita' | 'plano';

export interface RailCtaContext {
  project: string;
  tramo: TramoId;
  /** Rótulo del bloque construido ("Bloque 2"), si el manifiesto lo tiene. */
  bloqueLabel?: string | null;
  /** Deep link a lo que el visitante está mirando. */
  url: string;
}

/**
 * La pregunta que quedó abierta en cada tramo. Sólo la de amenities está
 * escrita en la spec (§6) porque es la que el tramo deja abierta a propósito:
 * la fecha de entrega de los amenities no está en ningún documento del
 * proyecto. Para el resto no se inventa una pregunta con datos que no
 * tenemos.
 */
const PREGUNTA: Partial<Record<TramoId, string>> = {
  amenities: '¿Cuándo se entregan los amenities?',
};

export function railCtaLabel(kind: RailCtaKind, ctx: Pick<RailCtaContext, 'bloqueLabel' | 'project'>): string {
  if (kind === 'visita') return ctx.bloqueLabel ? `Quiero visitar el ${ctx.bloqueLabel}` : 'Quiero visitarla';
  if (kind === 'plano') return 'Mandame el plano';
  return `Consultar por ${ctx.project}`;
}

export function railCtaMessage(kind: RailCtaKind, ctx: RailCtaContext): string {
  const def = tramoDef(ctx.tramo);
  const bloque = ctx.bloqueLabel ?? null;
  const lines: string[] = [];

  if (kind === 'visita') {
    lines.push(
      bloque
        ? `Hola! Estoy viendo el recorrido de ${ctx.project} y vi que el ${bloque} ya está construido. ¿Puedo coordinar una visita?`
        : `Hola! Estoy viendo el recorrido de ${ctx.project}. ¿Puedo coordinar una visita?`,
    );
  } else if (kind === 'plano') {
    lines.push(
      bloque
        ? `Hola! Estoy viendo el recorrido de ${ctx.project}. ¿Me pasás los planos en PDF de las unidades del ${bloque}?`
        : `Hola! Estoy viendo el recorrido de ${ctx.project}. ¿Me pasás los planos en PDF?`,
    );
  } else {
    lines.push(`Hola! Estoy viendo el recorrido de ${ctx.project} (${def.title.toLowerCase()}).`);
    lines.push(PREGUNTA[ctx.tramo] ?? 'Me gustaría hacer una consulta.');
  }

  lines.push(`Lo estoy viendo acá: ${ctx.url}`);
  return lines.join('\n');
}

// ------------------------------------------------------------- disponibilidad

/**
 * Resumen honesto de un bloque para el Tramo 5: cuántas unidades hay, cuántas
 * disponibles y desde cuánto. Sin availability no se inventa ningún número:
 * se devuelven los conteos que sí se saben (cuántas unidades) y nada más.
 */
export interface BloqueResumen {
  total: number;
  disponibles: number;
  /** Cuántas están marcadas "próximamente": un bloque entero así NO está agotado. */
  proximamente: number;
  /** Cuántas ya pasaron por el mercado: vendidas, reservadas o bloqueadas. */
  enVenta: number;
  desde: { a: number; c: string } | null;
}

export function resumenDeBloque(codes: readonly string[], availability: AvailabilityFile | null): BloqueResumen {
  let disponibles = 0;
  let proximamente = 0;
  let enVenta = 0;
  let desde: { a: number; c: string } | null = null;
  for (const code of codes) {
    const entry = availability?.units[code];
    if (!entry) continue;
    if (entry.s === 'proximamente') proximamente += 1;
    if (entry.s === 'vendido' || entry.s === 'reservado' || entry.s === 'bloqueado') enVenta += 1;
    if (entry.s !== 'disponible') continue;
    disponibles += 1;
    if (entry.p && (!desde || entry.p.a < desde.a)) desde = entry.p;
  }
  return { total: codes.length, disponibles, proximamente, enVenta, desde };
}

/**
 * La línea que se lee bajo el nombre del bloque. "Bloque 3 · 11 unidades · 0
 * disponibles" se leía como AGOTADO cuando lo que pasa es que todavía no salió
 * a la venta (auditoría §2.15): un bloque cuyas unidades están todas en
 * "próximamente" lo dice con esa palabra, no con un cero.
 */
export function resumenLinea(r: BloqueResumen, desdeTexto: string | null): string {
  const partes = [`${r.total} ${r.total === 1 ? 'unidad' : 'unidades'}`];
  if (r.disponibles > 0) {
    partes.push(`${r.disponibles} ${r.disponibles === 1 ? 'disponible' : 'disponibles'}`);
    if (desdeTexto) partes.push(`desde ${desdeTexto}`);
  } else if (r.proximamente > 0 && r.enVenta === 0) {
    // Nadie compró nada porque todavía no se vende: no hace falta que TODAS
    // tengan el dato (hoy a B3-K le falta el estado en `availability.json`) —
    // alcanza con que ninguna esté vendida, reservada ni bloqueada.
    partes.push('próximamente');
  } else {
    partes.push('sin unidades disponibles');
  }
  return partes.join(' · ');
}

// ------------------------------------------------------------ la Punta, cerca

/**
 * Las dos fotos donde el skyline de Punta del Este está a la vista (auditoría
 * §4, Idea 2): la aérea del Tramo 1 y la de la terraza que cierra el paseo.
 * Son las únicas del lote donde acercar la cámara tiene sentido, y sólo si el
 * archivo tiene resolución de sobra: a 2000 px de ancho, 2,5× sigue nítido.
 */
const PUNTA_IDS: readonly string[] = [ID_SKYLINE_AEREO, ID_SKYLINE_TERRAZA];

/** Ancho mínimo del original para poder acercar sin que se vea el pixel. */
const PUNTA_ANCHO_MIN = 1600;

export function esVistaDePunta(item: Pick<PhotoTourItem, 'id' | 'width'>): boolean {
  return PUNTA_IDS.includes(item.id) && item.width >= PUNTA_ANCHO_MIN;
}

/**
 * Dónde está el horizonte en cada una de esas dos fotos, como fracción del
 * alto de la imagen. Son medidas, no gustos: la etiqueta se ancla justo
 * encima del skyline y el acercamiento se centra en él. Estaban las dos
 * clavadas al 38 % —debajo del horizonte, sobre los árboles (auditoría
 * §2.10)— y el horizonte no está en el mismo lugar en las dos: la aérea mira
 * la península desde arriba y la de la terraza, desde el nivel del bloque.
 *
 * Las dos entran a pantalla completa recortadas SÓLO en horizontal (son
 * apaisadas en una pantalla vertical), así que la fracción de la imagen y la
 * fracción de la caja coinciden.
 */
export interface PuntaAnclaje {
  /** Alto al que se pone la píldora, para que señale la ciudad. */
  etiqueta: number;
  /** Centro del acercamiento. */
  horizonte: number;
}

const PUNTA_ANCLAJES: Readonly<Record<string, PuntaAnclaje>> = {
  [ID_SKYLINE_AEREO]: { etiqueta: 0.27, horizonte: 0.32 },
  [ID_SKYLINE_TERRAZA]: { etiqueta: 0.4, horizonte: 0.45 },
};

export function puntaAnclaje(id: string): PuntaAnclaje | null {
  return PUNTA_ANCLAJES[id] ?? null;
}

// ------------------------------------------------------------- la bienvenida

/**
 * ¿Se muestra la bienvenida (spec §2)? Tres casos la saltean, y son los tres
 * que el plan anterior ya había previsto:
 *
 *  - **Deep link a una unidad** (`#/scene/…/unit/201`): el destino ya está
 *    decidido; explicarle el proyecto a alguien que viene por una unidad
 *    concreta es ruido sobre la ficha que se está abriendo.
 *  - **Deep link a un tramo** (`#/scene/amenities`): idem, va directo al tramo.
 *  - **Ya la vio** (marca local): la bienvenida es una presentación, y una
 *    presentación se hace una vez.
 *
 * Es una decisión de producto con tres condiciones: se prueba, no se mira.
 */
/**
 * Las dos fotos de la bienvenida (spec §2): la aérea del bloque construido y,
 * a los 5 segundos, la vista del skyline desde la terraza. **Las dos son
 * fotografía real**: el video generado con IA no abre el recorrido, porque la
 * geometría del conjunto que inventa no es la del masterplan y abrir con una
 * invención contradice en el segundo uno el argumento de todo el recorrido.
 *
 * Devuelve `null` en `hero` si el manifiesto no trae esa foto: sin foto real
 * no se sustituye por un render — se cae al arranque de marca de siempre.
 */
export function welcomePhotos(tour: TourManifest): { hero: PhotoTourItem | null; segunda: PhotoTourItem | null } {
  const items = (tour.photoTour?.items ?? []).filter(isPublicable);
  return {
    hero: pick(items, ID_HERO),
    segunda: pick(items, ID_SKYLINE_TERRAZA),
  };
}

/**
 * Lo que se lee cuando la bienvenida pasa a la segunda foto. La caption del
 * manifiesto ("Desde esta terraza: Punta del Este sobre el mar. Sin retoque.")
 * ocupa tres líneas de 26 px y, puesta como titular, empujaba los botones y
 * dejaba "Sin retoque." como portada (auditoría §2.11). El titular NO cambia:
 * esta línea entra debajo, corta, y la foto entra ya acercada al skyline.
 */
export const WELCOME_SEGUNDA_CAPTION = 'Desde la terraza de una unidad: Punta del Este.';

/** Lugar, para el que llega desde un anuncio y no sabe dónde está parado. */
export const WELCOME_LUGAR = 'Punta Ballena · Uruguay';

/** Clave de la marca local "ya vi la bienvenida". Una sola, compartida. */
export const WELCOME_SEEN_KEY = 'r360:bienvenida-vista';

export function shouldShowWelcome(opts: { hash: string; seen: boolean }): boolean {
  if (opts.seen) return false;
  if (/^#\/scene\/[^/]+\/unit\//.test(opts.hash)) return false;
  if (parseTramoHash(opts.hash)) return false;
  return true;
}
