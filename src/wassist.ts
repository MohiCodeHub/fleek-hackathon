import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';

/**
 * Thin Wassist client (WhatsApp transport). We use BYOA — Wassist forwards
 * inbound WhatsApp messages to our webhook and we push replies via the send API.
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

/** Send a plain WhatsApp text message to an existing conversation. */
export async function sendMessage(conversationId: string, body: string): Promise<void> {
  const res = await fetch(`${base()}/api/v1/conversations/${conversationId}/messages/`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ type: 'text', text: { body } }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Wassist send failed (${res.status}): ${detail.slice(0, 200)}`);
  }
}

/** Register a Bring-Your-Own-Agent pointing Wassist at our webhook URL. */
export async function registerByoa(webhookUrl: string): Promise<unknown> {
  const res = await fetch(`${base()}/api/v1/agents/byoa/`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ webhookUrl }),
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(`Wassist BYOA register failed (${res.status}): ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

/**
 * Verify a Wassist webhook signature. Header format:
 *   X-Wassist-Signature: t=<timestamp>,v1=<hex-hmac-sha256>
 * HMAC is computed over `${t}.${rawBody}` with the signing secret.
 * Returns true (skip) if no secret is configured (local dev).
 */
export function verifySignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string = config.wassist.webhookSecret,
): boolean {
  if (!secret) return true; // dev mode — nothing to verify against
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

/** Parsed inbound message from a Wassist webhook delivery. */
export interface InboundMessage {
  from: string;
  conversationId: string;
  body: string;
}

/** Extract the fields we need from a Wassist `message.received` payload. */
export function parseInbound(payload: unknown): InboundMessage | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as {
    event?: string;
    from?: string;
    conversationId?: string;
    contact?: { phoneNumber?: string };
    message?: { body?: string } | string;
  };
  if (p.event && p.event !== 'message.received') return null;
  const from = p.from ?? p.contact?.phoneNumber;
  const conversationId = p.conversationId;
  const body = typeof p.message === 'string' ? p.message : (p.message?.body ?? '');
  if (!from || !conversationId) return null;
  return { from: String(from), conversationId: String(conversationId), body: String(body) };
}
