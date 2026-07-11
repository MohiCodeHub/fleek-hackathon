import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '../src/types.js';

const processInbound = vi.fn().mockResolvedValue('final');

vi.mock('../src/handler.js', () => ({
  processInbound: (...args: unknown[]) => processInbound(...args),
}));

/** In-memory stand-in for the Postgres products table (routes stay DB-free in unit tests). */
const fixtureProducts: Product[] = [
  {
    id: 1,
    collection: 'mens-unisex',
    name: 'Vintage Mix Branded T-Shirts',
    price: 135,
    originalPrice: null,
    currency: 'GBP',
    pricePerPiece: 9,
    units: 15,
    imageUrl: 'https://cdn.example.test/mens-1.webp',
    url: 'https://www.joinfleek.com/products/vintage-mix-branded-t-shirts',
  },
  {
    id: 2,
    collection: 'mens-unisex',
    name: 'Polo T-Shirts',
    price: 130,
    originalPrice: null,
    currency: 'GBP',
    pricePerPiece: 8.66,
    units: 15,
    imageUrl: null,
    url: 'https://www.joinfleek.com/products/polo-t-shirts',
  },
  {
    id: 1,
    collection: 'womens',
    name: 'Upcycled Denim Halter Top',
    price: 110,
    originalPrice: 193.8,
    currency: 'GBP',
    pricePerPiece: 9.15,
    units: 12,
    imageUrl: 'https://cdn.example.test/womens-1.webp',
    url: 'https://www.joinfleek.com/products/upcycled-denim-halter-top',
  },
];

function fakeListProducts(opts: {
  collection?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}) {
  const results = opts.collection
    ? fixtureProducts.filter((p) => p.collection === opts.collection)
    : [...fixtureProducts];
  if (opts.sort === 'price-asc') results.sort((a, b) => a.price - b.price);
  if (opts.sort === 'price-desc') results.sort((a, b) => b.price - a.price);
  if (opts.sort === 'name') results.sort((a, b) => a.name.localeCompare(b.name));
  const total = results.length;
  const offset = opts.offset ?? 0;
  const limit = opts.limit ?? total;
  return { total, offset, limit, data: results.slice(offset, offset + limit) };
}

vi.mock('../src/db/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/index.js')>();
  const claim = vi.fn().mockResolvedValue(true);
  return {
    ...actual,
    claimDelivery: claim,
    markDelivery: claim,
    releaseDelivery: vi.fn().mockResolvedValue(undefined),
    listProducts: vi.fn((opts: Parameters<typeof fakeListProducts>[0]) =>
      Promise.resolve(fakeListProducts(opts)),
    ),
    getProduct: vi.fn((collection: string, id: number) =>
      Promise.resolve(
        fixtureProducts.find((p) => p.collection === collection && p.id === id) ?? null,
      ),
    ),
    productCounts: vi.fn(() => Promise.resolve({ 'mens-unisex': 2, womens: 1 })),
  };
});

import { createApp } from '../src/app.js';
import * as db from '../src/db/index.js';
import * as wassist from '../src/wassist.js';

