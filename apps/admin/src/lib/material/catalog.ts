/**
 * Catálogo de material requerido.
 *
 * Es la versión tipada de `docs/01-CLIENTE/1-Brief-Maestro-de-Material.md`
 * (qué es / para qué / formato / obligatoriedad / plan B), enriquecida con
 * `docs/04-PRODUCCION/1-Quien-Hace-Que-y-Cuanto-Cuesta.md` (quién lo produce,
 * con qué software, dónde se lo contrata y a qué precio).
 *
 * Reglas que se respetaron al armarlo, y que hay que respetar al editarlo:
 *
 *  1. NO se inventa nada. Los campos de producción (`quienLoHace`,
 *     `comoSeHace`, `dondeContratarlo`, `precioReferencia`) sólo se completan
 *     cuando el dato está en alguno de esos dos documentos. Un plano o un
 *     listado de unidades los produce el cliente y los documentos no dicen
 *     con qué herramienta ni a qué precio: esos campos quedan vacíos.
 *  2. `requisito` es el nivel del brief para el caso general. Cuando la
 *     obligatoriedad depende de la etapa del proyecto (en pozo vs. obra
 *     construida) —algo que el catálogo no puede saber— el ítem queda como
 *     `recomendado` y la condición se explicita en `obligatorioSi`, en vez de
 *     inflar el contador de obligatorios faltantes de un proyecto terminado.
 *  3. `aplicaA` saca de la vista lo que a ese tipo de proyecto no le sirve:
 *     un corte topográfico importa en un complejo con desnivel y no en un
 *     edificio entre medianeras.
 *
 * Los precios vienen de una guía interna con rangos marcados como estimados y
 * cifras de 2024-2025 en pesos: son referencia para no salir a ciegas, NUNCA
 * un presupuesto. Por eso además nunca se muestran en el link público (ver
 * `share.ts`): el cliente no tiene por qué ver nuestros costos.
 */
import type { ProjectKind } from '@r360/core';

export type MaterialRequirement = 'obligatorio' | 'recomendado' | 'opcional';

export interface MaterialItem {
  /** Slug estable: es la clave que se guarda en la base. Nunca renombrar. */
  id: string;
  categoria: string;
  nombre: string;
  queEs: string;
  /** Por qué lo necesitamos: el cliente coopera más si entiende para qué es. */
  paraQue: string;
  /** Especificación técnica exacta. */
  formato: string;
  requisito: MaterialRequirement;
  /**
   * Condición que vuelve obligatorio un ítem `recomendado`, cuando depende de
   * algo que el catálogo no puede deducir del tipo de proyecto (etapa de obra,
   * sobre todo). Texto libre, para mostrar junto al nivel.
   */
  obligatorioSi?: string;
  /** Plan B, con su costo en días y en dinero. */
  siNoLoTienen: string;
  /** Perfil profesional que lo produce. */
  quienLoHace?: string;
  /** Herramientas y proceso, en criollo. */
  comoSeHace?: string;
  dondeContratarlo?: string;
  precioReferencia?: string;
  aplicaA: ProjectKind[];
  /** Hay ítems que son datos (coordenadas, contactos), no archivos. */
  aceptaArchivos: boolean;
  /** Extensiones sugeridas, en minúscula y con punto. */
  extensiones?: string[];
}

const TODOS: ProjectKind[] = ['loteo', 'edificio', 'complejo', 'mixto'];

/* Datos de producción compartidos: los mismos proveedores cubren varios ítems.
   Se declaran una sola vez para que actualizar un precio no deje la mitad del
   catálogo con el valor viejo. */

