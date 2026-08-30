# Plan de rediseño visual del panel de administración

**Fecha:** 2026-08-30
**Alcance:** el shell admin (`apps/admin`, rutas `/t/...`). Quedan afuera el shell de ventas (`/s/...`, mobile-first, otro problema) y el editor de hotspots (se queda oscuro a propósito, ver §1.4).
**Para quién se diseña:** una persona experta que opera esto ocho horas por día, sobre tablas de hasta 1.000 filas, con teclado. La densidad actual (base 13px, fila 32px, control 28px) es correcta y **no se toca**. Este rediseño es de jerarquía, color y legibilidad, no de densidad.

Los archivos citados son los reales del repo. Cada etapa del §8 lista exactamente qué toca.

---

## 1. Dirección visual

### 1.1 El problema a resolver

Hoy hay dos temas definidos en `apps/admin/src/app/globals.css`: claro en `:root` y oscuro en `@media (prefers-color-scheme: dark)`. Como el sistema operativo del usuario está en oscuro, el panel se ve oscuro azulado **aunque el tema principal diseñado sea el claro**. El pedido explícito es: claro como principal. La decisión de tema no puede depender del OS.

Además, los neutros claros actuales (`#f7f8f9`, `#e3e6ea`, `#64707d`) son un slate genérico levemente azul, y los colores semánticos de interfaz (`--danger #dc2626`, `--warn #d97706`, `--ok #16a34a`) son **exactamente los mismos hex** que los estados comerciales vendido/reservado/disponible de `STATUS_TOKENS`. Un error de guardado se ve igual que "vendido". Eso es un bug de lenguaje visual: dos vocabularios distintos compartiendo palabras.

### 1.2 Paleta clara — tokens y valores

Neutro elegido: **gris humo frío, matiz ≈220° con saturación 3–5%**. Justificación: no es el slate azulado por defecto de Tailwind (que a pantalla completa "tiñe" todo de azul, que es parte de lo que se ve mal hoy), pero tampoco un neutro cálido — los colores de estado comercial son saturados y cálidos (verde/ámbar/rojo) y sobre un fondo cálido se ensucian y pierden distancia entre sí. Un frío casi imperceptible mantiene el acento azul en familia y deja que los estados sean lo único "de color" en la pantalla.

Principio de superficie: **contenido blanco sobre lienzo gris**. Hoy `--bg` es blanco pleno y todo flota en él; la card de proyecto se pierde porque card y fondo son casi lo mismo. Invertimos: el fondo de página es gris claro (`--bg-canvas`) y las superficies de contenido (cards, tabla, panel lateral) son blancas con borde. La elevación se hace con superficie + borde, **sin sombras** salvo en overlays (popover, sheet, toast): en un panel denso las sombras suman ruido, el borde alcanza.

Reemplazo del bloque `:root` de `globals.css`:

```css
:root {
  /* superficies */
  --bg-canvas:  #F3F4F6;  /* fondo de página; lienzo gris */
  --bg:         #FFFFFF;  /* superficie de contenido: cards, tabla, sheet */
  --bg-subtle:  #F8F9FA;  /* encabezados de tabla, rail, franjas internas */
  --bg-sunken:  #EDEFF2;  /* pistas de barras, wells, inputs deshabilitados */
  --bg-hover:   #F1F3F5;  /* hover de fila y de botón ghost */
  --bg-sel:     #E8F0FE;  /* fila/ítem seleccionado */

  /* bordes */
  --border:        #E5E7EB;  /* divisores, bordes de card */
  --border-strong: #CDD2D9;  /* bordes de control (input, botón) */

  /* texto — tres niveles, nada más */
  --fg:       #191C1F;  /* contenido primario. 15.6:1 sobre blanco */
  --fg-muted: #5B6572;  /* etiquetas, metadatos, encabezados de tabla. 6.4:1 */
  --fg-faint: #98A1AC;  /* placeholder, deshabilitado, timestamps. 2.9:1 — sólo texto prescindible */

  /* acento (interactivo, no semántico) */
  --accent:        #1B5FD0;  /* links, botón primario, foco, selección. Blanco encima da 5.6:1 */
  --accent-fg:     #FFFFFF;
  --accent-subtle: #E8F0FE;  /* fondos de selección/chip activo (= --bg-sel a propósito) */

  /* semánticos de INTERFAZ — ver §1.3, nunca para estados comerciales */
  --ui-danger:    #C81E2B;  --ui-danger-bg:  #FDECEC;  --ui-danger-border: #F2B8BC;
  --ui-warn:      #94540A;  --ui-warn-bg:    #FDF4E3;  --ui-warn-border:   #EAD08F;
  --ui-ok:        #12744A;  --ui-ok-bg:      #E7F6EE;  --ui-ok-border:     #A9DCC2;

  /* foco */
  --focus-ring: var(--accent);

  /* densidad (sin cambios) */
  --row-h: 32px;
  --control-h: 28px;
}
```

