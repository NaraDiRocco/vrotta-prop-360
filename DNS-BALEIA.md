# DNS de Baleia — qué cargar en el panel del dominio

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

El sitio ya está en línea y se puede ver en:

    https://baleia.179.199.142.5.nip.io

Esa dirección es provisoria —es la IP del servidor disfrazada de
dominio— y sirve para revisar el recorrido antes de publicarlo en el
dominio propio.
