import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { log } from './log.js';

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
 * BYOA reply_callback / webhook response body.
 * Plain text or rich WhatsApp content — Wassist formats for delivery.
 * @see https://docs.wassist.app/concepts/bring-your-own-agent
 */
export type ReplyPayload =
  | { content: string }
  | { content?: string; image: string }
  | { content?: string; video: string }
  | { content?: string; audio: string }
  | { content?: string; document: string }
  | { contact: { name: string; phone_number: string } }
  | { location: { latitude: number; longitude: number } };

/** Coerce a plain string into `{ content }` for reply_callback. */
export function toReplyPayload(reply: string | ReplyPayload): ReplyPayload {
  return typeof reply === 'string' ? { content: reply } : reply;
}

/**
 * Async reply via the one-time callback URL from the inbound webhook
 * (valid ~24h). Prefer this when Abhi needs longer than ~5s.
 */
export async function replyViaCallback(
  replyCallbackUrl: string,
  reply: string | ReplyPayload,
): Promise<void> {
  const payload = toReplyPayload(reply);
  let host = '';
  try {
    host = new URL(replyCallbackUrl).host;
  } catch {
    host = 'invalid';
  }
  const body = JSON.stringify(payload);
  const start = Date.now();
  const res = await fetch(replyCallbackUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const ms = Date.now() - start;
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    log.warn('reply_callback.fail', {
      host,
      status: res.status,
      ms,
      detail: detail.slice(0, 200),
      bodyLen: body.length,
    });
    throw new Error(`Wassist reply_callback failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  log.info('reply_callback.ok', { host, status: res.status, ms, bodyLen: body.length });
}

/**
 * True only for real Wassist reply_callback URLs.
 * Rejects probes like https://example.com/cb so we never burn an Abhi turn
 * or POST replies to an unrelated host.
 */
export function isWassistReplyCallback(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;

  let allowedHost: string;
  try {
    allowedHost = new URL(config.wassist.baseUrl).hostname.toLowerCase();
  } catch {
    allowedHost = 'wassist.app';
  }
  const host = parsed.hostname.toLowerCase();
  return host === allowedHost || host === 'wassist.app' || host.endsWith('.wassist.app');
}

/**
 * Optional signature check for signed platform webhooks.
 * BYOA deliveries are unsigned — leave WASSIST_WEBHOOK_SECRET empty for BYOA.
 * When set, expects X-Wassist-Signature: t=<unix>,v1=<hex-hmac-sha256>
 * over `${t}.${rawBody}` (same scheme as https://docs.wassist.app/concepts/webhooks).
 */
export type SignatureFailure = 'missing_header' | 'malformed_header' | 'mismatch' | 'stale';

export type SignatureResult = { ok: true } | { ok: false; reason: SignatureFailure };

/** Reject signed events older than this (Wassist docs: 5 minutes). */
const SIGNATURE_MAX_AGE_SEC = 300;

export function checkSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string = config.wassist.webhookSecret,
  nowSec: number = Math.floor(Date.now() / 1000),
): SignatureResult {
  if (!secret) return { ok: true };
  if (!signatureHeader) return { ok: false, reason: 'missing_header' };

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((kv) => {
      const i = kv.indexOf('=');
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    }),
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return { ok: false, reason: 'malformed_header' };

  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > SIGNATURE_MAX_AGE_SEC) {
    return { ok: false, reason: 'stale' };
  }

  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  let a: Buffer;
  let b: Buffer;
  try {
    a = Buffer.from(expected, 'hex');
    b = Buffer.from(v1, 'hex');
  } catch {
    return { ok: false, reason: 'malformed_header' };
  }
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return { ok: false, reason: 'malformed_header' };
  }
  if (!timingSafeEqual(a, b)) return { ok: false, reason: 'mismatch' };
  return { ok: true };
}

/** Boolean wrapper around checkSignature (tests and simple callers). */
export function verifySignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string = config.wassist.webhookSecret,
): boolean {
  return checkSignature(rawBody, signatureHeader, secret).ok;
}

export function signatureFailureMessage(reason: SignatureFailure): string {
  switch (reason) {
    case 'missing_header':
      return (
        'missing X-Wassist-Signature (BYOA deliveries are unsigned — ' +
        'unset WASSIST_WEBHOOK_SECRET)'
      );
    case 'malformed_header':
      return 'malformed X-Wassist-Signature header';
    case 'mismatch':
      return 'signature mismatch (wrong WASSIST_WEBHOOK_SECRET or body altered)';
    case 'stale':
      return 'stale X-Wassist-Signature timestamp (>5m)';
  }
}

/** Stable idempotency key when Wassist does not send a delivery id. */
export function deliveryKey(
  inbound: Pick<InboundMessage, 'from' | 'body' | 'image' | 'replyCallback'>,
): string {
  return createHash('sha256')
    .update(`${inbound.from}\n${inbound.body}\n${inbound.image ?? ''}\n${inbound.replyCallback}`)
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

/**
 * Keep only real http(s) image URLs.
 * Wassist tool templates often send unsubstituted tokens like `%IMAGE_URL%`
 * on text-only messages — treat those as no image.
 */
export function normalizeInboundImage(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return null;
  // Unsubstituted Wassist template tokens, e.g. %IMAGE_URL%
  if (/^%[A-Z0-9_]+%$/.test(value)) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return value;
  } catch {
    return null;
  }
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
    return {
      from: phone,
      body,
      replyCallback,
      image: normalizeInboundImage(p.image),
    };
  }

  return null;
}
