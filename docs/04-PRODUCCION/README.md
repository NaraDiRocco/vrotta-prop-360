# Producción de contenido — guía práctica

Set de documentos internos sobre el **lado humano y comercial** de la producción de un recorrido 360° inmobiliario: quién hace cada pieza, con qué herramienta, cuánto cuesta, y qué hacer cuando el cliente no tiene material.

Esto es distinto del manual técnico de este repositorio (proyección equirectangular, cubemaps, tiling, pipeline de renderizado) — acá no hay especificaciones de imagen, hay proveedores, precios y decisiones de negocio.

> Fecha de referencia: agosto 2026. Los precios de mercado (renders, fotografía, drone, equipos) cambian rápido, sobre todo en Argentina por inflación. Cada dato de precio está marcado como **[Verificado con fuente]** o **[Estimado]** — repreguntar a proveedores antes de cotizar en firme.

## Documentos

| Archivo | Responde |
|---|---|
| `1-Quien-Hace-Que-y-Cuanto-Cuesta.md` | Para cada pieza (panorámicas de render, fotografía 360° real, drone, modelado 3D): qué perfil profesional la produce, cómo se llama el servicio en el mercado, dónde se encuentra, qué software usa, qué pedirle exactamente, y rangos de precio. |
| `2-Escalera-de-Niveles-de-Material.md` | Niveles de experiencia posibles según el material que trae el cliente, del más pobre (solo brochure y plano) al más rico (obra terminada con fotografía 360° real). Incluye en qué nivel está Baleia hoy. |
| `3-Minimo-Indispensable.md` | Qué es imprescindible, deseable y lujo para que exista un producto vendible — distinto de lo "obligatorio" del Brief Maestro, que apunta al recorrido 360° completo. |
| `4-Guion-Para-Destapar-Material.md` | Las 10 preguntas, en orden, para revelar material que el cliente no sabe que tiene (empieza por "¿quién les hizo el brochure?"). |
| `5-Producir-vs-Tercerizar.md` | Cálculo de punto de equilibrio para decidir si conviene comprar equipo propio (drone, cámara 360°) o tercerizar cada sesión, rubro por rubro. |
| `6-Caso-Practico-Baleia.md` | Aplicación concreta al proyecto Baleia: qué pedirle al estudio de arquitectura y a Dacal, en qué orden, con mails tipo, y qué se puede entregar mientras se espera respuesta. |

## Cómo se relaciona con el resto de `docs/`

- **`00-INDICE`**: índice del set de documentos orientado al brief de material que se envía al cliente.
- **`01-CLIENTE`**: documentos para copiar y enviar tal cual — el Brief Maestro (`1`), sus variantes por tipo de proyecto (`2`), la especificación técnica para el estudio de renders (`3`, referenciada varias veces en esta carpeta) y la plantilla de listado de unidades (`4`).
- **`02-INTERNO`**: checklist de recepción de material y guion de la reunión de kickoff — `04-PRODUCCION/4-Guion-Para-Destapar-Material.md` es un complemento específico de ese guion, no un reemplazo.
- **`03-PLANTILLAS-CSV`**: planillas de datos comerciales.
- **`04-PRODUCCION`** (esta carpeta): a diferencia de las anteriores, no son documentos para enviar al cliente — son referencia interna del equipo para decidir a quién contratar, cuánto cobrar y cómo levantar un proyecto que llega con poco material.

## Flujo de uso sugerido

1. Primera llamada o reunión con un cliente nuevo → correr el guion de destape (`4`) además del guion de kickoff (`02-INTERNO/2`).
2. Con las respuestas, ubicar al cliente en la escalera de niveles (`2`) y confirmar que cumple al menos el mínimo indispensable (`3`).
3. Cotizar según el nivel actual y el salto de nivel que el cliente quiera pagar.
4. Si hace falta contratar un proveedor externo (renderista, fotógrafo 360°, piloto de drone), consultar el documento 1 para saber a quién buscar, con qué herramienta y en qué rango de precio.
5. Si la duda es si conviene comprar equipo propio en vez de seguir tercerizando, consultar el documento 5.

## Pendiente de definir (marcado explícitamente, no asumido)

- No hay tarifas públicas verificadas de fotografía 360°/drone específicas para Montevideo o Punta del Este — los estudios locales cotizan a medida, hay que contactarlos directo antes de prometer un precio a un cliente uruguayo.
- Los precios en pesos argentinos citados en el documento 1 y 5 tienen fecha de referencia 2024-2025 en las fuentes encontradas — antes de usarlos en una cotización real, reajustar por inflación o pedir cotización actualizada.
- **Dacal Bienes Raíces** es la **comercializadora** de Baleia (inmobiliaria argentina, La Plata y Puerto Madero), junto con Suevia y Punta Ballena Inmobiliaria — confirmado en la auditoría del sitio del proyecto. No es la desarrolladora ni el estudio de arquitectura: el sitio **no identifica a ninguno de los dos**, y ese es justamente el dato que hay que destapar primero.
