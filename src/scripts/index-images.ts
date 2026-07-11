/**
 * Build the catalog image index: vision-caption every product photo, embed the
 * captions, and write the vectors to `fixtures/catalog-index.json`.
 *
 * Run once after scraping (`npm run scrape:catalog`). Resumable — an existing
 * index is reused, so only new/changed products cost tokens. Re-runs after a
 * fresh scrape are therefore cheap.
 *
 * Usage: tsx src/scripts/index-images.ts [maxProducts]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  attrsToText,
  type CatalogIndex,
  describeGarment,
  encodeVec,
  type IndexEntry,
} from '../image-search.js';
import { EMBED_DIMS, embed } from '../llm.js';
import mensJson from './fixtures/mens-unisex.json';
import womensJson from './fixtures/womens.json';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const INDEX_PATH = join(FIXTURES, 'catalog-index.json');

/** Parallel vision calls. Keep modest — this is a shared rate limit. */
const CONCURRENCY = 12;
/** Embeddings batch size (the API takes many inputs per call). */
const EMBED_BATCH = 128;

interface Fixture {
  id: number;
  collection: string;
  name: string;
  image_url: string | null;
}

interface Pending {
  collection: IndexEntry['collection'];
  id: number;
  name: string;
  imageUrl: string;
}

const key = (collection: string, id: number) => `${collection}:${id}`;

/** Reuse captions we already paid for. */
function loadExisting(): Map<string, IndexEntry> {
  if (!existsSync(INDEX_PATH)) return new Map();
  try {
    const raw = JSON.parse(readFileSync(INDEX_PATH, 'utf-8')) as CatalogIndex;
    if (raw.dims !== EMBED_DIMS) return new Map();
    return new Map(raw.entries.map((e) => [key(e.collection, e.id), e]));
  } catch {
    return new Map();
  }
}

/** Run `worker` over `items` with a fixed pool of parallel workers. */
async function pool<T, R>(
  items: T[],
  size: number,
  worker: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (true) {
        const i = next++;
        const item = items[i];
        if (i >= items.length || item === undefined) return;
        out[i] = await worker(item, i);
      }
    }),
  );
  return out;
}

async function main(): Promise<void> {
  const max = Number(process.argv[2]) || Number.POSITIVE_INFINITY;

  const fixtures = [...(mensJson as Fixture[]), ...(womensJson as Fixture[])];
  const all: Pending[] = fixtures
    .filter((p): p is Fixture & { image_url: string } => !!p.image_url)
    .map((p) => ({
      collection: p.collection as Pending['collection'],
      id: p.id,
      name: p.name,
      imageUrl: p.image_url,
    }))
    .slice(0, max);

  const existing = loadExisting();
  const todo = all.filter((p) => {
    const hit = existing.get(key(p.collection, p.id));
    // Re-caption if the image changed under the same id.
    return !hit || hit.imageUrl !== p.imageUrl;
  });

  console.log(
    `${all.length} products with images | ${all.length - todo.length} already indexed | ${todo.length} to caption`,
  );
  if (todo.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  // 1. Vision-caption (the expensive part).
  let done = 0;
  let failed = 0;
  const captions = await pool(todo, CONCURRENCY, async (p) => {
    try {
      const attrs = await describeGarment(p.imageUrl, p.name);
      return attrsToText(attrs);
    } catch (e) {
      failed++;
      console.warn(`  caption failed ${key(p.collection, p.id)}: ${(e as Error).message}`);
      return null;
    } finally {
      done++;
      if (done % 25 === 0 || done === todo.length) {
        process.stdout.write(`\r  captioned ${done}/${todo.length} (${failed} failed)`);
      }
    }
  });
  process.stdout.write('\n');

  const captioned = todo
    .map((p, i) => ({ p, caption: captions[i] }))
    .filter((x): x is { p: Pending; caption: string } => x.caption !== null);

  // 2. Embed the captions in batches.
  const fresh: IndexEntry[] = [];
  for (let i = 0; i < captioned.length; i += EMBED_BATCH) {
    const batch = captioned.slice(i, i + EMBED_BATCH);
    const vecs = await embed(batch.map((b) => b.caption));
    batch.forEach((b, j) => {
      const vec = vecs[j];
      if (!vec) return;
      fresh.push({
        collection: b.p.collection,
        id: b.p.id,
        name: b.p.name,
        imageUrl: b.p.imageUrl,
        caption: b.caption,
        vec: encodeVec(vec),
      });
    });
    console.log(`  embedded ${Math.min(i + EMBED_BATCH, captioned.length)}/${captioned.length}`);
  }

  // 3. Merge with what we already had and write.
  const merged = new Map(existing);
  for (const e of fresh) merged.set(key(e.collection, e.id), e);
  // Keep only products still in the catalog.
  const live = new Set(all.map((p) => key(p.collection, p.id)));
  const entries = [...merged.values()].filter((e) => live.has(key(e.collection, e.id)));

  const index: CatalogIndex = {
    model: 'text-embedding-3-small',
    dims: EMBED_DIMS,
    builtAt: new Date().toISOString(),
    entries,
  };
  writeFileSync(INDEX_PATH, `${JSON.stringify(index)}\n`);

  const mb = (readFileSync(INDEX_PATH).byteLength / 1e6).toFixed(1);
  console.log(`\n→ ${entries.length} indexed (${failed} failed) → ${INDEX_PATH} (${mb} MB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
