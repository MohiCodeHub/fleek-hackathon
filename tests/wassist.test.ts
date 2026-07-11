import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deliveryKey,
  parseInbound,
  replyViaCallback,
  verifySignature,
  webhookMessageReply,
} from '../src/wassist.js';

const SECRET = 'whsec_test_secret';

function sign(body: string, t = '1700000000'): string {
  const v1 = createHmac('sha256', SECRET).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

describe('verifySignature', () => {
  const body = JSON.stringify({ phone_number: '+1', message: 'hi' });

  it('accepts a correctly signed body', () => {
    expect(verifySignature(body, sign(body), SECRET)).toBe(true);
  });
  it('rejects a tampered body', () => {
    expect(verifySignature(`${body} `, sign(body), SECRET)).toBe(false);
  });
  it('rejects a wrong secret', () => {
    expect(verifySignature(body, sign(body), 'whsec_other')).toBe(false);
  });
  it('rejects a missing header', () => {
    expect(verifySignature(body, undefined, SECRET)).toBe(false);
  });
  it('rejects a malformed header', () => {
    expect(verifySignature(body, 'garbage', SECRET)).toBe(false);
  });
  it('skips verification when no secret is configured (dev mode)', () => {
    expect(verifySignature(body, undefined, '')).toBe(true);
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
