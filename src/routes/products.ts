/**
 * Demo product API, ported from the retired website/server.js Express app,
 * now backed by the Postgres `products` table (seeded by `npm run seed`).
 * Same wire shapes: list endpoints return { total, offset, limit, data }.
 */
import { Hono } from 'hono';
import { getProduct, listProducts } from '../db/index.js';
import type { Product } from '../types.js';
import { isCollectionSlug } from '../web/products.js';

/** Old website API wire shape (snake_case, original_price only when present). */
function toWire(p: Product) {
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    ...(p.originalPrice != null ? { original_price: p.originalPrice } : {}),
    currency: p.currency,
    price_per_piece: p.pricePerPiece,
    collection: p.collection,
  };
}

function parseIntOr(value: string | undefined, fallback: number | undefined) {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isNaN(n) ? fallback : n;
}

export const productRoutes = new Hono();

productRoutes.get('/api/products', async (c) => {
  const { collection, sort, limit, offset } = c.req.query();
  const page = await listProducts({
    collection: collection && isCollectionSlug(collection) ? collection : undefined,
    sort,
    limit: parseIntOr(limit, undefined),
    offset: parseIntOr(offset, 0),
  });
  return c.json({ ...page, data: page.data.map(toWire) });
});

productRoutes.get('/api/products/:collection', async (c) => {
  const collection = c.req.param('collection');
  if (!isCollectionSlug(collection)) return c.json({ error: 'Collection not found' }, 404);
  const { sort, limit, offset } = c.req.query();
  const page = await listProducts({
    collection,
    sort,
    limit: parseIntOr(limit, undefined),
    offset: parseIntOr(offset, 0),
  });
  return c.json({ ...page, data: page.data.map(toWire) });
});

productRoutes.get('/api/products/:collection/:id', async (c) => {
  // Old API behaviour: any non-womens collection falls back to mens-unisex.
  const collection = c.req.param('collection') === 'womens' ? 'womens' : 'mens-unisex';
  const id = Number.parseInt(c.req.param('id'), 10);
  const product = Number.isNaN(id) ? null : await getProduct(collection, id);
  if (!product) return c.json({ error: 'Product not found' }, 404);
  return c.json(toWire(product));
});
