/**
 * Visual catalog search: "buyer sends a photo on WhatsApp → find the closest
 * lots we actually stock".
 *
 * OpenAI's embedding models are text-only, so a vision caption is the bridge
 * between the two images. The *same* structured caption runs over the catalog
 * photos (offline, see `src/scripts/index-images.ts`) and over the buyer's
 * inbound photo (at query time), so both land in one semantic space and cosine
 * similarity is meaningful.
 *
 * Only visual attributes are embedded. Grade, price, and piece counts are not
 * things a photo can tell you — they stay as product metadata for display and
 * filtering, and never pollute the vector.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { dot, EMBED_DIMS, embed, generateJSON, imageMessage, type JSONSchema } from './llm.js';
import { fetchImageContent } from './media.js';
import type { Product } from './types.js';

const INDEX_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  'scripts',
  'fixtures',
  'catalog-index.json',
);

// ---------------------------------------------------------------------------
// The shared vision caption.
// ---------------------------------------------------------------------------

/** Visual attributes of a garment lot, as read off a photo. */
export interface GarmentAttrs {
  garments: string[];
  style: string;
  era: string;
  brands: string[];
  colours: string[];
  print: string;
  material: string;
  summary: string;
}

const ATTRS_SCHEMA: JSONSchema = {
  type: 'object',
  properties: {
    garments: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Garment types visible, e.g. ["t-shirt"], ["fleece","jacket"], ["jeans"]. Lowercase singular.',
    },
    style: {
      type: 'string',
      description:
        'Style register, e.g. "90s sportswear", "workwear", "y2k party top", "outdoor technical", "streetwear".',
    },
    era: { type: 'string', description: 'Best-guess era, e.g. "90s", "y2k", "00s", "modern".' },
    brands: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Brands visibly identifiable from logos/labels/prints. Empty array if none is legible. Never guess a brand that is not visible.',
    },
    colours: {
      type: 'array',
      items: { type: 'string' },
      description: 'Dominant colours, most prominent first.',
    },
    print: {
      type: 'string',
      description:
        'Graphic/print/pattern, e.g. "band graphic", "big logo spellout", "camo", "floral", "plain". Use "plain" if none.',
    },
    material: {
      type: 'string',
      description:
        'Apparent material, e.g. "cotton jersey", "denim", "fleece", "nylon", "leather".',
    },
    summary: {
      type: 'string',
      description:
        'One dense sentence a sourcing buyer would use to describe this lot. Visual only — no price, no grade, no piece count.',
    },
  },
  required: ['garments', 'style', 'era', 'brands', 'colours', 'print', 'material', 'summary'],
  additionalProperties: false,
};

const VISION_SYSTEM = `You are a vintage-wholesale sourcing expert looking at a photo of a clothing lot (often a flat-lay or rail of many similar secondhand pieces, not a single studio product shot).

Describe ONLY what is visually there. Never infer price, grade, or piece count — a photo cannot show those.
Only name a brand when a logo, label, or spellout is actually legible. An unbranded piece is not a failure; return an empty brand list.
Describe the lot as a whole: if it is a mixed rail, capture the common thread (garment type, era, colour story), not one outlier.`;

/**
 * Inline an image as a `data:` URI.
 *
 * We deliberately do NOT hand a third-party URL to OpenAI and hope it can reach
 * it: Fleek's CloudFront refuses to render its largest images at all, and
 * WhatsApp media URLs are short-lived and may be auth-gated. Fetching the bytes
 * ourselves (via `media.ts`, which also downsizes anything too big for the
 * model) is the only thing that works for both.
 */
async function toDataUri(image: string): Promise<string> {
  if (image.startsWith('data:')) return image;
  const content = await fetchImageContent(image);
  if (!content) throw new Error(`could not load image: ${image.slice(0, 80)}`);
  return `data:${content.mimeType};base64,${content.data}`;
}