Notas de intención, para no aplicarlo a ciegas:

- `--fg-muted` sube de contraste respecto del actual `#64707d` (6.4:1 vs 5.4:1). Es el color de los encabezados de tabla y las etiquetas: a 11px, ocho horas por día, necesita más tinta. Es la corrección más barata de todo el plan.
- `--accent` baja de `#1F6FEB` a `#1B5FD0`: el actual da 4.1:1 con texto blanco encima (falla AA en el botón primario a 12px); el nuevo pasa. El azul sigue siendo el mismo azul a la vista.
- `--bg-sel` y `--accent-subtle` son el mismo valor a propósito: "seleccionado" es siempre la misma seña.
- Los `--ui-*` de texto están elegidos para dar ≥4.5:1 **sobre su propio `-bg`**, porque siempre se usan en pareja (texto sobre fondo teñido). No usar `--ui-warn` como texto suelto sobre blanco para cosas largas.

Radios y sombra (agregar a `@theme` o como tokens):

```css
--radius-control: 5px;   /* botones, inputs, chips cuadrados (sin cambio) */
--radius-card:    8px;   /* cards y secciones */
--shadow-overlay: 0 4px 16px rgb(20 24 29 / 0.14);  /* SOLO popover/sheet/toast */
```

### 1.3 Semánticos de interfaz vs. estados comerciales

Dos vocabularios, dos reglas de forma. La separación no es sólo de hex — es de **presentación**, porque rojo-interfaz y rojo-vendido nunca van a ser inconfundibles por matiz solo:

| | Estados comerciales (`STATUS_TOKENS`) | Semánticos de interfaz (`--ui-*`) |
|---|---|---|
| Fuente | `packages/core/src/status.ts`, inyectados como `--st-*` | `globals.css` |
| Forma **exclusiva** | punto (`r-dot`) + etiqueta, chip con punto, segmento de barra | banner con fondo teñido `-bg` + borde `-border`, texto de validación, toast, glyph del checklist |
| Nunca | en banners ni validaciones | como punto/chip/segmento |

Con esa regla, un "vendido" siempre es un puntito rojo con la palabra "Vendido" al lado, y un error siempre es una franja rosada con borde. Se distinguen por silueta antes que por color, que además es lo que ya hace el visor con las tramas (`pattern`) para daltónicos.

