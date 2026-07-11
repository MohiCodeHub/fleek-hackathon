/**
 * Catalog collection metadata. Product rows live in Postgres
 * (`products` table, seeded by `npm run seed`) — see `src/db/index.ts`.
 */

export const COLLECTIONS = {
  'mens-unisex': {
    title: "Men's & Unisex",
    blurb: 'Branded tees, fleeces, streetwear, and mixed vintage bales.',
  },
  womens: {
    title: "Women's",
    blurb: 'Tops, denim, Y2K, and graded wholesale lots.',
  },
} as const;

export type CollectionSlug = keyof typeof COLLECTIONS;

export const SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'price-asc', label: 'Price ↑' },
  { value: 'price-desc', label: 'Price ↓' },
] as const;

export type SortValue = (typeof SORT_OPTIONS)[number]['value'];

export function isCollectionSlug(slug: string): slug is CollectionSlug {
  return slug in COLLECTIONS;
}

export function isSortValue(value: string | undefined): value is SortValue {
  return SORT_OPTIONS.some((option) => option.value === value);
}
