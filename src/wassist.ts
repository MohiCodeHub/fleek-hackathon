import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';

/**
 * Thin Wassist BYOA client.
 * Wassist forwards WhatsApp messages to our webhook; we reply via the
 * webhook JSON body (fast path) and/or `reply_callback` (async / follow-ups).
 * @see https://docs.wassist.app/concepts/bring-your-own-agent
 */

function base(): string {
  return config.wassist.baseUrl.replace(/\/$/, '');
}

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-API-Key': config.wassist.apiKey,
  };
}

/** Register a Bring-Your-Own-Agent pointing Wassist at our public webhook URL. */
export async function registerByoa(webhookUrl: string): Promise<unknown> {
  const res = await fetch(`${base()}/api/v1/agents/byoa/`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ webhookUrl }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Wassist BYOA register failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : {};
}

/**
 * Async reply via the one-time callback URL from the inbound webhook
 * (valid ~24h). Prefer this when Abhi needs longer than ~5s.
 */
export async function replyViaCallback(replyCallbackUrl: string, content: string): Promise<void> {
  const res = await fetch(replyCallbackUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Wassist reply_callback failed (${res.status}): ${detail.slice(0, 200)}`);
  }
}

/**
 * Optional signature check. Public BYOA docs do not require this; if
 * WASSIST_WEBHOOK_SECRET is unset, verification is skipped.
 * Header format when used: X-Wassist-Signature: t=<timestamp>,v1=<hex-hmac-sha256>
 */
export function verifySignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string = config.wassist.webhookSecret,
): boolean {
  if (!secret) return true;
  if (!signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((kv) => {
      const i = kv.indexOf('=');
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    }),
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;

  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(v1, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Stable idempotency key when Wassist does not send a delivery id. */
export function deliveryKey(
  inbound: Pick<InboundMessage, 'from' | 'body' | 'replyCallback'>,
): string {
  return createHash('sha256')
    .update(`${inbound.from}\n${inbound.body}\n${inbound.replyCallback}`)
    .digest('hex');
}

/** Parsed inbound message from a Wassist BYOA webhook. */
export interface InboundMessage {
  from: string;
  body: string;
  replyCallback: string;
  image: string | null;
}

/** Fast webhook JSON response shape (Wassist delivers this to WhatsApp). */
export function webhookMessageReply(content: string): { type: 'message'; content: string } {
  return { type: 'message', content };
}

/** Extract fields from the official BYOA webhook payload. */
export function parseInbound(payload: unknown): InboundMessage | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;

  // Official: https://docs.wassist.app/concepts/bring-your-own-agent
  const phone = p.phone_number;
  const replyCallback = p.reply_callback;
  if (typeof phone === 'string' && typeof replyCallback === 'string' && phone && replyCallback) {
    const body = typeof p.message === 'string' ? p.message : '';
    const image = typeof p.image === 'string' ? p.image : null;
    return { from: phone, body, replyCallback, image };
  }

  return null;
}
