# Quién produce cada cosa, con qué herramienta y cuánto cuesta

> Guía interna. No es para enviar al cliente. Es la referencia para cuando alguien del equipo tiene que salir a contratar un perfil que no conoce, o cotizar un servicio nuevo.
>
> **Aclaración sobre los precios:** el mercado de renders y de servicios audiovisuales en Argentina se mueve en pesos con inflación alta y en Uruguay con dólares como referencia informal. Todo lo que sigue está marcado como **[Verificado con fuente]** cuando viene de una búsqueda con dato concreto, o **[Estimado]** cuando es una inferencia razonable a partir de rangos internacionales o de datos parciales. Antes de cotizarle un precio final a un cliente, siempre repreguntar a 2-3 proveedores — los rangos de acá son para no salir a ciegas, no para copiar y pegar en un presupuesto.

---

## 1. Panorámicas 360° generadas por render (proyecto en pozo)

**Quién lo hace:** un **renderista** o **estudio de visualización arquitectónica** (en inglés, *archviz artist* / *3D visualization studio*). No es una profesión matriculada — no hace falta ser arquitecto, aunque muchos renderistas lo son o trabajan adentro de un estudio de arquitectura. El perfil típico es un diseñador con formación en 3D (industrial, gráfico, o arquitecto) especializado en modelado y render fotorrealista.

**Cómo se llama el servicio en el mercado:** "render arquitectónico", "visualización 3D arquitectónica", "archviz", "renders 360° / panorámicas VR".