/** Vision-caption one image into structured visual attributes. */
export async function describeGarment(image: string, titleHint?: string): Promise<GarmentAttrs> {
  const text = titleHint
    ? `Listing title (context — trust the photo over the title, but use it to confirm brand/era): "${titleHint}"`
    : undefined;
  return generateJSON<GarmentAttrs>({
    system: VISION_SYSTEM,
    messages: [imageMessage(await toDataUri(image), text)],
    schema: ATTRS_SCHEMA,
    toolName: 'emit_garment_attrs',
    toolDescription: 'Emit the garment lot’s visual attributes.',
    // Vision captioning is bulk, high-volume work — use the cheap model.
    model: config.models.fast,
  });
}

/** Canonical text for embedding. Corpus and query must build this identically. */
export function attrsToText(a: GarmentAttrs): string {
  const brands = a.brands.length ? a.brands.join(', ') : 'unbranded';
  return [
    `garments: ${a.garments.join(', ')}`,
    `style: ${a.style}`,
    `era: ${a.era}`,
    `brands: ${brands}`,
    `colours: ${a.colours.join(', ')}`,
    `print: ${a.print}`,
    `material: ${a.material}`,
    a.summary,
  ].join(' | ');
}

// ---------------------------------------------------------------------------
// The on-disk index.
// ---------------------------------------------------------------------------

/** One indexed catalog image. `vec` is the base64 of a Float32Array. */
export interface IndexEntry {
  collection: Product['collection'];
  id: number;
  name: string;
  imageUrl: string;
  caption: string;
  vec: string;
}

export interface CatalogIndex {
  model: string;
  dims: number;
  builtAt: string;
  entries: IndexEntry[];
}

function decodeVec(b64: string): Float32Array {
  const buf = Buffer.from(b64, 'base64');
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

export function encodeVec(v: Float32Array): string {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('base64');
}

interface LoadedIndex {
  entries: IndexEntry[];
  vecs: Float32Array[];
}

let _index: LoadedIndex | null = null;

/** Load and decode the committed index once, lazily. */
function loadIndex(): LoadedIndex {
  if (_index) return _index;

  let raw: CatalogIndex;
  try {
    raw = JSON.parse(readFileSync(INDEX_PATH, 'utf-8')) as CatalogIndex;
  } catch {
    throw new Error(
      'Catalog image index not found. Build it with: npm run index:images ' +
        '(scrape first with: npm run scrape:catalog)',
    );
  }
  if (raw.dims !== EMBED_DIMS) {
    throw new Error(
      `Catalog index has ${raw.dims} dims but EMBED_DIMS is ${EMBED_DIMS}. Rebuild: npm run index:images`,
    );
  }

  _index = { entries: raw.entries, vecs: raw.entries.map((e) => decodeVec(e.vec)) };
  return _index;
}

export function indexSize(): number {
  return loadIndex().entries.length;
}

// ---------------------------------------------------------------------------
// Search.
// ---------------------------------------------------------------------------

/** One visually-similar catalog hit. */
export interface ImageMatch {
  collection: Product['collection'];
  id: number;
  name: string;
  imageUrl: string;
  caption: string;
  /** Cosine similarity, 0-1. */
  score: number;
}

export interface ImageSearchResult {
  /** What we read off the buyer's photo — worth echoing back to them. */
  query: GarmentAttrs;
  matches: ImageMatch[];
}

/**
 * Find the catalog lots that look most like `image`.
 * `image` is an https URL or a data: URI.
 */
export async function searchByImage(
  image: string,
  opts: { limit?: number; collection?: Product['collection'] } = {},
): Promise<ImageSearchResult> {
  const limit = opts.limit ?? 5;
  const { entries, vecs } = loadIndex();

  const attrs = await describeGarment(image);
  const [queryVec] = await embed([attrsToText(attrs)]);
  if (!queryVec) throw new Error('Failed to embed the query image caption.');

  const scored: ImageMatch[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const vec = vecs[i];
    if (!e || !vec) continue;
    if (opts.collection && e.collection !== opts.collection) continue;
    scored.push({
      collection: e.collection,
      id: e.id,
      name: e.name,
      imageUrl: e.imageUrl,
      caption: e.caption,
      score: dot(queryVec, vec),
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return { query: attrs, matches: scored.slice(0, limit) };
}
