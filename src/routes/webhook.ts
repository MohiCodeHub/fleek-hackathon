import { Hono } from 'hono';
import { markDelivery } from '../db/index.js';
import { processInbound } from '../handler.js';
import {
  checkSignature,
  deliveryKey,
  isWassistReplyCallback,
  parseInbound,
  signatureFailureMessage,
} from '../wassist.js';

export const webhookRoutes = new Hono();

/**
 * Wassist BYOA webhook.
 * Acknowledge without an interim WhatsApp message, then finish Abhi in the
 * background and POST the final answer to `reply_callback`.
 */
webhookRoutes.post('/webhook', async (c) => {
  const raw = await c.req.text();

  // Optional signature (only enforced when WASSIST_WEBHOOK_SECRET is set).
  // BYOA is unsigned — leave the secret empty. Platform webhooks are signed.
  const sig = checkSignature(raw, c.req.header('X-Wassist-Signature'));
  if (!sig.ok) {
    const detail = signatureFailureMessage(sig.reason);
    console.warn(`webhook signature rejected: ${detail}`);
    return c.text(`invalid signature: ${detail}`, 401);
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

  if (!isWassistReplyCallback(inbound.replyCallback)) {
    console.warn(
      `webhook rejected non-Wassist reply_callback host: ${inbound.replyCallback.slice(0, 120)}`,
    );
    return c.json({ content: 'No CUSTOMER message reply' }, 200);
  }

  // Idempotency: prefer Wassist delivery header; else hash phone+body+callback.
  const id = c.req.header('X-Wassist-Delivery')?.trim() || deliveryKey(inbound);
  if (!(await markDelivery(id, new Date().toISOString()))) {
    return c.json({ content: 'No CUSTOMER message reply' }, 200);
  }

  void processInbound(inbound).catch((e) => console.error('processInbound error:', e));

  // Suppress interim WhatsApp message; Abhi replies once via reply_callback.
  return c.json({ content: 'No CUSTOMER message reply' }, 200);
});
