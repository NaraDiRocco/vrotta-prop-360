# Guion para pedirle material a un cliente que no sabe qué tiene

> Uso interno, para la reunión de kickoff o una llamada previa. Complementa `02-INTERNO/2-Guion-Reunion-de-Kickoff.md` — ese guion cubre la reunión completa; este documento es específicamente la secuencia de preguntas para **destapar material que el cliente no sabe que tiene**, porque no es él quien lo generó.

## Por qué hace falta un guion aparte

La mayoría de los clientes (desarrolladores, inmobiliarias, equipos comerciales) no son quienes producen el material — lo encargaron a un estudio de arquitectura, a un renderista, a un fotógrafo, y muchas veces ni siquiera saben qué formato de archivo les entregaron o si existe una versión de mayor calidad que la que circula en el brochure. Preguntar "¿tenés el modelo 3D?" casi siempre da un "no sé" — hay que preguntar alrededor del tema, no directo.

## La secuencia (en este orden, no salteando pasos)

**1. "¿Quién les hizo el brochure?"**
Esta es la pregunta que más material destapa. El brochure casi siempre lo armó un estudio de diseño gráfico o el mismo estudio de arquitectura, y ese estudio típicamente tiene: el archivo fuente en Illustrator/InDesign (con las imágenes a resolución completa, no comprimidas como en el PDF final), y a veces el modelo 3D si el mismo estudio hizo los renders.

**2. "¿Ese estudio también hizo los renders, o fue otro proveedor distinto?"**
Si es el mismo estudio, ya se identificó el contacto único para pedir modelo 3D + renders + panorámicas. Si es un proveedor distinto, hay que separar el pedido en dos: uno al diseñador gráfico (archivos fuente de brochure) y otro al renderista (modelo 3D, renders en resolución completa).

**3. "¿Tienen el archivo del modelo 3D, en cualquier programa? No hace falta que sea el que usamos nosotros."**
La clave de esta pregunta es aclarar que cualquier formato sirve como punto de partida (SketchUp, 3ds Max, Revit, Twinmotion, ArchiCAD) — muchos clientes asumen que si no es "el programa correcto" no vale la pena mencionarlo.

**4. "Los renders que nos pasaron, ¿son los únicos que existen, o hay más que no llegaron a entrar en el brochure?"**
Casi siempre existen más tomas de las que terminan en el material de marketing — ángulos descartados, versiones de day/night, interiores que no se usaron. Y casi siempre están en mayor resolución que la que circula en el PDF (que se comprime para que el archivo no pese).

**5. "¿El estudio de arquitectura les entregó planos en CAD (DWG), o solo el PDF?"**
El PDF vectorial del brochure sirve, pero el DWG original tiene capas separadas y permite trabajar mucho más rápido (ver `01-CLIENTE/1`, sección 1.1). Muchos clientes tienen el DWG guardado en una carpeta sin saber que es relevante para este proyecto.

**6. "¿Alguien filmó el terreno con drone alguna vez? Aunque haya sido para otra cosa — agrimensura, un evento, redes sociales."**
El material de drone generado para un propósito distinto (mensura, un video promocional viejo, incluso una foto que subió el arquitecto a Instagram) muchas veces sirve igual, o al menos confirma que hay antecedente y facilita coordinar un vuelo nuevo con el mismo operador.

**7. "¿Tienen agrimensura o mensura digital del terreno?"**
Conecta con el brief maestro sección 11 (GeoJSON) — preguntarle directo al agrimensor si no lo sabe el cliente, antes de asumir que no existe. Puede ahorrar semanas de dibujo manual de polígonos.

**8. "¿Hay fotos de obra, aunque sea del cartel de obra, del cerco perimetral o de una excavación inicial?"**
Sirve para dos cosas: material real de "esto existe" (aunque sea poco), y para confirmar en qué nivel de la escalera está el proyecto (ver `2-Escalera-de-Niveles-de-Material.md`).

**9. "¿Quién administra las redes sociales o la web del proyecto?"**
Suele ser una persona distinta al contacto comercial, y suele tener carpetas con más material del que circuló oficialmente — reels de drone, renders alternativos, fotos de eventos de lanzamiento.

**10. "¿Ya vendieron alguna unidad? ¿Con qué material la vendieron?"**
Si hubo venta antes de tener recorrido 360°, alguien mostró algo — un PDF armado a mano, un video de WhatsApp, una carpeta de Drive. Revela material informal que nadie pensó en centralizar.

---

## Después del guion

Con las respuestas a estas 10 preguntas ya se puede completar el checklist de recepción de material (`02-INTERNO/1-Checklist-de-Recepcion-de-Material.md`) con una foto mucho más precisa de qué pedirle a quién, en vez de mandar el Brief Maestro completo a ciegas y esperar que el cliente entienda solo qué tiene y qué no.
