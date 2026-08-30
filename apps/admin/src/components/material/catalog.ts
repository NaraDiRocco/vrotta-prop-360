/**
 * Catálogo de material del brief estándar. Derivado de
 * `docs/01-CLIENTE/1-Brief-Maestro-de-Material.md` — 11 categorías, filtradas
 * por tipo de proyecto con `aplicaA`. El contenido de cada ficha (qué es,
 * para qué, formato, plan B) es el texto operativo real que usamos con el
 * cliente, no un placeholder.
 */
import type { MaterialItem } from './types.ts';

const ALL_KINDS: MaterialItem['aplicaA'] = ['loteo', 'edificio', 'complejo', 'mixto'];
const CON_UNIDADES: MaterialItem['aplicaA'] = ['edificio', 'complejo', 'mixto'];

export const MATERIAL_CATALOG: MaterialItem[] = [
  // 1. Material gráfico (planos)
  {
    id: 'masterplan',
    categoria: 'Planos',
    nombre: 'Masterplan / plano general',
    queEs: 'El plano de conjunto del proyecto completo, con la ubicación de todas las unidades, calles, accesos, amenities y espacios comunes.',
    paraQue: 'Es la base sobre la que armamos el mapa de navegación del recorrido — el "mapa madre" desde donde el usuario elige qué unidad ver.',
    formato: 'Vectorial (DWG, DXF, AI, PDF vectorial) con capas separadas por tipo de elemento (unidades, vías, verde, amenities). Escala indicada.',
    requisito: 'obligatorio',
    siNoLoTienen: 'Lo armamos nosotros a partir de una imagen satelital o de un plano en baja calidad, pero pierde precisión geométrica y suma entre 3 y 7 días hábiles más costo de relevamiento/redibujo.',
    quienLoHace: 'Estudio de arquitectura o agrimensor del proyecto',
    aplicaA: ALL_KINDS,
    aceptaArchivos: true,
    extensiones: ['.dwg', '.dxf', '.ai', '.pdf'],
  },
  {
    id: 'plantas-tipologia',
    categoria: 'Planos',
    nombre: 'Plantas por unidad / tipología',
    queEs: 'El plano de cada tipología de unidad (o de cada unidad, si son todas distintas), con cotas y superficies.',
    paraQue: 'Se muestran en la ficha de cada unidad dentro del recorrido, y sirven de referencia para armar las cámaras de los renders interiores.',
    formato: 'PDF vectorial o imagen de alta resolución (mínimo 2000px en el lado mayor), un archivo por tipología, nombrado con el mismo código del listado de unidades.',
    requisito: 'obligatorio',
    siNoLoTienen: 'Si el estudio de arquitectura tiene el archivo fuente (Illustrator, InDesign, AutoCAD) lo pedimos directo. Si no existe ninguna digital, hay que generarla desde el modelo 3D o el legajo de obra: suma entre 2 y 5 días hábiles según cantidad de tipologías.',
    quienLoHace: 'Estudio de arquitectura',
    aplicaA: CON_UNIDADES,
    aceptaArchivos: true,
    extensiones: ['.pdf', '.ai', '.dwg', '.jpg', '.png'],
  },
  {
    id: 'cortes-tecnicos',
    categoria: 'Planos',
    nombre: 'Cortes y vistas técnicas',
    queEs: 'Cortes longitudinales/transversales del edificio o del terreno.',
    paraQue: 'En complejos con desnivel, para entender la topografía y ubicar correctamente las cámaras de las panorámicas; también sirve como material de referencia dentro del recorrido.',
    formato: 'PDF o imagen, mismo criterio que las plantas.',
    requisito: 'recomendado',
    siNoLoTienen: 'Trabajamos con la planta y fotos/drone del terreno para inferir la topografía; en terrenos con pendiente marcada esto puede generar imprecisiones en la ubicación de las cámaras.',
    quienLoHace: 'Estudio de arquitectura',
    aplicaA: ALL_KINDS,
    aceptaArchivos: true,
    extensiones: ['.pdf', '.jpg', '.png'],
  },

  // 2. Renders
  {
    id: 'renders-exteriores',
    categoria: 'Renders',
    nombre: 'Renders exteriores',
    queEs: 'Imágenes fotorrealistas de las fachadas, el conjunto y los espacios exteriores.',
    paraQue: 'Como imágenes estáticas complementarias dentro del recorrido (portada, fichas, galería) y como referencia de materialidad y color para toda la producción.',
    formato: 'JPG o PNG, mínimo 3000px en el lado mayor, calidad de compresión mínima 90%.',
    requisito: 'obligatorio',
    siNoLoTienen: 'Obligatorio si el proyecto está en pozo (no hay obra construida para fotografiar). Si tienen el modelo 3D los generamos nosotros; si no hay modelo 3D, hay que modelarlo primero, lo que suma semanas y presupuesto aparte.',
    quienLoHace: 'Estudio de renders',
    dondeContratarlo: 'Ver documento "Especificación técnica para estudio de renders"',
    aplicaA: ALL_KINDS,
    aceptaArchivos: true,
    extensiones: ['.jpg', '.jpeg', '.png'],
  },
  {
    id: 'renders-interiores',
    categoria: 'Renders',
    nombre: 'Renders interiores',
    queEs: 'Imágenes fotorrealistas del interior de cada tipología (living, dormitorios, cocina, baños).',
    paraQue: 'Como panorámicas 360° navegables interior y como imágenes fijas de referencia.',
    formato: 'Igual a exteriores: JPG o PNG, mínimo 3000px, calidad ≥90%.',
    requisito: 'obligatorio',
    siNoLoTienen: 'Obligatorio para edificios y complejos en pozo; opcional en loteos salvo que incluyan modelos de vivienda tipo. Mismo plan B que exteriores.',
    quienLoHace: 'Estudio de renders',
    aplicaA: CON_UNIDADES,
    aceptaArchivos: true,
    extensiones: ['.jpg', '.jpeg', '.png'],
  },
  {
    id: 'renders-aereos',
    categoria: 'Renders',
    nombre: 'Renders / tomas aéreas',
    queEs: 'Vista aérea del conjunto o del lote, en render o en foto de drone.',
    paraQue: 'Portada del recorrido y contexto general — ubicación respecto al entorno.',
    formato: 'Igual a exteriores.',
    requisito: 'recomendado',
    siNoLoTienen: 'Se puede reemplazar por una toma satelital de referencia (menor calidad) o coordinar un vuelo de drone si el terreno ya existe.',
    aplicaA: ALL_KINDS,
    aceptaArchivos: true,
    extensiones: ['.jpg', '.jpeg', '.png'],
  },

  // 3. Panorámicas 360°
  {
    id: 'panoramicas-360',
    categoria: 'Panorámicas 360°',
    nombre: 'Panorámicas equirectangulares',
    queEs: 'Las imágenes esféricas (equirectangulares) que arman el recorrido navegable interactivo — la pieza central del producto.',
    paraQue: 'Es el recorrido en sí. Cada punto de vista (exterior, interior de unidad tipo, amenity) se carga como una panorámica navegable con los polígonos clickeables encima.',
    formato: 'Mínimo 8192×4096px (ideal 12288×6144px), relación 2:1 exacta, horizonte nivelado, sin postproducción que rompa la costura. PNG 16-bit o EXR (preferido); JPG de máxima calidad sólo si no hay otra opción.',
    requisito: 'obligatorio',
    siNoLoTienen: 'Las producimos nosotros: si el proyecto está en pozo, necesitamos el modelo 3D para generarlas (si no hay modelo, primero hay que modelarlo); si hay obra o terreno accesible, coordinamos visita con cámara 360° o vuelo de drone — se cotiza aparte.',
    quienLoHace: 'Estudio de renders (pozo) / equipo de producción con cámara 360° o drone (obra/terreno)',
    aplicaA: ALL_KINDS,
    aceptaArchivos: true,
    extensiones: ['.png', '.exr', '.jpg', '.jpeg'],
  },

  // 4. Video
  {
    id: 'video-institucional',
    categoria: 'Video',
    nombre: 'Video institucional / de recorrido',
    queEs: 'Un video institucional o de recorrido, en formato tradicional (no interactivo).',
    paraQue: 'Material complementario para redes, landing o presentaciones comerciales — no forma parte del recorrido interactivo, pero se puede embeber como sección del sitio.',
    formato: 'MP4, H.264, mínimo 1920×1080, 30fps.',
    requisito: 'opcional',
    siNoLoTienen: 'No bloquea el proyecto. Se puede producir aparte (cotización independiente) o directamente omitir esta sección.',
    aplicaA: ALL_KINDS,
    aceptaArchivos: true,
    extensiones: ['.mp4'],
  },

  // 5. Fotografía real y de obra
  {
    id: 'fotografia-obra',
    categoria: 'Fotografía',
    nombre: 'Fotografía real y de obra',
    queEs: 'Fotos del estado actual del terreno, del avance de obra, o del edificio terminado.',
    paraQue: 'Galería complementaria y para transmitir avance de obra real — genera confianza en preventa.',
    formato: 'JPG, mínimo 3000px en el lado mayor.',
    requisito: 'recomendado',
    siNoLoTienen: 'Opcional salvo que el proyecto ya tenga obra avanzada (ahí se recomienda fuerte: es la prueba más efectiva de que el proyecto existe). Si no la tienen, coordinamos una sesión de fotografía cotizada aparte.',
    dondeContratarlo: 'Fotógrafo de obra / inmobiliario',
    aplicaA: ALL_KINDS,
    aceptaArchivos: true,
    extensiones: ['.jpg', '.jpeg'],
  },

  // 6. Datos comerciales
  {
    id: 'datos-comerciales',
    categoria: 'Datos comerciales',
    nombre: 'Listado de unidades',
    queEs: 'El listado completo de unidades con superficies, tipologías, estados comerciales, precios y condiciones de financiación.',
    paraQue: 'Alimenta el estado en vivo de cada polígono clickeable — disponible, reservado o vendido — y la ficha comercial de cada unidad.',
    formato: 'Planilla según la plantilla estándar ("Plantilla de listado de unidades"). El precio puede quedar oculto al público, pero igual lo necesitamos cargado para uso interno del equipo comercial.',
    requisito: 'obligatorio',
    siNoLoTienen: 'Sin este listado no se puede activar el estado comercial en vivo; el recorrido se puede lanzar igual mostrando sólo la navegación 3D, sin colores de disponibilidad, y se agrega en cuanto esté listo.',
    quienLoHace: 'Equipo comercial / inmobiliaria',
    aplicaA: ALL_KINDS,
    aceptaArchivos: true,
    extensiones: ['.xlsx', '.csv'],
  },

  // 7. Identidad de marca
  {
    id: 'logo',
    categoria: 'Marca',
    nombre: 'Logo',
    queEs: 'Logo del proyecto o la desarrolladora.',
    paraQue: 'Para que el recorrido y su interfaz respeten la identidad del proyecto.',
    formato: 'Vectorial (AI, EPS o SVG), versión para fondo claro y oscuro.',
    requisito: 'obligatorio',
    siNoLoTienen: 'Usamos una identidad neutra de nuestro sistema por defecto, ajustable después.',
    aplicaA: ALL_KINDS,
    aceptaArchivos: true,
    extensiones: ['.ai', '.eps', '.svg', '.png'],
  },
  {
    id: 'paleta-tipografia',
    categoria: 'Marca',
    nombre: 'Paleta de colores y tipografía',
    queEs: 'Códigos de color en HEX, nombre de las tipografías (con archivos de fuente si no son de Google Fonts) y manual de marca si existe.',
    paraQue: 'Para que los colores de botones, estados de interfaz y tipografía del recorrido respeten la identidad de marca.',
    formato: 'Documento o listado con HEX y nombres de fuente; archivos de fuente si aplica.',
    requisito: 'opcional',
    siNoLoTienen: 'Usamos una paleta y tipografía neutras de nuestro sistema por defecto, ajustable después.',
    aplicaA: ALL_KINDS,
    aceptaArchivos: true,
    extensiones: ['.pdf', '.ttf', '.otf', '.woff2'],
  },

  // 8. Textos y copy
  {
    id: 'textos-copy',
    categoria: 'Textos',
    nombre: 'Textos descriptivos',
    queEs: 'Los textos descriptivos del proyecto, de las tipologías y de los amenities.',
    paraQue: 'Fichas de unidad, textos de bienvenida, descripciones de amenities dentro del recorrido.',
    formato: 'Documento de texto (Word o Google Docs), un párrafo por sección.',
    requisito: 'opcional',
    siNoLoTienen: 'Los redactamos nosotros en base al brochure y a la información comercial, sujeto a aprobación antes de publicar.',
    aplicaA: ALL_KINDS,
    aceptaArchivos: true,
    extensiones: ['.doc', '.docx', '.pdf', '.txt'],
  },

  // 9. Datos legales y contractuales
  {
    id: 'legales',
    categoria: 'Legales',
    nombre: 'Disclaimers y datos legales',
    queEs: 'Disclaimers obligatorios (imágenes ilustrativas, superficies sujetas a aprobación municipal, etc.), número de matrícula o registro si aplica, y cualquier leyenda legal que el proyecto deba mostrar por normativa.',
    paraQue: 'Se incluyen como pie de página o pop-up legal dentro del recorrido, para que la pieza cumpla con lo que exige cada jurisdicción.',
    formato: 'Texto plano, provisto por el equipo legal o la inmobiliaria.',
    requisito: 'obligatorio',
    siNoLoTienen: 'No publicamos el recorrido sin esta validación — es responsabilidad del cliente proveerla; nosotros no redactamos disclaimers legales.',
    quienLoHace: 'Equipo legal del cliente',
    aplicaA: ALL_KINDS,
    aceptaArchivos: true,
    extensiones: ['.pdf', '.doc', '.docx', '.txt'],
  },

  // 10. Accesos y contactos
  {
    id: 'contactos',
    categoria: 'Contactos',
    nombre: 'Accesos y contactos de proveedores',
    queEs: 'Quién es el estudio de arquitectura, quién el estudio de renders (si ya tienen uno), quién administra el CRM/base de leads, y quién es el referente que autoriza cambios de estado comercial.',
    paraQue: 'Para coordinar directamente con cada proveedor (pedirle al renderista el modelo 3D o las panorámicas) y para saber a quién avisar cuando se vende o reserva una unidad.',
    formato: 'Nombre, empresa, mail y teléfono de cada contacto.',
    requisito: 'obligatorio',
    siNoLoTienen: 'Se define en la reunión de kickoff.',
    aplicaA: ALL_KINDS,
    aceptaArchivos: false,
  },

  // 11. Ubicación y georreferencia
  {
    id: 'ubicacion',
    categoria: 'Ubicación',
    nombre: 'Dirección y coordenadas',
    queEs: 'Dirección exacta y coordenadas GPS del predio.',
    paraQue: 'Para ubicar el proyecto en mapas y generar el contexto satelital.',
    formato: 'Coordenadas en decimal (lat, long).',
    requisito: 'obligatorio',
    siNoLoTienen: 'No se puede generar el contexto satelital ni el mapa de ubicación sin este dato.',
    aplicaA: ALL_KINDS,
    aceptaArchivos: false,
  },
  {
    id: 'geojson',
    categoria: 'Ubicación',
    nombre: 'Polígono del terreno (agrimensura)',
    queEs: 'Polígono del terreno digitalizado (mensura, agrimensura), si lo tienen.',
    paraQue: 'Si hay agrimensura digital, se importan directamente los límites de lotes/unidades como polígonos base — ahorra semanas de dibujo manual.',
    formato: 'GeoJSON.',
    requisito: 'recomendado',
    siNoLoTienen: 'Dibujamos los polígonos manualmente sobre la imagen satelital o el masterplan — funciona bien para pocas unidades, pero en loteos de cientos o miles de lotes suma varias semanas. Vale la pena preguntarle al agrimensor antes de asumir que no existe.',
    quienLoHace: 'Agrimensor',
    aplicaA: ALL_KINDS,
    aceptaArchivos: true,
    extensiones: ['.geojson', '.json'],
  },
];

export function catalogForKind(kind: MaterialItem['aplicaA'][number]): MaterialItem[] {
  return MATERIAL_CATALOG.filter((item) => item.aplicaA.includes(kind));
}
