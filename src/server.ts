import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { config } from './config.js';
import { log } from './log.js';

const app = createApp();
const port = config.port;

serve({
  fetch: app.fetch,
  port,
  hostname: '0.0.0.0',
});

log.info('server.listen', {
  port,
  routes: 'GET / landing, POST /webhook, GET /health',
});
if (!config.wassist.webhookSecret) {
  log.warn('server.config', {
    detail: 'WASSIST_WEBHOOK_SECRET not set — signature verification skipped.',
  });
}
if (!config.wassist.publicWebhookUrl) {
  log.warn('server.config', {
    detail: 'PUBLIC_WEBHOOK_URL not set — run npm run register after deploying/exposing /webhook.',
  });
}