**Dónde se los encuentra:**
- **Estudios establecidos**, generalmente recomendados por el propio estudio de arquitectura del proyecto (la vía más rápida: preguntarle al arquitecto quién les hace los renders).
- **Plataformas freelance**: [Workana](https://www.workana.com/en/freelancers/argentina/3d-rendering) (fuerte en Argentina/LATAM), Freelancer.com, Upwork (más internacional, precios en USD).
- **Comunidades especializadas de archviz**: [CGarchitect / CGConnect](https://www.cgarchitect.com/) (portfolio + job board, la referencia internacional del rubro), [Ronen Bekerman](https://www.ronenbekerman.com/) (blog/comunidad con listado de artistas), [CG Award](https://cgaward.com/) (club + job board).
- Portfolios en Behance / ArtStation buscando "archviz" o "architectural rendering".

**Software estándar (lo que vas a ver en cualquier estudio):**
| Software | Uso |
|---|---|
| 3ds Max + V-Ray o Corona Renderer | El combo más usado en estudios profesionales de LATAM y España para calidad fotorrealista alta. |
| SketchUp + V-Ray o Enscape | Muy común en estudios de arquitectura chicos/medianos — SketchUp es el modelador, Enscape es real-time (rápido, algo menos fotorrealista). |
| Blender + Cycles | Gratuito, cada vez más adoptado, calidad equivalente a 3ds Max/V-Ray. |
| Twinmotion / Lumion | Motores real-time pensados para exportar panorámicas 360° rápido — son los que ya cubre el documento técnico de este repo (`01-CLIENTE/3-Especificacion-Tecnica-para-Estudio-de-Renders.md`). |
| Unreal Engine | Usado por estudios más grandes para visualización en tiempo real / recorridos interactivos propios. |

**Qué pedirle exactamente:** reenviar tal cual `docs/01-CLIENTE/3-Especificacion-Tecnica-para-Estudio-de-Renders.md` — ya está armado con la spec de resolución, formato y nomenclatura. Lo único que agrega este documento: **preguntar primero qué software usan**, porque el paso de exportación a equirectangular cambia según el motor (está cubierto para Blender/Twinmotion/Lumion en ese documento; si usan V-Ray/3ds Max o Corona, pedirles específicamente una "cámara VR spherical / panorámica 360° equirectangular", que es una opción estándar en ambos motores).

**Precios [Estimado, con datos parciales verificados]:**
- Un render fijo (exterior o interior) de calidad media-alta en Argentina ronda entre **$800 y $2.000 USD equivalente** en estudios de nivel medio, y **$2.500-$6.000 USD** en estudios premium — son rangos internacionales/regionales, no específicos de Argentina ([maverickframe.com](https://maverickframe.com/blog/3d-rendering-pricing/), [lookrender.com](https://lookrender.com/cuanto-cuesta-un-render-3d-arquitectura-precios-2026/)).
- En España, el rango estándar para una imagen fija (interior o exterior, con 1-2 rondas de corrección) es **290-420 €** ([lookrender.com](https://lookrender.com/cuanto-cuesta-un-render-3d-arquitectura-precios-2026/)).
- En Argentina, con dato específico pero de 2024 (**tomarlo solo como referencia de proporción, no de monto — reajustar por inflación antes de usar**): un render 360° individual costaba del orden de **$40.000 ARS**, y combinar un render fijo + su versión 360° del mismo punto de vista sumaba un 50% sobre el valor del render fijo ([dprenders.com](https://www.dprenders.com/l/tarifas-actualizadas-tendencias/)).
- Freelancers en plataformas internacionales (Upwork): **USD 300-600 por interior**, **USD 75-900 por imagen** según complejidad ([maverickframe.com](https://maverickframe.com/blog/3d-rendering-pricing/)).
- **Regla práctica para cotizar:** una panorámica 360° sale entre 30% y 60% más cara que el mismo punto de vista en render fijo, porque exige modelar detrás de cámara (lo que en un render fijo se puede recortar del encuadre, en 360° siempre está a la vista).

---

## 2. Fotografía y escaneo 360° real (obra construida o terreno accesible)

**Quién lo hace:** un **fotógrafo inmobiliario especializado en 360°**, a veces certificado como **Matterport Service Partner**. Es un perfil de fotografía profesional, no de arquitectura — muchos vienen de fotografía de eventos o de producto y se especializaron en real estate.

**Cómo se llama el servicio:** "tour virtual 360°", "fotografía inmobiliaria HDR + 360°", "escaneo 3D" (cuando es con Matterport, que además genera planta y medidas).

**Dónde se los encuentra:**
- Directorio oficial de **Matterport Service Partners** (matterport.com) — filtra por ciudad.
- Estudios locales encontrados en la búsqueda: en Buenos Aires, [Real Estate 360](https://www.realestate360.com.ar/), [Delta Force Vision](https://deltaforcevision.com/), [Estudio3R](https://en.estudio3r.com/fotografia-inmobiliaria), [Spot360](https://www.spot360.com.ar/matterport/), [en360.com.ar](https://en360.com.ar/), [STUDIO360](https://studio360.com.ar/); en Montevideo/Uruguay, [FOTOPROP.UY](https://fotoprop.uy/), [Fotografía 360 Uruguay](https://fotografia360uruguay.com/).
- Grupos de Facebook/Instagram de fotografía inmobiliaria (búsqueda directa por ciudad suele dar resultados más frescos que Google).

**Equipo y software:**
| Equipo | Uso | Costo aproximado del hardware |
|---|---|---|
| **Matterport Pro3** | Escaneo 3D + planta + panorámicas navegables en un solo dispositivo. El estándar "todo en uno" del rubro. | Cámara sola: **USD 5.995**. Kit con batería/soporte (Performance Kit): **USD 6.595**. Bundle completo de captura: **≈USD 8.995** ([sofabrain.com](https://sofabrain.com/learn/matterport-pricing/), [scanmanifold.com](https://www.scanmanifold.com/blog-posts/matterport-pricing-2026-contractors)). Suscripción de software: plan Starter ≈USD 10/mes (5 espacios activos), Professional ≈USD 69/mes (25 espacios), Business/Enterprise desde USD 309/mes, más hosting ≈USD 20/mes por espacio activo ([sofabrain.com](https://sofabrain.com/learn/matterport-pricing/)). |
| **Insta360 Pro2 / Titan** | Cámaras 360° de gama alta con múltiples lentes, usadas para VR profesional en vez de Matterport cuando se prioriza calidad de imagen sobre el modelo 3D/planta. | Pro2 ronda **USD 5.000** [Estimado, un solo dato de reseña de usuario]; Titan no tiene precio público confirmado en la búsqueda — consultar directo en insta360.com. |
| **Insta360 X4 / Ricoh Theta** | Cámaras 360° de gama consumer/prosumer, usadas por fotógrafos independientes con trípode nodal para producir HDR 360° manual (varias exposiciones fusionadas). | Gama de entrada, del orden de **USD 400-500** — sin precio puntual confirmado para Argentina en la búsqueda, consultar Mercado Libre / tiendas oficiales. |

**Qué pedirle exactamente:**
- Si trabaja con **Matterport**: pedir explícitamente la **exportación de vistas individuales como imagen equirectangular** (Matterport permite exportar "Views" panorámicas desde el Showcase) además del link del tour — el link solo no sirve para integrarlo a un recorrido propio.
- Si trabaja con **cámara 360° directa** (Insta360, Ricoh Theta): pedir el archivo nativo equirectangular 2:1, **no** el link a la app/nube del fabricante. Mismos criterios de horizonte nivelado y sin postproducción que rompa costura que en la spec de render (`01-CLIENTE/3`).
- En ambos casos, coordinar de antemano **qué puntos fotografiar** (mismo criterio que la sección 6 de la especificación técnica de render: aéreo, acceso, cada amenity, cada ambiente principal por tipología) — si no se define antes, el fotógrafo cobra por sesión y puede no volver a sacar una toma olvidada sin cargo extra.

**Precios [Estimado a partir de un solo dato verificado]:**
- Buenos Aires: sesión de fotografía inmobiliaria (HDR + 360°, según metraje) **desde $35.000 ARS**, variable según tamaño de la propiedad y si incluye drone ([Delta Force Vision, vía búsqueda](https://deltaforcevision.com/)) — dato puntual de un solo proveedor, no representa el mercado completo.
- No se encontraron tarifas públicas específicas para Montevideo/Punta del Este — los estudios locales (FOTOPROP.UY, Fotografía 360 Uruguay) cotizan a medida; contactar directo.

---

## 3. Video y foto aérea con drone

**Quién lo hace:** un **piloto de drone certificado**, a veces integrado a un estudio de fotografía/video, a veces freelance independiente.

**Cómo se llama el servicio:** "filmación aérea", "relevamiento con drone", "video institucional con drone", "toma aérea inmobiliaria".

**Dónde se los encuentra:** [droneros.com.ar](https://www.droneros.com.ar/) (marketplace de servicios de drone en Argentina, con publicaciones específicas para inmobiliarias), [Alugo](https://alugo.com.ar/), [Lisual](https://lisual.com/servicio-de-filmacion-con-drones/), [dazzdrones](https://web.dazzdrones.com/) (opera en Argentina y Uruguay, pilotos certificados), [Otero.uy](https://www.otero.uy/alquiler-de-drones/) (Uruguay), y la **Asociación Uruguaya de Drones (AUD)** como gremio de referencia en Uruguay.

**Marco regulatorio (importante antes de contratar o de producir en casa):**
- **Argentina (ANAC):** desde 2025/2026 rige la Parte 100 de las RAAC. Categoría abierta (drones de 250 g a 25 kg, la inmensa mayoría de uso comercial chico) **no requiere licencia de piloto**, pero sí un **registro digital gratuito del equipo y del operador** ante ANAC ([argentina.gob.ar/anac](https://www.argentina.gob.ar/anac/vant-svant/registro-de-vant-svant)). Categoría específica (más de 25 kg o usos de mayor riesgo) sí exige licencia.
- **Uruguay (DINACIA):** drones "menores" (hasta 25 kg) no requieren registro ni licencia; drones "medianos" (25-260 kg, prácticamente no aplica a equipos fotográficos comerciales estándar) sí requieren inscripción y el **Permiso de Operador DAOD** (examen teórico + prueba práctica) ([cfs.uy](https://cfs.uy/piloto-de-drones-profesional-como-obtener-el-permiso-daod-en-uruguay/), [aud.org.uy](http://www.aud.org.uy/2017/04/21/como-btener-el-carne-de-operador-rpa/)). En la práctica, casi todo equipo fotográfico comercial (DJI Air/Mavic) entra en "menores" y no necesita licencia — igual conviene verificar el peso exacto del modelo contra la resolución vigente.

**Software/equipo:**
| Equipo | Uso | Precio oficial (USD, lista DJI) |
|---|---|---|
| DJI Air 3S | Drone de gama media, doble cámara, el más usado para trabajo inmobiliario chico/mediano. | **USD 1.099** el combo estándar, hasta ≈USD 1.599 el Fly More Combo ([djiusa.com](https://www.djiusa.com/products/dji-air-3s-rcn3), [dronedj.com](https://dronedj.com/2026/06/23/dji-air-3s-prime-day/)) |
| DJI Mavic 3 Pro | Gama alta, triple cámara, mejor calidad de imagen y autonomía — el estándar para trabajo profesional/cinematográfico. | **USD 2.199** con control DJI RC, hasta **USD 4.799** el Cine Premium Combo ([dji.com](https://www.dji.com/mavic-3-pro/specs), vía búsqueda) |
| Modo "Sphere Panorama" nativo del propio drone (DJI) | Genera una panorámica 360° por stitching automático de varias fotos — no reemplaza una cámara 360° dedicada en calidad, pero es gratis y ya viene en el firmware. | — |

**Qué pedirle exactamente:** fotos en RAW (no solo JPG comprimido), video en 4K, y si el drone lo soporta, **la foto "Sphere Panorama" nativa además de las tomas individuales** — es la forma más barata de conseguir una panorámica aérea 360° sin contratar una cámara 360° aparte. Pedir también las coordenadas GPS de cada punto de toma (la mayoría de los drones las graba en el EXIF automáticamente).

**Precios [Estimado, un solo proveedor verificado]:**
- Argentina: día de filmación (4 baterías, ≈2 horas de vuelo efectivo) incluyendo traslados, del orden de **$180.000 ARS**; trabajos puntuales para desarrollos inmobiliarios o piezas de marketing, **$45.000-$85.000 ARS** ([vía búsqueda, droneros/servicios similares](https://www.droneros.com.ar/)) — cifras de 2025, **reajustar por inflación antes de cotizar**.
- Uruguay: no se encontraron tarifas públicas — Otero.uy y dazzdrones cotizan a medida.

---

## 4. Modelado 3D (cuando no hay modelo y hace falta generarlo desde cero)

**Quién lo hace:** el mismo perfil de renderista/estudio de visualización de la sección 1 — el modelado es la etapa previa al render, no un rubro aparte, pero se cotiza por separado porque es la parte que más tiempo consume.

**Insumo que necesita:** planos en CAD (DWG idealmente, PDF vectorial como mínimo) con cotas. Sin esto, el estudio primero tiene que redibujar el proyecto, lo que suma presupuesto y tiempo antes de siquiera empezar a modelar.

**Tiempo:** ver sección 6 de este mismo documento y la escalera de niveles — modelar desde cero para un complejo mediano típicamente suma **semanas**, no días.

---

## Resumen rápido — a quién llamar según lo que falta

| Falta esto... | Contactás a... | Buscalo como... |
|---|---|---|
| Panorámicas 360° y el proyecto está en pozo | Renderista / estudio de archviz | "render arquitectónico 360", en Workana/CGarchitect |
| Panorámicas 360° y hay obra u terreno accesible | Fotógrafo 360 / Matterport Service Partner | "tour virtual 360 inmobiliario" |
| Vista aérea del terreno o del conjunto | Piloto de drone certificado | "filmación aérea inmobiliaria" |
| Modelo 3D (no existe ni siquiera para renders fijos) | Mismo renderista, cotizado como etapa de modelado | — |
