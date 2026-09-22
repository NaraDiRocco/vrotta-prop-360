import { Hono } from 'hono';
import type { Env } from './env.ts';
import { health } from './routes/health.ts';
import { serve, serveByHost } from './routes/serve.ts';
import { publish } from './routes/publish.ts';
import { rollback } from './routes/rollback.ts';
import { availability } from './routes/availability.ts';
import { leads } from './routes/leads.ts';
import { requirePublishSecret } from './lib/publish-auth.ts';
import { rateLimitLeads } from './lib/rate-limit.ts';

const app = new Hono<{ Bindings: Env }>();

// Sólo las rutas de escritura que actúan con la service key de Supabase
// exigen el secreto de publish — /t/*, /api/leads y el resto siguen
// públicas. Registrado ANTES de montar las rutas para que corra primero.
app.use('/api/publish', requirePublishSecret);
app.use('/api/rollback', requirePublishSecret);
app.use('/api/availability/:tenant/:project/regenerate', requirePublishSecret);

// /api/leads es pública (la llama el visitante anónimo) pero sin techo
// insertaba con la service key sin ningún límite (I2 de la auditoría): un
// script en loop llenaba la tabla de leads falsos. Ver lib/rate-limit.ts.
app.use('/api/leads', rateLimitLeads);

app.route('/', health);
app.route('/', serve);
app.route('/', publish);
app.route('/', rollback);
app.route('/', availability);
app.route('/', leads);

// Fallback para cualquier path que no matcheó ninguna ruta explícita: acá
// es donde caen los pedidos a un hostname propio de un proyecto (subdominio
// de plataforma o dominio del cliente, ver lib/host-routing.ts y el
// docstring de `serveByHost`), porque llegan con paths "pelados" (`/`,
// `/tour.json`, `/assets/x.js`) que ninguna ruta de arriba matchea. Para el
// host de la plataforma, o para un host que no resuelve a ningún proyecto,
// `serveByHost` devuelve el mismo 404 seco de siempre.
app.notFound(serveByHost);
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'internal_error', message: err.message }, 500);
});

export default app;
