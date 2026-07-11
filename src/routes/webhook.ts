import { Hono } from 'hono';
import { markDelivery } from '../db/index.js';
import { processInbound } from '../handler.js';
import { deliveryKey, parseInbound, verifySignature, webhookMessageReply } from '../wassist.js';

export const webhookRoutes = new Hono();

/**
 * Wassist BYOA webhook.
 * Respond quickly with an interim WhatsApp message, then finish Jack in the
 * background and POST the final answer to `reply_callback`.
 */
webhookRoutes.post('/webhook', async (c) => {
  const raw = await c.req.text();

  // Optional signature (only enforced when WASSIST_WEBHOOK_SECRET is set).
  if (!verifySignature(raw, c.req.header('X-Wassist-Signature'))) {
    return c.text('invalid signature', 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return c.text('bad json', 400);
  }

  const inbound = parseInbound(payload);
  if (!inbound) {
    return c.json({ content: 'No CUSTOMER message reply' }, 200);
  }

  // Idempotency: prefer Wassist delivery header; else hash phone+body+callback.
  const id = c.req.header('X-Wassist-Delivery')?.trim() || deliveryKey(inbound);
  if (!(await markDelivery(id, new Date().toISOString()))) {
    return c.json({ content: 'No CUSTOMER message reply' }, 200);
  }

  void processInbound(inbound).catch((e) => console.error('processInbound error:', e));

  // Fast interim while Jack/LLM runs (docs: aim to answer webhook within ~5s).
  return c.json(webhookMessageReply("Got it — Jack's on it. Hang tight."));
});
