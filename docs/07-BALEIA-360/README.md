# Baleia 360° — el paquete para conseguir las panorámicas

Todo lo necesario para pasar Baleia de **Nivel 1** (masterplan interactivo +
galería de renders, que es lo que hay funcionando hoy) a **Nivel 2**
(recorrido 360° navegable). Está armado para poder actuar mañana, no para
leer.

---

## El primer paso concreto

**Mandarle a Dacal el mail 1 de `3-Mails-Listos-Para-Enviar.md`.** Está listo
para copiar y pegar. Pide tres cosas: quién hizo los renders, autorización
para volar un drone sobre el predio, y si existe material que no entró al
brochure.

Es el primer paso porque **el sitio del proyecto no identifica ni a la
desarrolladora ni al estudio de arquitectura**, y Dacal es el único contacto
que tenemos. Dacal **comercializa**; no construye ni diseña, y probablemente
no tenga autoridad para ceder el modelo 3D — por eso el mail le pide **un
dato, no un archivo**.

**En paralelo, sin esperar respuesta:** pedir tres cotizaciones de vuelo de
drone en Punta Ballena (ver `2-Tres-Caminos.md`, camino c). El terreno existe
aunque el edificio no, y la vista al mar —que es lo que Baleia vende— es real
y fotografiable hoy.

---

## Los documentos

| Archivo | Responde | Para quién |
|---|---|---|
| `1-Lista-de-Tomas.md` | Dónde va cada cámara, a qué altura, hacia dónde mira, qué tiene que verse y por qué importa para vender. 21 tomas en tres niveles (8 / 14 / 20). | Interno |
| `2-Tres-Caminos.md` | Las tres formas de conseguir las panorámicas, con costo, plazo y riesgo de cada una. Incluye la evaluación seria del drone: qué se puede prometer y qué no. | Interno |
| `3-Mails-Listos-Para-Enviar.md` | Los mails a Dacal y al estudio, para copiar y pegar. Más una tabla de qué hacer con cada respuesta posible. | Interno (los mails, para afuera) |
| `4-Especificacion-Tecnica-Baleia.md` | Resolución, formato, orientación de cámara, nomenclatura de archivo, qué NO hacer, checklist previo a la entrega. | **Para reenviar tal cual al renderista** |
| `5-Recepcion-e-Integracion.md` | Cómo se integran las panorámicas cuando lleguen, y el resultado real de la prueba de punta a punta que ya se corrió. | Interno |
| `6-Que-Cambia-en-la-Experiencia.md` | Qué se desbloquea solo, qué hay que construir para aprovecharlas, y qué sigue sin poder hacerse. | Interno |

**Si sólo se va a leer un documento**: el 3 (para actuar) o el 2 (para
decidir).

**El único que sale para afuera es el 4.** El 3 contiene los mails, pero el
documento en sí es interno — se copia el mail, no se manda el archivo.

---

## Estado del sistema: listo para recibirlas

No hay desarrollo pendiente para integrar las panorámicas. El circuito
completo existe y **se probó de punta a punta** con panorámicas sintéticas
generadas por `pano-make-test`:

```bash
cd tools/baleia
../../packages/pipeline/.venv/bin/python scripts/integrate_panoramas.py \
    --in <carpeta-de-la-entrega> --dry-run     # ver el plan
    #  … y sin --dry-run, con --publish, para integrar de verdad
```

El script valida contra la spec (2:1 exacto, ≥ 8192 px), genera los tiles de
cubemap multiresolución, agrega cada panorámica como escena nueva al
`tour.json` y re-enlaza los hotspots del masterplan que corresponden.

**Resultado medido de la prueba:** 6 archivos de entrada → 5 integradas y 1
rechazada correctamente por resolución insuficiente; 126 tiles por
panorámica; **22 segundos** para las 6; **0 errores de consola y 0 requests
de tile fallidas** en el navegador; navegación masterplan → panorámica →
masterplan verificada en los dos sentidos. El detalle está en
`5-Recepcion-e-Integracion.md`. El recorrido quedó exactamente como estaba
antes de la prueba.

