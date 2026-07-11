import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Order, Product } from '../src/types.js';

const catalogProduct: Product = {
  id: 7,
  collection: 'mens-unisex',
  name: 'Vintage Carhartt T-Shirts',
  price: 135,
  originalPrice: null,
  currency: 'GBP',
  pricePerPiece: 9,
  units: 15,
  imageUrl: 'https://cdn.example.test/carhartt.webp',
  url: 'https://www.joinfleek.com/products/vintage-carhartt-t-shirts',
};

// The webhook route pulls in the agent factory, which demands an LLM key at
// import time. These tests are about the checkout surface, not the agent.
vi.mock('../src/handler.js', () => ({
  processInbound: vi.fn().mockResolvedValue('final'),
}));

/** In-memory stand-in for the orders table. */
const saved: Order[] = [];

vi.mock('../src/db/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/index.js')>();
  return {
    ...actual,
    claimDelivery: vi.fn().mockResolvedValue(true),
    markDelivery: vi.fn().mockResolvedValue(true),
    productCounts: vi.fn(() => Promise.resolve({ 'mens-unisex': 1, womens: 0 })),
    getProduct: vi.fn((collection: string, id: number) =>
      Promise.resolve(
        collection === catalogProduct.collection && id === catalogProduct.id
          ? catalogProduct
          : null,
      ),
    ),
    createOrder: vi.fn((o: Order) => {
      saved.push(o);
      return Promise.resolve();
    }),
    getOrder: vi.fn((id: string) => Promise.resolve(saved.find((o) => o.id === id) ?? null)),
    confirmOrder: vi.fn((id: string, at: string) => {
      const order = saved.find((o) => o.id === id);
      if (!order) return Promise.resolve(null);
      if (order.status === 'pending') {
        order.status = 'confirmed';
        order.confirmedAt = at;
      }
      return Promise.resolve(order);
    }),
  };
});

import { createApp } from '../src/app.js';
import { createCheckout } from '../src/checkout.js';

beforeEach(() => {
  saved.length = 0;
  vi.clearAllMocks();
});

describe('createCheckout', () => {
  it('snapshots a catalog lot and computes the total', async () => {
    const { order, url } = await createCheckout({
      buyerPhone: '+14155550101',
      collection: 'mens-unisex',
      productId: 7,
      quantity: 20,
    });

    // Price defaults to the catalog price when Abhi does not override it.
    expect(order.pricePerPiece).toBe(9);
    expect(order.total).toBe(180);
    expect(order.productName).toBe('Vintage Carhartt T-Shirts');
    expect(order.imageUrl).toBe(catalogProduct.imageUrl);
    expect(order.productUrl).toBe(catalogProduct.url);
    expect(order.status).toBe('pending');
    expect(url).toContain(`/checkout/${order.id}`);
  });

  it('uses the negotiated price over the catalog list price', async () => {
    const { order } = await createCheckout({
      buyerPhone: '+14155550101',
      collection: 'mens-unisex',
      productId: 7,
      quantity: 10,
      pricePerPiece: 6.5,
      grade: 'B',
    });

    expect(order.pricePerPiece).toBe(6.5);
    expect(order.total).toBe(65);
    expect(order.grade).toBe('B');
  });

  it('rounds the total to the penny rather than carrying float dust', async () => {
    const { order } = await createCheckout({
      buyerPhone: '+14155550101',
      productName: 'Mixed vintage bale',
      quantity: 3,
      pricePerPiece: 10.1,
    });

    expect(order.total).toBe(30.3);
  });

  it('rejects a non-positive quantity', async () => {
    await expect(
      createCheckout({ buyerPhone: '+1', productName: 'x', quantity: 0, pricePerPiece: 5 }),
    ).rejects.toThrow(/quantity/i);
  });

  it('rejects an unknown catalog lot rather than inventing an order', async () => {
    await expect(
      createCheckout({ buyerPhone: '+1', collection: 'womens', productId: 999, quantity: 5 }),
    ).rejects.toThrow(/No such catalog lot/);
  });

  it('requires a name when there is no catalog lot to take one from', async () => {
    await expect(
      createCheckout({ buyerPhone: '+1', quantity: 5, pricePerPiece: 5 }),
    ).rejects.toThrow(/productName/);
  });
});

describe('checkout routes', () => {
  async function seedOrder(): Promise<Order> {
    const { order } = await createCheckout({
      buyerPhone: '+14155550101',
      collection: 'mens-unisex',
      productId: 7,
      quantity: 20,
    });
    return order;
  }

  it('GET /checkout/:id renders the order with its terms', async () => {
    const order = await seedOrder();
    const res = await createApp().request(`/checkout/${order.id}`);

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Vintage Carhartt T-Shirts');
    expect(html).toContain('20 pcs');
    expect(html).toContain('£180');
    expect(html).toContain('Confirm order');
    expect(html).toContain(catalogProduct.imageUrl as string);
  });

  it('GET /checkout/:id 404s an unknown id', async () => {
    const res = await createApp().request('/checkout/ord_nope');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('isn’t valid');
  });

  it('POST confirm marks the order confirmed and redirects back', async () => {
    const order = await seedOrder();
    const app = createApp();

    const res = await app.request(`/checkout/${order.id}/confirm`, { method: 'POST' });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`/checkout/${order.id}`);

    const page = await app.request(`/checkout/${order.id}`);
    const html = await page.text();
    expect(html).toContain('Order confirmed');
    expect(html).not.toContain('Confirm order');
  });

  it('POST confirm is idempotent — a second confirm keeps the first timestamp', async () => {
    const order = await seedOrder();
    const app = createApp();

    await app.request(`/checkout/${order.id}/confirm`, { method: 'POST' });
    const firstConfirmedAt = saved[0]?.confirmedAt;

    await app.request(`/checkout/${order.id}/confirm`, { method: 'POST' });

    expect(saved[0]?.status).toBe('confirmed');
    expect(saved[0]?.confirmedAt).toBe(firstConfirmedAt);
  });

  it('POST confirm 404s an unknown id', async () => {
    const res = await createApp().request('/checkout/ord_nope/confirm', { method: 'POST' });
    expect(res.status).toBe(404);
  });
});
