/**
 * Datos de ejemplo para ejercitar `/m/[token]` mientras no existe la API de
 * resolución de token (la hace el otro agente, sobre `lib/material/**`).
 *
 * El contenido de cada ítem sale de dos documentos internos:
 *   - docs/01-CLIENTE/1-Brief-Maestro-de-Material.md → qué se pide, para qué,
 *     formato exacto, y el plan B si no lo tienen (todo esto SÍ es apto para
 *     mostrarle al cliente, porque el propio brief está escrito para él).
 *   - docs/04-PRODUCCION/1-Quien-Hace-Que-y-Cuanto-Cuesta.md → quién produce
 *     cada cosa, con qué herramienta, dónde se contrata y cuánto sale — esto
 *     es una guía interna, así que acá se resume en lenguaje llano y con los
 *     rangos de precio marcados como aproximados (tal como pide el propio
 *     documento fuente: "repreguntar a 2-3 proveedores antes de cotizar").
 *
 * Punto de conexión real (comentado a propósito, ver más abajo):
 *   GET /api/m/[token] → MaterialTokenResolution
 *   POST /api/m/[token]/items/[itemId]/upload (multipart)
 *   POST /api/m/[token]/items/[itemId]/no-tengo { comentario }
 *   POST /api/m/[token]/items/[itemId]/comentario { comentario }
 * Los nombres exactos los define el otro agente; ajustar `resolveMaterialToken`
 * en `app/m/[token]/page.tsx` cuando existan.
 */
import type {
  MaterialContact,
  MaterialItem,
  MaterialItemState,
  MaterialProjectSummary,
} from './types.ts';

export const EXAMPLE_PROJECT: MaterialProjectSummary = {
  nombre: 'Loteo Costa Azul',
  kind: 'loteo',
};

export const EXAMPLE_CONTACT: MaterialContact = {
  nombre: 'Nara — Vrotta Prop 360',
  medio: 'whatsapp',
  valor: '+54 9 11 5555-0100',
};

