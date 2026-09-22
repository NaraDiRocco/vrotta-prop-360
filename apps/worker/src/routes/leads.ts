import { Hono } from 'hono';
import type { Env } from '../env.ts';
import { createSupabaseClient } from '../lib/supabase.ts';
import { getTenantConfig } from '../lib/csp.ts';
import { resolveProject } from '../lib/resolve.ts';

/**
 * POST /api/leads
 * body: {
 *   tenant, project, channel: 'form' | 'crm_webhook' | 'whatsapp',
 *   name, email?, phone?, unitCode?, message?, whatsappNumber?
 * }
 *
 * Registra el lead en Supabase primero, SIEMPRE — incluso para el canal
 * WhatsApp, donde el destino final es un deep link: si registráramos
 * después de devolver el link, un usuario que abre WhatsApp y listo (sin
 * que el front vuelva a llamar a nadie) nunca quedaría registrado. Por eso
 * acá el insert en Supabase pasa ANTES de armar cualquier redirect/URL de
 * salida.
 *
 * Tabla real (supabase/migrations/0007_publications_leads_jobs_saved_views.sql):
 *   leads(id, project_id, unit_id, channel, payload jsonb, created_at)
 * `unit_id` es un uuid — si vino `unitCode` en el body, se resuelve contra
 * `units` antes de insertar; si no matchea ninguna unidad del proyecto, el
 * lead igual se registra con `unit_id: null` (nunca se pierde el lead por un
 * código de unidad inválido).
 *
 * Tres canales soportados:
 *  - 'form'        → sólo registro (+ TODO email de notificación al tenant,
 *                     ver el comentario junto al `return` de este canal más
 *                     abajo — no implementado a propósito).
 *  - 'crm_webhook'  → además reenvía el lead al webhook del CRM del cliente,
 *                     cuya URL es `crmWebhookUrl` en la config del tenant
 *                     (KV `tenant:{tenant}`, ver lib/csp.ts). Si el tenant no
 *                     configuró webhook, se responde igual (el lead ya quedó
 *                     registrado) pero se avisa en la respuesta.
 *  - 'whatsapp'     → responde con el deep link `https://wa.me/...` recién
 *                     después de confirmar el insert.
 */
export const leads = new Hono<{ Bindings: Env }>();

interface LeadBody {
  tenant?: string;
  project?: string;
  channel?: 'form' | 'crm_webhook' | 'whatsapp';
  name?: string;
  email?: string;
  phone?: string;
  unitCode?: string;
  message?: string;
  /** Número de WhatsApp del tenant, en formato E.164 sin '+' (ej: "5491122334455"). */
  whatsappNumber?: string;
}

leads.post('/api/leads', async (c) => {
  const body = await c.req.json<LeadBody>().catch(() => ({}) as LeadBody);
  const { tenant, project, channel, name } = body;

  if (!tenant || !project || !channel || !name) {
    return c.json({ error: 'bad_request', message: 'Faltan tenant, project, channel y/o name' }, 400);
  }

  const db = createSupabaseClient({ url: c.env.SUPABASE_URL, serviceKey: c.env.SUPABASE_SERVICE_KEY });

  const resolved = await resolveProject(db, tenant, project).catch(() => null);
  if (!resolved) {
    return c.json({ error: 'unknown_project', message: `No existe ${tenant}/${project} en Supabase` }, 404);
  }

  let unitId: string | null = null;
  if (body.unitCode) {
    const units = await db
      .select<{ id: string }[]>(
        'units',
        `project_id=eq.${resolved.projectId}&code=eq.${encodeURIComponent(body.unitCode)}&select=id`,
      )
      .catch(() => []);
    unitId = units[0]?.id ?? null;
  }

  // 1) Registro en Supabase — SIEMPRE primero, para los tres canales.
  try {
    await db.insert('leads', [
      {
        project_id: resolved.projectId,
        unit_id: unitId,
        channel,
        payload: {
          name,
          email: body.email ?? null,
          phone: body.phone ?? null,
          unitCode: body.unitCode ?? null,
          message: body.message ?? null,
        },
      },
    ]);
  } catch (err) {
    // El detalle va al log, no a la respuesta: este endpoint es publico y sin
    // token, y el mensaje crudo de Supabase puede describir tablas, columnas o
    // la forma de la consulta a cualquiera que sepa provocarlo.
    console.error('leads: fallo al insertar en Supabase:', err);
    return c.json({ error: 'supabase_error', message: 'No se pudo registrar el contacto.' }, 502);
  }

  // 2) Recién ahora armamos el destino según el canal.
  if (channel === 'whatsapp') {
    if (!body.whatsappNumber) {
      return c.json({ error: 'bad_request', message: 'Falta whatsappNumber para el canal whatsapp' }, 400);
    }
    const text = encodeURIComponent(
      body.message ?? `Hola, quiero más información${body.unitCode ? ` sobre la unidad ${body.unitCode}` : ''}.`,
    );
    return c.json({
      ok: true,
      channel: 'whatsapp',
      registered: true,
      redirectUrl: `https://wa.me/${body.whatsappNumber}?text=${text}`,
    });
  }

  if (channel === 'crm_webhook') {
    const config = await getTenantConfig(c.env.TENANTS_KV, tenant);
    if (!config?.crmWebhookUrl) {
      return c.json({
        ok: true,
        channel: 'crm_webhook',
        registered: true,
        forwarded: false,
        warning: `El tenant ${tenant} no tiene crmWebhookUrl configurada en KV; el lead quedó registrado pero no se reenvió.`,
      });
    }
    try {
      await fetch(config.crmWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant, project, ...body }),
      });
      return c.json({ ok: true, channel: 'crm_webhook', registered: true, forwarded: true });
    } catch (err) {
      // El lead ya está en Supabase aunque el webhook del cliente haya fallado.
      console.error('leads: fallo al reenviar al CRM del cliente:', err);
      return c.json({
        ok: true,
        channel: 'crm_webhook',
        registered: true,
        forwarded: false,
        // Sin el detalle: el error del webhook es de la integracion interna de
        // la inmobiliaria -su URL, su DNS, su servidor- y quien esta del otro
        // lado es un visitante anonimo que solo queria dejar su contacto.
        warning: 'El contacto quedo registrado pero no se pudo reenviar al CRM del cliente.',
      });
    }
  }

  // channel === 'form'
  // TODO: avisar al tenant por email que entró un lead nuevo. Falta, en orden:
  //   1) Elegir proveedor transaccional (Resend, Postmark, SES...) — decisión
  //      de producto/costo, no de este Worker; no se elige acá.
  //   2) Agregar el secret correspondiente (API key) a env.ts y wrangler.toml,
  //      igual que EMBED_HMAC_SECRET/PUBLISH_SECRET.
  //   3) A qué dirección: probablemente un campo nuevo en `TenantConfig`
  //      (lib/csp.ts, KV `tenant:{tenant}`) tipo `notifyEmail`, análogo a
  //      `crmWebhookUrl` — no existe todavía.
  //   4) Igual que el webhook del CRM (ver 'crm_webhook' arriba): si el envío
  //      falla, el lead ya está en Supabase y NO debe perderse por eso — la
  //      respuesta tiene que seguir siendo `ok: true` con un `warning`.
  return c.json({ ok: true, channel: 'form', registered: true });
});
