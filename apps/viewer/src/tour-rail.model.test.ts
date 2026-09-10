import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AvailabilityFile, PhotoTourItem, TourManifest } from '@r360/core';
import {
  AMBIENTE_MODELO,
  TRAMOS,
  buildRailContent,
  indiceDeAmbiente,
  captionSinChapa,
  chapaFor,
  chapasVisibles,
  esVistaDePunta,
  puntaAnclaje,
  formatCaptureDate,
  formatCaptureDateLong,
  initialRailState,
  isPublicable,
  isTramoId,
  parseTramoHash,
  railCtaLabel,
  railCtaMessage,
  railNextLabel,
  railReduce,
  resumenDeBloque,
  resumenLinea,
  serieIndex,
  shouldShowWelcome,
  tramoHash,
  welcomePhotos,
  tramoIndex,
  type RailAction,
  type RailState,
} from './tour-rail.model.ts';
import { legendStatuses } from './legend.ts';

// --------------------------------------------------------------- utilidades

/** Aplica una tanda de acciones y devuelve el estado final. */
function run(state: RailState, ...actions: RailAction[]): RailState {
  return actions.reduce((s, a) => railReduce(s, a).state, state);
}

const foto = (id: string, extra: Partial<PhotoTourItem> = {}): PhotoTourItem => ({
  id,
  url: `./m/${id}.webp`,
  thumbUrl: `./m/${id}.thumb.webp`,
  width: 2000,
  height: 1333,
  procedencia: { kind: 'foto', capturedAt: '2026-09-02' },
  ...extra,
});

const ia = (id: string): PhotoTourItem => ({
  id,
  url: `./ia/${id}.webp`,
  thumbUrl: `./ia/${id}.thumb.webp`,
  width: 1000,
  height: 1500,
  procedencia: { kind: 'ia', basedOn: '24_fachada_bloque2_atardecer_angulo' },
  restricted: true,
});

const TOUR: TourManifest = {
  schema: 1,
  project: 'Baleia',
  version: 1,
  tenant: 't',
  availabilityUrl: './availability.json',
  start: 'masterplan',
  scenes: [
    { id: 's1', slug: 'masterplan', kind: 'floorplan', name: 'Masterplan', source: { url: './mp.webp', width: 7945, height: 1960 }, procedencia: { kind: 'render' }, sort: 0 },
    { id: 's2', slug: 'acceso', kind: 'floorplan', name: 'Acceso al complejo', source: { url: './r/acceso.webp', width: 2000, height: 1333 }, procedencia: { kind: 'render' }, sort: 1 },
    { id: 's3', slug: 'amenities', kind: 'floorplan', name: 'Amenities', source: { url: './r/amenities.webp', width: 2000, height: 1333 }, procedencia: { kind: 'render' }, sort: 2 },
    { id: 's4', slug: 'complejo-laguna', kind: 'floorplan', name: 'Desde la laguna', source: { url: './r/laguna.webp', width: 2000, height: 1333 }, procedencia: { kind: 'render' }, sort: 3 },
    { id: 's5', slug: 'complejo-pergola', kind: 'floorplan', name: 'Pérgola', source: { url: './r/pergola.webp', width: 2000, height: 1333 }, procedencia: { kind: 'render' }, sort: 4 },
  ],
  hotspots: [],
  units: {
    B2: { label: 'Bloque 2', groupCode: null, attrs: { unitCodes: ['B2-A', 'B2-B'] } },
    'B2-A': { label: 'B2-A', groupCode: 'B2', areaTotalM2: 163.42, attrs: { tipologia: 'Dúplex' } },
    'B2-B': { label: 'B2-B', groupCode: 'B2', areaTotalM2: 160.5, attrs: { tipologia: 'Dúplex' } },
    'B3-A': { label: 'B3-A', groupCode: 'B3', areaTotalM2: 175.92, attrs: { tipologia: 'Dúplex' } },
  },
  photoTour: {
    items: [
      foto('01_aerea_contexto_costa_lejos', { caption: 'El terreno, entre el bosque y la Ruta 10.' }),
      foto('04_aerea_skyline_punta_del_este'),
      foto('02_aerea_bloque2_oblicua_cercana', { caption: 'Bloque 2. Tres niveles, nueve unidades. Foto real.' }),
      foto('07_fachada_bloque2_dia_completa'),
      foto('08_fachada_bloque2_angulo'),
      foto('09_fachada_bloque2_vertical'),
      foto('24_fachada_bloque2_atardecer_angulo'),
      foto('16_living_comedor_amplio', { ambiente: 'Living', caption: 'Living-comedor de un dúplex.' }),
      foto('17_cocina_equipada_completa', { ambiente: 'Cocina', caption: 'Cocina entregada así.' }),
      foto('11_vista_terraza_peninsula_skyline', { ambiente: 'La vista', caption: 'Desde esta terraza: Punta del Este sobre el mar. Sin retoque.' }),
      ia('DSC05104-paisajismo-baleia'),
    ],
    pairs: [
      {
        id: 'slider-paisajismo',
        label: 'Con el paisajismo terminado',
        before: foto('24_fachada_bloque2_atardecer_angulo'),
        after: ia('DSC05104-paisajismo-baleia'),
      },
    ],
  },
};

