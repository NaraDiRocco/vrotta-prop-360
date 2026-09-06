import type { MiddlewareHandler } from 'hono';
import type { Env } from '../env.ts';
import { timingSafeEqualString } from './embed-token.ts';

/**
 * Exige `Authorization: Bearer <PUBLISH_SECRET>` en las rutas de escritura
 * (publish, rollback, regeneración de availability) que actúan con la
 * service key de Supabase. Esas rutas sólo reciben `{tenant, project}` en el
 * cuerpo/params — sin este chequeo, cualquiera que supiera (o adivinara) el
 * nombre de un tenant/proyecto podía publicar o revertir contenido ajeno.
 *
 * Fail-closed a propósito: si `PUBLISH_SECRET` no está configurado en el
 * entorno (falta el secret en Cloudflare), la ruta rechaza con 500 en vez de
 * dejar pasar. Un entorno mal configurado nunca debe equivaler a "abierto".
 */
export const requirePublishSecret: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const secret = c.env.PUBLISH_SECRET;
  if (!secret) {
    console.error('PUBLISH_SECRET no está configurado: rechazando por defecto (fail-closed).');
    return c.json(
      { error: 'server_misconfigured', message: 'Falta configurar PUBLISH_SECRET en el Worker' },
      500,
    );
  }

  const header = c.req.header('Authorization') ?? '';
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) {
    return c.json({ error: 'unauthorized', message: 'Falta Authorization: Bearer <secreto>' }, 401);
  }

  const token = header.slice(prefix.length);
  if (!timingSafeEqualString(token, secret)) {
    return c.json({ error: 'unauthorized', message: 'Secreto inválido' }, 401);
  }

  await next();
};
