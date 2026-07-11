import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { html } from 'hono/html';
import { listProducts, productCounts } from '../db/index.js';
import { CollectionPage, CollectionsIndexPage } from '../web/pages/collections.js';
import { LandingPage } from '../web/pages/landing.js';
import { isCollectionSlug } from '../web/products.js';

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
  const page = await listProducts({ collection: slug });
  return c.html(html`<!doctype html>${CollectionPage({ slug, products: page.data })}`);
});

webRoutes.get('/web.css', (c) => {
  c.header('Content-Type', 'text/css; charset=utf-8');
  c.header('Cache-Control', 'public, max-age=3600');
  return c.body(webCss);
});