const ITEMS: MaterialItem[] = [
  {
    id: 'masterplan',
    categoria: 'Planos',
    nombre: 'Masterplan / plano general',
    queEs: 'El plano de conjunto del proyecto completo: dónde va cada unidad, las calles, los accesos y los espacios comunes.',
    paraQue: 'Es la base del mapa de navegación del recorrido — desde ahí el visitante elige qué unidad quiere ver.',
    formato: 'Archivo vectorial (DWG, DXF, AI o PDF vectorial), con capas separadas por tipo de elemento si es posible.',
    requisito: 'obligatorio',
    siNoLoTienen:
      'Lo armamos nosotros a partir de una imagen satelital o de un plano en baja calidad, pero el resultado pierde precisión y suma entre 3 y 7 días hábiles más un costo de relevamiento.',
    quienLoHace: 'El estudio de arquitectura o el agrimensor del proyecto suele tenerlo.',
    comoSeHace: 'Es el archivo con el que se aprobó o presentó el proyecto — vale la pena preguntar antes de asumir que no existe.',
    dondeContratarlo: 'Si no existe, un estudio de arquitectura o agrimensura puede redibujarlo a partir de planos en papel o de una mensura.',
    precioReferencia: 'Depende del relevamiento necesario — pedile un presupuesto puntual al operador.',
    aplicaA: ['loteo', 'edificio', 'complejo', 'mixto'],
    aceptaArchivos: true,
    extensiones: ['dwg', 'dxf', 'ai', 'pdf'],
  },
  {
    id: 'plantas-tipologia',
    categoria: 'Planos',
    nombre: 'Plantas por unidad o tipología',
    queEs: 'El plano de cada tipo de unidad (o de cada unidad, si son todas distintas), con medidas y superficies.',
    paraQue: 'Se muestran en la ficha de cada unidad dentro del recorrido, y sirven de referencia para armar las cámaras de los interiores.',
    formato: 'PDF vectorial o imagen de alta resolución (mínimo 2000px en el lado mayor). Un archivo por tipología.',
    requisito: 'obligatorio',
    siNoLoTienen:
      'Si el estudio de arquitectura tiene el archivo fuente lo pedimos directamente. Si no existe ninguna versión digital, hay que generarla desde el modelo 3D o desde el legajo de obra, y eso suma entre 2 y 5 días hábiles según la cantidad de tipologías.',
    quienLoHace: 'El estudio de arquitectura.',
    comoSeHace: 'Se dibuja en AutoCAD, Illustrator o similar a partir del proyecto ejecutivo.',
    dondeContratarlo: 'Mismo estudio de arquitectura del proyecto — conviene pedirle el archivo fuente, no una imagen.',
    aplicaA: ['edificio', 'complejo', 'mixto'],
    aceptaArchivos: true,
    extensiones: ['pdf', 'jpg', 'png', 'ai', 'dwg'],
  },
  {
    id: 'cortes-tecnicos',
    categoria: 'Planos',
    nombre: 'Cortes y vistas técnicas',
    queEs: 'Cortes longitudinales o transversales del edificio o del terreno.',
    paraQue: 'En proyectos con desnivel, ayudan a entender la topografía y ubicar bien las cámaras de las panorámicas.',
    formato: 'PDF o imagen, mismo criterio que las plantas.',
    requisito: 'recomendado',
    siNoLoTienen:
      'Trabajamos con la planta y fotos o drone del terreno para inferir la topografía. En terrenos con pendiente marcada esto puede generar imprecisiones en la ubicación de las cámaras.',
    quienLoHace: 'El estudio de arquitectura.',
    aplicaA: ['edificio', 'complejo', 'mixto'],
    aceptaArchivos: true,
    extensiones: ['pdf', 'jpg', 'png'],
  },
  {
    id: 'renders-exteriores',
    categoria: 'Renders',
    nombre: 'Renders exteriores',
    queEs: 'Imágenes fotorrealistas de las fachadas, el conjunto y los espacios exteriores.',
    paraQue: 'Se usan como imágenes complementarias del recorrido (portada, fichas, galería) y como referencia de color y materiales para toda la producción.',
    formato: 'JPG o PNG, mínimo 3000px en el lado mayor, alta calidad.',
    requisito: 'recomendado',
    siNoLoTienen:
      'Si tienen el modelo 3D del proyecto, los generamos nosotros. Si no hay modelo 3D, primero hay que modelarlo — eso suma semanas y se cotiza aparte. Es obligatorio conseguirlos de alguna forma si el proyecto todavía no tiene obra construida para fotografiar.',
    quienLoHace: 'Un renderista o estudio de visualización arquitectónica (también llamado "archviz").',
    comoSeHace: 'Con software como 3ds Max + V-Ray/Corona, SketchUp + Enscape, Blender o Twinmotion/Lumion, a partir del modelo 3D del proyecto.',
    dondeContratarlo: 'El mismo estudio de arquitectura suele recomendar uno. También hay en Workana, CGarchitect o portfolios de archviz en Behance.',
    precioReferencia: 'Aproximado, varía mucho según el estudio y la complejidad — conviene pedir presupuesto a 2 o 3 estudios antes de decidir.',
    aplicaA: ['loteo', 'edificio', 'complejo', 'mixto'],
    aceptaArchivos: true,
    extensiones: ['jpg', 'jpeg', 'png'],
  },
  {
    id: 'renders-interiores',
    categoria: 'Renders',
    nombre: 'Renders interiores',
    queEs: 'Imágenes fotorrealistas del interior de cada tipología (living, dormitorios, cocina, baños).',
    paraQue: 'Se convierten en las panorámicas 360° navegables del interior, y también sirven como imágenes fijas de referencia.',
    formato: 'JPG o PNG, mínimo 3000px en el lado mayor.',
    requisito: 'recomendado',
    siNoLoTienen: 'Mismo camino que los renders exteriores: los generamos desde el modelo 3D, o hay que modelarlo primero si no existe.',
    quienLoHace: 'El mismo renderista o estudio de archviz que hace los exteriores.',
    dondeContratarlo: 'Mismo estudio que los renders exteriores.',
    aplicaA: ['edificio', 'complejo', 'mixto'],
    aceptaArchivos: true,
    extensiones: ['jpg', 'jpeg', 'png'],
  },
  {
    id: 'panoramicas-360',
    categoria: 'Panorámicas 360°',
    nombre: 'Panorámicas 360°',
    queEs: 'Las imágenes esféricas que arman el recorrido navegable — la pieza central de todo el producto.',
    paraQue: 'Cada punto de vista (exterior, interior de una unidad tipo, amenity) se carga como una panorámica que el visitante recorre, con la información clickeable encima.',
    formato: 'Resolución mínima 8192×4096px (ideal 12288×6144px), relación de ancho/alto exactamente 2:1, horizonte nivelado, en PNG de 16 bits o EXR (JPG solo si no hay otra opción).',
    requisito: 'obligatorio',
    siNoLoTienen:
      'Las producimos nosotros. Si el proyecto está en pozo, necesitamos el modelo 3D para generarlas desde ahí. Si el proyecto tiene obra construida o el terreno es accesible, coordinamos una visita con cámara 360° o un vuelo de drone — esto se coordina y cotiza aparte según cantidad de puntos y ubicación.',
    quienLoHace:
      'Según la etapa: un renderista (si el proyecto está en pozo), un fotógrafo especializado en tours 360° (si hay obra construida), o un piloto de drone (si es terreno sin construir).',
    comoSeHace:
      'En pozo: se exporta directo desde el software de render en formato panorámico equirectangular. Con obra: se toma en sitio con una cámara 360° (o un equipo tipo Matterport, pidiendo la exportación de imagen equirectangular, no solo el link del tour).',
    dondeContratarlo: 'Avisale al operador — coordina la visita o el render según la etapa del proyecto.',
    precioReferencia: 'Se cotiza aparte según cantidad de puntos y ubicación — el operador te pasa el presupuesto.',
    aplicaA: ['loteo', 'edificio', 'complejo', 'mixto'],
    aceptaArchivos: true,
    extensiones: ['png', 'exr', 'jpg', 'jpeg'],
  },
  {
    id: 'video',
    categoria: 'Video',
    nombre: 'Video institucional o de recorrido',
    queEs: 'Un video tradicional (no interactivo) institucional o de recorrido del proyecto.',
    paraQue: 'Material complementario para redes, la landing o presentaciones comerciales. No forma parte del recorrido interactivo en sí.',
    formato: 'MP4, mínimo 1920×1080px, 30 cuadros por segundo.',
    requisito: 'opcional',
    siNoLoTienen: 'No bloquea el proyecto. Se puede producir aparte más adelante, o directamente omitir esta sección.',
    quienLoHace: 'Un piloto de drone o un productor audiovisual, según si es tomas aéreas o filmación en tierra.',
    dondeContratarlo: 'Consultale al operador si querés coordinarlo — se cotiza aparte.',
    aplicaA: ['loteo', 'edificio', 'complejo', 'mixto'],
    aceptaArchivos: true,
    extensiones: ['mp4', 'webm'],
  },
  {
    id: 'fotografia-obra',
    categoria: 'Fotografía',
    nombre: 'Fotografía real y de obra',
    queEs: 'Fotos del estado actual del terreno, del avance de obra, o del proyecto ya terminado.',
    paraQue: 'Como galería complementaria — es la prueba más efectiva de que el proyecto existe y avanza, genera confianza.',
    formato: 'JPG, mínimo 3000px en el lado mayor.',
    requisito: 'recomendado',
    siNoLoTienen: 'Coordinamos una sesión de fotografía nosotros — se cotiza aparte.',
    quienLoHace: 'Un fotógrafo inmobiliario.',
    dondeContratarlo: 'Avisale al operador si necesitás que lo coordine.',
    aplicaA: ['loteo', 'edificio', 'complejo', 'mixto'],
    aceptaArchivos: true,
    extensiones: ['jpg', 'jpeg', 'png'],
  },
  {
    id: 'listado-unidades',
    categoria: 'Datos comerciales',
    nombre: 'Listado de unidades',
    queEs: 'La planilla con todas las unidades del proyecto: superficies, tipologías y estado de cada una.',
    paraQue: 'Con esto activamos el estado en vivo de cada unidad dentro del recorrido (disponible, reservada, vendida) y la ficha de cada una.',
    formato: 'Planilla según la plantilla que te pasamos aparte (Excel o Google Sheets).',
    requisito: 'obligatorio',
    siNoLoTienen:
      'Sin esta planilla no se puede activar el estado en vivo de las unidades — el recorrido se puede lanzar igual mostrando solo la navegación, y se agrega en cuanto esté lista.',
    aplicaA: ['loteo', 'edificio', 'complejo', 'mixto'],
    aceptaArchivos: true,
    extensiones: ['xlsx', 'xls', 'csv'],
  },
  {
    id: 'logo',
    categoria: 'Identidad de marca',
    nombre: 'Logo',
    queEs: 'El logo del proyecto o de la desarrolladora.',
    paraQue: 'Para que el recorrido y su interfaz respeten la identidad visual del proyecto.',
    formato: 'Vectorial (AI, EPS o SVG), con versión para fondo claro y para fondo oscuro si existen.',
    requisito: 'obligatorio',
    siNoLoTienen: 'Usamos una versión neutra de nuestro sistema por defecto, ajustable más adelante.',
    aplicaA: ['loteo', 'edificio', 'complejo', 'mixto'],
    aceptaArchivos: true,
    extensiones: ['ai', 'eps', 'svg', 'png'],
  },
  {
    id: 'paleta-marca',
    categoria: 'Identidad de marca',
    nombre: 'Colores y tipografía',
    queEs: 'La paleta de colores de la marca (en códigos HEX) y el nombre de las tipografías que usan, si tienen un manual de marca.',
    paraQue: 'Para que los botones, estados y textos del recorrido respeten la identidad del proyecto.',
    formato: 'Documento o imagen con los códigos de color, y el nombre de las fuentes (con los archivos si no son de Google Fonts).',
    requisito: 'opcional',
    siNoLoTienen: 'Usamos una paleta y tipografía neutras de nuestro sistema por defecto.',
    aplicaA: ['loteo', 'edificio', 'complejo', 'mixto'],
    aceptaArchivos: true,
    extensiones: ['pdf', 'jpg', 'png'],
  },
  {
    id: 'textos-copy',
    categoria: 'Textos',
    nombre: 'Textos descriptivos',
    queEs: 'Los textos del proyecto, de las tipologías y de los amenities.',
    paraQue: 'Se usan en las fichas de unidad, el texto de bienvenida y las descripciones de los amenities dentro del recorrido.',
    formato: 'Documento de texto (Word o Google Docs), un párrafo por sección.',
    requisito: 'opcional',
    siNoLoTienen: 'Los redactamos nosotros en base al brochure y a la información comercial, y te los mandamos a revisar antes de publicar nada.',
    aplicaA: ['loteo', 'edificio', 'complejo', 'mixto'],
    aceptaArchivos: true,
    extensiones: ['doc', 'docx', 'pdf', 'txt'],
  },
  {
    id: 'legales',
    categoria: 'Datos legales',
    nombre: 'Disclaimers y datos legales',
    queEs: 'Los avisos legales obligatorios (por ejemplo "imágenes ilustrativas" o "superficies sujetas a aprobación municipal"), número de matrícula si aplica, y cualquier leyenda que el proyecto deba mostrar por normativa.',
    paraQue: 'Se muestran como pie de página o aviso legal dentro del recorrido, para cumplir con lo que exige la normativa de tu jurisdicción.',
    formato: 'Texto plano, provisto por su equipo legal o la inmobiliaria.',
    requisito: 'obligatorio',
    siNoLoTienen: 'No podemos publicar el recorrido sin esta validación — es información que solo ustedes (o su equipo legal) pueden proveer, nosotros no redactamos disclaimers legales.',
    aplicaA: ['loteo', 'edificio', 'complejo', 'mixto'],
    aceptaArchivos: true,
    extensiones: ['pdf', 'doc', 'docx', 'txt'],
  },
  {
    id: 'contactos-proveedores',
    categoria: 'Contactos',
    nombre: 'Contactos de proveedores',
    queEs: 'Quién es el estudio de arquitectura, el estudio de renders (si ya tienen uno), y quién es la persona que autoriza cambios en el estado comercial de las unidades.',
    paraQue: 'Para poder coordinar directo con cada proveedor (por ejemplo, pedirle al renderista el modelo 3D) y saber a quién avisar cuando se vende o reserva una unidad.',
    formato: 'Nombre, empresa, mail y teléfono de cada contacto.',
    requisito: 'obligatorio',
    siNoLoTienen: 'Lo definimos juntos en la reunión de arranque del proyecto.',
    aplicaA: ['loteo', 'edificio', 'complejo', 'mixto'],
    aceptaArchivos: false,
  },
  {
    id: 'ubicacion',
    categoria: 'Ubicación',
    nombre: 'Dirección y coordenadas',
    queEs: 'La dirección exacta del proyecto y sus coordenadas GPS.',
    paraQue: 'Para ubicar el proyecto en el mapa y generar el contexto satelital del recorrido.',
    formato: 'Dirección completa, y coordenadas en formato decimal si las tienen (latitud, longitud).',
    requisito: 'obligatorio',
    siNoLoTienen: 'Con la dirección sola alcanza para ubicar el proyecto en el mapa — las coordenadas exactas las buscamos nosotros si hace falta.',
    aplicaA: ['loteo', 'edificio', 'complejo', 'mixto'],
    aceptaArchivos: false,
  },
  {
    id: 'geojson-mensura',
    categoria: 'Ubicación',
    nombre: 'Polígono de mensura (GeoJSON)',
    queEs: 'El archivo digital de la mensura o agrimensura, con los límites exactos de cada lote o unidad.',
    paraQue: 'Si existe, lo importamos directo como base del mapa de navegación — ahorra semanas de dibujo manual en loteos grandes.',
    formato: 'Archivo GeoJSON (si el agrimensor no lo tiene en ese formato exacto, cualquier archivo digital de la mensura sirve como punto de partida).',
    requisito: 'recomendado',
    siNoLoTienen:
      'Dibujamos los límites manualmente sobre la imagen satelital o el masterplan. Funciona bien con pocas unidades, pero en loteos de cientos de lotes puede sumar varias semanas de trabajo — vale la pena preguntarle al agrimensor antes de asumir que no existe.',
    aplicaA: ['loteo', 'complejo', 'mixto'],
    aceptaArchivos: true,
    extensiones: ['geojson', 'json', 'dwg', 'dxf'],
  },
];

