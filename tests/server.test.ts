import { afterEach, describe, expect, it, vi } from 'vitest';

const processInbound = vi.fn().mockResolvedValue('final');

vi.mock('../src/handler.js', () => ({
  processInbound: (...args: unknown[]) => processInbound(...args),
}));

vi.mock('../src/db/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/index.js')>();
  return {
    ...actual,
    markDelivery: vi.fn().mockResolvedValue(true),
  };
});

import { createApp } from '../src/app.js';
import * as db from '../src/db/index.js';
import * as wassist from '../src/wassist.js';

describe('createApp', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.markDelivery).mockResolvedValue(true);
    processInbound.mockResolvedValue('final');
  });

  it('GET /health returns ok JSON', async () => {
    const app = createApp();
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: 'jack-and-jill' });
  });

  it('GET / returns service info', async () => {
    const app = createApp();
    const res = await app.request('/');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; webhook: string };
    expect(body.ok).toBe(true);
    expect(body.webhook).toBe('POST /webhook');
  });

  it('POST /webhook returns 401 when signature is invalid', async () => {
    vi.spyOn(wassist, 'verifySignature').mockReturnValue(false);
    const app = createApp();
    const res = await app.request('/webhook', {
      method: 'POST',
      body: '{}',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('invalid signature');
  });

  it('POST /webhook returns 400 for bad JSON when signature passes', async () => {
    vi.spyOn(wassist, 'verifySignature').mockReturnValue(true);
    const app = createApp();
    const res = await app.request('/webhook', {
      method: 'POST',
      body: 'not-json',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('bad json');
  });

  it('POST /webhook returns interim BYOA JSON and schedules processing', async () => {
    vi.spyOn(wassist, 'verifySignature').mockReturnValue(true);
    const app = createApp();
    const payload = {
      message: 'need 300 tees',
      phone_number: '+14155550101',
      reply_callback: 'https://wassist.app/api/callback/test',
      image: null,
    };
    const res = await app.request('/webhook', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      type: 'message',
      content: "Got it — Jack's on it. Hang tight.",
    });
    expect(db.markDelivery).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(processInbound).toHaveBeenCalled();
    });
  });
});
