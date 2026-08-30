import { Hono } from 'hono';
import type { Env } from './env.ts';
import { health } from './routes/health.ts';
import { serve } from './routes/serve.ts';
import { publish } from './routes/publish.ts';
import { rollback } from './routes/rollback.ts';
import { availability } from './routes/availability.ts';
import { leads } from './routes/leads.ts';

const app = new Hono<{ Bindings: Env }>();

app.route('/', health);
app.route('/', serve);
app.route('/', publish);
app.route('/', rollback);
app.route('/', availability);
app.route('/', leads);

app.notFound((c) => c.json({ error: 'not_found' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'internal_error', message: err.message }, 500);
});

export default app;