// ------------------------------------------------------------ los seis tramos

test('el riel tiene seis tramos, en el orden de la spec', () => {
  assert.deepEqual(
    TRAMOS.map((t) => t.id),
    ['llegada', 'bloque-2', 'amenities', 'video', 'unidades', 'consultar'],
  );
  assert.equal(tramoIndex('unidades'), 4);
});

test('cada tramo tiene su propio hash y se lo puede leer de vuelta', () => {
  for (const t of TRAMOS) {
    assert.equal(tramoHash(t.id), `#/scene/${t.id}`);
    assert.equal(parseTramoHash(tramoHash(t.id)), t.id);
  }
  // Un hash de escena real NO es un tramo: el riel no se roba la navegación
  // del recorrido de escenas.
  assert.equal(parseTramoHash('#/scene/masterplan'), null);
  assert.equal(parseTramoHash('#/scene/masterplan/unit/B2-A'), null);
  assert.equal(parseTramoHash(''), null);
  assert.equal(isTramoId('bloque-2'), true);
  assert.equal(isTramoId('bloque-9'), false);
});

// -------------------------------------------------------- máquina de estados

test('abrir el riel lo enciende en el tramo pedido', () => {
  const { state, effect } = railReduce(initialRailState, { type: 'abrir', tramo: 'amenities' });
  assert.equal(effect, 'abierto');
  assert.equal(state.open, true);
  assert.equal(state.tramo, 'amenities');
});

test('el cambio de tramo es explícito y se mueve de a uno', () => {
  let s = run(initialRailState, { type: 'abrir' });
  assert.equal(s.tramo, 'llegada');
  s = run(s, { type: 'siguiente' });
  assert.equal(s.tramo, 'bloque-2');
  s = run(s, { type: 'anterior' });
  assert.equal(s.tramo, 'llegada');
});

test('en las puntas del riel, siguiente/anterior no hacen nada', () => {
  const primero = run(initialRailState, { type: 'abrir', tramo: 'llegada' });
  const r1 = railReduce(primero, { type: 'anterior' });
  assert.equal(r1.effect, 'nada');
  assert.equal(r1.state.tramo, 'llegada');

  const ultimo = run(initialRailState, { type: 'abrir', tramo: 'consultar' });
  const r2 = railReduce(ultimo, { type: 'siguiente' });
  assert.equal(r2.effect, 'nada');
  assert.equal(r2.state.tramo, 'consultar');
});

test('horizontal = hermanos: mover una serie NUNCA cambia de tramo ni abre capas', () => {
  let s = run(initialRailState, { type: 'abrir', tramo: 'bloque-2' }, { type: 'abrir-capa', layer: 'foto' });
  const antes = s;
  s = run(s, { type: 'serie', id: 'paseo', index: 3, length: 11 });
  assert.equal(s.tramo, antes.tramo);
  assert.deepEqual(s.layers, antes.layers);
  assert.equal(serieIndex(s, 'paseo', 11), 3);

  // Pasarse de la punta no arrastra al tramo siguiente: se clampea.
  s = run(s, { type: 'serie', id: 'paseo', index: 99, length: 11 });
  assert.equal(serieIndex(s, 'paseo', 11), 10);
  assert.equal(s.tramo, 'bloque-2');
  s = run(s, { type: 'serie', id: 'paseo', index: -4, length: 11 });
  assert.equal(serieIndex(s, 'paseo', 11), 0);
  assert.equal(s.tramo, 'bloque-2');
});

