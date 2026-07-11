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

function scoreProduct(product: Product, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const hay = `${product.name} ${product.collection}`.toLowerCase();
  let hits = 0;
  for (const t of tokens) {
    if (hay.includes(t)) hits += 1;
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
