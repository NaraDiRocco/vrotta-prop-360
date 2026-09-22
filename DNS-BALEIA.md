# DNS de Baleia — qué cargar en el panel del dominio

> **SUPERADO por la plataforma multi-tenant (2026-09-22) — no enviar este
> documento tal cual.** Se escribió para cuando Baleia iba a publicarse como
> **sitio suelto**, con su propio dominio apuntado directo al VPS. Eso ya no
> es el plan: Baleia hoy vive DENTRO de la plataforma, en
> `baleia.vrottaprop360.com`, servida automáticamente por el wildcard de
> `vrottaprop360.com` — **nadie tiene que cargar nada en el DNS de Baleia
> para que el recorrido funcione.** Ver `DESPLIEGUE-VPS.md` sección 0.
>
> Si en algún momento Dacal quiere que el recorrido responda en un dominio
> **propio** de ellos (en vez del subdominio de la plataforma), el mecanismo
> real ya no es el de abajo (registros `A` sueltos, sin verificar). Existe la
> tabla `project_domains` (`supabase/migrations/0022_project_domains.sql`),
> pensada para que el cliente apunte su dominio y lo verifique con un
> registro **TXT** (con un `verification_token` propio, no con los `A`
> pelados de acá) antes de que el reconciliador lo enrute — y el worker ya
> sabe resolver por ese hostname (`apps/worker/src/lib/host-routing.ts`). **Lo
> que todavía NO existe es el flujo en el panel** para que alguien de Dacal
> cargue ese dominio y vea su estado de verificación: hoy sólo está el
> esquema de base y la resolución del lado del worker, no la pantalla del
> admin. Hasta que esa pantalla exista, dar de alta un dominio propio para
> Baleia es un trabajo manual (INSERT en `project_domains` + pedirle al
> cliente el TXT), no algo que se le pueda indicar a quien administra el
> dominio con un documento como éste.
>
> El resto de este documento queda como referencia histórica de qué
> registros pedía el modelo de sitio suelto (`baleia-web`, sección 0 de
> `DESPLIEGUE-VPS.md`), que sigue instalado sin ruta, como respaldo.

Este documento es para entregarle a quien administra el dominio del
desarrollo. No hace falta saber de servidores: son dos registros.

## Los registros

| Tipo | Nombre / Host | Valor | TTL |
|------|---------------|-------|-----|
| A    | `@`           | `179.199.142.5` | 300 |
| A    | `www`         | `179.199.142.5` | 300 |

`@` significa el dominio pelado (`eldominio.com`). Algunos paneles piden
que ese campo quede vacío en lugar de `@`; es lo mismo.

Si el panel no deja cargar un `A` en `www`, sirve igual un `CNAME` de
`www` apuntando al dominio pelado.

## Tres advertencias que evitan un dolor de cabeza

1. **No borrar los registros MX ni los TXT existentes.** Cambiar los `A` no
   toca el correo, pero vaciar la zona sí lo deja sin servicio.
2. **Si el dominio está en Cloudflare, dejar la nube en gris ("DNS only"),
   no naranja.** El certificado se emite validando por HTTP contra el
   servidor; con el proxy naranja esa validación puede fallar.
3. **No cargar registros AAAA.** El servidor atiende por IPv4; un AAAA
   apuntando a otro lado deja el sitio caído para quien tenga IPv6.

## El orden importa

Primero el DNS, después el certificado. El servidor pide el certificado
solo, pero recién puede hacerlo cuando el dominio ya resuelve a su IP.
Con TTL 300 la propagación suele tardar entre cinco minutos y una hora.

Avisanos cuando los registros estén cargados: del lado del servidor queda
una línea por cambiar y el sitio pasa a responder en el dominio con
HTTPS, que después se renueva solo.

## Mientras tanto

El recorrido ya está en línea en `https://baleia.vrottaprop360.com` (ver la
nota de arriba: no hace falta ningún DNS propio para eso). El link viejo,
`https://baleia.179.199.142.5.nip.io`, sigue funcionando pero ahora
redirige (301) al dominio actual — no lo repartas como link nuevo.
