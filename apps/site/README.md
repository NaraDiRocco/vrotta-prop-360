# @r360/site

Landing de venta de **Baleia**, un solo cliente, hardcodeada: contenido,
teléfono, inmobiliaria y sistema de diseño son los de ese proyecto puntual,
no una plantilla para otros. El recorrido 360° (`@r360/viewer`) no es acá el
producto entero — es una sección más (`#recorrido`) dentro de una página que
se recorre scrolleando como el brochure original del proyecto.

```bash
pnpm --filter @r360/site dev       # http://localhost:5190
pnpm --filter @r360/site build
```

`dev`/`build` corren primero `scripts/sync-assets.mjs`, que copia a
`public/media/` el material ya optimizado que vive en `tools/baleia/material*`
(fotos, planos, renders, marca) — nada se reprocesa acá, y las imágenes no se
duplican en el repo de este paquete.

## Sistema de diseño

No es de autor: sale del brochure de Baleia (`Copia de Baleia prueba
brochure (1).pdf`), leído con PyMuPDF. Montserrat Regular/Bold son las dos
únicas tipografías del PDF, `#abc1cb` el color de las fichas de unidad y la
contratapa — ver los comentarios de `src/styles.css`.

## Cómo se embebe el recorrido

`src/main.ts` mete el tour en un `<iframe>` **crudo** — sin usar
`@r360/embed` — apuntando a `VITE_TOUR_URL` (default
`http://localhost:5183/`, pensado para desarrollo). El iframe carga recién
cuando la sección `#recorrido` se acerca al viewport (`IntersectionObserver`,
`rootMargin: 400px`), porque son ~52 MB de tiles que no tiene sentido bajar
si el visitante nunca llega hasta ahí.

## Estado real: no está conectado a la plataforma ni al despliegue

Esta app se escribió el 2026-09-10 (`site(baleia): el sitio completo...`),
**antes** de que Baleia pasara a vivir dentro de la plataforma multi-tenant
(2026-09-22, ver `DESPLIEGUE-VPS.md` sección 0) y antes de que
`@r360/embed` tuviera su protocolo de subdominio terminado. Desde entonces
nadie la volvió a tocar. Consecuencias concretas, verificadas contra el
repo:

- **Ningún script de `tools/deploy/` la menciona.** `publicar-plataforma.sh`
  y `publicar-vps.sh` sólo suben `apps/viewer`. No hay evidencia de que este
  paquete se haya publicado nunca a un dominio real.
- **No hay ningún `.env`/`.env.production` con `VITE_TOUR_URL`.** Un
  `pnpm --filter @r360/site build` hoy, sin pasarle esa variable a mano,
  produce un `dist/` cuyo iframe apunta a `http://localhost:5183/` — roto en
  cualquier servidor que no sea la máquina de quien lo compiló.
- **No aparece en la tabla de apps de `DESPLIEGUE-VPS.md`** (corregido para
  señalar esto, ver ese documento).

Nada de esto es un juicio sobre si vale la pena — es la foto de qué tan al
día está respecto del resto del monorepo, para que quien retome esta app no
asuma que "ya funciona" porque compila.

## Recomendación

**No borrarla** (hay contenido real y trabajo de diseño de valor), pero
requiere una decisión explícita antes de la próxima vez que se toque:

1. **¿Sigue haciendo falta una landing de venta aparte del recorrido?** Sí,
   con un argumento concreto: el subdominio de plataforma
   (`baleia.vrottaprop360.com`) sirve **el visor**, no una página de venta
   con ubicación, arquitectura, amenities y datos de contacto — eso es un
   problema real y distinto que este paquete resuelve. La pregunta no es "¿la
   landing sirve para algo?" sino "¿tiene que vivir en este monorepo, como
   una app Vite más, con contenido hardcodeado a mano por cliente?". Ese
   patrón (una app nueva por cliente) no escala como funciona un SaaS
   multi-tenant: si mañana hay 20 clientes, no puede haber 20 carpetas
   `apps/<cliente>`. Si Baleia es la excepción única (el cliente original,
   de antes de que existiera la plataforma) y no el molde para los próximos,
   vale la pena decirlo explícitamente en algún lado — este documento es ese
   lugar por ahora.
2. **Si se decide mantenerla activa**, migrar el iframe crudo a
   `@r360/embed` (`v1.js`, ver `apps/embed/README.md`) en vez de
   `VITE_TOUR_URL` a mano. Se gana, sin escribir el protocolo de nuevo:
   resolución automática por subdominio (no hay que fijar una URL en un
   `.env` que nadie mantiene), carga diferida con poster en vez del
   `IntersectionObserver` casero que ya tiene este paquete (mismo problema,
   ya resuelto una vez, reimplementado acá por separado), deep link directo
   desde la ficha "7 unidades disponibles" de esta misma landing a la unidad
   correspondiente dentro del recorrido, y fullscreen con fallback iOS.
3. **Si se decide no mantenerla activa**, no hace falta borrarla para
   dejarlo asentado: alcanza con anotar acá que quedó fuera del despliegue
   a propósito, para que nadie pierda tiempo debugueando por qué no publica.

Mientras no se tome esta decisión, tratar esta app como **prototipo
congelado**, no como parte del producto en producción.