describe('createApp', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.claimDelivery).mockResolvedValue(true);
    vi.mocked(db.markDelivery).mockResolvedValue(true);
    processInbound.mockResolvedValue('final');
  });

  it('GET /health returns ok JSON', async () => {
    const app = createApp();
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      service: 'abhi-and-sanket',
      webhook: 'POST /webhook',
    });
  });

  it('GET / serves the landing page with the WhatsApp CTA', async () => {
    const app = createApp();
    const res = await app.request('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('https://wa.me/447424845871');
    expect(html).toContain('Message Abhi on WhatsApp');
  });

  it('GET /collections/:slug serves a catalog page and 404s unknown slugs', async () => {
    const app = createApp();
    const res = await app.request('/collections/mens-unisex');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('https://wa.me/447424845871');
    expect(html).toContain('Source with Abhi');
    expect(html).toContain('Catalog');
    expect(html).not.toContain('Demo catalog');

    const missing = await app.request('/collections/nope');
    expect(missing.status).toBe(404);
  });

  it('GET /collections index lists collections without demo framing', async () => {
    const app = createApp();
    const res = await app.request('/collections');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<h1>Catalog</h1>');
    expect(html).toContain('Men&#39;s &amp; Unisex');
    expect(html).toContain('Women&#39;s');
    expect(html).not.toContain('Demo catalog');
  });

  it('GET /web.css serves the stylesheet', async () => {
    const app = createApp();
    const res = await app.request('/web.css');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/css');
  });

  it('GET /api/products lists products with sort/limit/offset', async () => {
    const app = createApp();
    const res = await app.request('/api/products?sort=price-asc&limit=2&offset=1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      total: number;
      offset: number;
      limit: number;
      data: { price: number }[];
    };
    expect(body.total).toBe(3);
    expect(body.offset).toBe(1);
    expect(body.limit).toBe(2);
    expect(body.data.map((p) => p.price)).toEqual([130, 135]);
    expect(db.listProducts).toHaveBeenCalledWith({
      collection: undefined,
      sort: 'price-asc',
      limit: 2,
      offset: 1,
    });
  });

  it('GET /api/products/:collection filters by collection and 404s unknown ones', async () => {
    const app = createApp();
    const res = await app.request('/api/products/womens');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      total: number;
      data: Record<string, unknown>[];
    };
    expect(body.total).toBe(1);
    // Old website API wire shape: snake_case, original_price present when set.
    expect(body.data[0]).toEqual({
      id: 1,
      name: 'Upcycled Denim Halter Top',
      price: 110,
      original_price: 193.8,
      currency: 'GBP',
      price_per_piece: 9.15,
      collection: 'womens',
      url: 'https://www.joinfleek.com/products/upcycled-denim-halter-top',
    });

    const missing = await app.request('/api/products/nope');
    expect(missing.status).toBe(404);
  });

  it('GET /api/products/:collection/:id returns one product or 404', async () => {
    const app = createApp();
    const res = await app.request('/api/products/mens-unisex/1');
    expect(res.status).toBe(200);
    const product = (await res.json()) as Record<string, unknown>;
    expect(product.id).toBe(1);
    expect(product.collection).toBe('mens-unisex');
    expect(product.original_price).toBeUndefined();
    expect(product.price_per_piece).toBe(9);
    expect(product.url).toBe('https://www.joinfleek.com/products/vintage-mix-branded-t-shirts');

    const missing = await app.request('/api/products/mens-unisex/9999');
    expect(missing.status).toBe(404);
  });

  it('POST /webhook returns 401 when signature is invalid', async () => {
    vi.spyOn(wassist, 'checkSignature').mockReturnValue({
      ok: false,
      reason: 'missing_header',
    });
    const app = createApp();
    const res = await app.request('/webhook', {
      method: 'POST',
      body: '{}',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).toContain('invalid signature');
    expect(text).toContain('unset WASSIST_WEBHOOK_SECRET');
  });

  it('POST /webhook returns 400 for bad JSON when signature passes', async () => {
    vi.spyOn(wassist, 'checkSignature').mockReturnValue({ ok: true });
    const app = createApp();
    const res = await app.request('/webhook', {
      method: 'POST',
      body: 'not-json',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('bad json');
  });

  it('POST /webhook suppresses interim WhatsApp and schedules processing', async () => {
    vi.spyOn(wassist, 'checkSignature').mockReturnValue({ ok: true });
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
    expect(await res.json()).toEqual({});
    expect(db.claimDelivery).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(processInbound).toHaveBeenCalled();
    });
  });

  it('POST /webhook accepts image-only BYOA payloads', async () => {
    vi.spyOn(wassist, 'checkSignature').mockReturnValue({ ok: true });
    const app = createApp();
    const payload = {
      message: '',
      phone_number: '+14155550102',
      reply_callback: 'https://wassist.app/api/callback/img',
      image: 'https://media.wassist.app/bale.png',
    };
    const res = await app.request('/webhook', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    await vi.waitFor(() => {
      expect(processInbound).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '+14155550102',
          body: '',
          image: 'https://media.wassist.app/bale.png',
        }),
      );
    });
  });

  it('POST /webhook ignores non-Wassist reply_callback hosts without processing', async () => {
    vi.spyOn(wassist, 'checkSignature').mockReturnValue({ ok: true });
    const app = createApp();
    const res = await app.request('/webhook', {
      method: 'POST',
      body: JSON.stringify({
        message: 'probe',
        phone_number: '+10000000000',
        reply_callback: 'https://example.com/cb',
        image: null,
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    expect(processInbound).not.toHaveBeenCalled();
    expect(db.claimDelivery).not.toHaveBeenCalled();
  });
});