const RENDERISTA = {
  quienLoHace:
    'Renderista o estudio de visualización arquitectónica (archviz). No es una profesión matriculada: el perfil típico es un diseñador con formación en 3D, muchas veces adentro del propio estudio de arquitectura.',
  comoSeHace:
    'Modelan el proyecto en 3D y lo renderizan. El combo más común en LATAM y España es 3ds Max con V-Ray o Corona; en estudios chicos, SketchUp con V-Ray o Enscape; Blender con Cycles es gratis y da calidad equivalente; Twinmotion y Lumion son motores real-time pensados para sacar panorámicas rápido.',
  dondeContratarlo:
    'Lo más rápido es preguntarle al estudio de arquitectura del proyecto quién les hace los renders. Si no: Workana (fuerte en Argentina/LATAM), Upwork, CGarchitect/CGConnect y Ronen Bekerman como comunidades del rubro, o portfolios de "archviz" en Behance y ArtStation.',
  precioReferencia:
    'Render fijo de calidad media-alta: USD 800-2.000 en estudios de nivel medio, USD 2.500-6.000 en premium (rangos regionales/internacionales, estimados). En España, 290-420 € por imagen con 1-2 rondas de corrección. Freelance internacional: USD 75-900 por imagen según complejidad. Verificar siempre con 2-3 proveedores antes de cotizar.',
} as const;

const DRONE = {
  quienLoHace: 'Piloto de drone certificado, freelance o dentro de un estudio de foto/video.',
  comoSeHace:
    'Vuelan el predio con un DJI Air 3S (gama media, el más usado en inmobiliario) o un Mavic 3 Pro (gama alta). Pedir las fotos en RAW además del JPG, el video en 4K y las coordenadas GPS de cada punto de toma (van en el EXIF).',
  dondeContratarlo:
    'droneros.com.ar (marketplace argentino), Alugo, Lisual, dazzdrones (opera en Argentina y Uruguay); en Uruguay, Otero.uy y la Asociación Uruguaya de Drones. En Argentina la categoría abierta (250 g a 25 kg) no exige licencia pero sí registro del equipo y del operador ante ANAC; en Uruguay los drones "menores" (hasta 25 kg) no requieren registro.',
  precioReferencia:
    'Argentina: día de filmación (4 baterías, ~2 h de vuelo) con traslados, del orden de $180.000 ARS; trabajos puntuales para desarrollos, $45.000-$85.000 ARS. Cifras de 2025, reajustar por inflación. En Uruguay cotizan a medida.',
} as const;

const FOTOGRAFO_360 = {
  quienLoHace:
    'Fotógrafo inmobiliario especializado en 360°, a veces certificado como Matterport Service Partner. Es un perfil de fotografía profesional, no de arquitectura.',
  comoSeHace:
    'Con Matterport Pro3 (escanea y además genera planta y medidas) o con cámara 360° directa —Insta360 Pro2/Titan en gama alta, Insta360 X4 o Ricoh Theta con trípode nodal en gama de entrada—. Si usan Matterport hay que pedir explícitamente la exportación de cada vista como imagen equirectangular: el link del tour solo no sirve para integrarlo a un recorrido propio. Definir de antemano qué puntos fotografiar; volver por una toma olvidada se cobra aparte.',
  dondeContratarlo:
    'Directorio oficial de Matterport Service Partners, filtrando por ciudad. En Buenos Aires: Real Estate 360, Delta Force Vision, Estudio3R, Spot360, en360, STUDIO360. En Uruguay: FOTOPROP.UY y Fotografía 360 Uruguay (cotizan a medida).',
  precioReferencia:
    'Buenos Aires: sesión de fotografía inmobiliaria HDR + 360° desde $35.000 ARS según metraje y si incluye drone (dato de un solo proveedor, 2025). El hardware, como referencia de por qué se terceriza: Matterport Pro3 USD 5.995 más suscripción desde USD 10/mes.',
} as const;

