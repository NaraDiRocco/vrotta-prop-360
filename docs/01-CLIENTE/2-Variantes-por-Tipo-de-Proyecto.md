> **DOCUMENTO PARA EL CLIENTE — listo para copiar y enviar tal cual.**
> Este documento complementa el "Brief Maestro de Material". Acá vas a encontrar solo lo que **cambia o se agrega** según el tipo de proyecto. Enviá al cliente únicamente la sección que corresponde a su proyecto (o las tres, si el desarrollador tiene varios tipos en cartera).

# Variantes del brief según tipo de proyecto

---

## A. Loteos / barrios (cientos o miles de lotes)

Lo que más pesa acá es la **precisión geométrica a gran escala** y la **automatización del dibujo de polígonos** — dibujar a mano miles de lotes no es viable en los tiempos habituales de un proyecto.

### Qué se agrega respecto al brief general

**1. GeoJSON de la mensura/agrimensura (crítico).**
Si el estudio de agrimensura ya digitalizó el fraccionamiento (algo muy habitual hoy), pedirles el archivo **GeoJSON o Shapefile** con cada lote como polígono individual y su número de lote como atributo. Esto es lo que marca la diferencia entre dibujar manualmente durante semanas o importar los polígonos en una tarde. Por favor, antes de asumir que no existe, pregúntenle directamente al agrimensor — casi siempre el archivo está, solo que no circula por default.

**2. Ortofoto o imagen aérea de alta resolución del predio.**
Una toma de drone (o satelital de alta resolución) del terreno completo, idealmente georreferenciada, que sirva de base visual para el mapa general y para el panorama aéreo del loteo.
- Formato: JPG/TIFF de alta resolución, con archivo de georreferencia (.tfw o equivalente) si lo tienen.
- Si no lo tienen: coordinamos un vuelo de drone (cotizado aparte según hectáreas y accesibilidad del terreno).

**3. Nomenclatura de lotes consistente con el plan de mensura.**
El número/código de cada lote en el listado de unidades (planilla comercial) tiene que ser **idéntico** al que figura en el GeoJSON y en el plano de mensura aprobado. Si hay lotes con doble numeración (plano viejo vs. plano aprobado), avisar antes de empezar — es la causa más común de errores de matching en loteos.

**4. Etapas del loteo.**
Si el loteo se lanza por etapas (manzanas o secciones liberadas en distintos momentos), indicar qué lotes pertenecen a cada etapa y el estado de habilitación de cada una — esto define qué se muestra activo/clickeable desde el día uno y qué queda "próximamente".

### Qué pierde relevancia en un loteo
- Plantas por tipología: normalmente no aplica (salvo que vendan también la vivienda tipo a construir).
- Renders interiores: solo si ofrecen modelos de casa.

---

## B. Edificios (deptos por piso y tipología)

Lo que más pesa acá es la **correspondencia exacta entre planta, piso y unidad**, porque un edificio tiene decenas o cientos de unidades repartidas en pocos pisos, y el usuario navega verticalmente (piso por piso) además de por tipología.

### Qué se agrega respecto al brief general

**1. Plantas por piso (no solo por tipología).**
Además de la planta de cada tipología, necesitamos la **planta de cada piso** con la distribución de todas las unidades de ese piso — sirve para armar la navegación vertical del edificio (selector de piso).
- Formato: igual a plantas de tipología (vectorial o alta resolución).
- Si hay pisos idénticos (plantas repetidas), aclarar el rango de pisos que comparte cada planta tipo.

**2. Nomenclatura de unidades por piso.**
Definir el estándar de código: recomendamos **PISO + UNIDAD** (por ejemplo `04-A`, `12-C`). Tiene que ser consistente en el plano, en la planilla comercial y en el nombre de archivo de cada render/panorámica interior. Si el edificio nombra los pisos de forma irregular (por ejemplo, no hay piso 13, o el subsuelo se numera negativo), avisar antes de cargar el listado.

**3. Panorámicas por tipología, no por unidad física.**
En un edificio en pozo, no hace falta una panorámica 360° por cada unidad — alcanza con **una panorámica interior por tipología** (todas las unidades del mismo tipo comparten la misma imagen). Aclarar cuántas tipologías distintas tiene el edificio, porque eso define la cantidad de renders 360° a producir.

