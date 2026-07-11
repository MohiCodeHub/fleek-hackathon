import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { html } from 'hono/html';
import { confirmOrder, getOrder, listProducts, productCounts } from '../db/index.js';
import { CheckoutNotFoundPage, CheckoutPage } from '../web/pages/checkout.js';
import { CollectionPage, CollectionsIndexPage } from '../web/pages/collections.js';
import { LandingPage } from '../web/pages/landing.js';
import { isCollectionSlug, isSortValue } from '../web/products.js';

// Read once at startup — the stylesheet is a static asset shipped with the repo.
const webCss = readFileSync(new URL('../../public/web.css', import.meta.url), 'utf-8');

export const webRoutes = new Hono();

webRoutes.get('/', (c) => c.html(html`<!doctype html>${LandingPage()}`));

webRoutes.get('/collections', async (c) => {
  const counts = await productCounts();
  return c.html(html`<!doctype html>${CollectionsIndexPage({ counts })}`);
});

webRoutes.get('/collections/:slug', async (c) => {
  const slug = c.req.param('slug');
  if (!isCollectionSlug(slug)) return c.notFound();
  const sortParam = c.req.query('sort');
  const sort = isSortValue(sortParam) ? sortParam : 'name';
  const [page, counts] = await Promise.all([
    listProducts({ collection: slug, sort }),
    productCounts(),
  ]);
  return c.html(
    html`<!doctype html>${CollectionPage({
      slug,
      products: page.data,
      counts,
      sort,
    })}`,
  );
});

webRoutes.get('/checkout/:id', async (c) => {
  const order = await getOrder(c.req.param('id'));
  if (!order) return c.html(html`<!doctype html>${CheckoutNotFoundPage()}`, 404);
  return c.html(html`<!doctype html>${CheckoutPage({ order })}`);
});

/**
 * Confirm an order, then redirect back to the page (POST-redirect-GET) so a
 * browser refresh doesn't re-submit. Confirming is idempotent in the DB layer.
 */
webRoutes.post('/checkout/:id/confirm', async (c) => {
  const id = c.req.param('id');
  const order = await confirmOrder(id, new Date().toISOString());
  if (!order) return c.html(html`<!doctype html>${CheckoutNotFoundPage()}`, 404);
  return c.redirect(`/checkout/${id}`, 303);
});

webRoutes.get('/web.css', (c) => {
  c.header('Content-Type', 'text/css; charset=utf-8');
  c.header('Cache-Control', 'public, max-age=3600');
  return c.body(webCss);
});
