import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { sellerChannel } from '../src/seller/channel.js';

describe('sellerChannel', () => {
  beforeEach(() => sellerChannel.reset());

  it('appends posts to history and tags the sender', () => {
    sellerChannel.post('agent', 'hello', { kind: 'intro' });
    const hist = sellerChannel.history();
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ from: 'agent', text: 'hello', kind: 'intro' });
  });

  it('awaitReply resolves early when the seller replies', async () => {
    const pending = sellerChannel.awaitReply(5_000);
    sellerChannel.submitReply('go ahead');
    await expect(pending).resolves.toEqual({ text: 'go ahead', auto: false });
    // Both the agent wait and the seller message are recorded.
    expect(sellerChannel.history().some((m) => m.from === 'seller')).toBe(true);
  });

  it('awaitReply auto-resolves on timeout so a demo never hangs', async () => {
    await expect(sellerChannel.awaitReply(10)).resolves.toEqual({ text: '', auto: true });
  });

  it('reset clears the thread', () => {
    sellerChannel.post('agent', 'x');
    sellerChannel.reset();
    expect(sellerChannel.history()).toHaveLength(0);
  });
});

describe('seller routes', () => {
  beforeEach(() => sellerChannel.reset());
  const app = createApp();

  it('GET /seller serves the console page', async () => {
    const res = await app.request('/seller');
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('Fleek Sourcing');
    expect(body).toContain('/seller/stream');
  });

  it('POST /seller/reply rejects an empty message', async () => {
    const res = await app.request('/seller/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '  ' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /seller/reply records the seller message', async () => {
    const res = await app.request('/seller/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'send it' }),
    });
    expect(res.status).toBe(200);
    const last = sellerChannel.history().at(-1);
    expect(last).toMatchObject({ from: 'seller', text: 'send it' });
  });
});
