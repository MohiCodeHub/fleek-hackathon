import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkSignature,
  deliveryKey,
  isWassistReplyCallback,
  parseInbound,
  replyViaCallback,
  signatureFailureMessage,
  verifySignature,
  webhookMessageReply,
} from '../src/wassist.js';

const SECRET = 'whsec_test_secret';
const NOW = 1_700_000_000;

function sign(body: string, t = String(NOW)): string {
  const v1 = createHmac('sha256', SECRET).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

describe('checkSignature / verifySignature', () => {
  const body = JSON.stringify({ phone_number: '+1', message: 'hi' });

  it('accepts a correctly signed body', () => {
    expect(checkSignature(body, sign(body), SECRET, NOW)).toEqual({ ok: true });
    const freshT = String(Math.floor(Date.now() / 1000));
    expect(verifySignature(body, sign(body, freshT), SECRET)).toBe(true);
  });

  it('rejects a tampered body', () => {
    expect(checkSignature(`${body} `, sign(body), SECRET, NOW)).toEqual({
      ok: false,
      reason: 'mismatch',
    });
  });

  it('rejects a wrong secret', () => {
    expect(checkSignature(body, sign(body), 'whsec_other', NOW)).toEqual({
      ok: false,
      reason: 'mismatch',
    });
  });

  it('rejects a missing header when a secret is set', () => {
    expect(checkSignature(body, undefined, SECRET, NOW)).toEqual({
      ok: false,
      reason: 'missing_header',
    });
  });

  it('rejects a malformed header', () => {
    expect(checkSignature(body, 'garbage', SECRET, NOW)).toEqual({
      ok: false,
      reason: 'malformed_header',
    });
  });

  it('rejects a stale timestamp', () => {
    const old = String(NOW - 400);
    expect(checkSignature(body, sign(body, old), SECRET, NOW)).toEqual({
      ok: false,
      reason: 'stale',
    });
  });

  it('skips verification when no secret is configured (BYOA / dev)', () => {
    expect(checkSignature(body, undefined, '', NOW)).toEqual({ ok: true });
    expect(verifySignature(body, undefined, '')).toBe(true);
  });

  it('explains missing-header failures for BYOA operators', () => {
    expect(signatureFailureMessage('missing_header')).toContain('unset WASSIST_WEBHOOK_SECRET');
  });
});

describe('isWassistReplyCallback', () => {
  it('allows wassist.app callback URLs', () => {
    expect(isWassistReplyCallback('https://wassist.app/api/callback/xyz')).toBe(true);
  });

  it('allows subdomains of wassist.app', () => {
    expect(isWassistReplyCallback('https://api.wassist.app/callback/1')).toBe(true);
  });

  it('rejects example.com and other hosts', () => {
    expect(isWassistReplyCallback('https://example.com/cb')).toBe(false);
    expect(isWassistReplyCallback('https://evil.example/wassist.app')).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(isWassistReplyCallback('not-a-url')).toBe(false);
    expect(isWassistReplyCallback('')).toBe(false);
  });
});

describe('parseInbound (official BYOA)', () => {
  it('parses phone_number + message + reply_callback', () => {
    const p = {
      message: 'need 300 tees',
      image: null,
      phone_number: '+447700900200',
      reply_callback: 'https://wassist.app/api/callback/xyz',
    };
    expect(parseInbound(p)).toEqual({
      from: '+447700900200',
      body: 'need 300 tees',
      replyCallback: 'https://wassist.app/api/callback/xyz',
      image: null,
    });
  });

  it('keeps image URL when present', () => {
    const p = {
      message: 'see this',
      image: 'https://media.wassist.app/img.png',
      phone_number: '+1',
      reply_callback: 'https://wassist.app/api/callback/1',
    };
    expect(parseInbound(p)?.image).toBe('https://media.wassist.app/img.png');
  });

  it('returns null when required fields are missing', () => {
    expect(parseInbound({ message: 'x' })).toBeNull();
    expect(parseInbound({ phone_number: '+1' })).toBeNull();
    expect(parseInbound(null)).toBeNull();
  });

  it('ignores legacy event payloads without BYOA fields', () => {
    expect(
      parseInbound({
        event: 'message.received',
        from: '+1',
        conversationId: 'c1',
        message: { body: 'hi' },
      }),
    ).toBeNull();
  });
});

describe('deliveryKey', () => {
  it('is stable for the same inbound', () => {
    const inbound = {
      from: '+1',
      body: 'hi',
      replyCallback: 'https://wassist.app/api/callback/a',
    };
    expect(deliveryKey(inbound)).toBe(deliveryKey(inbound));
  });
  it('changes when the message changes', () => {
    const a = deliveryKey({ from: '+1', body: 'a', replyCallback: 'https://cb' });
    const b = deliveryKey({ from: '+1', body: 'b', replyCallback: 'https://cb' });
    expect(a).not.toBe(b);
  });
});

describe('webhookMessageReply', () => {
  it('builds the interim WhatsApp JSON shape', () => {
    expect(webhookMessageReply('hello')).toEqual({ type: 'message', content: 'hello' });
  });
});

describe('replyViaCallback', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('POSTs { content } to the callback URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);

    await replyViaCallback('https://wassist.app/api/callback/xyz', 'deal closed');

    expect(fetchMock).toHaveBeenCalledWith('https://wassist.app/api/callback/xyz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'deal closed' }),
    });
  });
});
