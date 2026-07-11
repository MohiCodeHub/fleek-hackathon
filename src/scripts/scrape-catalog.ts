/**
 * Scrape the public Fleek catalog into the demo fixtures, including product
 * image URLs.
 *
 * The collection pages are Next.js SSR: each HTML response embeds the server
 * props in a `__NEXT_DATA__` script tag, so we parse that rather than the DOM.
 * Pagination is `?page=N`, 25 items per page.
 *
 * We keep the CloudFront `imageUrl` as a reference — the image bytes stay on
 * Fleek's CDN and are never rehosted here.
 *
 * Usage: tsx src/scripts/scrape-catalog.ts [pagesPerCollection]
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120 Safari/537.36';

/** Be a good citizen: one page at a time, ~1s apart. */
const DELAY_MS = 1000;

const COLLECTIONS = ['mens-unisex', 'womens'] as const;
type Collection = (typeof COLLECTIONS)[number];

/** The subset of Fleek's collection-item shape we care about. */
interface FleekItem {
  id: string;
  title: string;
  slug: string;
  imageUrl: string | null;
  units: number | null;
  totalPrice: number | null;
  pricePerUnit: number | null;
  currencyCode: string | null;
  nonDiscountedTotalPrice: number | null;
  redirectUrl: string | null;
}

/** Our fixture shape: the existing Product, plus the image and source link. */
interface Product {
  id: number;
  collection: Collection;
  name: string;
  price: number;
  original_price: number | null;
  currency: string;
  price_per_piece: number;
  units: number | null;
  image_url: string | null;
  url: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function extractNextData(html: string): unknown {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m?.[1]) throw new Error('no __NEXT_DATA__ in response (page shape changed?)');
  return JSON.parse(m[1]);
}

/** The one path we depend on in Fleek's server props. */
interface NextData {
  props?: {
    pageProps?: {
      collection?: { getCollectionItems?: { data?: { items?: unknown } } };
    };
  };
}

function itemsFrom(nextData: unknown): FleekItem[] {
  const items = (nextData as NextData)?.props?.pageProps?.collection?.getCollectionItems?.data
    ?.items;
  return Array.isArray(items) ? (items as FleekItem[]) : [];
}

async function fetchPage(collection: Collection, page: number): Promise<FleekItem[]> {
  const url = `https://www.joinfleek.com/collections/${collection}?page=${page}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return itemsFrom(extractNextData(await res.text()));
}

/** Fleek ids are big numeric strings; the fixtures use ints, so hash down. */
function toProduct(item: FleekItem, collection: Collection, seq: number): Product | null {
  const price = item.totalPrice;
  const perPiece = item.pricePerUnit;
  if (price == null || perPiece == null || !item.title) return null;

  return {
    id: seq,
    collection,
    name: item.title,
    price,
    original_price: item.nonDiscountedTotalPrice,
    currency: item.currencyCode ?? 'GBP',
    price_per_piece: perPiece,
    units: item.units,
    image_url: item.imageUrl,
    url: productUrl(item),
  };
}

/** Canonical listing URL. `redirectUrl` is the path; fall back to the slug. */
function productUrl(item: FleekItem): string {
  const base = 'https://www.joinfleek.com';
  if (item.redirectUrl) return `${base}${item.redirectUrl}`;
  return `${base}/products/${item.slug}`;
}

async function scrapeCollection(collection: Collection, pages: number): Promise<Product[]> {
  const byFleekId = new Map<string, FleekItem>();

  for (let page = 1; page <= pages; page++) {
    let items: FleekItem[];
    try {
      items = await fetchPage(collection, page);
    } catch (e) {
      console.warn(`  page ${page}: ${(e as Error).message} — stopping`);
      break;
    }
    if (items.length === 0) {
      console.log(`  page ${page}: empty — end of collection`);
      break;
    }

    const before = byFleekId.size;
    for (const it of items) if (it.id) byFleekId.set(it.id, it);
    const added = byFleekId.size - before;

    console.log(`  page ${page}: ${items.length} items (+${added} new, ${byFleekId.size} total)`);

    // Fleek recycles items across pages once the feed is exhausted.
    if (added === 0) {
      console.log('  no new items — stopping');
      break;
    }
    await sleep(DELAY_MS);
  }

  const products: Product[] = [];
  let seq = 1;
  for (const item of byFleekId.values()) {
    const p = toProduct(item, collection, seq);
    if (p) {
      products.push(p);
      seq++;
    }
  }
  return products;
}

async function main(): Promise<void> {
  const pages = Number(process.argv[2]) || 40;

  for (const collection of COLLECTIONS) {
    console.log(`\n${collection} (up to ${pages} pages)`);
    const products = await scrapeCollection(collection, pages);
    const withImage = products.filter((p) => p.image_url).length;

    const out = join(FIXTURES, `${collection}.json`);
    writeFileSync(out, `${JSON.stringify(products, null, 2)}\n`);
    console.log(`  → ${products.length} products (${withImage} with images) → ${out}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