test('Atrás sale de una capa por vez y nunca del recorrido de un salto', () => {
  let s = run(initialRailState, { type: 'abrir', tramo: 'bloque-2' }, { type: 'abrir-capa', layer: 'foto' });

  const r1 = railReduce(s, { type: 'atras' });
  assert.equal(r1.effect, 'capa-cerrada');
  assert.deepEqual(r1.state.layers, []);
  assert.equal(r1.state.open, true, 'cerrar la foto no cierra el riel');

  const r2 = railReduce(r1.state, { type: 'atras' });
  assert.equal(r2.effect, 'al-plano');
  assert.equal(r2.state.open, false);

  const r3 = railReduce(r2.state, { type: 'atras' });
  assert.equal(r3.effect, 'salir', 'recién con todo cerrado Atrás es del navegador');
  s = r3.state;
  assert.equal(s.tramo, 'bloque-2', 'salir no borra dónde estaba');
});

test('cambiar de tramo cierra las capas del anterior pero conserva la posición de las series', () => {
  const s = run(
    initialRailState,
    { type: 'abrir', tramo: 'bloque-2' },
    { type: 'serie', id: 'paseo', index: 6, length: 11 },
    { type: 'abrir-capa', layer: 'foto' },
    { type: 'siguiente' },
  );
  assert.equal(s.tramo, 'amenities');
  assert.deepEqual(s.layers, [], 'una foto grande no sobrevive al cambio de capítulo');
  assert.equal(serieIndex(s, 'paseo', 11), 6, 'volver al tramo te deja donde estabas');
});

test('cerrar el riel manda al plano y abrirlo de nuevo vuelve al mismo tramo', () => {
  const cerrado = railReduce(run(initialRailState, { type: 'abrir', tramo: 'video' }), { type: 'cerrar' });
  assert.equal(cerrado.effect, 'al-plano');
  assert.equal(cerrado.state.open, false);
  const reabierto = railReduce(cerrado.state, { type: 'abrir' });
  assert.equal(reabierto.state.tramo, 'video');
  assert.equal(reabierto.state.open, true);
});

// ------------------------------------------------------------------- chapas

test('las chapas de procedencia son tres y la fecha es la prueba de la foto', () => {
  const f = chapaFor({ kind: 'foto', capturedAt: '2026-09-02' });
  assert.equal(f?.kind, 'foto');
  assert.equal(f?.text, 'Foto real · 2 sep 2026');
  assert.match(f!.detail, /2 de septiembre de 2026/);

  const r = chapaFor({ kind: 'render' });
  assert.equal(r?.text, 'Render del proyecto');

  // Sin fecha sigue siendo foto, pero no se inventa un día.
  assert.equal(chapaFor({ kind: 'foto' })?.text, 'Foto real');
  assert.equal(chapaFor(undefined), null);
});

test('no existe chapa de IA: esa imagen sólo vive dentro del deslizador', () => {
  assert.equal(chapaFor({ kind: 'ia', basedOn: 'x' }), null);
});

test('las fechas se formatean sin pasar por Date (nada de correrse un día)', () => {
  assert.equal(formatCaptureDate('2026-09-02'), '2 sep 2026');
  assert.equal(formatCaptureDate('2026-01-31'), '31 ene 2026');
  assert.equal(formatCaptureDateLong('2026-12-01'), '1 de diciembre de 2026');
  assert.equal(formatCaptureDate('ayer'), null);
  assert.equal(formatCaptureDate('2026-13-01'), null);
});

// -------------------------------------------------------- contenido y honestidad

test('la imagen de IA no entra en ninguna lista del recorrido', () => {
  const c = buildRailContent(TOUR);
  const todas = [
    ...c.llegada.fotos,
    ...c.bloque.fachadas,
    ...c.bloque.paseo,
    ...(c.bloque.hero ? [c.bloque.hero] : []),
    ...(c.amenities.hoy ? [c.amenities.hoy] : []),
    ...(c.video.poster ? [c.video.poster] : []),
    // el "antes" de cada par sí es publicable: es la foto real
    ...c.bloque.pares.map((p) => p.before),
  ];
  for (const i of todas) {
    assert.equal(isPublicable(i), true, `${i.id} no debería estar fuera del deslizador`);
    assert.notEqual(i.procedencia.kind, 'ia');
  }
  // La de IA sí sigue viajando DENTRO del par, que es su único lugar.
  assert.equal(c.bloque.pares[0]?.after.procedencia.kind, 'ia');
});