**4. Amenities y espacios comunes.**
Si el edificio tiene SUM, piscina, gimnasio, rooftop, coworking, etc., estos también necesitan su panorámica 360° (render si está en pozo, foto real si está construido) — se muestran como puntos adicionales del recorrido, fuera de las unidades vendibles.

**5. Vista desde balcón/ventana por orientación (opcional pero recomendado).**
Si las unidades tienen vistas distintas según orientación (frente/contrafrente, altura), aporta mucho mostrar la vista real o renderizada desde cada orientación tipo — ayuda a vender pisos altos.

### Qué pierde relevancia en un edificio
- GeoJSON de mensura: no aplica (es una sola parcela).
- Ortofoto de todo el predio: se reemplaza por la vista aérea/render exterior del edificio.

---

## C. Complejos de viviendas (bloques, tipo Baleia en Punta Ballena)

Es el caso intermedio: menos unidades que un loteo, pero con **topografía y distribución en bloques** que un edificio no tiene. El caso de referencia (Baleia): 5 bloques, ~20 unidades documentadas, en preventa/pozo.

### Qué se agrega respecto al brief general

**1. Corte topográfico del terreno (crítico acá, opcional en los otros dos casos).**
Si el complejo está en un terreno con desnivel (algo muy común en proyectos de este tipo, sobre todo en zonas de costa o serranas), necesitamos el **corte topográfico** con las cotas de nivel de cada bloque. Esto es clave para:
- ubicar correctamente las cámaras de las panorámicas (que el horizonte quede coherente entre bloques a distinta altura),
- y para que el mapa de navegación represente bien la disposición real del conjunto.
- Si no lo tienen: se puede inferir aproximadamente con fotos de drone del terreno, pero con menor precisión — no recomendado si el desnivel es marcado.

**2. Plano de implantación por bloque.**
Un plano que muestre cómo se ubica cada bloque dentro del predio (no solo el masterplan general), con accesos y circulaciones entre bloques — sirve para la navegación entre bloques dentro del recorrido.

**3. Nomenclatura por bloque + unidad.**
Código recomendado: **BLOQUE + UNIDAD** (por ejemplo `B1-U03`, `B4-U12`). Tiene que ser consistente entre el plano de implantación, las plantas de cada bloque y la planilla comercial.

**4. Plantas y renders por tipología dentro de cada bloque.**
Si distintos bloques tienen distintas tipologías (algo habitual: bloques con unidades de 1, 2 y 3 dormitorios mezclados), aclarar qué tipología corresponde a qué unidad de qué bloque — esto define cuántas plantas y panorámicas interiores hace falta producir (no es "una por bloque" sino "una por tipología", igual que en el edificio).

**5. Estado de avance por bloque (si aplica).**
Si los bloques se construyen en etapas distintas (por ejemplo, bloques 1 y 2 con obra iniciada y bloques 3 a 5 aún en pozo), indicarlo — define si el material sale de render (pozo) o de foto/cámara 360 real (obra iniciada), pudiendo convivir ambos orígenes dentro del mismo recorrido.

### Qué pierde relevancia en un complejo
- Selector de piso tipo edificio: se reemplaza por selector de bloque.
- GeoJSON de mensura de lotes individuales: no suele aplicar salvo que cada unidad tenga parcela propia (consultarlo puntualmente).

---

## Tabla comparativa rápida

| Ítem | Loteo | Edificio | Complejo |
|---|---|---|---|
| GeoJSON de mensura | Crítico | No aplica | Rara vez |
| Ortofoto / drone del predio | Crítico | Opcional | Recomendado |
| Corte topográfico | Opcional | No aplica | Crítico si hay desnivel |
| Plantas por piso | No aplica | Crítico | No aplica |
| Plantas por bloque | No aplica | No aplica | Crítico |
| Nomenclatura de unidad | N° de lote | Piso + unidad | Bloque + unidad |
| Panorámica interior | Solo si venden vivienda tipo | Una por tipología | Una por tipología y bloque |
| Etapas | Por manzana/sección | Rara vez | Por bloque |