export function buildExampleItemStates(kind: MaterialProjectSummary['kind']): MaterialItemState[] {
  return ITEMS.filter((item) => item.aplicaA.includes(kind)).map((item, index) => {
    // Unos pocos ítems de ejemplo con estado de avance, para poder ver la UI
    // en cada situación sin tener que subir nada a mano.
    if (item.id === 'logo') {
      return {
        item,
        estado: 'aprobado',
        archivos: [{ id: 'f1', nombre: 'logo-costa-azul.svg', pesoBytes: 24_600, subidoEl: '2026-08-12T14:03:00-03:00' }],
        comentario: null,
        marcadoSinMaterial: false,
      };
    }
    if (item.id === 'masterplan') {
      return {
        item,
        estado: 'recibido',
        archivos: [{ id: 'f2', nombre: 'masterplan-general.pdf', pesoBytes: 8_400_000, subidoEl: '2026-08-20T09:41:00-03:00' }],
        comentario: null,
        marcadoSinMaterial: false,
      };
    }
    if (item.id === 'cortes-tecnicos') {
      return {
        item,
        estado: 'no_aplica',
        archivos: [],
        comentario: 'El terreno es plano, no tenemos cortes porque no aplican.',
        marcadoSinMaterial: true,
      };
    }
    if (item.id === 'contactos-proveedores') {
      return {
        item,
        estado: 'solicitado',
        archivos: [],
        comentario: null,
        marcadoSinMaterial: false,
      };
    }
    return {
      item,
      estado: index % 5 === 0 ? 'solicitado' : 'pendiente',
      archivos: [],
      comentario: null,
      marcadoSinMaterial: false,
    };
  });
}
