# Amenities — no existen todavía

**Confirmado por el dueño del proyecto: los amenities son renders, no están
construidos.** Esto es lo que justifica el modelo 3D. Lo construido (bloque 2,
interiores, fachadas) se puede fotografiar; los amenities sólo pueden existir
como render, y hoy los únicos que hay son imágenes fijas del brochure.

Referencias extraídas a `referencias/amenities/`.

## Qué hay que modelar

Del render `p20-amenities-piscina.png` (vista aérea nocturna) y del texto del
brochure — "piscina, solárium, pérgolas y fogones":

| Elemento | Descripción |
|---|---|
| **Piscina** | Rectangular alargada, borde de hormigón, iluminación sumergida. |
| **Solárium** | Deck de madera al costado de la piscina, con reposeras y sombrillas. |
| **Pérgolas** | Estructura de madera de listones, apoyada sobre columnas de madera, con vegetación trepadora. Hay al menos dos. |
| **Fogones** | Piezas circulares bajas, con sillones curvos alrededor. Sobre solado de canto rodado. |
| **Laguna** | Naturalizada, forma libre (dos lóbulos), con **deck de madera perimetral serpenteante** y juncos/gramíneas en el borde. Es la pieza más característica del conjunto. |
| **Senderos** | Canto rodado claro, borde de hormigón. |
| **Iluminación** | Baja y contenida: balizas a nivel de piso a lo largo del deck y los senderos. Define el carácter nocturno. |
| **Muro de piedra** | En el volumen construido del fondo del render. |

Paleta: agua, madera, piedra y vegetación nativa. Sin blancos ni colores
saturados.

## Implantación

`referencias/amenities/p07-masterplan.png` da la implantación: **5 bloques
escalonados** con **parking entre cada uno**, Carlos Páez Vilaró al oeste,
**Ruta 10 (Interbalnearia) al este**, y los amenities —piscina y laguna— en el
**extremo este** del predio. Bloque 2 es el que está en comercialización.

> **Limitación:** el masterplan del brochure está compuesto **en perspectiva**
> sobre una foto, proyectado sobre un vidrio. No sirve como plano de
> implantación calibrado. Para modelar el conjunto a escala real hace falta el
> **plano de implantación en planta**, que no tenemos. Se puede rectificar la
> perspectiva y trabajar con ese resultado, aceptando un error mayor que en las
> unidades — o pedirlo. Es el pedido más valioso que se le puede hacer al
> estudio, más que el modelo 3D completo.

## Orden sugerido

Los amenities son la parte de mayor retorno del 3D (nadie más los puede
mostrar) pero también la de mayor incertidumbre geométrica. Conviene resolver
primero la unidad piloto, donde las cotas son duras, y encarar los amenities
después con el pipeline de render ya validado.
