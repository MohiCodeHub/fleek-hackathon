import { describe, expect, it } from 'vitest';
import type { ToolExec } from '../src/agent/factory.js';
import {
  buildCatalogPayloads,
  type CatalogReplyMatch,
  extractCatalogMatches,
  formatProductCaption,
} from '../src/catalogReplies.js';

const sample: CatalogReplyMatch = {
  name: 'Star Wars T-Shirts',
  currency: 'USD',
  price: 64,
  pricePerPiece: 8,
  url: 'https://www.joinfleek.com/products/star-wars-t-shirts',
  imageUrl: 'https://cdn.example/star-wars.webp',
};

describe('formatProductCaption', () => {
  it('formats name, price line, and joinfleek url', () => {
    expect(formatProductCaption(sample)).toBe(
      [
        'Star Wars T-Shirts',
        'USD 64 lot · USD 8/pc',
        'https://www.joinfleek.com/products/star-wars-t-shirts',
      ].join('\n'),
    );
  });
});

describe('buildCatalogPayloads', () => {
  it('uses image+caption when imageUrl is present', () => {
    expect(buildCatalogPayloads([sample])).toEqual([
      {
        image: 'https://cdn.example/star-wars.webp',
        content: formatProductCaption(sample),
      },
    ]);
  });

  it('falls back to text+link when imageUrl is null', () => {
    const noImage = { ...sample, imageUrl: null };
    expect(buildCatalogPayloads([noImage])).toEqual([{ content: formatProductCaption(noImage) }]);
  });
});

describe('extractCatalogMatches', () => {
  it('reads top matches from the latest find_matches tool result', () => {
    const toolExecs: ToolExec[] = [
      {
        name: 'extract_mandate',
        input: {},
        output: { mandateId: 'm1' },
      },
      {
        name: 'find_matches',
        input: { mandateId: 'm1' },
        output: {
          mandateId: 'm1',
          matches: [],
          catalogMatches: [
            {
              name: 'Lot A',
              price: 10,
              currency: 'GBP',
              pricePerPiece: 2,
              url: 'https://www.joinfleek.com/products/a',
              imageUrl: 'https://cdn.example/a.webp',
            },
            {
              name: 'Lot B',
              price: 20,
              currency: 'GBP',
              pricePerPiece: 4,
              url: 'https://www.joinfleek.com/products/b',
              imageUrl: null,
            },
            {
              name: 'Lot C',
              price: 30,
              currency: 'GBP',
              pricePerPiece: 5,
              url: 'https://www.joinfleek.com/products/c',
              imageUrl: 'https://cdn.example/c.webp',
            },
            {
              name: 'Lot D skipped',
              price: 40,
              currency: 'GBP',
              pricePerPiece: 6,
              url: 'https://www.joinfleek.com/products/d',
              imageUrl: null,
            },
          ],
        },
      },
    ];

    const matches = extractCatalogMatches(toolExecs);
    expect(matches).toHaveLength(3);
    expect(matches.map((m) => m.name)).toEqual(['Lot A', 'Lot B', 'Lot C']);
    const [a, b, c] = matches;
    expect(a && b && c).toBeTruthy();
    if (!a || !b || !c) return;
    expect(buildCatalogPayloads(matches)).toEqual([
      {
        image: 'https://cdn.example/a.webp',
        content: formatProductCaption(a),
      },
      { content: formatProductCaption(b) },
      {
        image: 'https://cdn.example/c.webp',
        content: formatProductCaption(c),
      },
    ]);
  });

  it('skips results without catalogMatches and prefers the latest find_matches', () => {
    const toolExecs: ToolExec[] = [
      {
        name: 'find_matches',
        input: {},
        output: {
          catalogMatches: [
            {
              name: 'Old',
              price: 1,
              currency: 'USD',
              pricePerPiece: 1,
              url: 'https://www.joinfleek.com/products/old',
              imageUrl: null,
            },
          ],
        },
      },
      {
        name: 'find_matches',
        input: {},
        output: { error: 'Unknown mandateId' },
      },
      {
        name: 'find_matches',
        input: {},
        output: {
          catalogMatches: [
            {
              name: 'New',
              price: 2,
              currency: 'USD',
              pricePerPiece: 2,
              url: 'https://www.joinfleek.com/products/new',
              imageUrl: 'https://cdn.example/new.webp',
            },
          ],
        },
      },
    ];

    expect(extractCatalogMatches(toolExecs).map((m) => m.name)).toEqual(['New']);
  });

  it('returns empty when no find_matches catalog section', () => {
    expect(extractCatalogMatches([{ name: 'negotiate', input: {}, output: {} }])).toEqual([]);
  });
});
