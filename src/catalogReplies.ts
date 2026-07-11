import type { ToolExec } from './agent/factory.js';
import type { ReplyPayload } from './wassist.js';

/** Catalog lot shape returned in find_matches details (for WhatsApp cards). */
export type CatalogReplyMatch = {
  name: string;
  price: number;
  currency: string;
  pricePerPiece: number;
  url: string;
  imageUrl: string | null;
};

const MAX_CATALOG_CARDS = 3;

/** WhatsApp caption: name, price line, joinfleek.com URL. */
export function formatProductCaption(p: CatalogReplyMatch): string {
  return [p.name, `${p.currency} ${p.price} lot · ${p.currency} ${p.pricePerPiece}/pc`, p.url].join(
    '\n',
  );
}

/**
 * Latest find_matches that includes a catalogMatches array → top lots with a URL.
 * Skips tool results that have no catalogMatches (e.g. Unknown mandateId).
 */
export function extractCatalogMatches(
  toolExecs: ToolExec[],
  limit = MAX_CATALOG_CARDS,
): CatalogReplyMatch[] {
  for (let i = toolExecs.length - 1; i >= 0; i--) {
    const exec = toolExecs[i];
    if (exec?.name !== 'find_matches') continue;
    const out = exec.output;
    if (!out || typeof out !== 'object') continue;
    const o = out as Record<string, unknown>;
    if (!Array.isArray(o.catalogMatches)) continue;

    const matches: CatalogReplyMatch[] = [];
    for (const raw of o.catalogMatches) {
      if (!raw || typeof raw !== 'object') continue;
      const m = raw as Record<string, unknown>;
      const url = typeof m.url === 'string' ? m.url.trim() : '';
      if (!url) continue;
      const name = typeof m.name === 'string' ? m.name : 'Fleek catalog lot';
      const currency = typeof m.currency === 'string' ? m.currency : 'USD';
      const price = typeof m.price === 'number' ? m.price : Number(m.price);
      const pricePerPiece =
        typeof m.pricePerPiece === 'number' ? m.pricePerPiece : Number(m.pricePerPiece);
      const imageUrl =
        typeof m.imageUrl === 'string' && m.imageUrl.trim() ? m.imageUrl.trim() : null;
      matches.push({
        name,
        currency,
        price: Number.isFinite(price) ? price : 0,
        pricePerPiece: Number.isFinite(pricePerPiece) ? pricePerPiece : 0,
        url,
        imageUrl,
      });
      if (matches.length >= limit) break;
    }
    return matches;
  }
  return [];
}

/** Build reply_callback payloads: image+caption when possible, else text+link. */
export function buildCatalogPayloads(matches: CatalogReplyMatch[]): ReplyPayload[] {
  return matches.map((p) => {
    const content = formatProductCaption(p);
    if (p.imageUrl) return { image: p.imageUrl, content };
    return { content };
  });
}
