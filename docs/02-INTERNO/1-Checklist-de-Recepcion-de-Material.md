> **DOCUMENTO INTERNO — no enviar al cliente.**
> Uso: equipo de producción, antes de dar por "recibido" el material y arrancar cualquier tarea de armado del recorrido. Cada ítem rechazado se comunica al cliente citando el punto exacto del "Brief Maestro" o de la "Especificación técnica para renders" que corresponde, para que la corrección sea rápida y sin ida y vuelta innecesaria.

# Checklist de recepción de material

## 1. Panorámicas 360°

Por cada archivo recibido, verificar:

- [ ] **Relación de aspecto 2:1 exacta.** Abrir propiedades del archivo (no confiar en el nombre ni en lo que diga el proveedor) y confirmar ancho = 2 × alto. Comando rápido: `identify -format "%wx%h\n" archivo.png` (ImageMagick) o revisar en el inspector de la herramienta de edición.
- [ ] **Resolución mínima 8192×4096.** Si está por debajo, rechazar salvo excepción explícita aprobada por el responsable de producción (dejar constancia de por qué se aceptó una excepción).
- [ ] **Formato correcto.** PNG 16-bit o EXR. Si llega en JPG, verificar que no sea el único formato disponible (pedir el original si existe) — el JPG se acepta solo como último recurso, dejando registro.
- [ ] **Horizonte nivelado.** Inspección visual: abrir la imagen en un visor 360° (o al menos revisar que la línea de horizonte quede recta y centrada verticalmente en la imagen plana). Cualquier inclinación visible se rechaza.
- [ ] **Sin costura visible.** Revisar específicamente el borde izquierdo/derecho de la imagen (donde la proyección "da la vuelta") en zoom — buscar salto de color, doble exposición, o corte de un objeto que no continúa del otro lado.
- [ ] **Sin postproceso incompatible.** Viñeteado, blur radial, distorsión de lente: rechazar, pedir reexportación sin esos efectos.
- [ ] **Nombre de archivo con nomenclatura correcta.** Tiene que seguir el patrón `[CODIGO]_[TIPO-VISTA]_[NUMERO]`, y el `[CODIGO]` tiene que existir en el listado de unidades o en el masterplan. Si no matchea con ningún código conocido, marcar para consulta antes de rechazar (puede ser un punto nuevo no informado, no necesariamente un error).

## 2. Material gráfico (planos)

- [ ] **Formato vectorial cuando corresponde** (masterplan, plantas) — si llega rasterizado, verificar que la resolución alcance (mínimo 2000 px en el lado mayor) antes de aceptar como sustituto.
- [ ] **Capas separadas** en el masterplan (unidades / vías / verde / amenities), si el archivo es DWG/DXF/AI — si viene todo en una sola capa, avisar que va a demandar tiempo extra de preparación.
- [ ] **Código de unidad visible o inferible** en cada planta — si las plantas no tienen el código de tipología marcado, pedir al cliente la correspondencia planta↔código antes de avanzar.
- [ ] **Escala indicada** en planos con cotas.

## 3. GeoJSON / Shapefile de mensura (si aplica — loteos principalmente)

- [ ] **Formato válido** — abrir en un visor GIS (QGIS, geojson.io) y confirmar que carga sin errores de geometría.
- [ ] **Un polígono por lote/unidad**, sin polígonos superpuestos ni con geometría inválida (self-intersecting).
- [ ] **Atributo de código de lote presente** en cada feature, y **consistente con la nomenclatura acordada** con el cliente — si el GeoJSON trae otro sistema de numeración (por ejemplo, del plano de mensura viejo), avisar para resolver el mapeo antes de importar.
- [ ] **Sistema de coordenadas identificado** (idealmente WGS84 / EPSG:4326) — si viene en otro sistema, convertir antes de importar.

## 4. Renders (exteriores/interiores, no 360°)

- [ ] **Resolución mínima 3000 px** en el lado mayor.
- [ ] **Formato JPG/PNG de alta calidad** (compresión mínima 90% si es JPG).
- [ ] **Nomenclatura con código de unidad/tipología**, igual criterio que las panorámicas.

## 5. Listado de unidades (planilla comercial)

- [ ] **Columnas exactas** según la plantilla estándar — si el cliente mandó su propio formato, no reprocesar a mano: devolver la plantilla oficial para que la completen (evita errores de interpretación de columnas ambiguas).
- [ ] **`codigo_unidad` sin duplicados.**
- [ ] **`codigo_unidad` con match contra el mapa/GeoJSON/plantas** — correr el proceso de validación automática y revisar el reporte de no-matcheados antes de importar.
- [ ] **`estado` limitado a los tres valores permitidos** (`disponible`, `reservado`, `vendido`).
- [ ] **Campos numéricos limpios** (superficies, precio) — sin texto, sin rango, sin unidad incluida.
- [ ] **Si `mostrar_precio_publico = SI`, que exista `precio` cargado.**

## 6. Identidad de marca

- [ ] **Logo en vectorial** (AI/EPS/SVG), con versión para fondo claro y oscuro.
- [ ] **Colores en HEX**, no solo en descripción ("azul institucional").

## 7. Datos legales

- [ ] **Disclaimers recibidos por escrito**, de una fuente autorizada (no verbal en reunión) — si no llegaron, no se publica el recorrido aunque el resto del material esté listo.

## Qué se rechaza y se pide de nuevo — resumen de motivos más frecuentes

| Motivo de rechazo | Se comunica citando |
|---|---|
| Relación de aspecto ≠ 2:1 | Especificación técnica, sección 1 |
| Resolución insuficiente | Especificación técnica, sección 1 |
| Horizonte torcido | Especificación técnica, sección 5 |
| Costura visible | Especificación técnica, sección 5 |
| Código de unidad sin match | Plantilla de listado, sección "cómo nombrar unidades" |
| Estado con valor no permitido | Plantilla de listado, sección "valores permitidos" |
| Planta sin código de tipología | Brief maestro, sección 1.2 |

Ningún material se integra a producción hasta pasar este checklist. Si hay que avanzar con material parcialmente aprobado por urgencia comercial, requiere aprobación explícita del responsable de proyecto, dejando registro de qué puntos quedaron pendientes.
