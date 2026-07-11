/**
 * Demo catalog collection metadata. Product rows live in Postgres
 * (`products` table, seeded by `npm run seed`) — see `src/db/index.ts`.
 */

export const COLLECTIONS = {
  'mens-unisex': { title: "Men's & Unisex" },
  womens: { title: "Women's" },
} as const;

export type CollectionSlug = keyof typeof COLLECTIONS;

export function isCollectionSlug(slug: string): slug is CollectionSlug {
  return slug in COLLECTIONS;
}
