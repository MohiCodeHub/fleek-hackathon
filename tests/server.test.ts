import { describe, it, expect, vi, afterEach } from 'vitest';
import { createApp } from '../src/app.js';
import * as wassist from '../src/wassist.js';

describe('createApp', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
});
