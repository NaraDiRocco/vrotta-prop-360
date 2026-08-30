> **DOCUMENTO INTERNO — no enviar al cliente.**
> Uso: guía para quien lidere la reunión de arranque de cada proyecto. El objetivo es que ninguna de estas preguntas quede sin respuesta antes de empezar a producir — cada una evita un tipo específico de sorpresa a mitad de camino. Tomar nota de las respuestas y volcarlas al brief del proyecto.

# Guion — Reunión de kickoff

## 0. Antes de la reunión
- [ ] Confirmar qué tipo de proyecto es (loteo / edificio / complejo) — si no está claro, es la primera pregunta.
- [ ] Tener a mano el Brief Maestro y la variante correspondiente ya enviados, para repasar juntos qué falta.

## 1. Alcance y etapas del proyecto
- ¿El proyecto tiene **etapas o lanzamientos escalonados** (manzanas, bloques, torres)? ¿Cuáles están habilitadas para mostrarse desde el lanzamiento del recorrido y cuáles quedan como "próximamente"?
- ¿Hay unidades que **todavía no están definidas** (planos no cerrados, tipologías en revisión)? Si las hay, ¿se muestran como "a confirmar" o se excluyen del recorrido hasta que estén listas?
- ¿Cuál es la **fecha objetivo de lanzamiento** del recorrido? ¿Está atada a un evento comercial (feria, lanzamiento de ventas, apertura de sala de ventas)?

## 2. Precios y condiciones comerciales
- ¿Los **precios se muestran públicamente** en el recorrido, o quedan solo para uso interno del equipo comercial?
- Si se muestran: ¿en qué **moneda**? ¿Los precios **incluyen o excluyen** impuestos/gastos de escrituración?
- ¿Hay **condiciones de financiación** que se deban mostrar (plan de pagos, anticipo, cuotas)? ¿Cambian según unidad o son generales del proyecto?
- ¿Los precios van a **cambiar con frecuencia**? Si sí, ¿quién nos los actualiza y con qué periodicidad?

## 3. Gobernanza del estado comercial
- ¿**Quién autoriza** el cambio de estado de una unidad (disponible → reservado → vendido)? ¿Una persona, un equipo, o se automatiza desde el CRM?
- ¿Con qué **rapidez** necesita reflejarse un cambio de estado en el recorrido público (en tiempo real, una vez al día, una vez por semana)?
- ¿Qué pasa si dos vendedores marcan la misma unidad casi al mismo tiempo? ¿Hay un proceso de reserva formal (seña) antes de marcar "reservado"?

## 4. Sistemas y proveedores existentes
- ¿Tienen un **CRM** en uso (Salesforce, HubSpot, uno propio)? ¿Necesitamos integrar el estado comercial con ese sistema, o la carga va a ser manual de nuestro lado?
- ¿Quién es el **estudio de arquitectura** a cargo del proyecto? ¿Tienen los planos en digital y quién los provee?
- ¿Ya tienen un **estudio de renders/renderista** contratado, o lo coordinamos nosotros? Si ya existe, pedir contacto directo — ahorra intermediación para pedir ajustes técnicos.
- ¿Quién administra la **base de leads/consultas** que genera el recorrido? ¿A qué mail o sistema tienen que llegar los contactos que se generen desde la pieza?

## 5. Dominio y publicación
- ¿El **dominio** donde va a vivir el recorrido lo maneja el cliente o nosotros? Si lo maneja el cliente, ¿quién tiene acceso al DNS para apuntar el subdominio?
- ¿El recorrido va a estar **embebido** en un sitio existente del cliente, o va a ser una pieza standalone con su propio link?
- ¿Hay **restricciones de acceso** (solo para clientes con usuario, solo para el equipo comercial, público abierto)?

## 6. Material disponible — repaso rápido
- Repasar ítem por ítem el Brief Maestro y tildar qué está **listo**, qué está **en proceso** y qué **no existe todavía**.
- Para cada ítem faltante: ¿quién es el responsable de conseguirlo (cliente, estudio de arquitectura, renderista, nosotros) y para cuándo?
- Específicamente confirmar: **¿existe mensura digital (GeoJSON/Shapefile)** si es un loteo? Preguntarlo explícitamente al cliente, no asumir que no existe — muchas veces el agrimensor lo tiene y no circuló.
- Específicamente confirmar: **¿el brochure fue armado en Illustrator o InDesign?** Si es así, pedir el archivo fuente — se pueden extraer los planos vectoriales con `pdftocairo` en vez de redibujarlos.

## 7. Aspectos legales
- ¿Qué **disclaimers obligatorios** tiene que llevar el material (imágenes ilustrativas, superficies sujetas a aprobación municipal, u otros según jurisdicción)? ¿Quién los provee — legales del cliente, la inmobiliaria?
- ¿Hay algún dato que **no se pueda mostrar públicamente** por motivos legales o de competencia (por ejemplo, cantidad de unidades vendidas)?

## 8. Identidad y tono
- ¿Tienen **manual de marca**? Si no, ¿quién define la paleta y tipografía a usar?
- ¿Los **textos y copy** los provee el cliente o los redactamos nosotros en base al brochure? Si los redactamos nosotros, ¿quién los aprueba antes de publicar?

## 9. Cierre de la reunión
- [ ] Resumir en voz alta la lista de pendientes con responsable y fecha, y confirmarla con el cliente antes de cerrar.
- [ ] Enviar por escrito (mail) el resumen de acuerdos — sirve como registro y evita reclamos de "no quedó claro" más adelante.
- [ ] Agendar el próximo checkpoint (revisión de material recibido, o nueva reunión si falta demasiado material para arrancar).