**Una cosa que la prueba encontró y no está arreglada:** las escenas de
panorámica entran a la galería **sin miniatura** — es un bug del visor
(deriva la miniatura de `source.url`, que una escena de tiles no tiene), no
del pipeline ni del script. Es una línea de código y está anotado como lo
segundo a construir en el documento 6.

---

## Lo verificado y lo estimado

**Verificado** (contra el brochure, el CSV o una corrida real):

- El terreno tiene más de 15.000 m² y más de 250 m de longitud, en el punto
  más alto del Camino de la Ballena, sobre la falda este.
- **El terreno baja de oeste a este: Bloque 1 es el más alto y Bloque 5 el
  más bajo**, con los amenities en el extremo bajo. Sale del corte
  topográfico de la página 9 del brochure, no de una suposición.
- 20 unidades en 2 tipologías (dúplex y 1 dormitorio), en Bloques 2 y 3, con
  superficies verificadas matemáticamente contra los totales que imprime el
  propio PDF.
- **No hay un solo render de interior** en el material: los 7 son exteriores.
- Todos los números de la prueba de integración.

**Estimado, y hay que tratarlo como tal:**

- Los costos y plazos de los tres caminos. Los rangos de render vienen de
  fuentes internacionales y de datos argentinos de 2024-2025 que hay que
  reajustar; **para Uruguay no hay tarifa pública verificada de drone ni de
  fotografía 360**.
- El peso final de las panorámicas reales (3-5 MB por escena): la medición se
  hizo con panorámicas sintéticas de colores planos, que comprimen mucho
  mejor.
- El desnivel total del terreno (20-30 m): el corte del brochure no está
  acotado.

**No se puede saber hasta hablar con el cliente:**

- **Quién tiene el modelo 3D**, o si existe todavía. Es la incógnita que
  define cuál de los tres caminos es viable, y no hay forma de averiguarla
  sin preguntar.
- **Si los interiores están modelados.** Si no lo están, las 8 tomas de
  interior no son "re-exportar": son modelado nuevo, con otro precio y otro
  plazo. Es la pregunta que más puede mover el presupuesto.
- **En qué software trabaja el estudio.** Define si nos conviene pedir el
  modelo (camino b) o pedirles que exporten ellos (camino a).
- Si hay **restricción de espacio aéreo** por la cercanía del aeropuerto de
  Punta del Este (está a 5 minutos). Hay que preguntárselo al piloto de drone
  antes de contratar.

---

## Una advertencia que no es sobre panorámicas

El `availability.json` de Baleia hoy tiene **estados de demostración
sintéticos**, no reales, y **cero precios** — el brochure no publica stock ni
valores. Un recorrido 360° espectacular con la disponibilidad inventada es
peor producto que un plano con la disponibilidad real.

**Ese dato es más urgente que las panorámicas, y no depende de ningún estudio
de renders:** es una planilla que el equipo comercial de Dacal ya tiene.
Conviene pedirla en la misma conversación.

---

## Relación con el resto de `docs/`

- **`01-CLIENTE/3-Especificacion-Tecnica-para-Estudio-de-Renders.md`** — la
  spec genérica. Para Baleia queda **reemplazada** por el documento 4 de esta
  carpeta, que es la misma con los valores concretos ya decididos.
- **`04-PRODUCCION/2-Escalera-de-Niveles-de-Material.md`** — dónde está
  Baleia hoy (Nivel 1) y qué separa cada escalón.
- **`04-PRODUCCION/6-Caso-Practico-Baleia.md`** — el diagnóstico previo, con
  los mails tipo genéricos. Esta carpeta es su ejecución: los mails de acá
  son los de ese documento, reescritos para mandar sin editar.
- **`04-PRODUCCION/1-Quien-Hace-Que-y-Cuanto-Cuesta.md`** — de dónde salen
  los rangos de precio del documento 2, y los proveedores de drone en Uruguay.
- **`tools/baleia/README.md`** — cómo se extrajo la geometría y el CSV, y la
  lista completa de material que sigue faltando pedirle al cliente.
