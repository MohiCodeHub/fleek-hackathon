import { Hono } from 'hono';

export const healthRoutes = new Hono();

healthRoutes.get('/health', (c) => c.json({ ok: true, service: 'abhi-and-sanket' }));

healthRoutes.get('/', (c) =>
  c.json({
    ok: true,
    service: 'abhi-and-sanket',
    webhook: 'POST /webhook',
  }),
);
