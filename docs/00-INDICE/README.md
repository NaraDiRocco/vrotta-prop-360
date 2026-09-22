# Brief estándar de material — Recorrido 360° inmobiliario

Set de documentos operativos para el arranque de cualquier proyecto de recorrido 360° interactivo (loteos, edificios, complejos).

## 01-CLIENTE — para copiar y enviar tal cual

| Archivo | Uso |
|---|---|
| `1-Brief-Maestro-de-Material.md` | Pedido general de material, organizado por categorías. Se envía a todo cliente nuevo. |
| `2-Variantes-por-Tipo-de-Proyecto.md` | Complemento del brief maestro. Enviar solo la sección (A/B/C) que corresponde al proyecto del cliente. |
| `3-Especificacion-Tecnica-para-Estudio-de-Renders.md` | Reenviar tal cual al arquitecto/renderista que va a generar las panorámicas 360°. |
| `4-Plantilla-Listado-de-Unidades.md` | Explica la planilla comercial. Enviar junto con el CSV en blanco de `03-PLANTILLAS-CSV`. |

## 02-INTERNO — uso exclusivo del equipo, no enviar al cliente

| Archivo | Uso |
|---|---|
| `1-Checklist-de-Recepcion-de-Material.md` | Se usa al recibir cualquier entrega, antes de arrancar producción. |
| `2-Guion-Reunion-de-Kickoff.md` | Guía de preguntas para la primera reunión con cada cliente nuevo. |

## 03-PLANTILLAS-CSV — planillas listas para usar

| Archivo | Uso |
|---|---|
| `plantilla-en-blanco.csv` | Se envía al cliente para que cargue sus datos. |
| `ejemplo-loteo.csv` / `ejemplo-edificio.csv` / `ejemplo-complejo.csv` | Ejemplos de referencia, uno por tipo de proyecto — se pueden adjuntar junto con la planilla en blanco para que el cliente vea el formato esperado. |

## Flujo de uso sugerido

1. Cliente nuevo confirma tipo de proyecto → reunión de kickoff (`02-INTERNO/2`).
2. Se envían `01-CLIENTE/1`, `01-CLIENTE/2` (sección correspondiente) y `01-CLIENTE/4` + CSV en blanco.
3. Si el cliente ya tiene renderista, se reenvía `01-CLIENTE/3` a ese estudio.
4. A medida que llega material, se corre `02-INTERNO/1` antes de aceptarlo en producción.

## Fuera de este índice

Este índice cubre sólo el set operativo `01-CLIENTE` a `03-PLANTILLAS-CSV`
(el brief genérico, reusable con cualquier cliente nuevo). El resto de
`docs/` son carpetas posteriores, cada una con su propio alcance y su propio
`README.md` cuando corresponde:

- `04-PRODUCCION/` — costos, niveles de material y el caso práctico de
  Baleia.
- `05-DISENO/` — plan de rediseño del panel.
- `06-BENCHMARK/` — comparación contra la competencia y plan de experiencia.
- `07-BALEIA-360/` — el paquete concreto para conseguir las panorámicas de
  Baleia (específico de este cliente, no genérico como `01`-`03`).
- `08-MATERIAL-REAL/`, `09-MODELO-3D/` — material de obra y del modelo 3D,
  también específicos de Baleia.

## Pendiente de definir (marcado explícitamente, no asumido)

- Estado comercial intermedio más allá de disponible/reservado/vendido: no está contemplado por defecto; si un cliente lo pide, definirlo antes de cargar su planilla (ver nota en `01-CLIENTE/4`).
- Integración directa con CRMs de terceros (Salesforce, HubSpot): no cubierta en este set de documentos — depende de cada proyecto y se evalúa en la reunión de kickoff (pregunta en `02-INTERNO/2`, sección 4).
