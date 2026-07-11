import { listProducts } from './db/index.js';
import type { Mandate, Product } from './types.js';

/** Function words only — keep mandate vocabulary like vintage / mixed / wholesale. */
const STOP = new Set([
  'a',
  'an',
  'and',
  'for',
  'the',
  'with',
  'from',
  'pcs',
  'pc',
  'lot',
  'lots',
  'bundle',
]);

/**
 * Synonym groups so mandate tokens like "tees" match catalog names like "t-shirts".
 * Keys and values are lowercase; expansion is bidirectional via the group list.
 */
const SYNONYM_GROUPS: string[][] = [
  ['tee', 'tees', 'tshirt', 'tshirts', 't-shirt', 't-shirts'],
  ['graphic', 'graphics', 'printed', 'print'],
  ['sportswear', 'sport', 'sports', 'athletic'],
  ['superhero', 'superheroes', 'marvel', 'comics'],
];

const SYNONYM_MAP = buildSynonymMap(SYNONYM_GROUPS);

function buildSynonymMap(groups: string[][]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const group of groups) {
    for (const term of group) {
      map.set(term, group);
    }
  }
  return map;
}

/**
 * Normalize text for matching: lowercase and collapse hyphenated tee forms so
 * "t-shirts" / "t shirts" align with expanded "t-shirt" tokens.
 */
export function normalizeCatalogText(text: string): string {
  return text
    .toLowerCase()
    .replace(/t[\s-]?shirts?/g, ' tshirt ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Expand mandate tokens with synonym-group peers (deduped). */
export function expandTokens(tokens: string[]): string[] {
  const out = new Set<string>();
  for (const t of tokens) {
    out.add(t);
    const group = SYNONYM_MAP.get(t);
    if (group) {
      for (const peer of group) out.add(peer);
    }
  }
  return [...out];
}

/** Tokenize mandate style/category into searchable keywords. */
export function mandateTokens(mandate: Mandate): string[] {
  const raw = `${mandate.category} ${mandate.style}`.toLowerCase();
  return [
    ...new Set(
      raw
        .split(/[^a-z0-9]+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 3 && !STOP.has(t)),
    ),
  ];
}

/** Score a product against mandate tokens with synonym expansion (pure; for tests). */
export function scoreProduct(product: Product, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const hay = ` ${normalizeCatalogText(`${product.name} ${product.collection}`)} `;
  let hits = 0;
  for (const t of tokens) {
    const candidates = expandTokens([t]).map((c) => normalizeCatalogText(c));
    const matched = candidates.some((needle) => needle.length >= 3 && hay.includes(` ${needle} `));
    if (matched) hits += 1;
  }
  if (hits === 0) return 0;
  // Prefer more token coverage; slight boost for cheaper lots.
  return hits * 10 + Math.max(0, 5 - product.pricePerPiece / 10);
}

/**
 * Rank Fleek catalog lots against a mandate (keyword fit on name + collection).
 * Returns top matches with their joinfleek.com URLs for Abhi to share.
 */
export async function searchCatalogProducts(
  mandate: Mandate,
  limit = 5,
): Promise<Array<Product & { fitScore: number }>> {
  const tokens = mandateTokens(mandate);
  if (tokens.length === 0) return [];

  const page = await listProducts({});
  const scored = page.data
    .map((p) => ({ ...p, fitScore: Math.round(scoreProduct(p, tokens)) }))
    .filter((p) => p.fitScore > 0)
    .sort((a, b) => b.fitScore - a.fitScore || a.price - b.price);

  return scored.slice(0, limit);
}