test('el paseo por la unidad respeta el orden del manifiesto y termina en el skyline', () => {
  const { paseo } = buildRailContent(TOUR).bloque;
  assert.deepEqual(
    paseo.map((p) => p.ambiente),
    ['Living', 'Cocina', 'La vista'],
  );
  assert.equal(paseo.at(-1)?.id, '11_vista_terraza_peninsula_skyline');
  // Las captions son las del manifiesto, textuales.
  assert.equal(paseo.at(-1)?.caption, 'Desde esta terraza: Punta del Este sobre el mar. Sin retoque.');
});

test('cada tramo toma su material del manifiesto y nada más', () => {
  const c = buildRailContent(TOUR);
  assert.deepEqual(c.llegada.fotos.map((f) => f.id), [
    '01_aerea_contexto_costa_lejos',
    '04_aerea_skyline_punta_del_este',
  ]);
  assert.equal(c.llegada.render?.slug, 'acceso');
  assert.equal(c.llegada.render?.procedencia.kind, 'render');
  assert.equal(c.bloque.hero?.id, '02_aerea_bloque2_oblicua_cercana');
  assert.deepEqual(c.amenities.renders.map((r) => r.slug), ['amenities', 'complejo-laguna', 'complejo-pergola']);
  assert.equal(c.amenities.hoy?.id, '01_aerea_contexto_costa_lejos');
  // Ninguna vista del proyecto queda sin lugar al sacar la pestaña "Vistas",
  // y el masterplan (que es la escena de arranque) no se repite como render.
  assert.deepEqual(c.amenities.otros.map((r) => r.slug), []);
  assert.equal(c.bloque.bloque?.code, 'B2');
  assert.deepEqual(c.unidades.bloques.map((b) => b.code), ['B2', 'B3']);
  assert.deepEqual(c.unidades.bloques[0]?.codes, ['B2-A', 'B2-B']);
  // No hay escena de video en este manifiesto: el tramo lo tiene que saber en
  // vez de mostrar un reproductor vacío.
  assert.equal(c.video.scene, null);
});

test('un manifiesto sin photoTour no rompe el recorrido', () => {
  const pelado: TourManifest = { ...TOUR, photoTour: undefined };
  const c = buildRailContent(pelado);
  assert.deepEqual(c.llegada.fotos, []);
  assert.deepEqual(c.bloque.paseo, []);
  assert.equal(c.bloque.hero, null);
  assert.equal(c.llegada.render?.slug, 'acceso');
});

// ------------------------------------------------------------------- cierre

