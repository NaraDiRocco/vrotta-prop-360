> **DOCUMENTO PARA REENVIAR TAL CUAL AL ESTUDIO DE ARQUITECTURA O AL RENDERISTA.**
> Esta es la especificación técnica exacta que necesitamos para generar las panorámicas 360° del recorrido interactivo a partir de un modelo 3D. Cualquier desvío de estos parámetros (resolución, relación de aspecto, horizonte) obliga a rehacer la exportación, así que pedimos seguirla al pie de la letra antes de entregar.

# Especificación técnica — Panorámicas 360° desde modelo 3D

## 1. Parámetros no negociables

| Parámetro | Valor |
|---|---|
| Resolución mínima | 8192 × 4096 px |
| Resolución ideal | 12288 × 6144 px |
| Relación de aspecto | 2:1 exacta (ancho = 2 × alto) |
| Proyección | Equirectangular esférica (360° horizontal × 180° vertical) |
| Horizonte | Nivelado — pitch 0°, sin inclinación de cámara |
| Formato de archivo | PNG 16-bit, o EXR (preferido) |
| Postproducción | Ninguna que afecte los bordes izquierdo/derecho de la imagen (deben empalmar sin costura visible) |

**Por qué importa cada punto:** el visor de recorrido interpreta la imagen como una esfera completa. Si la relación no es 2:1 exacta, la imagen se deforma al proyectarse. Si el horizonte no está a pitch 0, el usuario ve el horizonte "torcido" al navegar. Si hay ajuste de perspectiva o recorte en los bordes, se genera una costura visible donde la imagen "da la vuelta".

## 2. Exportación por software

### Blender
1. Crear una cámara y setear su tipo en **Object Data Properties → Lens → Type: Panoramic**.
2. Dentro de Panoramic, elegir **Panorama Type: Equirectangular**.
3. Verificar que la cámara esté perfectamente nivelada: rotación X = 90° (si está apuntando hacia arriba en Z) y rotación Z según el encuadre horizontal deseado — **rotación en el eje de inclinación (pitch) debe quedar en 0**, sin tilt.
4. Motor de render: Cycles (recomendado para calidad fotorrealista) o Eevee.
5. Output Properties → Resolution: **12288 × 6144** (o 8192 × 4096 como mínimo aceptable) — Aspect Ratio 1:1 (no confundir con la relación de la imagen final, que ya queda en 2:1 por la resolución elegida).
6. Formato de salida: **PNG (16-bit, RGB)** o **OpenEXR (32-bit float, recomendado si van a hacer algún ajuste tonal posterior sin perder calidad)**.
7. Renderizar y exportar — no recortar ni escalar la imagen resultante después.

### Twinmotion
1. Ubicar la cámara en el punto exacto deseado, nivelada (sin tilt vertical).
2. Ir a **Export → Panorama**.
3. Elegir formato de salida **360° Equirectangular**.
4. Resolución de exportación: **12288 × 6144** (ideal) o **8192 × 4096** (mínimo).
5. Formato: PNG. Si Twinmotion ofrece opción de calidad/compresión, usar la máxima.
6. No aplicar efectos de postproceso que dependan de la posición de cámara (viñeteado, distorsión de lente) — quedan mal en proyección esférica.

### Lumion
1. Seleccionar el modo **360 Panorama** dentro del modo de cámara.
2. Ubicar el punto de cámara nivelado (altura de ojos aprox. 1.60–1.70 m si es una vista interior/peatonal; ajustar según el punto de recorrido).
3. Configurar la resolución de salida en **12288 × 6144** o **8192 × 4096** como mínimo.
4. Exportar en formato PNG de máxima calidad.
5. Evitar efectos de Lumion que generen viñeteado o profundidad de campo — no funcionan bien en proyección 360°, generan zonas borrosas que no corresponden.

## 3. Nomenclatura de archivos (obligatoria)

Formato de nombre de archivo:

```
[CODIGO-UNIDAD-O-PUNTO]_[TIPO-DE-VISTA]_[NUMERO].png
```

Ejemplos:
- `MASTERPLAN_AEREA_01.png` — panorámica aérea del conjunto.
- `B2-U05_INT-LIVING_01.png` — interior del living, bloque 2, unidad 5.
- `04-A_INT-COCINA_01.png` — interior de cocina, piso 4, unidad A.
- `LOTE-0142_EXTERIOR_01.png` — exterior sobre el lote 142.
- `SUM_AMENITY_01.png` — panorámica del salón de usos múltiples.

