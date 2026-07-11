import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { config } from './config.js';
import { verifySignature, parseInbound } from './wassist.js';
import { markDelivery } from './db.js';
import { processInbound } from './handler.js';

const app = new Hono();

app.get('/', (c) => c.text('Jack & Jill — WhatsApp sourcing agent. POST /webhook'));

app.post('/webhook', async (c) => {
  const raw = await c.req.text();

  // 1. Verify signature.
  if (!verifySignature(raw, c.req.header('X-Wassist-Signature'))) {
    return c.text('invalid signature', 401);
  }

  // 2. Idempotency — drop duplicate deliveries.
  const deliveryId = c.req.header('X-Wassist-Delivery');
  if (deliveryId && !markDelivery(deliveryId, new Date().toISOString())) {
    return c.body(null, 200); // already processed
  }

  // 3. Parse inbound.
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return c.text('bad json', 400);
  }
  const inbound = parseInbound(payload);

  // 4. ACK immediately; process (LLM + negotiation) in the background and
  //    push the reply via the Wassist send API.
  if (inbound) {
    void processInbound(inbound).catch((e) => console.error('processInbound error:', e));
  }
  return c.body(null, 200);
});

const port = config.port;
serve({ fetch: app.fetch, port });
console.log(`Jack & Jill webhook listening on http://localhost:${port}/webhook`);
if (!config.wassist.webhookSecret) {
  console.warn('⚠  WASSIST_WEBHOOK_SECRET not set — signature verification is skipped (dev mode).');
}