**Sobre tocar `STATUS_TOKENS`:** no hace falta y no conviene en esta pasada. Los cinco base actuales (#16A34A, #D97706, #DC2626, #7C3AED, #64748B) son distinguibles entre sí, tienen tramas para el caso no cromático, y cambiarlos toca panel + editor + visor + material impreso de clientes. El único ajuste que vale la pena evaluar más adelante: `no_disponible #64748B` queda muy cerca del nuevo `--fg-muted`; si en la tabla se confunde con texto apagado, subirlo a `#526071` o llevarlo a un gris más oscuro — pero decidirlo mirando el visor, no el panel. **Este plan no cambia el contrato.**

Sí cambia una cosa en el panel: `LEVEL_COLOR` en `src/lib/health.ts` hoy apunta a `--ok/--warn/--danger`. Pasa a `--ui-ok/--ui-warn/--ui-danger`. El checklist de salud habla del sistema, no del negocio.

### 1.4 Modo oscuro: decisión

- **El panel arranca claro siempre**, ignore lo que diga el OS. Se elimina el `@media (prefers-color-scheme: dark)` de `globals.css`.
- **El oscuro se conserva como opción explícita**, no automática: el mismo bloque de overrides pasa a vivir bajo `[data-theme="dark"]` en `<html>`, con un toggle chico al pie del rail que persiste en `localStorage` (misma mecánica que `r360.projectnav.collapsed`). Cuesta casi nada mantenerlo porque ya existe y está bien hecho (los componentes sólo consumen tokens), y el operador trabaja de noche a veces. Si en tres meses nadie lo usó, se borra el bloque y listo — por eso importa que sea un selector y no lógica repartida.
- Al portar el bloque oscuro hay que sumarle los tokens nuevos (`--bg-canvas`, `--ui-*`, `--accent-subtle`). Valores oscuros de partida: `--bg-canvas #0B0E12`, `--bg #12161B`, y los `--ui-*-bg` como `color-mix(in srgb, <color> 14%, var(--bg))`.
- **El editor de hotspots sigue oscuro forzado**, sin toggle. La razón es óptica, no estética: un marco claro alrededor de una panorámica falsea la percepción del color de los polígonos. Eso queda documentado en el propio editor y no participa de este sistema de temas.

---

## 2. Tipografía

### 2.1 Familia: Inter variable, self-hosted

Hoy es la pila del sistema. En una Mac se ve bien (SF); el problema es que **la métrica del panel está calibrada a 13px con filas de 32px**, y la pila del sistema cambia de dibujo, de altura-x y de anchos según la máquina (Segoe en Windows es más angosta y más floja a 11px). Para un producto que vive de la densidad, la tipografía es parte de la calibración, no un detalle.

Recomendación: **Inter (variable, `wght` 400–700)**, self-hosted vía `next/font/local` en `src/app/layout.tsx` (un solo woff2, ~45 KB, cero requests externas). Por qué Inter y no otra:

- Diseñada para UI a cuerpos chicos: altura-x grande, contadores abiertos — a 11–13px rinde mejor que SF/Segoe.
- **Cifras tabulares reales** (`tnum`) y `calt`/`case` correctos. La clase `.tnum` existente sigue funcionando igual.
- Activar `cv08` o la variante `zero` (cero cruzado) **sólo en `--font-mono`-contexts y celdas de código** si aparecen confusiones O/0 en códigos de unidad; no globalmente, que ensucia el texto corrido.

Mono: se queda la pila del sistema (`ui-monospace, SF Mono, Menlo`). Sólo se usa para códigos de unidad y `r-kbd`; no justifica otra font descargada.

```css
--font-sans: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
```

Con fallback métrico automático de `next/font` (adjustFontFallback) el swap no salta.

### 2.2 Escala y pesos

La escala actual (11/12/13/14/16/20) es correcta para la densidad; se conserva y se le agrega un escalón para los números del dashboard:

| Token | px | Uso | Peso |
|---|---|---|---|
| `--text-xs` | 11 | encabezados de tabla, metadatos, chips | 400/600 |
| `--text-sm` | 12 | controles, celdas secundarias | 400 |
| `--text-base` | 13 | cuerpo, celdas | 400 |
| `--text-md` | 14 | títulos de sección dentro de pantalla | 600 |
| `--text-lg` | 16 | título de pantalla / nombre de proyecto en nav | 600 |
| `--text-xl` | 20 | métricas secundarias | 600 |
| `--text-2xl` **(nuevo)** | 26 | cifra principal de KPI del dashboard | 600, `tnum` |

Pesos permitidos: **400, 500, 600**. Nada de 700 en texto (el logo/avatar del rail puede quedarse en 700). La jerarquía en un panel denso se hace con color (`--fg` vs `--fg-muted`) y peso 600, no con tamaño: cambiar tamaños dentro de una tabla rompe el ritmo vertical.

### 2.3 Números en tablas

Reglas que hoy están a medias y pasan a ser obligatorias:

1. Toda celda numérica lleva `.tnum` **y** alineación derecha (m² y precio ya lo hacen; "Actualizado" está en `tnum` pero es una fecha — puede quedar a la izquierda, es texto).
2. Precio: moneda en `--fg-muted` y monto en `--fg` (`USD` apagado, `185.000` con tinta) — el ojo compara montos, la moneda es contexto. Se implementa en `fmtPrice`/celda de `units-table.tsx`.
3. Vacíos: `—` en `--fg-faint`, nunca `0`, nunca celda vacía (ya es así; mantener).
4. KPIs del dashboard: `--text-2xl` + `tnum`, con la unidad en `--text-xs --fg-muted` debajo, nunca al lado de la cifra.

---

## 3. Rail y navegación

### 3.1 Diagnóstico

El rail de 56px (`src/components/app-shell.tsx`) tiene tres glyphs Unicode (`▤ ✉ +`) sin etiqueta, un cuadrado azul con iniciales, y "Nuevo cliente" —una acción rara, de setup— ocupando el mismo rango visual que "Proyectos". No dice dónde estás ni, más grave para el caso real, **en qué cliente estás parado** más allá de dos iniciales.

### 3.2 Propuesta: rail de 64px con etiquetas + conmutador de cliente

No se convierte en sidebar ancho: el ancho es de la tabla. Se pasa de 56 a **64px** (+8px, `--spacing-rail: 64px`) para que entren etiquetas de 10px debajo de cada icono. Un rail con etiqueta permanente le gana a los tooltips siempre: el tooltip exige hover secuencial para descubrir qué hay.

```
┌──────┐
│ ▩ DA │  ← conmutador de cliente (avatar + caret), popover al click
├──────┤
│  ⌂   │
│ Proy │  ← activo: fondo --bg-sel, icono y texto --accent
│  ✉   │
│ Leads│
│      │
│  …   │
├──────┤
│  ◐   │  ← toggle de tema (claro/oscuro), --fg-faint
│ admin│  ← rol, como hoy pero horizontal a 9px
└──────┘
```

Decisiones:

- **Iconos de verdad** (Lucide, tree-shakeable, ~1 KB por icono) en lugar de glyphs Unicode: `LayoutGrid` para Proyectos, `Inbox` para Leads. Los glyphs Unicode se dibujan distinto en cada plataforma y a 15px son ilegibles — es la mitad del problema actual del rail. Misma sustitución en `project-nav.tsx` (`◎ ▤ ⌗ ◈ ↑` → `Home, Table2, Network, Images, UploadCloud`).
- **Conmutador de cliente arriba de todo.** El avatar (iniciales sobre `--accent`, como hoy) más un caret. Al click abre un popover (sombra `--shadow-overlay`) con la lista de tenants del operador, cada uno con nombre completo + conteo de proyectos con atención pendiente (punto `--ui-warn` si hay), y al pie "＋ Nuevo cliente". Esto resuelve el caso real —una persona saltando entre varios clientes— y saca "Nuevo cliente" del rail, donde hoy tiene el mismo peso que la navegación diaria. Requiere exponer "mis tenants" (hoy `Membership` es de a uno; el dato existe en el repo de datos).
- **Estado activo visible**: ítem activo con fondo `--bg-sel` y tinta `--accent`. Hoy no hay ninguna indicación de sección activa en el rail — parte de "no sé dónde estoy".
- **El breadcrumb del header queda como está** (es correcto y navegable); se le suma tipografía: último crumb en 600/`--fg`, anteriores en `--fg-muted` (ya es así) — sólo asegurarse de que el nombre del tenant en el primer crumb coincida con el avatar del rail para cerrar el circuito de "dónde estoy".
- **Paleta de comandos (Cmd+K)** para saltar a cualquier proyecto de cualquier cliente por nombre. Para un operador experto con teclado, es la navegación primaria real; el rail queda como mapa y fallback de mouse. Entra en etapa 5 (§8) porque no bloquea nada.
- La barra de proyecto de 220px (`project-nav.tsx`) está bien: colapsable, recuerda estado, muestra nombre y tipo. Sólo cambia iconos (punto anterior) y el estado activo pasa a usar los mismos tokens que el rail.

---

## 4. Dashboard de proyectos, rediseñado

### 4.1 Qué necesita ver el operador a la mañana

En orden: **(1)** qué se rompió o requiere acción — antes que cualquier métrica; **(2)** cómo va el negocio de este cliente — unidades disponibles/reservadas/vendidas, leads recientes; **(3)** el estado de cada proyecto para decidir a cuál entrar. Hoy la pantalla da (1) mal (texto corrido naranja), (2) no lo da en absoluto, y (3) lo da en una card pobre.

### 4.2 Jerarquía de la pantalla

```
┌────────────────────────────────────────────────────────────────────┐
│ Dacal Bienes Raíces / Proyectos                    [Nuevo proyecto]│  header (existente)
├────────────────────────────────────────────────────────────────────┤
│                                                                    │  fondo: --bg-canvas
│  ┌─ KPIs del cliente ────────────────────────────────────────────┐ │
│  │   184        ●62        ●17        ●105        23             │ │  fila de 4-5 KPIs
│  │   unidades   disponibles reservadas vendidas   leads 7 días   │ │  --text-2xl tnum
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌─ Requiere atención (3) ───────────────────────────────────────┐ │  sólo si hay issues
│  │ ✕  Baleia      Sin escenas                        [Resolver →]│ │  ver §5
│  │ ✕  Baleia      Ninguna unidad tiene polígono      [Resolver →]│ │
│  │ !  Las Golondrinas  4 unidades sin precio público [Resolver →]│ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  Proyectos                                                         │  --text-md 600
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐             │
│  │  card §4.3    │ │               │ │               │             │
│  └───────────────┘ └───────────────┘ └───────────────┘             │
└────────────────────────────────────────────────────────────────────┘
```

- **KPIs primero, atención segunda… no:** atención va *visualmente* segunda pero con más contraste (borde e íconos semánticos); los KPIs van arriba porque son la respuesta a "cómo venimos" y son estables — la banda de atención aparece y desaparece, y si estuviera primera, la página "saltaría" de layout cada vez. Los KPIs son puntos con el color de estado comercial al lado de cada cifra (vocabulario correcto: son estados del negocio).
- Los KPIs agregan sobre **todos los proyectos del tenant**. "Leads 7 días" requiere sumar el conteo por proyecto (el dato ya existe para la pantalla de leads).
- Cada KPI es clickeable: "disponibles" lleva a la vista de unidades cross-proyecto filtrada si existe, o no es link si no existe aún — no inventar navegación para la etapa 3; con que sean cifras ya paga.
- Contenido con `max-width: 1200px` centrado: es la única pantalla del panel que no es tabla, y a pantalla completa en un monitor grande las cards regadas a lo ancho son lo que produce el "todo vacío" actual.

### 4.3 Anatomía de la card de proyecto

```
┌──────────────────────────────────────┐   superficie --bg, borde --border,
│ ░░░░░░ thumbnail 16:9 ░░░░░░░░░░░░░░ │   radio --radius-card
│ ░░░ (escena inicial, cover) ░░░░░░░░ │ ← imagen real; ver abajo
│░░░░░░░░░░░░░░░░░░░░░░░[ v3 público ]│ ← pill sobre la foto, esquina inf. der.
├──────────────────────────────────────┤
│ Baleia                        ✕ 2    │ ← nombre 600 · badge de salud (§5)
│ Complejo de chacras · Punta Ballena  │   --text-xs --fg-muted
│                                      │
│ ██████████▁▁▁▁▁▁▁▁  62 disp · 105 v. │ ← barra de estados §6.5 + resumen corto
│                                      │
│ 184 unidades   12 leads/7d   87 % ▰▰ │ ← fila de datos, tnum
└──────────────────────────────────────┘
```

- **Thumbnail real**: el preview de la escena inicial (los tiles ya existen para el visor; alcanza un derivado chico, ~640px, cacheado). Es lo que convierte la card de "rectángulo gris con texto" en algo reconocible — el operador identifica proyectos por la foto antes que por el nombre. Si el proyecto no tiene escenas todavía, placeholder con el patrón `--bg-sunken` y el texto "Sin escenas" en `--fg-faint` — que el vacío se vea como carencia, no como diseño.
- **Pill de publicación** sobre la foto: `v3 público` (fondo `--ui-ok-bg`, texto `--ui-ok`) o `sin publicar` (fondo neutro `--bg-sunken`, `--fg-muted`). Es estado del sistema, no comercial → vocabulario `--ui-*`.
- **Badge de salud** junto al nombre: nada si todo ok; `! n` en `--ui-warn` o `✕ n` en `--ui-danger` con el conteo de issues. Duplica a propósito la banda de atención: la banda es la cola de trabajo, el badge dice "esta card en particular tiene deuda".
- **Barra de estados**: la versión rediseñada de §6.5 (altura 8px, con mínimo de segmento), seguida de un resumen de **máximo dos cifras** ("62 disp · 105 vend"), no el rosario completo de `summarize()` que hoy va en 10px `--fg-faint` y no se lee. El detalle completo vive en el title/tooltip de la barra, como ya está.
- **La barra de completeness desaparece de la card.** Hoy hay dos barras apiladas (completeness + estados) compitiendo; el porcentaje de completeness queda como número chico en la fila de datos y su detalle es el checklist dentro del proyecto.
- Card entera clickeable (como hoy), hover: borde `--border-strong` + fondo sin cambio (la card ya es blanca sobre gris; oscurecerla ensucia el thumbnail).

Grid: `minmax(300px, 1fr)`, gap 16. Con 2–6 proyectos por cliente (el caso real), esto llena la parte superior de la pantalla en vez de dejar un sello perdido arriba a la izquierda.

---

## 5. Banda de atención y checklist de salud

### 5.1 Banda "Requiere atención" (listado de proyectos)

Hoy (`AttentionBand` en `t/[tenant]/p/page.tsx`): links naranjas corridos separados por "·", todo el bloque con borde y fondo `--warn`. Domina sin jerarquizar: un warning de dominios pesa lo mismo que "el recorrido está roto".

Rediseño — de párrafo a **cola de trabajo**:

```
┌ Requiere atención ────────────────────────────── 2 bloqueantes · 1 aviso ┐
│ ✕  Baleia            Sin escenas                              Resolver → │
│ ✕  Baleia            Ninguna unidad tiene polígono            Resolver → │
│ !  Las Golondrinas   4 unidades sin precio público vigente    Resolver → │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Una fila por issue**, no por proyecto: cuatro columnas fijas (glyph de nivel, proyecto, título, acción). Escaneable en vertical, que es como se lee una lista de tareas.
- **Orden**: bloqueantes primero, después warns; dentro de cada nivel, por proyecto. `healthIssues()` ya trae todo; es un `flatMap` + sort en la página.
- **Color por fila, no por bloque**: el glyph usa `--ui-danger`/`--ui-warn`; la fila es neutra. El contenedor lleva borde `--border` normal y **sólo el header** de la sección un fondo teñido según el peor nivel (`--ui-danger-bg` si hay bloqueantes, `--ui-warn-bg` si no). Así la banda pesa proporcional a su gravedad en vez de ser siempre una pared naranja.
- **"Resolver →" como botón ghost** (patrón que ya existe en el resumen de proyecto) usando el `href` con deeplink filtrado que `healthIssues()` ya provee. La banda actual tiene los links en el título; separar el "qué" del "ir a arreglarlo" hace ambos legibles.
- Tope de 6 filas + "ver n más" que expande. Con muchos proyectos la banda no puede comerse el dashboard.
- Los issues `ok` no aparecen acá jamás (hoy ya se filtran; mantener).

### 5.2 Checklist de salud (resumen de proyecto)

La estructura actual (`ProjectOverview`) ya es una lista con glyph + título + detalle + "Resolver →". Lo que falta es jerarquía entre lo hecho y lo pendiente:

- **Los ítems `ok` se colapsan** en una sola fila al pie: "✓ 3 verificaciones en orden" (expandible). Hoy los ✓ verdes ocupan el mismo espacio que los bloqueantes y hay que leerlo todo para saber qué falta.
- **Header con progreso**: "Salud del proyecto — 2 de 5" + los conteos por nivel a la derecha. El "n bloqueante(s)" actual pasa a chip `--ui-danger-bg`.
- Glyphs y colores pasan a `--ui-*` (cambio en `LEVEL_COLOR`, §1.3). El `✓ ! ✕` de `LEVEL_GLYPH` está bien — es silueta, no sólo color.
- El botón **Publicar deshabilitado ya explica por qué** vía `title`; agregarle un subtexto visible bajo el botón cuando hay bloqueantes ("2 bloqueantes impiden publicar") — el tooltip requiere hover y el estado disabled es de las cosas que más confunden si no se explican en el plano visible.

---

## 6. Tabla de unidades

Lo estructural (virtualización, 32px, columna código sticky, edición inline, cursor j/k) está bien y no se toca. Esto es una pasada de jerarquía visual sobre `units-table.tsx`, `filter-bar.tsx` y `globals.css`.

### 6.1 Encabezados

- `.r-th` pasa de `--fg-muted` viejo a: **11px / 600 / `--fg-muted` nuevo (6.4:1) / sin uppercase**. El uppercase a 11px con Inter come legibilidad y no hace falta: el fondo `--bg-subtle` + borde inferior ya separan el header del cuerpo.
- Borde inferior del header sube a `--border-strong`: es la línea estructural más importante de la pantalla y hoy es igual que cualquier divisor de fila.
- **Affordance de orden siempre presente**: columna ordenable muestra `↕` en `--fg-faint` al hover, y `↑/↓` en `--fg` cuando está activa (hoy la flecha sólo existe en la activa; no hay forma de saber qué es ordenable sin probar).

### 6.2 Filas: zebra no, bordes sí

**Sin zebra.** La fila ya tiene cinco estados de fondo (hover, selección, cursor, pending, failed); una sexta alternancia de gris convierte cualquier combinación en ambigua ("¿esta fila está seleccionada o es par?"). A 32px con borde inferior `--border` el ojo no pierde la línea — la zebra se justifica en filas altas o sin bordes, que no es este caso.

- Hover: `--bg-hover` (como hoy).
- Selección: `--bg-sel` (como hoy) **+ el checkbox marcado**; la combinación selección+hover debe resolverse con `color-mix(in srgb, var(--bg-sel) 70%, var(--bg-hover))` para que el hover siga visible dentro de una selección grande.
- Cursor de teclado: el `inset 2px 0 0 var(--accent)` actual es correcto; subirlo a 3px porque con columna sticky el borde de 2px queda medio tapado por el fondo sticky de la celda código.
- Pending: en vez de `opacity: 0.55` sobre toda la fila (apaga también lo que no cambió), opacidad sólo sobre la celda editada + un puntito `--fg-faint` pulsante junto al código. Menos parpadeo global cuando se edita en lote.
- Failed: mantener el fondo `--ui-danger` al 8–12% (cambiar de `--danger` a `--ui-danger`: es error de sistema) y agregar `title` con el motivo.

### 6.3 Estado de la unidad de un vistazo

La celda de estado pasa de "punto + texto plano" a **chip teñido**: fondo `color-mix(in srgb, var(--st-<estado>) 10%, transparent)`, punto sólido, etiqueta en `--fg`. Alto 20px dentro de la fila de 32.

Por qué: en una tabla de 1.000 filas el operador escanea la columna de estado en vertical; el punto de 8px solo es una señal demasiado chica y el texto no tiene color. El chip teñido convierte la columna en una banda de color legible en scroll rápido, sin gritar (10% de alpha). El doble-click para editar se mantiene sobre el chip.

### 6.4 Chips de conteo por estado (filter bar)

Hoy los chips con conteo "se pierden" arriba. Rediseño: los chips de estado son **la leyenda y el filtro a la vez**, pegados a la barra apilada (§6.5) en una sola línea:

```
[● Disponible 412] [● Reservado 61] [● Vendido 380] [● Bloqueado 12] [● No disp. 135]   ████████░░▓▓▓░
```

- Chip: punto del estado + etiqueta + conteo en `tnum` 600. Activo: borde del color del estado + fondo al 10% (hoy el chip activo usa `--accent` — mal vocabulario: filtrar por "vendido" debe verse vendido, no azul).
- Click = toggle del filtro de estado (mecánica existente de la filter bar; sólo cambia la piel).
- Esto elimina la necesidad de leyenda aparte para la barra apilada: chips y barra comparten orden y color, uno al lado del otro.

### 6.5 La barra apilada, arreglada

El problema real: a 6px de alto y ancho libre, cinco colores con segmentos de 2px no comunican nada. Reglas nuevas para `StatusBar` (`src/components/status.tsx`):

1. **Alto 8px** en filter bar y cards, 10px en el resumen (ya parametrizado con `height`).
2. **Mínimo de segmento 6px**: todo estado con count > 0 recibe al menos 6px y el resto se reparte proporcional. Un estado presente pero invisible es peor que una proporción 2% distorsionada — la barra es cualitativa ("hay de esto"), los números exactos están en los chips de al lado.
3. **Separador de 1px** (`--bg` de gap) entre segmentos: cinco colores pegados a esta escala vibran; con 1px de aire cada uno se lee como bloque.
4. La barra **nunca aparece sola**: siempre con los chips-leyenda (§6.4) o con el resumen de dos cifras (card, §4.3). Barra sin leyenda es el arcoíris actual.
5. `role="img"` + `aria-label` con `summarize()` ya está; mantener.

### 6.6 Columnas y detalles

- **Código**: mono 600 como hoy, pero en `--accent` al hover para señalar que abre el sheet (hoy es un botón invisible — nada indica que el código es clickeable).
- **Precio**: moneda `--fg-muted` + monto `--fg` (§2.3); precio no público entero en `--fg-muted` con el `title` actual.
- **Polígono**: `◆/◇` funciona como silueta; cambiar el color del "sí" de `--ok` a `--fg-muted`. Tener polígono no es un éxito semántico, es un dato; el verde debe reservarse para `--ui-ok` (sistema) y disponible (comercial). El "no" queda `--fg-faint`, y el warn de polígonos faltantes ya vive en el checklist, que es donde corresponde.
- **Actualizado**: queda `--fg-muted`; es la columna más prescindible y así lo dice su tinta.

---

## 7. Detalles de oficio

### 7.1 Estados vacíos

Patrón único para todo el panel: contenedor centrado, glyph grande en `--fg-faint` (icono Lucide 32px, no emoji), una frase que diga **qué es esto y por qué está vacío**, y la acción primaria si el rol puede ejecutarla.

- Tabla sin resultados de filtro (existe, texto plano): agregar botón "Limpiar filtros" — el operador llegó ahí por un filtro; darle la salida.
- Proyecto sin escenas / sin unidades: el vacío enlaza al paso del checklist correspondiente, no a una pantalla pelada.
- Tenant sin proyectos (existe como `<p>`): pasa al patrón con la acción "Crear el primero".

### 7.2 Carga

- **Tabla**: skeleton de filas — 12 filas de 32px con bloques `--bg-sunken` (sin shimmer animado; a esta densidad el shimmer es ruido). Nunca spinner centrado: el layout de columnas debe estar presente desde el primer frame para que el ojo no re-aprenda la pantalla.
- **Cards del dashboard**: skeleton de card completa (thumbnail + tres líneas).
- **Recargas con datos previos** (cambio de filtro/orden): los datos viejos se quedan con `opacity: 0.6` hasta que llegan los nuevos (patrón `keepPreviousData` de la query), sin skeleton — el flash de skeleton en cada cambio de filtro es lo más molesto que puede hacer una tabla que se opera rápido.

### 7.3 Foco de teclado

Ya existe `*:focus-visible { outline: 2px solid var(--accent) }` — bien. Se completa:

- `outline-offset: 1px` global, pero **`-2px` dentro de filas de tabla** (offset positivo en un contenedor con `overflow: hidden` se recorta y el foco "desaparece", que en un panel de atajos es crítico).
- El cursor j/k (borde izquierdo accent) y el foco DOM son cosas distintas y pueden divergir; regla: al tipear j/k el foco DOM se queda en el contenedor de la tabla y sólo se dibuja el cursor. Tab entra a los controles de la fila cursor.
- **Overlay de atajos con `?`**: lista de shortcuts (j/k, x para seleccionar, Enter abre sheet, Cmd+K, etc.) usando `r-kbd` que ya existe. Un panel de atajos que no se pueden descubrir es un panel sin atajos.

### 7.4 Microinteracciones que pagan

Pocas y con criterio; todas bajo `@media (prefers-reduced-motion: reduce) { none }`:

1. **Transición de fondo 100ms** sólo en hover de fila/botón (`background-color 100ms ease-out`). Nada de transiciones en bordes, transform ni sombras del contenido.
2. **Sheet lateral de unidad**: entra con `transform: translateX(8px)` + fade 140ms. Sin animación el panel de 420px "aparece de golpe" y el ojo pierde de dónde vino; más de 150ms y estorba al operar rápido.
3. **Toast de resultado de edición en lote** con **Deshacer**: "14 unidades → Reservado · Deshacer" (fondo `--fg`, texto `--bg`, esquina inferior, 6s). Es la microinteracción de mayor valor del panel: la edición masiva de estados es la operación más peligrosa y hoy no tiene red visible.
4. **Cifras de KPI sin animación de conteo.** Los number-tickers son exactamente el cliché de dashboard que este producto no necesita: el operador quiere leer el número, no verlo llegar.

---

## 8. Plan de implementación por etapas

Ordenado por impacto/esfuerzo. Cada etapa deja el panel funcionando; ninguna depende de la siguiente.

### Etapa 1 — Fundación: tema claro por defecto, tokens y tipografía (medio día)

La de mayor impacto por línea de código: resuelve el pedido explícito (nunca más arranca oscuro) y recalibra tinta y contraste de todo el panel sin tocar un componente.

- `apps/admin/src/app/globals.css`: nuevo bloque `:root` (§1.2), `@media (prefers-color-scheme: dark)` → `[data-theme="dark"]` con los tokens nuevos agregados (§1.4), `--spacing-rail: 64px`, `--text-2xl`, radios, `--shadow-overlay`, ajustes de `.r-th` (§6.1), `.r-stack` (gap y mínimo van en el componente), `focus-visible` con offsets (§7.3), `body { background: var(--bg-canvas) }`.
- `apps/admin/src/app/layout.tsx`: Inter vía `next/font/local` + clase en `<html>`; leer `data-theme` inicial.
- `apps/admin/src/lib/health.ts`: `LEVEL_COLOR` → `--ui-*`.
- Riesgo: casi nulo — los componentes consumen tokens. Verificar a ojo las cuatro pantallas principales y el chip MOCK (`--warn` → `--ui-warn`) en `app-shell.tsx`.
- **No tocar** `packages/core/src/status.ts` ni `status-styles`.

### Etapa 2 — Shell: rail, iconos, conmutador de cliente, toggle de tema (1 día)

- `apps/admin/src/components/app-shell.tsx`: rail 64px con icono+etiqueta (§3.2), Lucide (`pnpm add lucide-react`), conmutador de tenant (popover; requiere exponer la lista de memberships del operador en `lib/data`), "Nuevo cliente" al popover, toggle de tema al pie (client component chico, persiste `r360.theme`).
- `apps/admin/src/components/project-nav.tsx`: iconos Lucide, tokens de activo.
- Riesgo: el conmutador toca datos (lista de tenants). Si el repo aún no lo expone, el rail nuevo sale igual con el avatar como link a `/t/<tenant>/p` (como hoy) y el popover entra después.

### Etapa 3 — Dashboard de proyectos y banda de atención (1–2 días)

- `apps/admin/src/app/t/[tenant]/p/page.tsx`: layout §4.2 (KPIs, banda rediseñada §5.1, grid centrado), card §4.3.
- `apps/admin/src/components/status.tsx`: `StatusBar` v2 (mínimo de segmento, separadores, §6.5) — **ojo**: la usan también el resumen de proyecto y las cards; el cambio es compatible (misma API, `height` param).
- KPIs del tenant: agregar al repo un agregado por tenant (suma de `statusCounts` que las cards ya reciben — se puede computar en la página sin tocar el repo en la primera versión; leads 7d sí pide dato nuevo, puede entrar después con placeholder "—").
- Thumbnail de escena inicial: requiere un derivado de imagen del pipeline. Si no está, la card sale con placeholder "Sin vista previa" y el slot ya queda hecho — no bloquear la etapa por el pipeline.

### Etapa 4 — Tabla de unidades (1 día)

- `apps/admin/src/components/units/units-table.tsx`: chip de estado teñido (§6.3), precio bicolor, polígono sin verde, código con hover accent, pending por celda, cursor 3px, affordance de orden.
- `apps/admin/src/components/units/filter-bar.tsx`: chips-leyenda por estado (§6.4) + `StatusBar` v2 al lado.
- `globals.css`: variantes de `.r-chip` por estado (`data-status` + `--st-*`).
- Riesgo: bajo; es piel sobre mecánica existente. Probar con el seed de 1.000 filas que la virtualización no note los chips (son spans con background, no debería).

### Etapa 5 — Oficio (1–2 días, troceable)

- Resumen de proyecto: checklist con `ok` colapsados + header de progreso + subtexto del botón Publicar (§5.2) — `t/[tenant]/p/[project]/page.tsx` y `components/onboarding/startup-checklist.tsx`.
- Estados vacíos unificados (componente `EmptyState`) y skeletons (§7.1–7.2).
- Toast con Deshacer para ediciones en lote (`units-screen.tsx`; el deshacer es re-aplicar el estado anterior guardado en memoria — no pide backend nuevo).
- Overlay de atajos `?` y Cmd+K (§3.2, §7.3). Cmd+K puede ser lo último de todo: alto valor pero cero urgencia visual.

### Qué queda explícitamente afuera

- Cambios a `STATUS_TOKENS` (contrato de tres consumidores; sólo el eventual ajuste de `no_disponible`, a evaluar con el visor delante — §1.3).
- El editor de hotspots (oscuro forzado se queda) y el shell `/s/` de ventas.
- Densidades, alturas de fila, anchos de paneles (220/200/420): correctos para el perfil; no son parte del problema diagnosticado.
