import { Hono } from 'hono';

export const healthRoutes = new Hono();

healthRoutes.get('/health', (c) => c.json({ ok: true, service: 'jack-and-jill' }));

healthRoutes.get('/', (c) =>
  c.json({
    ok: true,
    service: 'jack-and-jill',
    webhook: 'POST /webhook',
  }),
);
