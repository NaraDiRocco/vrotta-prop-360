# Escalera de niveles de material disponible

> Guía interna. Sirve para diagnosticar rápido, en la primera llamada con un cliente nuevo, qué tan lejos está de un recorrido 360° completo — y para cotizar en consecuencia.

## Cómo usar esto

Ningún cliente llega con todo. La pregunta útil no es "¿tenés material o no?" sino **"¿en qué escalón estás, y qué te separa del siguiente?"**. Cada nivel de esta escalera es acumulativo: para estar en el Nivel 3 hace falta tener también lo del Nivel 0, 1 y 2.

Los precios de esta tabla son **de referencia interna**, en USD equivalente, para un proyecto de porte medio (edificio o complejo de 20-80 unidades). Ajustar según tamaño real del proyecto — un loteo de 500 lotes o un edificio de 8 unidades no entran en el mismo número.

---

## Nivel 0 — Solo brochure y plano

**Qué material hay:** brochure comercial en PDF (aunque sea de baja resolución) y algún plano general, aunque no sea vectorial.

**Qué experiencia se puede entregar:** masterplan interactivo 2D con unidades clickeables y ficha comercial básica (superficie, tipología, estado). Sin navegación 3D ni panorámicas — es un mapa, no un recorrido.

**Trabajo nuestro:** redibujar los polígonos de unidades sobre la imagen del plano si no viene vectorial, armar la base de datos comercial, diseñar las fichas. Es el nivel de **menor esfuerzo de producción** porque no depende de terceros (renderista, fotógrafo, drone) — todo el trabajo es interno.

**Qué cobrar [Estimado]:** el producto más económico del catálogo. Referencia: **USD 800-1.500** para un proyecto de porte medio, dependiendo de cantidad de unidades a cargar.

---

## Nivel 1 — + Renders exteriores

**Qué material hay:** todo lo del Nivel 0, más al menos 3-5 renders de exterior en buena resolución (mínimo 3000px recomendado — ver `01-CLIENTE/1-Brief-Maestro-de-Material.md`).

**Qué experiencia se puede entregar:** todo lo del Nivel 0, más una galería de imágenes, hotspots informativos sobre el masterplan (ej. "acá va la pileta", con foto de referencia), y un video de intro tipo slideshow armado con los renders existentes (no un video narrativo nuevo, sino una edición de lo que ya hay).

**Trabajo nuestro:** curaduría y edición de las imágenes existentes, integración de la galería, armado del video de intro. Sigue sin depender de producción nueva de terceros.

**Qué cobrar [Estimado]:** **USD 1.500-2.800**, sumando la galería y el video de intro al paquete del Nivel 0.

---

## Nivel 2 — + Panorámicas de render (interiores y amenities)

**Qué material hay:** todo lo anterior, más panorámicas 360° equirectangulares generadas por el estudio de renders a partir del modelo 3D (ver especificación técnica en `01-CLIENTE/3`).

**Qué experiencia se puede entregar:** recorrido 360° real navegable por los amenities y por al menos una unidad tipo de cada tipología — el producto empieza a ser "el recorrido 360°" propiamente dicho, no solo un mapa con fotos.

**Trabajo nuestro:** integración de las panorámicas al visor, armado de hotspots de navegación entre puntos, conexión con el masterplan. Acá **empieza la dependencia de un tercero** (el renderista) — si el material que llega no cumple la spec técnica (horizonte torcido, resolución baja, relación de aspecto mal), hay que devolverlo y esperar una nueva entrega, lo que puede sumar días o semanas fuera de nuestro control.

**Qué cobrar [Estimado]:** **USD 3.500-6.000**, dependiendo de la cantidad de puntos 360° a integrar (esto es integración nuestra — el costo de producir las panorámicas en sí, si el cliente no lo tiene y hay que encargarlo, es aparte y depende del renderista, ver documento 1).

---

## Nivel 3 — + Drone del terreno

**Qué material hay:** todo lo anterior, más una toma aérea real del terreno (foto o video de drone, no render).

**Qué experiencia se puede entregar:** una vista aérea real integrada al recorrido — el momento "esta va a ser tu vista" con contexto real del entorno (mar, sierra, ciudad), que ningún render por sí solo transmite con la misma credibilidad porque el usuario sabe que es una foto real, no una ilustración.

**Trabajo nuestro:** integración de la toma aérea como punto de partida o cierre del recorrido, eventualmente como fondo del masterplan en vez de una imagen satelital genérica.

**Qué cobrar [Estimado]:** **+USD 500-1.000** sobre el Nivel 2, más el costo del vuelo de drone si hay que coordinarlo (ver documento 1, sección 3).

---

## Nivel 4 — Obra terminada: fotografía 360° real

**Qué material hay:** unidades y amenities construidos y accesibles físicamente.

**Qué experiencia se puede entregar:** el recorrido completo con fotografía 360° real en vez de renders — máxima credibilidad posible, porque ya no hay "esto es una ilustración" de por medio. Es también el momento de reemplazar progresivamente las panorámicas de render por las reales, unidad por unidad, a medida que se van entregando.

**Trabajo nuestro:** coordinación de la sesión de fotografía/escaneo (fotógrafo 360 o Matterport, ver documento 1), integración, y eventualmente migración del recorrido de "modo pozo" a "modo obra terminada" sin perder los datos comerciales ya cargados.

**Qué cobrar [Estimado]:** depende mucho del alcance — desde una actualización parcial (**+USD 800-1.500**, reemplazando solo amenities y unidades modelo) hasta un rehecho completo del recorrido con fotografía real de todas las unidades vendidas (cotización aparte, escala con la cantidad de unidades).

---

## Dónde está Baleia hoy

Con el material disponible — brochure PDF de 37 páginas vectorial, 5 renders de exterior a 1920px, plantas por unidad, masterplan — **Baleia está en el Nivel 1, con una salvedad**: los renders existentes están a 1920px, por debajo del mínimo recomendado (3000px) para verse bien en galería a pantalla completa o impresos. Funcionalmente entra en Nivel 1, pero con una advertencia de calidad para la galería.

**No hay panorámicas 360°, ni fotos de obra, ni modelo 3D en nuestras manos** — por eso no se puede saltar directo a Nivel 2 sin antes conseguir uno de estos dos caminos:

1. **Conseguir el modelo 3D** del estudio que hizo los renders (lo más rápido y barato: ya existe, solo hay que pedirlo y que exporten panorámicas nuevas — ver `01-CLIENTE/3`).
2. Si el modelo 3D no está disponible o el estudio no puede volver a intervenir, **encargar panorámicas nuevas** a otro renderista, lo que implica remodelar desde los planos (más lento y más caro — ver documento 1, sección 4, "Modelado 3D").

**Qué haría falta para subir a Nivel 2:** contactar al estudio de arquitectura/renders de Baleia y pedir el archivo del modelo 3D (o, si no quieren cederlo, pedirles directamente que generen 6-10 panorámicas siguiendo la especificación técnica: aérea del conjunto, acceso, cada amenity, y al menos un ambiente principal por tipología de unidad). Ver el caso práctico completo en `6-Caso-Practico-Baleia.md`.

**Camino a Nivel 3:** un vuelo de drone sobre el predio en Punta Ballena es contratable ya mismo, independientemente de que se consiga o no el modelo 3D — no depende del estudio de arquitectura. Es la mejora más rápida y más barata disponible hoy si se quiere sumar algo antes de resolver el Nivel 2.
