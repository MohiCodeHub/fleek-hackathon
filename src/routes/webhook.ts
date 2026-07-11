import { Hono } from 'hono';
import { markDelivery } from '../db/index.js';
import { processInbound } from '../handler.js';
import { parseInbound, verifySignature } from '../wassist.js';

export const webhookRoutes = new Hono();

webhookRoutes.post('/webhook', async (c) => {
  const raw = await c.req.text();

  // 1. Verify signature.
  if (!verifySignature(raw, c.req.header('X-Wassist-Signature'))) {
    return c.text('invalid signature', 401);
  }

  // 2. Idempotency — drop duplicate deliveries.
  const deliveryId = c.req.header('X-Wassist-Delivery');
  if (deliveryId && !(await markDelivery(deliveryId, new Date().toISOString()))) {
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
