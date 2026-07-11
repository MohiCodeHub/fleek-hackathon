import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseInbound, verifySignature } from '../src/wassist.js';

const SECRET = 'whsec_test_secret';

function sign(body: string, t = '1700000000'): string {
  const v1 = createHmac('sha256', SECRET).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

describe('verifySignature', () => {
  const body = JSON.stringify({ event: 'message.received', from: '+1' });

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

describe('parseInbound', () => {
  it('parses a message.received payload', () => {
    const p = {
      event: 'message.received',
      from: '+447700900200',
      conversationId: 'conv_123',
      message: { body: 'need 300 tees' },
    };
    expect(parseInbound(p)).toEqual({
      from: '+447700900200',
      conversationId: 'conv_123',
      body: 'need 300 tees',
    });
  });
  it('falls back to contact.phoneNumber for from', () => {
    const p = {
      contact: { phoneNumber: '+1' },
      conversationId: 'c1',
      message: { body: 'hi' },
    };
    expect(parseInbound(p)?.from).toBe('+1');
  });
  it('ignores non-message events', () => {
    expect(parseInbound({ event: 'status.update', conversationId: 'c' })).toBeNull();
  });
  it('returns null when required fields are missing', () => {
    expect(parseInbound({ message: { body: 'x' } })).toBeNull();
    expect(parseInbound(null)).toBeNull();
  });
});
