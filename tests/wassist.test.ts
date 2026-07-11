import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkSignature,
  deliveryKey,
  isWassistReplyCallback,
  parseInbound,
  replyViaCallback,
  signatureFailureMessage,
  toReplyPayload,
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

  it('parses image-only messages (empty caption)', () => {
    const p = {
      message: '',
      image: 'https://media.wassist.app/only.png',
      phone_number: '+447700900200',
      reply_callback: 'https://wassist.app/api/callback/img',
    };
    expect(parseInbound(p)).toEqual({
      from: '+447700900200',
      body: '',
      replyCallback: 'https://wassist.app/api/callback/img',
      image: 'https://media.wassist.app/only.png',
    });
  });

  it('treats empty or whitespace image as null', () => {
    expect(
      parseInbound({
        message: 'hi',
        image: '  ',
        phone_number: '+1',
        reply_callback: 'https://wassist.app/api/callback/1',
      })?.image,
    ).toBeNull();
  });

  it('treats unsubstituted %IMAGE_URL% as null', () => {
    expect(
      parseInbound({
        message: 'need 300 tees',
        image: '%IMAGE_URL%',
        phone_number: '+1',
        reply_callback: 'https://wassist.app/api/callback/1',
      })?.image,
    ).toBeNull();
  });

  it('rejects non-http image values', () => {
    expect(
      parseInbound({
        message: 'hi',
        image: 'ftp://media.wassist.app/x.png',
        phone_number: '+1',
        reply_callback: 'https://wassist.app/api/callback/1',
      })?.image,
    ).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    expect(parseInbound({ message: 'x' })).toBeNull();
    expect(parseInbound({ phone_number: '+1' })).toBeNull();
    expect(parseInbound(null)).toBeNull();
  });

  it('rejects non-BYOA payloads', () => {
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
      image: null as string | null,
      replyCallback: 'https://wassist.app/api/callback/a',
    };
    expect(deliveryKey(inbound)).toBe(deliveryKey(inbound));
  });

  it('changes when the message changes', () => {
    const a = deliveryKey({ from: '+1', body: 'a', image: null, replyCallback: 'https://cb' });
    const b = deliveryKey({ from: '+1', body: 'b', image: null, replyCallback: 'https://cb' });
    expect(a).not.toBe(b);
  });

  it('changes when the image URL changes (including image-only)', () => {
    const base = { from: '+1', body: '', replyCallback: 'https://cb' };
    const a = deliveryKey({ ...base, image: 'https://media.wassist.app/a.png' });
    const b = deliveryKey({ ...base, image: 'https://media.wassist.app/b.png' });
    const none = deliveryKey({ ...base, image: null });
    expect(a).not.toBe(b);
    expect(a).not.toBe(none);
  });
});

describe('webhookMessageReply', () => {
  it('builds the interim WhatsApp JSON shape', () => {
    expect(webhookMessageReply('hello')).toEqual({ type: 'message', content: 'hello' });
  });
});

describe('toReplyPayload', () => {
  it('wraps plain strings as { content }', () => {
    expect(toReplyPayload('hi')).toEqual({ content: 'hi' });
  });

  it('passes through rich payloads', () => {
    const rich = { content: 'cap', image: 'https://media.wassist.app/x.png' };
    expect(toReplyPayload(rich)).toBe(rich);
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

  it('POSTs image / video / audio / document rich payloads', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);
    const url = 'https://wassist.app/api/callback/rich';

    await replyViaCallback(url, { content: 'look', image: 'https://cdn.example/a.png' });
    await replyViaCallback(url, { video: 'https://cdn.example/a.mp4' });
    await replyViaCallback(url, { audio: 'https://cdn.example/a.ogg' });
    await replyViaCallback(url, { document: 'https://cdn.example/a.pdf' });

    const bodies = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body as string));
    expect(bodies).toEqual([
      { content: 'look', image: 'https://cdn.example/a.png' },
      { video: 'https://cdn.example/a.mp4' },
      { audio: 'https://cdn.example/a.ogg' },
      { document: 'https://cdn.example/a.pdf' },
    ]);
  });

  it('POSTs contact and location payloads', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);
    const url = 'https://wassist.app/api/callback/rich';

    await replyViaCallback(url, {
      contact: { name: 'Fleek Ops', phone_number: '+447700900100' },
    });
    await replyViaCallback(url, {
      location: { latitude: 51.5, longitude: -0.12 },
    });

    const bodies = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body as string));
    expect(bodies).toEqual([
      { contact: { name: 'Fleek Ops', phone_number: '+447700900100' } },
      { location: { latitude: 51.5, longitude: -0.12 } },
    ]);
  });
});