El código de unidad/bloque/piso tiene que ser **idéntico** al usado en la planilla de listado de unidades (documento aparte) — es lo que permite el matching automático entre panorámica y unidad comercial. Antes de renderizar, confirmar la nomenclatura definitiva con el cliente.

## 4. Formato de entrega

- Un archivo por panorámica, sin comprimir en ZIP fragmentado (si son muchos archivos, sí se puede entregar en un único ZIP o carpeta compartida).
- Entrega vía carpeta compartida (Drive, WeTransfer, Dropbox) — evitar mail para archivos pesados.
- Incluir una planilla simple (CSV o Excel) que liste cada archivo entregado con su descripción y ubicación (qué unidad, qué ambiente, qué bloque/piso) — agiliza mucho la carga.
- Entregar también, si es posible, el archivo fuente del modelo 3D o al menos las coordenadas de cámara usadas — permite regenerar tomas puntuales sin rehacer todo si después piden un ajuste.

## 5. Checklist de errores comunes (revisar antes de entregar)

- [ ] **Horizonte torcido** — abrir la imagen y verificar que la línea de horizonte quede recta en el centro vertical, sin inclinación.
- [ ] **Resolución insuficiente** — confirmar que la imagen final sea de al menos 8192 × 4096 px (verificar en las propiedades del archivo, no solo en el setting de render, porque a veces el motor reescala).
- [ ] **Relación de aspecto distinta de 2:1** — el ancho tiene que ser exactamente el doble del alto. Si el archivo quedó, por ejemplo, 8192 × 4320, hay un error de configuración.
- [ ] **Costura visible** — mirar el borde donde la imagen "da la vuelta" (extremo izquierdo/derecho): no debe haber salto de color, desalineación ni efecto de postproceso cortado a la mitad.
- [ ] **Cámara con tilt** — si la cámara no estaba perfectamente nivelada al renderizar, el horizonte sale curvo o inclinado incluso si técnicamente es 2:1.
- [ ] **Efectos de postproceso incompatibles** — viñeteado, profundidad de campo, distorsión de lente, grano: revisar que no queden aplicados, generan artefactos severos en proyección esférica.
- [ ] **Nombre de archivo sin código de unidad** — todo archivo entregado sin nomenclatura clara se devuelve para renombrar antes de ser procesado.

Cualquier archivo que no cumpla alguno de estos puntos se devuelve para corrección antes de integrarlo al recorrido — no lo procesamos "arreglándolo" de nuestro lado, porque suele perder calidad.

## 6. Lista de tomas tipo por proyecto

### Loteo / barrio
- 1 panorámica aérea del conjunto completo (drone o render aéreo).
- 1 panorámica a nivel de calle por sector/manzana representativa (no hace falta una por lote).
- 1 panorámica de cada amenity o espacio común (club house, ingreso, parque).
- Si venden vivienda tipo: 1 panorámica exterior + 1 por ambiente principal (living, dormitorio, cocina) de cada tipología de vivienda.

### Edificio
- 1 panorámica exterior/fachada a nivel de calle.
- 1 panorámica aérea del edificio en su entorno.
- 1 panorámica por amenity (SUM, piscina, gimnasio, rooftop, lobby, coworking).
- Por cada tipología de unidad: 1 panorámica por ambiente principal (living/comedor, dormitorio principal, cocina; dormitorios secundarios y baños opcionales pero recomendados si el tiempo lo permite).
- Opcional: vista desde balcón/ventana por orientación tipo.

### Complejo (tipo Baleia)
- 1 panorámica aérea del conjunto completo, mostrando la disposición de los bloques.
- 1 panorámica a nivel de acceso/circulación entre bloques.
- Por cada bloque: 1 panorámica exterior representativa.
- Por cada tipología de unidad (independientemente de en qué bloque esté): 1 panorámica por ambiente principal, igual criterio que edificio.
- 1 panorámica por amenity común, si el complejo los tiene.

Ante cualquier duda sobre qué tomas priorizar dado el tiempo/presupuesto disponible, consultarnos antes de renderizar — a veces conviene menos tomas pero mejor elegidas.
