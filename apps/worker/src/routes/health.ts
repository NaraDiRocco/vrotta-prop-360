import { Hono } from 'hono';
import type { Env } from '../env.ts';

export const health = new Hono<{ Bindings: Env }>();

health.get('/api/health', (c) =>
  c.json({ ok: true, service: '@r360/worker', time: new Date().toISOString() }),
);
