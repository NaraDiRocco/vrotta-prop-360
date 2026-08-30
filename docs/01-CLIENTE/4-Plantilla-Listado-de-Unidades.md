> **DOCUMENTO PARA EL CLIENTE — listo para copiar y enviar tal cual, junto con la planilla en blanco.**
> Esta es la planilla que necesitamos para cargar los datos comerciales de cada unidad y activar el estado en vivo (disponible/reservado/vendido) sobre los polígonos del recorrido. Por favor respetar el formato de columnas y de código de unidad — es lo que permite que el matching entre la planilla y los polígonos del mapa sea automático, sin intervención manual nuestra.

# Plantilla de listado de unidades

## Columnas exactas

| Columna | Nombre en planilla | Formato | Obligatoria |
|---|---|---|---|
| A | `codigo_unidad` | Texto, sin espacios, según regla de nomenclatura (ver abajo) | Sí |
| B | `tipologia` | Texto corto (ej: "2 dorm", "Lote interno", "Duplex") | Sí |
| C | `superficie_cubierta_m2` | Número, con punto decimal (ej: 54.30) | Sí |
| D | `superficie_total_m2` | Número, con punto decimal (incluye descubierto/terreno si aplica) | Sí (si aplica al tipo de proyecto) |
| E | `estado` | Uno de: `disponible`, `reservado`, `vendido` | Sí |
| F | `precio` | Número, sin símbolo de moneda, sin separador de miles (ej: 85000) | Solo si el precio se muestra públicamente |
| G | `moneda` | `USD` o `UYU` (u otra, definir en kickoff) | Sí si hay precio cargado |
| H | `mostrar_precio_publico` | `SI` / `NO` | Sí |
| I | `financiacion` | Texto libre corto (ej: "30% anticipo, saldo en 24 cuotas") | Opcional |
| J | `bloque_o_piso` | Según tipo de proyecto (ver ejemplos abajo) | Depende del tipo de proyecto |
| K | `orientacion` | Texto libre (ej: "Norte", "Frente", "Contrafrente") | Opcional |
| L | `notas_internas` | Texto libre, uso solo del equipo comercial, nunca se muestra al público | Opcional |

## Valores permitidos para `estado` (estricto — no usar sinónimos)

- `disponible`
- `reservado`
- `vendido`

Cualquier otro valor (por ejemplo "en negociación", "bloqueado", "señado") va a ser rechazado en la importación. Si necesitan un estado intermedio, consultarlo con nosotros antes de cargar la planilla — se puede sumar como estado adicional, pero tiene que quedar definido de entrada porque afecta el color/leyenda del mapa.

## Cómo nombrar las unidades (`codigo_unidad`) para que el matching automático funcione

El `codigo_unidad` tiene que ser **exactamente igual** al identificador usado en:
1. el plano/masterplan (o el GeoJSON, si lo hay),
2. el nombre de archivo de cada render/panorámica correspondiente,
3. esta planilla.

Reglas generales:
- Sin espacios, sin tildes, sin caracteres especiales salvo guion medio (`-`).
- Mayúsculas.
- Un código único por fila — no puede haber dos unidades con el mismo código.

### Convención según tipo de proyecto

**Loteo:** `LOTE-[número]` → ej. `LOTE-0142` (usar ceros a la izquierda si hay más de 999 lotes, para que el orden alfabético coincida con el numérico).

**Edificio:** `[PISO]-[UNIDAD]` → ej. `04-A`, `12-C`. Si el edificio tiene subsuelos o piso 0, usar `SS1-A`, `PB-A`, etc., pero definirlo antes de cargar.

**Complejo:** `[BLOQUE]-[UNIDAD]` → ej. `B1-U03`, `B4-U12`.

## Ejemplos por tipo de proyecto

