# DNS de vrottaprop360.com — qué cargar apenas se compre

Este es el dominio de **la plataforma**, no el de un cliente. Es lo único
que falta para que los proyectos dejen de vivir en direcciones provisorias.

Los registros se cargan en el panel de Hostinger, donde ya está el DNS de
los otros dominios.

## Los registros

| Tipo | Nombre / Host | Valor | TTL |
|------|---------------|-------|-----|
| A    | `*`           | `179.199.142.5` | 300 |
| A    | `@`           | `179.199.142.5` | 300 |
| A    | `www`         | `179.199.142.5` | 300 |

## Por qué el asterisco es el importante

El `*` es un **wildcard**: hace que CUALQUIER subdominio resuelva al
servidor sin que nadie vuelva a tocar el DNS nunca más. Es lo que permite
que un proyecto nuevo quede publicado en el acto en
`suproyecto.vrottaprop360.com` apenas se crea, sin esperar a nadie.

Sin el wildcard, cada proyecto nuevo necesitaría que alguien cargue un
registro a mano y espere la propagación. Con él, no.

Los otros dos son para la plataforma en sí: el dominio pelado y el `www`.

## Tres advertencias

1. **No cargar registros AAAA.** El servidor atiende por IPv4; un AAAA
   apuntando a otro lado deja todo caído para quien tenga IPv6.
2. **Si en algún momento el dominio pasa a Cloudflare, dejar la nube en
   gris ("DNS only").** Los certificados se emiten validando por HTTP
   contra el servidor y el proxy naranja puede romper esa validación.
3. **El certificado se pide solo**, uno por cada subdominio, la primera vez
   que alguien lo visita. No hay que generar nada a mano. Límite a tener
   presente: Let's Encrypt permite unos 50 certificados nuevos por semana
   por dominio registrado, o sea unos 50 proyectos nuevos por semana.

## Qué pasa después

Avisame cuando los registros estén cargados y el dominio resuelva. Del lado
del servidor son tres pasos que ya están preparados:

1. Cambiar el dominio base en la configuración del worker y del
   reconciliador.
2. Reiniciar esos dos servicios.
3. Mover el host fijo de la plataforma al dominio nuevo.

A partir de ahí, Baleia pasa a `baleia.vrottaprop360.com` y cada proyecto
nuevo estrena su subdominio solo.

## Para el dominio propio de un cliente

Es otro flujo y ya está construido: el cliente apunta su dominio al
servidor y carga un TXT de verificación. Los registros concretos están en
`DNS-BALEIA.md`. Mientras el dominio no esté verificado, el reconciliador
no lo enruta.