test('el cierre ofrece las dos variantes que sólo Baleia puede ofrecer', () => {
  const ctx = { project: 'Baleia', tramo: 'consultar' as const, bloqueLabel: 'Bloque 2', url: 'https://b.uy/#/scene/consultar' };
  const visita = railCtaMessage('visita', ctx);
  assert.match(visita, /ya está construido/);
  assert.match(visita, /coordinar una visita/);
  assert.match(visita, /https:\/\/b\.uy\/#\/scene\/consultar/);
  assert.equal(railCtaLabel('visita', ctx), 'Quiero visitar el Bloque 2');

  const plano = railCtaMessage('plano', ctx);
  assert.match(plano, /planos en PDF/);
  assert.equal(railCtaLabel('plano', ctx), 'Mandame el plano');
});

test('el mensaje del tramo lleva la pregunta que ese tramo dejó abierta', () => {
  const amen = railCtaMessage('tramo', { project: 'Baleia', tramo: 'amenities', url: 'u' });
  assert.match(amen, /¿Cuándo se entregan los amenities\?/);
  // Donde no hay una pregunta escrita en la spec, no se inventa ninguna.
  const bloque = railCtaMessage('tramo', { project: 'Baleia', tramo: 'bloque-2', url: 'u' });
  assert.match(bloque, /Me gustaría hacer una consulta\./);
  assert.doesNotMatch(bloque, /amenities/);
});

// ---------------------------------------------------------------- resúmenes

test('el resumen de un bloque no inventa precios que no están', () => {
  const avail: AvailabilityFile = {
    v: 1,
    generated_at: 'x',
    units: {
      'B2-A': { s: 'disponible', p: { a: 364861, c: 'USD' } },
      'B2-B': { s: 'disponible', p: { a: 358638, c: 'USD' } },
      'B2-C': { s: 'vendido', p: null },
    },
  };
  assert.deepEqual(resumenDeBloque(['B2-A', 'B2-B', 'B2-C'], avail), {
    total: 3,
    disponibles: 2,
    proximamente: 0,
    enVenta: 1,
    desde: { a: 358638, c: 'USD' },
  });
  assert.deepEqual(resumenDeBloque(['B2-A'], null), {
    total: 1,
    disponibles: 0,
    proximamente: 0,
    enVenta: 0,
    desde: null,
  });
});

test('un bloque que todavía no salió a la venta dice "próximamente", no "0 disponibles"', () => {
  const avail: AvailabilityFile = {
    v: 1,
    generated_at: 'x',
    units: {
      'B3-A': { s: 'proximamente', p: null },
      'B3-B': { s: 'proximamente', p: null },
    },
  };
  const b3 = resumenDeBloque(['B3-A', 'B3-B'], avail);
  assert.equal(b3.proximamente, 2);
  // "11 unidades · 0 disponibles" se leía como AGOTADO (auditoría §2.15).
  assert.equal(resumenLinea(b3, null), '2 unidades · próximamente');
  // Y sigue diciendo "próximamente" aunque a una le falte el estado (hoy le
  // pasa a B3-K): lo que descarta "próximamente" es una venta, no un hueco.
  assert.equal(resumenLinea(resumenDeBloque(['B3-A', 'B3-B', 'B3-K'], avail), null), '3 unidades · próximamente');

  const b2 = resumenDeBloque(['B2-A', 'B2-B'], {
    v: 1,
    generated_at: 'x',
    units: {
      'B2-A': { s: 'disponible', p: { a: 358638, c: 'USD' } },
      'B2-B': { s: 'vendido', p: null },
    },
  });
  assert.equal(resumenLinea(b2, 'US$ 358.638'), '2 unidades · 1 disponible · desde US$ 358.638');

  // Todo vendido tampoco es "próximamente": es que no queda nada.
  const agotado = resumenDeBloque(['X'], {
    v: 1,
    generated_at: 'x',
    units: { X: { s: 'vendido', p: null } },
  });
  assert.equal(resumenLinea(agotado, null), '1 unidad · sin unidades disponibles');
});

// ------------------------------------------------------------------ chapas

test('la chapa aparece una vez por tramo y cuando cambia la naturaleza del material', () => {
  // El Tramo 2 la dibujaba 17 veces, una por foto (auditoría §2.13).
  assert.deepEqual(chapasVisibles(['foto', 'foto', 'foto']), [true, false, false]);
  // Foto → render → foto: cada cambio de naturaleza la vuelve a mostrar.
  assert.deepEqual(chapasVisibles(['foto', 'render', 'render', 'foto']), [true, true, false, true]);
  // Una imagen sin chapa (la de IA, dentro de su deslizador) no corta la
  // secuencia ni se lleva una chapa propia.
  assert.deepEqual(chapasVisibles(['foto', null, 'foto']), [true, false, false]);
  assert.deepEqual(chapasVisibles([]), []);
});

test('la caption no repite lo que la chapa ya dice', () => {
  assert.equal(
    captionSinChapa('El terreno, entre el bosque y la Ruta 10. Foto real, 2 sep 2026.'),
    'El terreno, entre el bosque y la Ruta 10.',
  );
  assert.equal(captionSinChapa('Bloque 2. Tres niveles, nueve unidades. Foto real.'), 'Bloque 2. Tres niveles, nueve unidades.');
  // Sólo la frase FINAL: "Foto real" en el medio es parte de lo que se cuenta.
  assert.equal(captionSinChapa('Foto real del living, sin muebles.'), 'Foto real del living, sin muebles.');
  assert.equal(captionSinChapa(null), null);
  assert.equal(captionSinChapa('Foto real, 2 sep 2026.'), null);
});

// -------------------------------------------------------------- el pie y la Punta

test('el botón "Siguiente" se rotula corto y nombra el tramo en el aria-label', () => {
  assert.deepEqual(railNextLabel('llegada'), {
    label: 'Siguiente',
    aria: 'Siguiente: el Bloque 2, construido',
  });
  // En el último tramo no hay botón: el riel es finito y se ve.
  assert.equal(railNextLabel('consultar'), null);
});

test('sólo las dos fotos del skyline —y con resolución de sobra— se pueden acercar', () => {
  assert.equal(esVistaDePunta({ id: '04_aerea_skyline_punta_del_este', width: 2000 }), true);
  assert.equal(esVistaDePunta({ id: '11_vista_terraza_peninsula_skyline', width: 2000 }), true);
  assert.equal(esVistaDePunta({ id: '16_living_comedor_amplio', width: 2000 }), false);
  // Sin píxeles de sobra, acercar 2,5× es mostrar el pixel: no se ofrece.
  assert.equal(esVistaDePunta({ id: '04_aerea_skyline_punta_del_este', width: 900 }), false);

  // El horizonte NO está a la misma altura en las dos: la aérea mira la
  // península desde arriba y la de la terraza, desde el nivel del bloque.
  // Estaban las dos clavadas al 38 %, debajo del skyline (auditoría §2.10).
  const aerea = puntaAnclaje('04_aerea_skyline_punta_del_este')!;
  const terraza = puntaAnclaje('11_vista_terraza_peninsula_skyline')!;
  assert.ok(aerea.etiqueta >= 0.26 && aerea.etiqueta <= 0.28);
  assert.ok(aerea.etiqueta < aerea.horizonte, 'la píldora va ENCIMA del horizonte');
  assert.ok(terraza.etiqueta < terraza.horizonte);
  assert.ok(terraza.horizonte > aerea.horizonte);
  assert.equal(puntaAnclaje('16_living_comedor_amplio'), null);
});

// ------------------------------------------------------------------ leyenda

test('la leyenda muestra sólo los estados presentes, en orden de lectura', () => {
  const avail: AvailabilityFile = {
    v: 1,
    generated_at: 'x',
    units: {
      a: { s: 'proximamente', p: null },
      b: { s: 'disponible', p: null },
      c: { s: 'vendido', p: null },
      d: { s: 'disponible', p: null },
    },
  };
  assert.deepEqual(legendStatuses(avail), ['disponible', 'vendido', 'proximamente']);
});

test('sin disponibilidad la leyenda no dice nada (en vez de inventar cinco colores)', () => {
  assert.deepEqual(legendStatuses(null), []);
  assert.deepEqual(legendStatuses({ v: 1, generated_at: 'x', units: {} }), []);
});

test('un estado desconocido en availability no se cuela en la leyenda', () => {
  const raro = { v: 1, generated_at: 'x', units: { a: { s: 'en_promocion', p: null } } } as unknown as AvailabilityFile;
  assert.deepEqual(legendStatuses(raro), []);
});

// -------------------------------------------------------------- bienvenida

test('la bienvenida se saltea sólo cuando el link nombra un destino', () => {
  assert.equal(shouldShowWelcome({ hash: '' }), true);
  // La escena de arranque la escribe el propio visor en la URL: verla ahí no
  // significa que nadie la haya pedido.
  assert.equal(shouldShowWelcome({ hash: '#/scene/masterplan' }), true);
  // deep link a una unidad
  assert.equal(shouldShowWelcome({ hash: '#/scene/masterplan/unit/B2-A' }), false);
  // deep link a un tramo
  assert.equal(shouldShowWelcome({ hash: '#/scene/amenities' }), false);
  // deep link a una panorámica
  assert.equal(shouldShowWelcome({ hash: '#/scene/p-b2a-living' }), false);
  // Volver a entrar NO saltea la portada: es el inicio, no un cartel de una
  // sola vez.
  assert.equal(shouldShowWelcome({ hash: '' }), true);
});

test('la bienvenida son dos fotos reales, nunca un render ni el video de IA', () => {
  const { hero, segunda } = welcomePhotos(TOUR);
  assert.equal(hero?.id, '02_aerea_bloque2_oblicua_cercana');
  assert.equal(segunda?.id, '11_vista_terraza_peninsula_skyline');
  assert.equal(hero?.procedencia.kind, 'foto');
  assert.equal(segunda?.procedencia.kind, 'foto');
  // Sin material fotográfico no se rellena con otra cosa.
  assert.deepEqual(welcomePhotos({ ...TOUR, photoTour: undefined }), { hero: null, segunda: null });
});

// --------------------------------------------------- volver a la unidad modelo

test('la ficha entra al paseo por el living, que es donde arranca el recorrido de la casa', () => {
  const paseo = buildRailContent(TOUR).bloque.paseo;
  assert.equal(indiceDeAmbiente(paseo, AMBIENTE_MODELO), 0);
});

test('un ambiente que no está fotografiado no devuelve un índice cualquiera', () => {
  assert.equal(indiceDeAmbiente([{ ambiente: 'Living' }], 'Cochera'), null);
  assert.equal(indiceDeAmbiente([], 'Living'), null);
});