### Loteo
| codigo_unidad | tipologia | superficie_cubierta_m2 | superficie_total_m2 | estado | precio | moneda | mostrar_precio_publico | financiacion | bloque_o_piso | orientacion | notas_internas |
|---|---|---|---|---|---|---|---|---|---|---|---|
| LOTE-0001 | Lote esquina | 0 | 600 | disponible | 45000 | USD | SI | 20% anticipo, 36 cuotas | Manzana 1 | Norte | — |
| LOTE-0002 | Lote interno | 0 | 450 | reservado | 32000 | USD | SI | 20% anticipo, 36 cuotas | Manzana 1 | — | Reservado por Fernández, seña 27/08 |
| LOTE-0003 | Lote interno | 0 | 450 | vendido | 32000 | USD | NO | — | Manzana 1 | — | Escritura en trámite |

### Edificio
| codigo_unidad | tipologia | superficie_cubierta_m2 | superficie_total_m2 | estado | precio | moneda | mostrar_precio_publico | financiacion | bloque_o_piso | orientacion | notas_internas |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 04-A | 2 dorm | 54.30 | 62.10 | disponible | 98000 | USD | SI | 30% anticipo, saldo pozo | Piso 4 | Frente Norte | — |
| 04-B | 1 dorm | 38.00 | 41.50 | disponible | 71000 | USD | NO | 30% anticipo, saldo pozo | Piso 4 | Contrafrente | Precio bajo revisión |
| 12-C | 3 dorm | 89.00 | 105.00 | vendido | 145000 | USD | NO | — | Piso 12 | Frente | — |

### Complejo
| codigo_unidad | tipologia | superficie_cubierta_m2 | superficie_total_m2 | estado | precio | moneda | mostrar_precio_publico | financiacion | bloque_o_piso | orientacion | notas_internas |
|---|---|---|---|---|---|---|---|---|---|---|---|
| B1-U03 | Duplex 3 dorm | 120.00 | 180.00 | disponible | 210000 | USD | SI | 25% anticipo, 18 cuotas | Bloque 1 | Vista al mar | — |
| B2-U05 | 2 dorm | 75.00 | 95.00 | reservado | 150000 | USD | SI | 25% anticipo, 18 cuotas | Bloque 2 | Vista interna | Reservado, vence seña 05/09 |
| B4-U12 | 2 dorm | 75.00 | 95.00 | disponible | 150000 | USD | NO | 25% anticipo, 18 cuotas | Bloque 4 | Vista interna | — |

*(Se adjuntan las tres planillas en formato CSV, en blanco y con estos ejemplos, en archivo aparte.)*

## Reglas de validación al importar

Al recibir la planilla, nuestro sistema valida automáticamente lo siguiente, y **rechaza la fila** (no todo el archivo) si algo falla:

1. **`codigo_unidad` único** — no se permite duplicado en toda la planilla.
2. **`codigo_unidad` con match en el mapa** — tiene que existir un polígono (dibujado o importado por GeoJSON) con ese mismo código; si no hay match, la unidad queda cargada en la base pero sin polígono asociado, y avisamos para resolverlo.
3. **`estado` dentro de los tres valores permitidos** — cualquier otro valor se rechaza.
4. **`superficie_cubierta_m2` y `superficie_total_m2` numéricos** — no se aceptan textos, rangos ("50-60") ni unidades incluidas ("54 m2").
5. **`precio` numérico sin formato** — si viene con separador de miles o símbolo de moneda, se limpia automáticamente, pero preferimos que llegue limpio para evitar errores de interpretación (por ejemplo, "1.500" podría leerse como mil quinientos o como uno con tres decimales según la configuración regional).
6. **`mostrar_precio_publico` = SI solo si `precio` está cargado** — si dicen SI pero no hay precio, se marca como error y se pide corrección.
7. **Consistencia de `bloque_o_piso`** — tiene que coincidir con los valores usados en el plano/nomenclatura acordada; si aparece un bloque o piso no definido previamente, se marca para revisión antes de importar.

Cualquier fila rechazada se devuelve en un reporte de errores para que la corrijan y reenvíen — no se descarta el resto de la planilla.
