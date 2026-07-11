import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp();
const port = config.port;

serve({
  fetch: app.fetch,
  port,
  hostname: '0.0.0.0',
});

console.log(`Jack & Jill listening on http://0.0.0.0:${port} (POST /webhook, GET /health)`);
if (!config.wassist.webhookSecret) {
  console.warn('⚠  WASSIST_WEBHOOK_SECRET not set — signature verification is skipped (dev mode).');
}