export const MATERIAL_CATALOG: readonly MaterialItem[] = [
  /* ── 1. Material gráfico (planos) ──────────────────────────────────── */
  {
    id: 'plano-masterplan',
    categoria: 'Material gráfico (planos)',
    nombre: 'Masterplan / plano general',
    queEs:
      'El plano de conjunto del proyecto completo, con la ubicación de todas las unidades, calles, accesos, amenities y espacios comunes.',
    paraQue:
      'Es la base sobre la que armamos el mapa de navegación: el "mapa madre" desde donde el usuario elige qué unidad ver.',
    formato:
      'Vectorial (DWG, DXF, AI o PDF vectorial) con capas separadas por tipo de elemento (unidades, vías, verde, amenities) y escala indicada.',
    requisito: 'obligatorio',
    siNoLoTienen:
      'Lo armamos nosotros a partir de una imagen satelital o de un plano en baja calidad, pero pierde precisión geométrica y suma entre 3 y 7 días hábiles más un costo de relevamiento/redibujo.',
    aplicaA: TODOS,
    aceptaArchivos: true,
    extensiones: ['.dwg', '.dxf', '.ai', '.pdf'],
  },
  {
    id: 'plantas-tipologia',
    categoria: 'Material gráfico (planos)',
    nombre: 'Plantas por unidad / tipología',
    queEs: 'El plano de cada tipología de unidad (o de cada unidad, si son todas distintas), con cotas y superficies.',
    paraQue:
      'Se muestran en la ficha de cada unidad dentro del recorrido y sirven de referencia para armar las cámaras de los renders interiores.',
    formato:
      'PDF vectorial o imagen de alta resolución (mínimo 2000 px en el lado mayor), un archivo por tipología, nombrado con el mismo código que va a tener en el listado de unidades.',
    requisito: 'obligatorio',
    siNoLoTienen:
      'Si el estudio de arquitectura tiene el archivo fuente (Illustrator, InDesign, AutoCAD) lo pedimos directamente, que ahorra tiempo. Si no existe ninguna planta digital hay que generarla desde el modelo 3D o desde el legajo de obra: entre 2 y 5 días hábiles según la cantidad de tipologías.',
    aplicaA: TODOS,
    aceptaArchivos: true,
    extensiones: ['.pdf', '.dwg', '.ai', '.indd', '.png', '.jpg'],
  },
  {
    id: 'cortes-vistas-tecnicas',
    categoria: 'Material gráfico (planos)',
    nombre: 'Cortes y vistas técnicas',
    queEs: 'Cortes longitudinales y transversales del edificio o del terreno.',
    paraQue:
      'En conjuntos con desnivel, para entender la topografía y ubicar bien las cámaras de las panorámicas. También se puede mostrar como material de referencia dentro del recorrido.',
    formato: 'PDF o imagen, mismo criterio que las plantas.',
    requisito: 'recomendado',
    siNoLoTienen:
      'Trabajamos con la planta y con fotos o tomas de drone del terreno para inferir la topografía. En terrenos con pendiente marcada eso puede generar imprecisiones en la ubicación de las cámaras.',
    // El brief lo declara opcional en loteos y edificios sin desnivel, y
    // recomendado en complejos: en los dos primeros no se le pide al cliente.
    aplicaA: ['complejo', 'mixto'],
    aceptaArchivos: true,
    extensiones: ['.pdf', '.dwg', '.png', '.jpg'],
  },

  /* ── 2. Renders ────────────────────────────────────────────────────── */
  {
    id: 'renders-exteriores',
    categoria: 'Renders',
    nombre: 'Renders exteriores',
    queEs: 'Imágenes fotorrealistas de las fachadas, del conjunto y de los espacios exteriores.',
    paraQue:
      'Como imágenes estáticas complementarias del recorrido (portada, fichas, galería) y como referencia de materialidad y color para toda la producción.',
    formato: 'JPG o PNG, mínimo 3000 px en el lado mayor, compresión de alta calidad (90% o más).',
    requisito: 'recomendado',
    obligatorioSi: 'El proyecto está en pozo: no hay obra construida para fotografiar.',
    siNoLoTienen:
      'Si tienen el modelo 3D los generamos nosotros (ver la especificación técnica para el estudio de renders). Si no hay modelo 3D hay que modelarlo primero: son semanas y un presupuesto aparte, y el insumo mínimo para modelar son planos en CAD con cotas.',
    ...RENDERISTA,
    aplicaA: TODOS,
    aceptaArchivos: true,
    extensiones: ['.jpg', '.jpeg', '.png'],
  },
  {
    id: 'renders-interiores',
    categoria: 'Renders',
    nombre: 'Renders interiores',
    queEs: 'Imágenes fotorrealistas del interior de cada tipología: living, dormitorios, cocina, baños.',
    paraQue: 'Se convierten en las panorámicas 360° navegables de interior y se usan como imágenes fijas de referencia.',
    formato: 'Igual a los exteriores: JPG o PNG, mínimo 3000 px en el lado mayor, alta calidad.',
    requisito: 'recomendado',
    obligatorioSi: 'El proyecto es un edificio o un complejo en pozo. En loteos sólo aplica si incluyen modelos de vivienda tipo.',
    siNoLoTienen: 'Mismo plan B que los exteriores: con modelo 3D los generamos nosotros; sin modelo 3D hay que modelar primero.',
    ...RENDERISTA,
    aplicaA: TODOS,
    aceptaArchivos: true,
    extensiones: ['.jpg', '.jpeg', '.png'],
  },
  {
    id: 'renders-aereos',
    categoria: 'Renders',
    nombre: 'Renders o tomas aéreas',
    queEs: 'Vista aérea del conjunto o del lote, en render o en foto de drone.',
    paraQue: 'Portada del recorrido y contexto general: dónde está el proyecto respecto de su entorno.',
    formato: 'Igual a los exteriores: JPG o PNG, mínimo 3000 px en el lado mayor, alta calidad.',
    requisito: 'recomendado',
    siNoLoTienen:
      'Se puede reemplazar por una toma satelital de referencia, de menor calidad, o coordinar un vuelo de drone si el terreno ya existe.',
    ...DRONE,
    aplicaA: TODOS,
    aceptaArchivos: true,
    extensiones: ['.jpg', '.jpeg', '.png'],
  },

  /* ── 3. Panorámicas 360° ───────────────────────────────────────────── */
  {
    id: 'panoramicas-360',
    categoria: 'Panorámicas 360°',
    nombre: 'Panorámicas 360° equirectangulares',
    queEs: 'Las imágenes esféricas que arman el recorrido navegable: la pieza central del producto.',
    paraQue:
      'Son el recorrido en sí. Cada punto de vista (exterior, interior de unidad tipo, amenity) se carga como una panorámica navegable con los polígonos clickeables encima.',
    formato:
      'Mínimo 8192 × 4096 px, ideal 12288 × 6144 px. Relación 2:1 exacta (ancho = 2 × alto): cualquier otra rompe la proyección esférica. Horizonte nivelado (pitch 0°). Sin postproducción que rompa la costura: nada de viñeteados, recortes ni ajustes locales de perspectiva sobre los bordes izquierdo y derecho. PNG 16-bit o EXR (preferido); JPG de máxima calidad sólo si el software no permite otro formato.',
    requisito: 'obligatorio',
    siNoLoTienen:
      'Las producimos nosotros. En pozo salen de renders del modelo 3D exportados en equirectangular, así que necesitamos el modelo (si no existe, hay que modelarlo primero). Para terreno y entorno se generan con drone. Con obra terminada se toman con cámara 360° en sitio. Se cotiza aparte según cantidad de puntos y ubicación geográfica.',
    quienLoHace:
      'Depende de la etapa: en pozo, un renderista o estudio de archviz; con obra terminada, un fotógrafo 360°/Matterport Service Partner; para terreno y entorno, un piloto de drone.',
    comoSeHace:
      'Por render: cámara "VR spherical / panorámica 360° equirectangular", que es una opción estándar en V-Ray, Corona, Blender, Twinmotion y Lumion. Preguntar primero qué motor usan, porque el paso de exportación cambia según cuál sea. Por foto: cámara 360° dedicada, pidiendo el archivo nativo equirectangular 2:1 y no el link a la nube del fabricante. Por drone: el modo "Sphere Panorama" nativo de DJI arma la esférica por stitching automático; no iguala a una cámara dedicada, pero ya viene en el firmware y sale gratis.',
    dondeContratarlo:
      'Renderistas: preguntarle al estudio de arquitectura, o Workana / CGarchitect / Behance / ArtStation. Fotógrafos 360: directorio de Matterport Service Partners y estudios locales (Real Estate 360, Delta Force Vision, Spot360 en Buenos Aires; FOTOPROP.UY en Uruguay). Drone: droneros.com.ar, dazzdrones, Otero.uy.',
    precioReferencia:
      'Regla práctica: una panorámica 360° sale entre 30% y 60% más cara que el mismo punto de vista en render fijo, porque hay que modelar también detrás de cámara. Sobre una base de USD 800-2.000 por render fijo de nivel medio. Dato argentino de 2024, sólo como proporción: un render 360° individual del orden de $40.000 ARS, y sumarle la versión 360° a un render fijo del mismo punto de vista agregaba un 50%.',
    aplicaA: TODOS,
    aceptaArchivos: true,
    extensiones: ['.png', '.exr', '.jpg', '.jpeg', '.tif', '.tiff'],
  },

  /* ── 4. Video ──────────────────────────────────────────────────────── */
  {
    id: 'video-institucional',
    categoria: 'Video',
    nombre: 'Video institucional o de recorrido',
    queEs: 'Un video en formato tradicional, no interactivo.',
    paraQue:
      'Material complementario para redes, landing o presentaciones comerciales. No forma parte del recorrido interactivo, pero se puede embeber como sección del sitio.',
    formato: 'MP4, H.264, mínimo 1920×1080, 30 fps.',
    requisito: 'opcional',
    siNoLoTienen:
      'No bloquea el proyecto. Se puede producir aparte, con cotización independiente, o directamente omitir la sección.',
    ...DRONE,
    aplicaA: TODOS,
    aceptaArchivos: true,
    extensiones: ['.mp4', '.mov'],
  },

  /* ── 5. Fotografía real y de obra ──────────────────────────────────── */
  {
    id: 'fotografia-obra',
    categoria: 'Fotografía real y de obra',
    nombre: 'Fotografía del terreno, de la obra o del edificio terminado',
    queEs: 'Fotos del estado actual del terreno, del avance de obra o del edificio ya construido.',
    paraQue:
      'Galería complementaria y prueba de avance real de obra: es lo que más confianza genera en preventa, porque demuestra que el proyecto existe.',
    formato: 'JPG, mínimo 3000 px en el lado mayor.',
    requisito: 'opcional',
    obligatorioSi: 'Muy recomendado si el proyecto ya tiene obra avanzada.',
    siNoLoTienen: 'Coordinamos una sesión de fotografía nosotros, cotizada aparte.',
    ...FOTOGRAFO_360,
    aplicaA: TODOS,
    aceptaArchivos: true,
    extensiones: ['.jpg', '.jpeg', '.png'],
  },

  /* ── 6. Datos comerciales ──────────────────────────────────────────── */
  {
    id: 'listado-unidades',
    categoria: 'Datos comerciales',
    nombre: 'Listado de unidades',
    queEs:
      'El listado completo de unidades con superficies, tipologías, estados comerciales, precios y condiciones de financiación.',
    paraQue:
      'Es lo que alimenta el estado en vivo de cada polígono clickeable —disponible, reservado o vendido— y la ficha comercial de cada unidad.',
    formato:
      'Planilla según nuestra plantilla estándar (documento "Plantilla de listado de unidades"). El precio puede quedar oculto al público si lo prefieren, pero igual lo necesitamos cargado para uso interno del equipo comercial.',
    requisito: 'obligatorio',
    siNoLoTienen:
      'Sin listado no se puede activar el estado comercial en vivo. El recorrido igual se puede lanzar mostrando sólo la navegación 3D, sin colores de disponibilidad, y se agrega en cuanto esté listo.',
    aplicaA: TODOS,
    aceptaArchivos: true,
    extensiones: ['.csv', '.xlsx', '.xls'],
  },

  /* ── 7. Identidad de marca ─────────────────────────────────────────── */
  {
    id: 'logo-vectorial',
    categoria: 'Identidad de marca',
    nombre: 'Logo en vectorial',
    queEs: 'El logo del proyecto o de la desarrolladora, en archivo vectorial.',
    paraQue: 'Para que el recorrido y su interfaz respeten la identidad del proyecto en vez de mostrar una marca genérica.',
    formato: 'AI, EPS o SVG, con versión para fondo claro y versión para fondo oscuro.',
    requisito: 'obligatorio',
    siNoLoTienen: 'Usamos una marca neutra de nuestro sistema por defecto, ajustable después.',
    aplicaA: TODOS,
    aceptaArchivos: true,
    extensiones: ['.svg', '.ai', '.eps', '.pdf'],
  },
  {
    id: 'manual-de-marca',
    categoria: 'Identidad de marca',
    nombre: 'Paleta, tipografía y manual de marca',
    queEs: 'Los colores, las tipografías y el manual de marca, si existe.',
    paraQue: 'Definen los colores de botones y estados y la tipografía de toda la interfaz del recorrido.',
    formato:
      'Códigos de color en HEX; nombre de las tipografías, con los archivos de fuente si no son de Google Fonts; manual en PDF si existe.',
    requisito: 'opcional',
    siNoLoTienen: 'Usamos una paleta y una tipografía neutras de nuestro sistema por defecto, ajustables después.',
    aplicaA: TODOS,
    aceptaArchivos: true,
    extensiones: ['.pdf', '.otf', '.ttf', '.woff2', '.zip'],
  },

  /* ── 8. Textos y copy ──────────────────────────────────────────────── */
  {
    id: 'textos-copy',
    categoria: 'Textos y copy',
    nombre: 'Textos descriptivos',
    queEs: 'Los textos del proyecto, de las tipologías y de los amenities.',
    paraQue: 'Alimentan las fichas de unidad, el texto de bienvenida y las descripciones de amenities dentro del recorrido.',
    formato: 'Documento de texto (Word o Google Docs), un párrafo por sección.',
    requisito: 'opcional',
    siNoLoTienen:
      'Los redactamos nosotros en base al brochure y a la información comercial, sujeto a aprobación de ustedes antes de publicar.',
    aplicaA: TODOS,
    aceptaArchivos: true,
    extensiones: ['.docx', '.doc', '.pdf', '.txt', '.md'],
  },

  /* ── 9. Datos legales y contractuales ──────────────────────────────── */
  {
    id: 'disclaimers-legales',
    categoria: 'Datos legales y contractuales',
    nombre: 'Disclaimers y leyendas legales',
    queEs:
      'Los disclaimers obligatorios (imágenes ilustrativas, superficies sujetas a aprobación municipal), el número de matrícula o registro si aplica, y cualquier leyenda que el proyecto deba mostrar por normativa.',
    paraQue: 'Se incluyen como pie de página o pop-up legal dentro del recorrido, para que la pieza cumpla con lo que exige cada jurisdicción.',
    formato: 'Texto plano, provisto por su equipo legal o por la inmobiliaria.',
    requisito: 'obligatorio',
    siNoLoTienen:
      'No publicamos el recorrido sin esta validación. Es responsabilidad del cliente proveerla: nosotros no redactamos disclaimers legales.',
    aplicaA: TODOS,
    aceptaArchivos: true,
    extensiones: ['.txt', '.docx', '.pdf'],
  },

  /* ── 10. Accesos y contactos ───────────────────────────────────────── */
  {
    id: 'contactos-proveedores',
    categoria: 'Accesos y contactos',
    nombre: 'Contactos de proveedores y referentes',
    queEs:
      'Quién es el estudio de arquitectura, quién el estudio de renders si ya tienen uno contratado, quién administra el CRM o la base de leads, y quién es el referente que autoriza cambios de estado comercial.',
    paraQue:
      'Para coordinar directamente con cada proveedor —por ejemplo, pedirle al renderista el modelo 3D o las panorámicas ya generadas— y para saber a quién avisarle cuando se vende o se reserva una unidad.',
    formato: 'Nombre, empresa, mail y teléfono de cada contacto.',
    requisito: 'obligatorio',
    siNoLoTienen: 'Lo definimos en la reunión de kickoff.',
    aplicaA: TODOS,
    aceptaArchivos: false,
  },

  /* ── 11. Ubicación y georreferencia ────────────────────────────────── */
  {
    id: 'ubicacion-coordenadas',
    categoria: 'Ubicación y georreferencia',
    nombre: 'Dirección y coordenadas del predio',
    queEs: 'La dirección exacta y las coordenadas GPS del predio.',
    paraQue: 'Para ubicar el proyecto en mapas y generar el contexto satelital.',
    formato: 'Coordenadas en decimal (lat, long).',
    requisito: 'obligatorio',
    siNoLoTienen: 'Se releva en el kickoff a partir de la dirección; sin ubicación no hay contexto satelital.',
    aplicaA: TODOS,
    aceptaArchivos: false,
  },
  {
    id: 'poligono-geojson',
    categoria: 'Ubicación y georreferencia',
    nombre: 'Polígono del terreno (mensura digital)',
    queEs: 'El polígono del terreno y de los lotes, si está digitalizado por la mensura o la agrimensura.',
    paraQue:
      'Si existe en digital, importamos directamente los límites de lotes y unidades como polígonos base: ahorra semanas de dibujo manual.',
    formato: 'GeoJSON.',
    requisito: 'recomendado',
    siNoLoTienen:
      'Dibujamos los polígonos manualmente sobre la imagen satelital o el masterplan. Funciona bien para pocas unidades, pero en loteos de cientos o miles de lotes puede sumar varias semanas. Vale la pena preguntarle al agrimensor antes de asumir que no existe.',
    quienLoHace: 'Agrimensor o estudio de mensura: normalmente el mismo que hizo la subdivisión del predio.',
    aplicaA: ['loteo', 'complejo', 'mixto'],
    aceptaArchivos: true,
    extensiones: ['.geojson', '.json', '.kml', '.kmz', '.dwg', '.dxf'],
  },
];

/** Índice por id, para resolver un `item_id` guardado en la base. */
const BY_ID = new Map(MATERIAL_CATALOG.map((item) => [item.id, item]));

export function materialItem(id: string): MaterialItem | undefined {
  return BY_ID.get(id);
}

export function isMaterialItemId(id: string): boolean {
  return BY_ID.has(id);
}

/** Los ítems que se le piden a un proyecto de este tipo, en orden de catálogo. */
export function catalogFor(kind: ProjectKind): MaterialItem[] {
  return MATERIAL_CATALOG.filter((item) => item.aplicaA.includes(kind));
}

/** Categorías con sus ítems, en el orden en que aparecen en el brief. */
export function catalogByCategory(kind: ProjectKind): { categoria: string; items: MaterialItem[] }[] {
  const out: { categoria: string; items: MaterialItem[] }[] = [];
  for (const item of catalogFor(kind)) {
    const last = out[out.length - 1];
    if (last && last.categoria === item.categoria) last.items.push(item);
    else out.push({ categoria: item.categoria, items: [item] });
  }
  return out;
}
