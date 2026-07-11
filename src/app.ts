import { Hono } from 'hono';
import { requestLogger } from './middleware/logger.js';
import { healthRoutes } from './routes/health.js';
import { productRoutes } from './routes/products.js';
import { webRoutes } from './routes/web.js';
import { webhookRoutes } from './routes/webhook.js';

/** Build the Hono app (no listen) so tests can use `app.request()`. */
export function createApp() {
  const app = new Hono();
  app.use('*', requestLogger);
  app.route('/', healthRoutes);
  app.route('/', webhookRoutes);
  app.route('/', productRoutes);
  app.route('/', webRoutes);
  return app;
}
