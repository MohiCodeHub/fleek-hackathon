import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  expandTokens,
  mandateTokens,
  normalizeCatalogText,
  scoreProduct,
} from '../src/catalogSearch.js';
import { products } from '../src/db/schema.js';
import mensProductsJson from '../src/scripts/fixtures/mens-unisex.json';
import womensProductsJson from '../src/scripts/fixtures/womens.json';
import type { Mandate, Product } from '../src/types.js';

const JOINFLEEK_PRODUCT_URL = /^https:\/\/www\.joinfleek\.com\/products\//;

function mandate(partial: Partial<Mandate> & Pick<Mandate, 'category' | 'style'>): Mandate {
  return {
    id: 'm1',
    buyerPhone: '+10000000000',
    quantity: 100,
    gradeFloor: 'B',
    priceCeiling: 10,
    rawText: 'test',
    status: 'open',
    ...partial,
  };
}

function product(partial: Partial<Product> & Pick<Product, 'name' | 'url'>): Product {
  return {
    id: 1,
    collection: 'mens-unisex',
    price: 80,
    currency: 'USD',
    pricePerPiece: 10,
    originalPrice: null,
    units: null,
    imageUrl: null,
    ...partial,
  };
}

describe('mandateTokens', () => {
  it('extracts useful keywords including vintage/mixed and drops function words', () => {
    const tokens = mandateTokens(
      mandate({ category: 'tees', style: 'vintage Nike and adidas graphic tees' }),
    );
    expect(tokens).toContain('tees');
    expect(tokens).toContain('nike');
    expect(tokens).toContain('adidas');
    expect(tokens).toContain('graphic');
    expect(tokens).toContain('vintage');
    expect(tokens).not.toContain('and');
  });

  it('keeps mixed as a searchable token', () => {
    const tokens = mandateTokens(mandate({ category: 'mixed vintage', style: '90s sportswear' }));
    expect(tokens).toContain('mixed');
    expect(tokens).toContain('vintage');
    expect(tokens).toContain('sportswear');
  });
});

describe('expandTokens / normalizeCatalogText', () => {
  it('expands tees into t-shirt forms', () => {
    const expanded = expandTokens(['tees']);
    expect(expanded).toEqual(
      expect.arrayContaining(['tees', 'tshirt', 'tshirts', 't-shirt', 't-shirts']),
    );
  });

  it('normalizes hyphenated t-shirts to tshirt', () => {
    expect(normalizeCatalogText('Star Wars T-Shirts / Tops')).toContain('tshirt');
  });
});

describe('scoreProduct', () => {
  it('matches tees mandate token against products named with t-shirts', () => {
    const p = product({
      name: 'star wars t-shirts / tops wholesale bundle - 8 pcs - grade a',
      url: 'https://www.joinfleek.com/products/star-wars-t-shirts-tops-wholesale-bundle-8-pcs-grade-a-2',
    });
    const score = scoreProduct(p, ['tees']);
    expect(score).toBeGreaterThan(0);
  });

  it('scores graphic/tees-style mandates with url-bearing catalog hits', () => {
    const tokens = mandateTokens(
      mandate({ category: 'tees', style: 'superhero and graphic gear' }),
    );
    const catalog = [
      product({
        id: 1,
        name: 'star wars t-shirts / tops wholesale bundle - 8 pcs - grade a',
        url: 'https://www.joinfleek.com/products/star-wars-t-shirts-tops-wholesale-bundle-8-pcs-grade-a-2',
        pricePerPiece: 8,
      }),
      product({
        id: 2,
        name: 'Printed T-Shirts',
        url: 'https://www.joinfleek.com/products/printed-t-shirts-268',
        pricePerPiece: 6,
      }),
      product({
        id: 3,
        name: 'tommy hilfiger pants wholesale bundle - 8 pcs - grade a',
        url: 'https://www.joinfleek.com/products/tommy-hilfiger-pants',
        pricePerPiece: 12,
      }),
    ];

    const scored = catalog
      .map((p) => ({ ...p, fitScore: Math.round(scoreProduct(p, tokens)) }))
      .filter((p) => p.fitScore > 0)
      .sort((a, b) => b.fitScore - a.fitScore || a.price - b.price);

    expect(scored.length).toBeGreaterThanOrEqual(2);
    expect(scored.every((p) => p.url.startsWith('https://www.joinfleek.com/products/'))).toBe(true);
    expect(scored.map((p) => p.id)).not.toContain(3);
  });

  it('does not count every synonym peer as a separate hit', () => {
    const p = product({
      name: 'Champion T-Shirts',
      url: 'https://www.joinfleek.com/products/champion-t-shirts',
    });
    // One original token ("tees") → one hit bucket, not six synonym peers.
    expect(scoreProduct(p, ['tees'])).toBeLessThan(20);
  });
});

describe('product links in DB seed path', () => {
  it('products.url column is required (notNull) so seed always stores links', () => {
    const cols = getTableColumns(products);
    expect(cols.url).toBeDefined();
    expect(cols.url.notNull).toBe(true);
    expect(cols.url.name).toBe('url');
  });

  it('every catalog fixture has a joinfleek.com product url for insertProduct', () => {
    const fixtures = [
      ...(mensProductsJson as Array<{ url?: string }>),
      ...(womensProductsJson as Array<{ url?: string }>),
    ];
    expect(fixtures.length).toBeGreaterThan(0);
    for (const p of fixtures) {
      expect(p.url).toMatch(JOINFLEEK_PRODUCT_URL);
    }
  });
});
